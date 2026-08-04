import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  isPlatformStaffRole,
  isPartnerSchoolRole,
  PARTNER_SCHOOL_AI_GENERATE_TYPES,
} from "@/lib/dashboard/route-access";
import { extractCronSecret, isValidCronSecret } from "@/lib/server/cron-auth";
import { geminiGenerateText } from "@/lib/gemini/client";
import {
  openRouterComplete,
  MIN_CONTENT_CHARS,
  OPENROUTER_MAX_OUTPUT_TOKENS,
} from "@/lib/ai/openrouter";
import {
  generateAIContent,
  resolveGenerationPlan,
  safeParseJSON,
  VALID_GENERATE_TYPES,
  type GenerateRequest,
  type GenerateType,
} from "@/lib/ai/generate-core";

export const dynamic = "force-dynamic";
// Lesson/curriculum generation is slow; raise the cap so it isn't killed mid-stream.
// Inert on Cloudflare Containers (no per-route cap there), but the client still
// detects a cut-off stream and surfaces a retry instead of a hasty "success".
export const maxDuration = 300;

/**
 * Browser-facing entry point for AI generation.
 *
 * This route is authorisation plus transport. The prompts, model queue and
 * execution ladder live in @/lib/ai/generate-core so that server-side callers
 * — the lesson-plan generators above all — can run a generation in-process
 * instead of making an HTTP request back into the app.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const isCronCall = isValidCronSecret(extractCronSecret(req));
    let role: string | undefined;

    if (isCronCall) {
      role = "admin";
    } else {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();
      if (authErr || !user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const { data: profile } = await supabase
        .from("portal_users")
        .select("role")
        .eq("id", user.id)
        .single();
      role = profile?.role;
    }

    const isPlatform = isCronCall || isPlatformStaffRole(role);
    const isSchoolPartner = isPartnerSchoolRole(role);
    const isStudent = role === "student";
    const isParent = role === "parent";

    const body: GenerateRequest = await req.json();
    const { type } = body;

    // Security: platform staff (admin/teacher) = full professional surface; partner school = narrow ops/commms;
    // students/parents = learning-assist types only (aligned with dashboard / partner lockdown).
    const STUDENT_PARENT_ALLOWED: GenerateType[] = [
      "lesson-hook",
      "daily-missions",
      "code-generation",
      "homework" as GenerateType,
    ];
    const canUseType =
      isPlatform ||
      (isSchoolPartner &&
        (PARTNER_SCHOOL_AI_GENERATE_TYPES as readonly string[]).includes(
          type
        )) ||
      ((isStudent || isParent) && STUDENT_PARENT_ALLOWED.includes(type));

    if (!canUseType) {
      return NextResponse.json(
        {
          error:
            "Forbidden: This AI action is not available for your account type.",
          hint: isSchoolPartner
            ? "Partner school accounts can use report feedback and newsletter drafting only."
            : undefined,
        },
        { status: 403 }
      );
    }

    if (!body.topic?.trim() && !body.prompt?.trim()) {
      return NextResponse.json(
        { error: "topic or prompt is required" },
        { status: 400 }
      );
    }
    if (!VALID_GENERATE_TYPES.includes(type)) {
      return NextResponse.json({ error: "invalid type" }, { status: 400 });
    }

    // ── SSE Streaming path — used when client sends ?stream=1 (lesson type only) ──
    const wantsStream =
      req.nextUrl?.searchParams.get("stream") === "1" && type === "lesson";

    if (wantsStream) {
      const plan = await resolveGenerationPlan(body);
      const enc = new TextEncoder();
      const sseStream = new ReadableStream({
        async start(streamController) {
          const emit = (payload: object) => {
            try {
              streamController.enqueue(
                enc.encode(`data: ${JSON.stringify(payload)}\n\n`)
              );
            } catch {
              /* stream may be closed */
            }
          };

          emit({ status: "Initialising lesson engine..." });

          // Free Gemini first, exactly as the non-streaming path does. This was
          // skipped here, so the single most common generation in the product —
          // a streamed lesson — went straight to OpenRouter and never touched
          // the free ladder it was supposed to prefer. Gemini has no token
          // stream in this client, so progress is reported rather than streamed;
          // the SSE contract is unchanged either way.
          emit({ status: "Generating with Gemini (free)..." });
          const geminiResult = await geminiGenerateText(
            plan.systemPrompt,
            plan.prompt,
            { json: true }
          ).catch(() => null);

          const text = geminiResult?.text ?? "";
          if (text && text.length >= MIN_CONTENT_CHARS) {
            try {
              const parsed = safeParseJSON(text);
              emit({ done: true, model: geminiResult!.model, data: parsed });
              streamController.close();
              return;
            } catch {
              emit({ status: "Falling back to the model queue..." });
            }
          } else if (text) {
            emit({ status: "Answer came back thin — trying another model..." });
          }

          const openRouterKey = process.env.OPENROUTER_API_KEY ?? "";
          if (!openRouterKey) {
            emit({
              error:
                "The free AI tier is busy and no paid fallback is configured. Please try again.",
            });
            streamController.close();
            return;
          }

          for (const modelId of plan.modelQueue) {
            const shortName =
              modelId.split("/").pop()?.split(":")[0] ?? modelId;
            emit({ status: `Generating with ${shortName}...` });

            try {
              const abortCtrl = new AbortController();
              const tid = setTimeout(() => abortCtrl.abort(), 55000);

              // Resumes itself on max_tokens rather than emitting a half-written
              // lesson that safeParseJSON rejects, which used to look like a
              // model failure and send the whole job to the next model.
              const completion = await openRouterComplete({
                apiKey: openRouterKey,
                model: modelId,
                system: plan.systemPrompt,
                user: plan.prompt,
                maxTokens: Math.min(plan.maxTokens, OPENROUTER_MAX_OUTPUT_TOKENS),
                temperature: plan.temperature,
                json: true,
                signal: abortCtrl.signal,
                onContinue: (pass) =>
                  emit({ status: `Still writing — part ${pass + 1}...` }),
              });

              clearTimeout(tid);

              emit({ status: "Assembling lesson blocks..." });
              // A stub that happens to parse is not a lesson. Falling through
              // to the next model is the whole point of having a queue, and
              // free models under load are exactly where stubs come from.
              if (completion.content.length < MIN_CONTENT_CHARS) {
                emit({ status: "Answer came back thin — trying a stronger model..." });
              } else if (completion.content) {
                try {
                  const parsed = safeParseJSON(completion.content);
                  emit({ done: true, model: modelId, data: parsed });
                  streamController.close();
                  return;
                } catch {
                  emit({ status: "Retrying with better model..." });
                }
              } else {
                emit({ status: "Switching to backup model..." });
              }
            } catch {
              emit({ status: "Switching to backup model..." });
            }
          }

          emit({
            error: "All AI models are currently busy. Please try again.",
          });
          streamController.close();
        },
      });

      return new Response(sseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const result = await generateAIContent(body);

    // "custom" answers with free-form content at the top level; everything else
    // answers with { data }. Both shapes predate this route being split out and
    // are relied on by callers, so they are preserved exactly.
    if (result.content !== undefined) {
      return NextResponse.json({
        success: true,
        content: result.content,
        ...(result.extra ?? {}),
      });
    }
    return NextResponse.json({
      success: true,
      model: result.model,
      data: result.data,
    });
  } catch (err: any) {
    const status = err?.status ?? 500;
    const message = err?.message ?? "AI generation failed";
    return NextResponse.json({ error: message }, { status });
  }
}
