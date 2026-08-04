import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffUser, canAccessLessonScope } from "@/app/api/lesson-plans/authz";
import { extractCronSecret, isValidCronSecret } from "@/lib/server/cron-auth";
import { getTeacherSchoolIds } from "@/lib/auth-utils";
import { validateLessonPlanForGeneration } from "@/lib/api-guards";
import { geminiGenerateText } from "@/lib/gemini/client";

export const dynamic = "force-dynamic";

type AiGeneratedCard = {
  front?: string;
  back?: string;
  tags?: string[];
  difficulty?: string;
};

const FLASHCARD_SYSTEM_PROMPT = `You are an expert educational content creator for Rillcod Technologies, a Christian STEM innovation academy.
Generate high-quality flashcards that are clear, accurate, and pedagogically sound.
Each card should have a clear question or concept on the front and a concise, complete answer on the back.
Return ONLY valid JSON — no markdown fences, no extra text.`;

function buildFlashcardPrompt(topic: string, count: number, content?: string): string {
  const contextBlock = content?.trim()
    ? `\nLesson context (use this to make cards more relevant):\n${content.trim().slice(0, 2000)}`
    : "";
  return `Generate exactly ${count} flashcards about: "${topic}"${contextBlock}

Return a JSON object with this exact shape:
{
  "cards": [
    {
      "front": "string — question or concept to test",
      "back": "string — clear, complete answer or explanation",
      "tags": ["string — relevant topic tags"],
      "difficulty": "medium"
    }
  ]
}

RULES:
- Generate EXACTLY ${count} cards — no more, no less.
- front: concise question or prompt (max 20 words).
- back: clear answer with enough context to be self-explanatory (1-3 sentences).
- Vary question types: definitions, applications, comparisons, code output, true/false reasoning.
- British English throughout.`;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const sessionClient = await createServerClient();
  const cronSecret = extractCronSecret(req);
  const isCron = isValidCronSecret(cronSecret);
  const staff = isCron
    ? { id: "cron", role: "admin", school_id: null }
    : await requireStaffUser(sessionClient);
  if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data: plan, error: planErr } = await (db as any)
    .from("lesson_plans")
    .select(
      "*, courses(title), classes!lesson_plans_class_id_fkey(name,teacher_id), official_curriculum:academic_curriculum_releases!lesson_plans_curriculum_release_id_fkey(content), curriculum:course_curricula(content, version)"
    )
    .eq("id", id)
    .single();

  const validationError = validateLessonPlanForGeneration(planErr ? null : plan);
  if (validationError) {
    const { status, ...payload } = validationError;
    return NextResponse.json(payload, { status });
  }

  if (!isCron && staff.role !== "admin") {
    const teacherSchoolIds =
      staff.role === "teacher"
        ? await getTeacherSchoolIds(staff.id, staff.school_id)
        : [];
    const allowed = canAccessLessonScope(
      staff,
      {
        school_id: (plan as any)?.school_id ?? null,
        created_by: (plan as any)?.created_by ?? null,
      },
      teacherSchoolIds
    );
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const week = Number(body.week);
  if (!Number.isInteger(week) || week < 1) {
    return NextResponse.json({ error: "week must be a positive integer" }, { status: 400 });
  }

  const weekMeta = Array.isArray((plan as any)?.plan_data?.weeks)
    ? (plan as any).plan_data.weeks.find((w: any) => Number(w.week) === week)
    : null;
  if (!weekMeta) {
    return NextResponse.json({ error: "That week is not in this teaching plan" }, { status: 422 });
  }

  const { data: existingDeck } = await (db as any)
    .from("flashcard_decks")
    .select("id,title")
    .eq("lesson_plan_id", id)
    .eq("curriculum_week_number", week)
    .eq("class_id", (plan as any).class_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingDeck?.id) {
    return NextResponse.json({ data: existingDeck, generated: 0, skipped: 1, already_exists: true });
  }

  const { data: lesson } = await (db as any)
    .from("lessons")
    .select("id,title,content_layout")
    .eq("lesson_plan_id", id)
    .eq("curriculum_week_number", week)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Hold for approval unless the caller explicitly asked to publish live.
  // DB default is also false; setting it here keeps auto_publish honest.
  const isPublic = body.auto_publish === true;
  const title = `Week ${week}: ${(weekMeta.topic || "Flashcards").toString()}`;

  // flashcard_decks.created_by is NOT NULL, while lessons and assignments
  // tolerate a null creator. So a plan whose creator was never recorded
  // generated four of the five parts and failed the fifth on a raw Postgres
  // constraint. The class teacher owns the week either way, so they are the
  // honest owner of its cards.
  const planClass = Array.isArray((plan as any).classes)
    ? (plan as any).classes[0]
    : (plan as any).classes;
  const deckOwner = isCron
    ? (plan as any).created_by ?? planClass?.teacher_id ?? null
    : staff.id;
  if (!deckOwner) {
    return NextResponse.json(
      {
        error:
          "This plan has no recorded owner, so its flashcards cannot be attributed.",
        detail:
          "Set a class teacher on the class, or regenerate from the plan page while signed in.",
      },
      { status: 422 }
    );
  }
  const { data: deck, error: deckError } = await (db as any)
    .from("flashcard_decks")
    .insert({
      title,
      lesson_id: lesson?.id ?? null,
      course_id: (plan as any).course_id ?? null,
      class_id: (plan as any).class_id ?? null,
      lesson_plan_id: id,
      curriculum_week_number: week,
      is_public: isPublic,
      created_by: deckOwner,
      school_id: (plan as any).school_id ?? null,
      term_id: (plan as any).term_id ?? null,
      academic_offering_id: (plan as any).academic_offering_id ?? null,
      offering_period_id: (plan as any).offering_period_id ?? null,
      curriculum_release_id: (plan as any).curriculum_release_id ?? null,
    })
    .select("id,title")
    .single();
  if (deckError || !deck?.id) {
    return NextResponse.json({ error: deckError?.message || "Deck creation failed" }, { status: 500 });
  }

  const contextText = Array.isArray(lesson?.content_layout)
    ? lesson.content_layout
        .map((b: any) => b?.content || b?.title || "")
        .filter(Boolean)
        .join("\n")
    : "";
  const prompt = buildFlashcardPrompt(String(weekMeta.topic || "This week"), 15, contextText);
  const aiResult = await geminiGenerateText(FLASHCARD_SYSTEM_PROMPT, prompt, true);
  if (!aiResult?.text) {
    return NextResponse.json({ error: "AI returned empty response" }, { status: 502 });
  }
  let parsed: { cards?: AiGeneratedCard[] };
  try {
    const clean = aiResult.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    return NextResponse.json({ error: "AI returned invalid JSON for flashcards" }, { status: 502 });
  }
  const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
  const cardsToInsert = cards
    .map((card, index) => ({
      deck_id: deck.id,
      front: card.front?.trim() || "",
      back: card.back?.trim() || "",
      tags: Array.isArray(card.tags) ? card.tags : [],
      difficulty_level: card.difficulty || "medium",
      template: "classic",
      position: index + 1,
    }))
    .filter((card) => card.front && card.back);
  if (!cardsToInsert.length) {
    return NextResponse.json({ error: "No valid flashcards generated" }, { status: 502 });
  }

  const { data: inserted, error: insertError } = await (db as any)
    .from("flashcard_cards")
    .insert(cardsToInsert)
    .select("id");
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    data: { id: deck.id, title: deck.title },
    generated: inserted?.length ?? cardsToInsert.length,
    skipped: 0,
  });
}
