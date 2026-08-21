import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessLessonScope } from "../authz";
import { getTeacherSchoolIds } from "@/lib/auth-utils";
import { canonicalPlanCurriculum } from "@/lib/curriculum/official-direction";
import { parseAutoGenerateSettings } from "@/lib/academic/auto-generate-settings";

export const dynamic = "force-dynamic";
import { getProgressionTermStatus } from "@/lib/progression/termStatus";
import { syncWeeksIntoProgression } from "@/lib/progression/lessonPlanOperation";
import type { Database, Json } from "@/types/supabase";

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("portal_users")
    .select("role, school_id")
    .eq("id", user.id)
    .single();
  return data ? { ...user, role: data.role, school_id: data.school_id } : null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const db = createAdminClient();

  const { data, error } = await db
    .from("lesson_plans")
    .select(
      `
    *,
    courses(
      id,
      title,
      program_id,
      programs(
        id,
        name,
        school_progression_enabled,
        session_frequency_per_week,
        progression_policy
      )
    ),
    classes!lesson_plans_class_id_fkey(id, name),
    schools!lesson_plans_school_id_fkey(id, name),
    lessons!lessons_lesson_plan_id_fkey(id, title, description, course_id, school_id, created_by, lesson_type, status, duration_minutes),
    official_curriculum:academic_curriculum_releases!lesson_plans_curriculum_release_id_fkey(id, release_number, title, content, source_curriculum_id),
    curriculum:course_curricula!fk_lesson_plans_curriculum(id, version, content, school_id)
  `
    )
    .eq("id", id)
    .single();

  if (error || !data)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "admin") {
    const teacherSchoolIds =
      user.role === "teacher"
        ? await getTeacherSchoolIds(user.id, user.school_id)
        : [];
    const allowed = canAccessLessonScope(
      { id: user.id, role: user.role, school_id: user.school_id },
      {
        school_id:
          (data as any)?.lessons?.school_id ?? (data as any)?.school_id ?? null,
        created_by:
          (data as any)?.lessons?.created_by ??
          (data as any)?.created_by ??
          null,
      },
      teacherSchoolIds
    );
    if (!allowed)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch deletion summary counts
  const [lessonsRes, assignmentsRes, auditRes] = await Promise.all([
    db
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .or(`lesson_plan_id.eq.${id},metadata->>lesson_plan_id.eq.${id}`),
    db
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .or(`lesson_plan_id.eq.${id},metadata->>lesson_plan_id.eq.${id}`),
    db
      .from("progression_override_audit")
      .select("id", { count: "exact", head: true })
      .eq("lesson_plan_id", id),
  ]);

  return NextResponse.json({
    data: {
      ...data,
      curriculum: canonicalPlanCurriculum(data),
      deletion_summary: {
        lessons: lessonsRes.count ?? 0,
        assignments: assignmentsRes.count ?? 0,
        audit: auditRes.count ?? 0,
      },
    },
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user || !["admin", "teacher"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const bodyRaw = await request.json().catch(() => ({} as unknown));
  const body = asObject(bodyRaw);
  const db = createAdminClient();

  const { data: existingPlan, error: existingErr } = await db
    .from("lesson_plans")
    .select(
      "id, school_id, created_by, plan_data, metadata, lessons!lessons_lesson_plan_id_fkey(school_id, created_by)"
    )
    .eq("id", id)
    .maybeSingle();
  if (existingErr || !existingPlan)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // For term-level plans (no lesson_id), scope by plan.school_id or plan.created_by
  const planSchoolId =
    (existingPlan as any)?.lessons?.school_id ??
    (existingPlan as any)?.school_id ??
    null;
  const planCreatedBy =
    (existingPlan as any)?.lessons?.created_by ??
    (existingPlan as any)?.created_by ??
    null;

  const teacherSchoolIds =
    user.role === "teacher"
      ? await getTeacherSchoolIds(user.id, user.school_id)
      : [];
  const allowed =
    user.role === "admin" ||
    canAccessLessonScope(
      { id: user.id, role: user.role, school_id: user.school_id },
      { school_id: planSchoolId, created_by: planCreatedBy },
      teacherSchoolIds
    );
  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Cast through unknown: the generated types predate `metadata` on
  // lesson_plans, though the column is live and the automation writes to it.
  const existingPlanRow = existingPlan as unknown as Record<string, unknown>;
  const existingPlanData = asObject(existingPlanRow.plan_data);
  const patchBody: Record<string, unknown> = {};
  for (const key of [
    "plan_data",
    "status",
    "version",
    "term_start",
    "term_end",
    "sessions_per_week",
    "progression_term_status_update",
  ]) {
    if (key in body) patchBody[key] = body[key];
  }

  // `metadata` was absent from that list, so the plan page's automation panel
  // PATCHed its settings, got a 200, showed "saved" — and nothing was written.
  // Merged rather than replaced: the same object carries academic_automation
  // and last_run_at, and a settings save must not erase the automation's own
  // bookkeeping.
  if ("metadata" in body) {
    const existingMetadata = asObject(existingPlanRow.metadata);
    const incomingMetadata = asObject(body.metadata);
    const nextMetadata = {
      ...existingMetadata,
      ...incomingMetadata,
    };
    if ("auto_generate_settings" in incomingMetadata) {
      const previous = parseAutoGenerateSettings(
        existingMetadata.auto_generate_settings
      );
      const next = parseAutoGenerateSettings(
        incomingMetadata.auto_generate_settings
      );
      if (next.auto_publish && !previous.auto_publish && user.role !== "admin") {
        return NextResponse.json(
          {
            error:
              "Trusted auto-release must be approved by an administrator. Automatic preparation can remain on while content waits for review.",
          },
          { status: 403 }
        );
      }
      nextMetadata.auto_generate_settings = next;
      if (next.auto_publish && !previous.auto_publish) {
        nextMetadata.trusted_auto_release = {
          authorized_by: user.id,
          authorized_at: new Date().toISOString(),
        };
      } else if (!next.auto_publish && previous.auto_publish) {
        nextMetadata.trusted_auto_release = {
          ...asObject(existingMetadata.trusted_auto_release),
          revoked_by: user.id,
          revoked_at: new Date().toISOString(),
        };
      }
    }
    patchBody.metadata = nextMetadata;
  }
  let nextPlanData = existingPlanData;

  if (
    patchBody.progression_term_status_update &&
    typeof patchBody.progression_term_status_update === "object"
  ) {
    const update = patchBody.progression_term_status_update as Record<
      string,
      unknown
    >;
    const year = Number(update.year_number ?? 0);
    const term = Number(update.term_number ?? 0);
    const status = update.status;
    if (
      Number.isFinite(year) &&
      Number.isFinite(term) &&
      (status === "draft" || status === "approved" || status === "locked")
    ) {
      const progression = asObject(nextPlanData.progression);
      const generatedTerms = asObject(progression.generated_terms);
      const key = `y${year}t${term}`;
      const termObj = asObject(generatedTerms[key]);
      const before = { term_status: termObj.term_status ?? "draft" };
      termObj.term_status = status;
      generatedTerms[key] = termObj;
      nextPlanData = {
        ...nextPlanData,
        progression: {
          ...progression,
          generated_terms: generatedTerms,
        },
      };
      const auditRow: Database["public"]["Tables"]["progression_override_audit"]["Insert"] =
        {
          lesson_plan_id: id,
          school_id: planSchoolId,
          actor_id: user.id,
          actor_role: user.role,
          year_number: year,
          term_number: term,
          action_type: "term_status_change",
          reason: typeof update.reason === "string" ? update.reason : null,
          before_state: toJson(before),
          after_state: toJson({ term_status: status }),
        };
      await db.from("progression_override_audit").insert(auditRow);
    }
    delete patchBody.progression_term_status_update;
  }

  if (patchBody.plan_data && typeof patchBody.plan_data === "object") {
    const proposedPlanData = asObject(patchBody.plan_data);
    const existingWeeks = Array.isArray(existingPlanData.weeks)
      ? (existingPlanData.weeks as Array<Record<string, unknown>>)
      : [];
    const nextWeeks = Array.isArray(proposedPlanData.weeks)
      ? (proposedPlanData.weeks as Array<Record<string, unknown>>)
      : existingWeeks;
    let lockViolation: { week: number; year: number; term: number } | null =
      null;
    for (const nextWeek of nextWeeks) {
      const weekNum = Number(nextWeek.week ?? 0);
      if (!Number.isFinite(weekNum) || weekNum <= 0) continue;
      const existingWeek =
        existingWeeks.find((w) => Number(w.week ?? -1) === weekNum) ?? null;
      if (!existingWeek) continue;
      if (JSON.stringify(existingWeek) === JSON.stringify(nextWeek)) continue;
      const syllabusRef = asObject(nextWeek.syllabus_ref);
      const year = Number(syllabusRef.year_number ?? 1);
      const term = Number(syllabusRef.term_number ?? 1);
      const status = getProgressionTermStatus(existingPlanData, year, term);
      if (status === "locked") {
        const reason =
          typeof nextWeek.override_reason === "string"
            ? nextWeek.override_reason.trim()
            : "";
        if (!reason) {
          lockViolation = { week: weekNum, year, term };
          break;
        }
        const auditRow: Database["public"]["Tables"]["progression_override_audit"]["Insert"] =
          {
            lesson_plan_id: id,
            school_id: planSchoolId,
            actor_id: user.id,
            actor_role: user.role,
            year_number: year,
            term_number: term,
            week_number: weekNum,
            action_type: "week_edit_while_locked",
            reason,
            before_state: toJson(existingWeek),
            after_state: toJson(nextWeek),
          };
        await db.from("progression_override_audit").insert(auditRow);
      }
    }
    if (lockViolation) {
      return NextResponse.json(
        {
          error: `Week ${lockViolation.week} belongs to locked term Y${lockViolation.year}T${lockViolation.term}. Provide override reason.`,
        },
        { status: 409 }
      );
    }
    if (Array.isArray(proposedPlanData.weeks)) {
      nextPlanData = syncWeeksIntoProgression(
        {
          ...nextPlanData,
          ...proposedPlanData,
        },
        nextWeeks
      ) as unknown as Record<string, unknown>;
    } else {
      nextPlanData = {
        ...nextPlanData,
        ...proposedPlanData,
      };
    }
  }
  patchBody.plan_data = nextPlanData;

  const { data, error } = await db
    .from("lesson_plans")
    .update({ ...patchBody, updated_at: new Date().toISOString() } as any)
    .eq("id", id)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user || !["admin", "teacher"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const db = createAdminClient();

  const { data: existingPlan, error: existingErr } = await db
    .from("lesson_plans")
    .select("id, school_id, created_by, lessons!lessons_lesson_plan_id_fkey(school_id, created_by)")
    .eq("id", id)
    .maybeSingle();
  if (existingErr || !existingPlan)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (user.role !== "admin") {
    const planSchoolId =
      (existingPlan as any)?.lessons?.school_id ??
      (existingPlan as any)?.school_id ??
      null;
    const planCreatedBy =
      (existingPlan as any)?.lessons?.created_by ??
      (existingPlan as any)?.created_by ??
      null;
    const teacherSchoolIds = await getTeacherSchoolIds(user.id, user.school_id);
    const allowed = canAccessLessonScope(
      { id: user.id, role: user.role, school_id: user.school_id },
      { school_id: planSchoolId, created_by: planCreatedBy },
      teacherSchoolIds
    );
    if (!allowed)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cascade both canonical columns and the legacy metadata mirror.
  await db
    .from("lessons")
    .delete()
    .or(`lesson_plan_id.eq.${id},metadata->>lesson_plan_id.eq.${id}`);

  await db
    .from("assignments")
    .delete()
    .or(`lesson_plan_id.eq.${id},metadata->>lesson_plan_id.eq.${id}`);

  const { error } = await db.from("lesson_plans").delete().eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
