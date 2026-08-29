import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessLessonScope } from "../authz";
import { getTeacherSchoolIds } from "@/lib/auth-utils";
import { canonicalPlanCurriculum } from "@/lib/curriculum/official-direction";
import { parseAutoGenerateSettings } from "@/lib/academic/auto-generate-settings";
import { hasLearnerAssignmentEvidence } from "@/lib/academic/record-retention";
import { logAudit } from "@/lib/audit/log";
import { requireSupabaseWrite } from "@/lib/supabase/require-result";
import {
  loadCleanupPolicy,
  mayHardDeleteRebuildableContent,
  STRICT_CLEANUP_MESSAGE,
} from "@/lib/operations/cleanup-policy";

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
    classes!lesson_plans_class_id_fkey(id, name, teacher_id),
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
    const klass = Array.isArray((data as any)?.classes)
      ? (data as any).classes[0]
      : (data as any)?.classes;
    const teacherSchoolIds =
      user.role === "teacher"
        ? await getTeacherSchoolIds(user.id, user.school_id)
        : [];
    const allowed = canAccessLessonScope(
      { id: user.id, role: user.role, school_id: user.school_id },
      {
        school_id: (data as any)?.school_id ?? null,
        created_by: (data as any)?.created_by ?? null,
        class_id: (data as any)?.class_id ?? null,
        class_teacher_id: klass?.teacher_id ?? null,
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
      .eq("lesson_plan_id", id),
    db
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("lesson_plan_id", id),
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

  // Class ownership is a workflow transition, not ordinary plan metadata.
  // The old UI sent { class_id } here even though this PATCH whitelist never
  // persisted it, creating a false-success state. Require the single atomic
  // adoption endpoint so plan, child content, visibility and evidence guards
  // always move together.
  if ("class_id" in body) {
    return NextResponse.json(
      {
        error:
          "Class ownership is changed through the historical-plan adoption flow.",
        code: "USE_ADOPT_CLASS_ENDPOINT",
      },
      { status: 409 },
    );
  }

  const { data: existingPlan, error: existingErr } = await db
    .from("lesson_plans")
    .select(
      "id, school_id, class_id, created_by, plan_data, metadata, classes!lesson_plans_class_id_fkey(teacher_id), lessons!lessons_lesson_plan_id_fkey(school_id, created_by)"
    )
    .eq("id", id)
    .maybeSingle();
  if (existingErr || !existingPlan)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Scope the canonical class plan by its own school/creator and assigned teacher.
  const planSchoolId =
    (existingPlan as any)?.school_id ??
    null;
  const planCreatedBy =
    (existingPlan as any)?.created_by ??
    null;
  const planClass = Array.isArray((existingPlan as any)?.classes)
    ? (existingPlan as any).classes[0]
    : (existingPlan as any)?.classes;

  const teacherSchoolIds =
    user.role === "teacher"
      ? await getTeacherSchoolIds(user.id, user.school_id)
      : [];
  const allowed =
    user.role === "admin" ||
    canAccessLessonScope(
      { id: user.id, role: user.role, school_id: user.school_id },
      {
        school_id: planSchoolId,
        created_by: planCreatedBy,
        class_id: (existingPlan as any)?.class_id ?? null,
        class_teacher_id: planClass?.teacher_id ?? null,
      },
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
    .select("id, school_id, class_id, created_by, classes!lesson_plans_class_id_fkey(teacher_id), lessons!lessons_lesson_plan_id_fkey(id, school_id, created_by)")
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
    const planClass = Array.isArray((existingPlan as any)?.classes)
      ? (existingPlan as any).classes[0]
      : (existingPlan as any)?.classes;
    const teacherSchoolIds = await getTeacherSchoolIds(user.id, user.school_id);
    const allowed = canAccessLessonScope(
      { id: user.id, role: user.role, school_id: user.school_id },
      {
        school_id: planSchoolId,
        created_by: planCreatedBy,
        class_id: (existingPlan as any)?.class_id ?? null,
        class_teacher_id: planClass?.teacher_id ?? null,
      },
      teacherSchoolIds
    );
    if (!allowed)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cleanupPolicy = await loadCleanupPolicy(db as any);
  if (!mayHardDeleteRebuildableContent(cleanupPolicy)) {
    return NextResponse.json({ error: STRICT_CLEANUP_MESSAGE, code: 'STRICT_RETENTION' }, { status: 409 });
  }

  // Migration 100 makes the complete cleanup one database transaction. Keep the
  // explicit fallback below during rolling deployment, but prefer the atomic path.
  const atomic = await (db as any).rpc('delete_lesson_plan_preserving_learner_work', {
    p_plan_id: id,
    p_actor_id: user.id,
  });
  if (!atomic.error) {
    const preserved = Number(atomic.data?.preserved_learner_assignments || 0);
    const removed = Number(atomic.data?.removed_unused_assignments || 0);
    const preservedWritten = Number(atomic.data?.preserved_written_exams || 0);
    const preservedCbt = Number(atomic.data?.preserved_cbt_exams || 0);
    const preservedTotal = preserved + preservedWritten + preservedCbt;
    await logAudit(db as any, {
      action: 'delete_lesson_plan_keep_learner_work',
      actorId: user.id,
      resourceType: 'lesson_plan',
      resourceId: id,
      newValue: preservedTotal > 0
        ? `Deleted the lesson plan and kept ${preservedTotal} assessment${preservedTotal === 1 ? '' : 's'} with learner work`
        : 'Deleted the lesson plan and its unused generated assignment drafts',
      newValues: {
        preserved_learner_assignments: preserved,
        preserved_written_exams: preservedWritten,
        preserved_cbt_exams: preservedCbt,
        removed_unused_assignments: removed,
        atomic: true,
      },
    });
    return NextResponse.json({
      success: true,
      preserved_learner_assignments: preserved,
      preserved_written_exams: preservedWritten,
      preserved_cbt_exams: preservedCbt,
      removed_unused_assignments: removed,
    });
  }
  const atomicCode = String(atomic.error?.code || '');
  const atomicMessage = String(atomic.error?.message || '');
  const missingAtomicFunction = atomicCode === 'PGRST202'
    || atomicCode === '42883'
    || /delete_lesson_plan_preserving_learner_work.*(schema cache|does not exist|not find)/i.test(atomicMessage);
  if (!missingAtomicFunction) {
    console.error('[lesson-plan-delete] atomic cleanup failed', atomic.error);
    const status = atomicCode === '42501' ? 403 : atomicCode === 'P0002' ? 404 : 500;
    return NextResponse.json({
      error: status === 403
        ? 'You do not have permission to remove this lesson plan.'
        : status === 404
          ? 'Lesson plan not found.'
          : 'The lesson plan could not be removed safely. Nothing was deleted.',
    }, { status });
  }

  const lessonRows = Array.isArray((existingPlan as any).lessons)
    ? (existingPlan as any).lessons
    : (existingPlan as any).lessons ? [(existingPlan as any).lessons] : [];
  const lessonIds = lessonRows.map((row: any) => String(row.id || '')).filter(Boolean);
  const assignmentFilters = [
    `lesson_plan_id.eq.${id}`,
    ...(lessonIds.length > 0 ? [`lesson_id.in.(${lessonIds.join(',')})`] : []),
  ];
  const { data: linkedAssignments, error: assignmentError } = await (db as any)
    .from("assignments")
    .select("id,title,metadata,lesson_id,lesson_plan_id")
    .or(assignmentFilters.join(','));
  if (assignmentError) {
    console.error('[lesson-plan-delete] linked assignment lookup failed', assignmentError);
    return NextResponse.json({ error: 'The lesson plan could not be checked safely. Nothing was deleted.' }, { status: 500 });
  }

  const assignmentIds = (linkedAssignments ?? []).map((row: any) => String(row.id)).filter(Boolean);
  const { data: submissions, error: submissionError } = assignmentIds.length > 0
    ? await (db as any).from('assignment_submissions')
        .select('id,assignment_id,submission_text,file_url,submitted_at,answers,grade,weighted_score,graded_at,graded_by,grading_mode,status')
        .in('assignment_id', assignmentIds)
    : { data: [], error: null };
  if (submissionError) {
    console.error('[lesson-plan-delete] learner evidence lookup failed', submissionError);
    return NextResponse.json({ error: 'Learner work could not be checked safely. Nothing was deleted.' }, { status: 500 });
  }

  const protectedAssignmentIds = new Set(
    (submissions ?? [])
      .filter(hasLearnerAssignmentEvidence)
      .map((row: any) => String(row.assignment_id)),
  );
  const protectedAssignments = (linkedAssignments ?? []).filter((row: any) => protectedAssignmentIds.has(String(row.id)));
  const disposableAssignmentIds = assignmentIds.filter((assignmentId: string) => !protectedAssignmentIds.has(assignmentId));

  // Preserve learner work as a standalone class assignment while allowing the
  // rebuildable plan and its generated drafts to be cleared.
  for (const assignment of protectedAssignments) {
    const metadata = { ...asObject(assignment.metadata) };
    delete metadata.lesson_plan_id;
    await requireSupabaseWrite(
      (db as any).from('assignments').update({
        lesson_plan_id: null,
        lesson_id: null,
        metadata: toJson(metadata),
        updated_at: new Date().toISOString(),
      }).eq('id', assignment.id),
      `preserve learner assignment ${assignment.id}`,
    );
  }

  if (disposableAssignmentIds.length > 0) {
    await requireSupabaseWrite(
      (db as any).from('assignment_submissions').delete().in('assignment_id', disposableAssignmentIds),
      'remove unused assignment drafts',
    );
    await requireSupabaseWrite(
      (db as any).from('assignments').delete().in('id', disposableAssignmentIds),
      'remove assignments without learner work',
    );
  }

  // Rolling-deploy fallback for assessment content. Attempts are learner
  // evidence: detach their assessment from the plan; delete only unused drafts.
  const preserveAssessments = async (
    table: 'exams' | 'cbt_exams',
    attemptsTable: 'exam_attempts' | 'cbt_sessions',
  ): Promise<{ preserved: number; removed: number }> => {
    const { data: assessments, error: assessmentsError } = await (db as any)
      .from(table)
      .select('id,metadata')
      .eq('lesson_plan_id', id);
    if (assessmentsError) throw new Error(`Could not verify ${table}`);
    const ids = (assessments ?? []).map((row: any) => String(row.id)).filter(Boolean);
    if (ids.length === 0) return { preserved: 0, removed: 0 };
    const { data: attempts, error: attemptsError } = await (db as any)
      .from(attemptsTable)
      .select('exam_id')
      .in('exam_id', ids);
    if (attemptsError) throw new Error(`Could not verify learner attempts for ${table}`);
    const protectedIds = new Set((attempts ?? []).map((row: any) => String(row.exam_id)));
    for (const assessment of assessments ?? []) {
      if (!protectedIds.has(String(assessment.id))) continue;
      const metadata = { ...asObject(assessment.metadata) };
      delete metadata.lesson_plan_id;
      await requireSupabaseWrite(
        (db as any).from(table).update({
          lesson_plan_id: null,
          lesson_id: null,
          metadata: toJson(metadata),
          updated_at: new Date().toISOString(),
        }).eq('id', assessment.id),
        `preserve learner attempts for ${assessment.id}`,
      );
    }
    const disposable = ids.filter((assessmentId: string) => !protectedIds.has(assessmentId));
    if (disposable.length > 0) {
      await requireSupabaseWrite(
        (db as any).from(table).delete().in('id', disposable),
        `remove unused ${table}`,
      );
    }
    return { preserved: protectedIds.size, removed: disposable.length };
  };

  let writtenFallback: { preserved: number; removed: number };
  let cbtFallback: { preserved: number; removed: number };
  try {
    [writtenFallback, cbtFallback] = await Promise.all([
      preserveAssessments('exams', 'exam_attempts'),
      preserveAssessments('cbt_exams', 'cbt_sessions'),
    ]);
  } catch (assessmentError) {
    console.error('[lesson-plan-delete] assessment preservation failed', assessmentError);
    return NextResponse.json({
      error: 'Learner assessment attempts could not be checked safely. The lesson plan was not removed.',
    }, { status: 500 });
  }

  await requireSupabaseWrite(
    (db as any).from("lessons").delete().eq("lesson_plan_id", id),
    'remove lesson plan content',
  );

  const { error } = await db.from("lesson_plans").delete().eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(db as any, {
    action: 'delete_lesson_plan_keep_learner_work',
    actorId: user.id,
    resourceType: 'lesson_plan',
    resourceId: id,
    oldValues: {
      linked_assignments: assignmentIds.length,
      preserved_learner_assignments: protectedAssignmentIds.size,
      preserved_written_exams: writtenFallback.preserved,
      preserved_cbt_exams: cbtFallback.preserved,
    },
    newValue: protectedAssignmentIds.size > 0
      ? `Deleted the lesson plan and kept ${protectedAssignmentIds.size} assignment${protectedAssignmentIds.size === 1 ? '' : 's'} with learner work`
      : 'Deleted the lesson plan and its unused generated assignment drafts',
  });
  return NextResponse.json({
    success: true,
    preserved_learner_assignments: protectedAssignmentIds.size,
    preserved_written_exams: writtenFallback.preserved,
    preserved_cbt_exams: cbtFallback.preserved,
    removed_unused_assignments: disposableAssignmentIds.length,
  });
}
