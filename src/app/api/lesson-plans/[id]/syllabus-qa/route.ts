import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { buildLessonPlanSyllabusQa } from "@/lib/progression/syllabusQa";
import { canonicalPlanCurriculum } from "@/lib/curriculum/official-direction";
import { canAccessLessonScope } from "@/app/api/lesson-plans/authz";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("portal_users")
    .select("id, role, school_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["teacher", "admin"].includes(profile.role ?? "")) {
    return NextResponse.json(
      { error: "Teacher or admin access required." },
      { status: 403 }
    );
  }

  const { data: plan, error: planErr } = await supabase
    .from("lesson_plans")
    .select(
      `
      id,
      school_id,
      class_id,
      created_by,
      plan_data,
      classes!lesson_plans_class_id_fkey(teacher_id),
      official_curriculum:academic_curriculum_releases!lesson_plans_curriculum_release_id_fkey(content),
      curriculum:course_curricula!fk_lesson_plans_curriculum(content),
      courses(
        programs(
          progression_policy
        )
      )
    `
    )
    .eq("id", id)
    .single();

  if (planErr || !plan) {
    return NextResponse.json(
      { error: "Lesson plan not found." },
      { status: 404 }
    );
  }
  if (profile.role !== "admin") {
    const klass = Array.isArray((plan as any).classes)
      ? (plan as any).classes[0]
      : (plan as any).classes;
    if (!canAccessLessonScope(
      { id: user.id, role: profile.role, school_id: profile.school_id },
      {
        school_id: plan.school_id ?? null,
        created_by: (plan as any).created_by ?? null,
        class_id: (plan as any).class_id ?? null,
        class_teacher_id: klass?.teacher_id ?? null,
      },
    )) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const report = buildLessonPlanSyllabusQa({
    planData: plan.plan_data,
    curriculum: canonicalPlanCurriculum(plan)?.content as any,
    policy:
      (
        plan.courses as {
          programs?: {
            progression_policy?: Record<string, unknown> | null;
          } | null;
        } | null
      )?.programs?.progression_policy ?? null,
  });

  return NextResponse.json({
    data: {
      lesson_plan_id: id,
      ...report,
    },
  });
}
