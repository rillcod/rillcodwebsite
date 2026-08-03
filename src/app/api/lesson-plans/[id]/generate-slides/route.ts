import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTeacherSchoolIds } from "@/lib/auth-utils";
import { requireStaffUser } from "@/app/api/lesson-plans/authz";
import { AIFetchError, fetchAIGenerate } from "@/lib/lesson-plans/ai-fetch";
import { r2Delete, r2Upload } from "@/lib/r2/client";
import {
  normaliseGeneratedSlides,
  renderGeneratedSlideSvg,
} from "@/lib/slides/generated-deck";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type PlanWeek = {
  week?: number;
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

async function findWeekLesson(
  db: ReturnType<typeof createAdminClient>,
  plan: Record<string, any>,
  week: number
) {
  const { data: canonical } = await db
    .from("lessons")
    .select(
      "id,title,description,lesson_notes,content_layout,metadata,lesson_plan_id,curriculum_week_number"
    )
    .eq("lesson_plan_id", plan.id)
    .eq("curriculum_week_number", week)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
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
        Number(metadata?.week ?? metadata?.week_number) === week
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
  const staff = await requireStaffUser(auth);
  if (!staff)
    return NextResponse.json(
      { error: "Staff access required" },
      { status: 403 }
    );

  const db = createAdminClient();
  const { data: plan } = await db
    .from("lesson_plans")
    .select(
      "id,class_id,course_id,school_id,created_by,plan_data,curriculum_release_id,academic_offering_id,offering_period_id,classes!lesson_plans_class_id_fkey(name,teacher_id),courses(title)"
    )
    .eq("id", planId)
    .maybeSingle();
  if (!plan)
    return NextResponse.json(
      { error: "Teaching plan not found" },
      { status: 404 }
    );

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
  const planWeek = weeks.find((row) => Number(row.week) === week);
  if (!planWeek) {
    return NextResponse.json(
      { error: `Week ${week} is not in this teaching plan` },
      { status: 400 }
    );
  }

  const lesson = await findWeekLesson(db, plan as Record<string, any>, week);
  if (!lesson) {
    return NextResponse.json(
      { error: "Generate or add the lesson before creating its slides" },
      { status: 409 }
    );
  }

  const { data: existing } = await db
    .from("lesson_materials")
    .select("id,title,lesson_id,file_url")
    .eq("lesson_id", lesson.id)
    .eq("file_type", "slide-deck")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      data: existing,
      generated: 0,
      skipped: 1,
      already_exists: true,
    });
  }

  const course = Array.isArray(plan.courses) ? plan.courses[0] : plan.courses;
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
    const reason =
      error instanceof AIFetchError ? error.reason : "Slide generation failed";
    return NextResponse.json({ error: reason }, { status: 502 });
  }

  const slides = normaliseGeneratedSlides(aiData.data);
  if (slides.length < 5) {
    return NextResponse.json(
      { error: "The AI returned an incomplete slide deck. Please try again." },
      { status: 502 }
    );
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
        } - Learning Slides`,
        file_type: "slide-deck",
        file_url: JSON.stringify({
          slides: uploadedKeys,
          source: "ai-generated",
        }),
        is_public: true,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(
      { data: material, generated: 1, skipped: 0 },
      { status: 201 }
    );
  } catch (error) {
    await Promise.all(
      uploadedKeys.map((key) => r2Delete(key).catch(() => undefined))
    );
    const message =
      error instanceof Error ? error.message : "Could not save the slide deck";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
