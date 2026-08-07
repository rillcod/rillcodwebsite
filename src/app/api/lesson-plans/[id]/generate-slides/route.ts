import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTeacherSchoolIds } from "@/lib/auth-utils";
import { requireStaffUser } from "@/app/api/lesson-plans/authz";
import { extractCronSecret, isValidCronSecret } from "@/lib/server/cron-auth";
import { AIFetchError, fetchAIGenerate } from "@/lib/lesson-plans/ai-fetch";
import { validateLessonPlanForGeneration } from "@/lib/api-guards";
import { r2Copy, r2Delete, r2Upload } from "@/lib/r2/client";
import { reuseWeekContent } from "@/lib/academic/content-reuse-server";
import {
  normaliseGeneratedSlides,
  renderGeneratedSlideSvg,
} from "@/lib/slides/generated-deck";
import {
  assetMeetingSession,
  parseRequestSession,
} from "@/lib/academic/session-identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type PlanWeek = {
  week?: number;
  session?: number;
  topic?: string;
  objectives?: string;
  activities?: string;
  notes?: string;
};

function lessonSummary(lesson: Record<string, unknown>): string {
  const layout = Array.isArray(lesson.content_layout)
    ? lesson.content_layout
        .map((block) => {
          if (!block || typeof block !== "object") return "";
          const row = block as Record<string, unknown>;
          const content = typeof row.content === "string" ? row.content : "";
          const title = typeof row.title === "string" ? row.title : "";
          const terms = Array.isArray(row.terms)
            ? row.terms
                .map((term) =>
                  term && typeof term === "object"
                    ? `${String(
                        (term as Record<string, unknown>).term ?? ""
                      )}: ${String(
                        (term as Record<string, unknown>).definition ?? ""
                      )}`
                    : ""
                )
                .filter(Boolean)
                .join("; ")
            : "";
          return [title, content, terms].filter(Boolean).join(": ");
        })
        .filter(Boolean)
        .join("\n")
    : "";

  return [
    typeof lesson.description === "string" ? lesson.description : "",
    typeof lesson.lesson_notes === "string" ? lesson.lesson_notes : "",
    layout,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 7000);
}

function sessionMatches(
  metadata: Record<string, unknown> | null | undefined,
  session: number | null,
): boolean {
  if (session == null || session < 1) return true;
  const got = assetMeetingSession({ metadata });
  return got === session;
}

async function findWeekLesson(
  db: ReturnType<typeof createAdminClient>,
  plan: Record<string, any>,
  week: number,
  session: number | null = null,
) {
  const { data: candidates } = await db
    .from("lessons")
    .select(
      "id,title,description,lesson_notes,content_layout,metadata,lesson_plan_id,curriculum_week_number"
    )
    .eq("lesson_plan_id", plan.id)
    .eq("curriculum_week_number", week)
    .order("created_at", { ascending: false })
    .limit(20);

  const canonical = (candidates ?? []).find((lesson) =>
    sessionMatches(lesson.metadata as Record<string, unknown> | null, session),
  );
  if (canonical) return canonical;

  const { data: legacy } = await db
    .from("lessons")
    .select(
      "id,title,description,lesson_notes,content_layout,metadata,lesson_plan_id,curriculum_week_number"
    )
    .eq("course_id", plan.course_id)
    .eq("school_id", plan.school_id)
    .order("created_at", { ascending: false })
    .limit(500);
  return (
    (legacy ?? []).find((lesson) => {
      const metadata = lesson.metadata as Record<string, unknown> | null;
      return (
        metadata?.lesson_plan_id === plan.id &&
        Number(metadata?.week ?? metadata?.week_number) === week &&
        sessionMatches(metadata, session)
      );
    }) ?? null
  );
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await context.params;
  const auth = await createServerClient();
  // Slides was the only generator with no service path, so an automated run
  // produced a lesson, an assignment and a project, and then silently never
  // produced the slides for them. The other three already accept the cron
  // secret; this makes the five-part package reachable as one package.
  const isCron = isValidCronSecret(extractCronSecret(req));
  const staff = isCron
    ? { id: "cron", role: "admin", school_id: null }
    : await requireStaffUser(auth);
  if (!staff)
    return NextResponse.json(
      { error: "Staff access required" },
      { status: 403 }
    );

  const db = createAdminClient();
  const { data: plan } = await db
    .from("lesson_plans")
    .select(
      "id,status,class_id,course_id,school_id,created_by,plan_data,curriculum_release_id,academic_offering_id,offering_period_id,classes!lesson_plans_class_id_fkey(name,teacher_id),courses(title)"
    )
    .eq("id", planId)
    .maybeSingle();
  // Same gate as the lesson/assignment/project generators. Slides used to skip
  // it, so a draft plan failed here for a missing lesson rather than for the
  // reason that actually mattered — which is how "only flashcards work" looked
  // like five unrelated faults instead of one unpublished plan.
  const validationError = validateLessonPlanForGeneration(plan);
  if (validationError || !plan) {
    const block =
      validationError ??
      ({
        error: "Teaching plan not found",
        status: 404,
        reason: "not_found" as const,
      });
    const { status, ...payload } = block;
    return NextResponse.json(payload, { status });
  }

  const klass = Array.isArray(plan.classes) ? plan.classes[0] : plan.classes;
  if (staff.role !== "admin") {
    const schoolIds = await getTeacherSchoolIds(staff.id, staff.school_id);
    const ownsPlan =
      plan.created_by === staff.id || klass?.teacher_id === staff.id;
    if (!ownsPlan || !plan.school_id || !schoolIds.includes(plan.school_id)) {
      return NextResponse.json(
        { error: "You can only generate slides for your assigned class" },
        { status: 403 }
      );
    }
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const week = Number(body.week);
  /** Opt-in: replace an existing deck instead of reporting it already exists. */
  const regenerate = body.regenerate === true;
  const onlySession = parseRequestSession(body);
  if (!Number.isInteger(week) || week < 1) {
    return NextResponse.json(
      { error: "Choose a valid teaching week" },
      { status: 400 }
    );
  }

  const weeks = Array.isArray(
    (plan.plan_data as { weeks?: unknown[] } | null)?.weeks
  )
    ? (plan.plan_data as { weeks: PlanWeek[] }).weeks
    : [];
  const planWeeks = weeks.filter((row) => {
    if (Number(row.week) !== week) return false;
    if (onlySession == null) return true;
    const s = Number(row.session ?? 0);
    return Number.isFinite(s) && s > 0
      ? Math.floor(s) === onlySession
      : onlySession === 1;
  });
  if (!planWeeks.length) {
    return NextResponse.json(
      { error: `Week ${week} is not in this teaching plan` },
      { status: 400 }
    );
  }

  const course = Array.isArray(plan.courses) ? plan.courses[0] : plan.courses;
  let generated = 0;
  let skipped = 0;
  const results: unknown[] = [];
  let lastError: string | null = null;

  for (const planWeek of planWeeks) {
    const sessionRaw = Number(planWeek.session ?? 0);
    const session =
      Number.isFinite(sessionRaw) && sessionRaw > 0
        ? Math.floor(sessionRaw)
        : null;
    const lesson = await findWeekLesson(
      db,
      plan as Record<string, any>,
      week,
      session,
    );
    if (!lesson) {
      lastError = "Generate or add the lesson before creating its slides";
      skipped += 1;
      continue;
    }

    // Cast: content_stale_at was added by 20260929000046 and the generated
    // Supabase types have not been regenerated since, so the column is real but
    // the type does not know it — the same note migration 41 left on lessons.
    const { data: existing } = (await (db as any)
      .from("lesson_materials")
      .select("id,title,lesson_id,file_url,content_stale_at")
      .eq("lesson_id", lesson.id)
      .eq("file_type", "slide-deck")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()) as {
      data: {
        id: string;
        title: string | null;
        lesson_id: string | null;
        file_url: string | null;
        content_stale_at: string | null;
      } | null;
    };

    // A deck whose lesson has since been corrected is stale (20260929000046)
    // and is rebuilt whether or not the caller asked to regenerate. Skipping it
    // would leave the class being taught from slides the lesson no longer says,
    // and nothing on the row would show the mismatch.
    const isStale = Boolean((existing as { content_stale_at?: string | null })?.content_stale_at);
    const rebuild = regenerate || isStale;

    if (existing && !rebuild) {
      results.push(existing);
      skipped += 1;
      continue;
    }
    if (existing && rebuild) {
      try {
        const parsed = JSON.parse(String(existing.file_url ?? "{}"));
        const oldKeys: string[] = Array.isArray(parsed?.slides)
          ? parsed.slides
          : [];
        await Promise.all(oldKeys.map((key) => r2Delete(key).catch(() => {})));
      } catch {
        /* unreadable payload */
      }
      await db.from("lesson_materials").delete().eq("id", existing.id);
    }

    // Copy this week's deck from a class that already rendered it.
    //
    // Slides are the second AI call of every week — the lesson is copied for
    // free and then this paid the model again for slides of the very same
    // lesson. Matched on file_type so it can only ever copy a generated deck,
    // never a PDF or link a teacher uploaded to their own lesson.
    //
    // The storage objects are duplicated rather than shared. Two rows pointing
    // at one set of keys looks fine until the source class regenerates: that
    // path deletes the old keys, and every class that copied from it is left
    // with a healthy-looking row whose slides no longer exist.
    const slideReuse = await reuseWeekContent({
      db: db as never,
      table: "lesson_materials",
      releaseId: (plan as Record<string, any>).curriculum_release_id ?? null,
      week,
      targetPlanId: plan.id,
      classId: (plan as Record<string, any>).class_id ?? null,
      match: { file_type: "slide-deck" },
      scope: {
        schoolId: (plan as Record<string, any>).school_id ?? null,
        termId: (plan as Record<string, any>).term_id ?? null,
        courseId: course?.id ?? null,
        lessonId: lesson.id,
        offeringId: (plan as Record<string, any>).academic_offering_id ?? null,
        periodId: (plan as Record<string, any>).offering_period_id ?? null,
      },
      transform: async (source) => {
        const parsed = JSON.parse(String(source.file_url ?? "{}"));
        const sourceKeys: string[] = Array.isArray(parsed?.slides) ? parsed.slides : [];
        if (!sourceKeys.length) throw new Error("source deck has no slides");

        const copied: string[] = [];
        try {
          for (const sourceKey of sourceKeys) {
            copied.push(
              await r2Copy(
                sourceKey,
                `${plan.school_id || "global"}/lesson-slides/${lesson.id}/${randomUUID()}.svg`
              )
            );
          }
        } catch (error) {
          // Half a deck is not a deck. Take the orphans back out before giving
          // up, or every failed copy leaves paid-for storage nothing points at.
          await Promise.all(copied.map((key) => r2Delete(key).catch(() => {})));
          throw error;
        }

        return {
          file_url: JSON.stringify({
            ...parsed,
            slides: copied,
            ...(session != null ? { session } : {}),
          }),
        };
      },
    });

    if (slideReuse.copied) {
      results.push({ id: slideReuse.id, lesson_id: lesson.id });
      generated += 1;
      continue;
    }

    let aiData: { success: true; data: unknown };
    try {
      aiData = await fetchAIGenerate({
        type: "slides",
        topic: lesson.title || planWeek.topic || `Week ${week}`,
        className: klass?.name || "Basic 1 to SS3",
        gradeLevel: klass?.name || "Basic 1 to SS3",
        courseName: course?.title || "STEM & Technology",
        planWeekObjectives: planWeek.objectives || "",
        planWeekActivities: planWeek.activities || "",
        syllabusReference: planWeek.notes || "",
        lessonSummary: lessonSummary(lesson as Record<string, unknown>),
        slideCount: 7,
      });
    } catch (error) {
      lastError =
        error instanceof AIFetchError ? error.reason : "Slide generation failed";
      skipped += 1;
      continue;
    }

    const slides = normaliseGeneratedSlides(aiData.data);
    if (slides.length < 5) {
      lastError = "The AI returned an incomplete slide deck. Please try again.";
      skipped += 1;
      continue;
    }

    const uploadedKeys: string[] = [];
    try {
      for (let index = 0; index < slides.length; index += 1) {
        const key = `${plan.school_id || "global"}/lesson-slides/${
          lesson.id
        }/${randomUUID()}.svg`;
        const svg = renderGeneratedSlideSvg(slides[index], {
          index,
          total: slides.length,
          courseTitle: course?.title || "Rillcod Academy",
          week,
        });
        await r2Upload(
          key,
          Buffer.from(svg, "utf8"),
          "image/svg+xml; charset=utf-8"
        );
        uploadedKeys.push(key);
      }

      const sessionLabel =
        session != null && session > 0 ? ` · Session ${session}` : "";
      const { data: material, error } = await db
        .from("lesson_materials")
        .insert({
          lesson_id: lesson.id,
          lesson_plan_id: plan.id,
          class_id: plan.class_id,
          curriculum_release_id: plan.curriculum_release_id,
          academic_offering_id: plan.academic_offering_id,
          offering_period_id: plan.offering_period_id,
          curriculum_week_number: week,
          title: `${
            lesson.title || planWeek.topic || `Week ${week}`
          }${sessionLabel} - Learning Slides`,
          file_type: "slide-deck",
          file_url: JSON.stringify({
            slides: uploadedKeys,
            source: "ai-generated",
            ...(session != null ? { session } : {}),
          }),
          is_public: true,
        })
        .select()
        .single();

      if (error) throw error;
      results.push(material);
      generated += 1;
    } catch (error) {
      await Promise.all(
        uploadedKeys.map((key) => r2Delete(key).catch(() => undefined))
      );
      lastError =
        error instanceof Error ? error.message : "Could not save the slide deck";
      skipped += 1;
    }
  }

  if (generated === 0 && results.length === 0) {
    return NextResponse.json(
      { error: lastError || "Could not generate slides for this week" },
      { status: lastError?.includes("lesson") ? 409 : 502 }
    );
  }

  return NextResponse.json(
    {
      data: results.length === 1 ? results[0] : results,
      generated,
      skipped,
      ...(generated === 0 ? { already_exists: true, can_regenerate: true } : {}),
    },
    { status: generated > 0 ? 201 : 200 }
  );
}
