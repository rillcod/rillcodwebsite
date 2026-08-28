/**
 * Admin cleanup for a course_curricula draft row.
 *
 * After migration 20260929000016, FKs cascade on delete/update so wiping a
 * curriculum pulls releases → plans → assignments/flashcards/exams with it.
 * Until then (and as a belt-and-suspenders), we explicitly purge releases and
 * plan children via admin RPCs / manual deletes.
 */

import { hasLearnerAssignmentEvidence } from "@/lib/academic/record-retention";

type AdminClient = any;

const CURRICULUM_LEARNER_WORK_MESSAGE =
  "This curriculum still holds learner submissions, attempts, or week scores. Those records stay. Remove unused drafts, or withdraw the edition.";

export type TeachingOrphanCounts = {
  lesson_plans: number;
  lessons: number;
  assignments: number;
  flashcards: number;
  exams: number;
  cbt_exams: number;
};

export type TeachingOrphanScan = {
  orphan_lesson_plans: any[];
  orphan_lessons: any[];
  orphan_assignments: any[];
  orphan_flashcards: any[];
  orphan_exams: any[];
  orphan_cbt_exams: any[];
  counts: TeachingOrphanCounts;
};

async function step(
  label: string,
  run: () => Promise<{ error: { message: string } | null }>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await run();
  if (error) return { ok: false, error: `${label}: ${error.message}` };
  return { ok: true };
}

async function refuseIfPlansHoldLearnerWork(
  admin: AdminClient,
  planIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (planIds.length === 0) return { ok: true };

  const [assignments, exams, cbtExams, weekScores, evidence] = await Promise.all([
    admin.from("assignments").select("id").in("lesson_plan_id", planIds),
    admin.from("exams").select("id").in("lesson_plan_id", planIds),
    admin.from("cbt_exams").select("id").in("lesson_plan_id", planIds),
    admin.from("curriculum_week_performance").select("id", { count: "exact", head: true }).in("lesson_plan_id", planIds),
    admin.from("academic_assessment_evidence").select("id", { count: "exact", head: true }).in("lesson_plan_id", planIds),
  ]);
  const lookupError = [assignments.error, exams.error, cbtExams.error, weekScores.error, evidence.error].find(Boolean);
  if (lookupError) return { ok: false, error: lookupError.message };

  if ((weekScores.count ?? 0) > 0 || (evidence.count ?? 0) > 0) {
    return { ok: false, error: CURRICULUM_LEARNER_WORK_MESSAGE };
  }

  const assignmentIds = (assignments.data ?? []).map((row: { id: string }) => row.id);
  const examIds = (exams.data ?? []).map((row: { id: string }) => row.id);
  const cbtIds = (cbtExams.data ?? []).map((row: { id: string }) => row.id);
  const [submissions, attempts, sessions] = await Promise.all([
    assignmentIds.length
      ? admin.from("assignment_submissions")
        .select("id,submission_text,file_url,submitted_at,answers,grade,weighted_score,graded_at,graded_by,grading_mode,status")
        .in("assignment_id", assignmentIds)
      : Promise.resolve({ data: [], error: null }),
    examIds.length
      ? admin.from("exam_attempts").select("id").in("exam_id", examIds).limit(1)
      : Promise.resolve({ data: [], error: null }),
    cbtIds.length
      ? admin.from("cbt_sessions").select("id").in("exam_id", cbtIds).limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const evidenceError = [submissions.error, attempts.error, sessions.error].find(Boolean);
  if (evidenceError) return { ok: false, error: evidenceError.message };
  if ((submissions.data ?? []).some(hasLearnerAssignmentEvidence)
    || (attempts.data?.length ?? 0) > 0
    || (sessions.data?.length ?? 0) > 0) {
    return { ok: false, error: CURRICULUM_LEARNER_WORK_MESSAGE };
  }
  return { ok: true };
}

/** Delete every teaching artifact that would block deleting these plans. */
async function cascadeDeleteLessonPlans(
  admin: AdminClient,
  planIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (planIds.length === 0) return { ok: true };
  const blocked = await refuseIfPlansHoldLearnerWork(admin, planIds);
  if (!blocked.ok) return blocked;

  const childDeletes: Array<{ table: string; column: string }> = [
    { table: "assignments", column: "lesson_plan_id" },
    { table: "exams", column: "lesson_plan_id" },
    { table: "cbt_exams", column: "lesson_plan_id" },
    { table: "flashcard_decks", column: "lesson_plan_id" },
    { table: "lesson_materials", column: "lesson_plan_id" },
    { table: "lessons", column: "lesson_plan_id" },
    { table: "class_lesson_delivery", column: "lesson_plan_id" },
    { table: "curriculum_week_tracking", column: "lesson_plan_id" },
    { table: "curriculum_week_performance", column: "lesson_plan_id" },
    { table: "term_schedules", column: "lesson_plan_id" },
    { table: "progression_override_audit", column: "lesson_plan_id" },
    { table: "lesson_plan_pattern_applications", column: "lesson_plan_id" },
    { table: "curriculum_project_usage", column: "lesson_plan_id" },
  ];

  for (const { table, column } of childDeletes) {
    const result = await step(`Cascade-clear ${table}`, () =>
      admin.from(table).delete().in(column, planIds)
    );
    if (!result.ok && !/does not exist|Could not find|column/i.test(result.error)) {
      return result;
    }
  }

  await admin
    .from("academic_assessment_evidence")
    .update({ lesson_plan_id: null })
    .in("lesson_plan_id", planIds);

  return step("Delete lesson plans", () =>
    admin.from("lesson_plans").delete().in("id", planIds)
  );
}

/**
 * Remove release-linked rows then the releases. Prefers the DB RPC
 * (cascade-aware + trigger bypass).
 */
export async function purgeCurriculumReleases(
  admin: AdminClient,
  releaseIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (releaseIds.length === 0) return { ok: true };

  try {
    const { data, error } = await admin.rpc("admin_purge_curriculum_releases", {
      p_release_ids: releaseIds,
    });
    if (!error && data) {
      if (data.ok === false) {
        return { ok: false, error: data.error || "Release purge failed" };
      }
      return { ok: true };
    }
    if (
      error &&
      !/Could not find the function|function .* does not exist|PGRST202/i.test(
        error.message || ""
      )
    ) {
      return { ok: false, error: `Release purge RPC: ${error.message}` };
    }
  } catch {
    // Fall through
  }

  const { data: plans } = await admin
    .from("lesson_plans")
    .select("id")
    .in("curriculum_release_id", releaseIds);
  const planIds = (plans ?? []).map((p: { id: string }) => p.id);
  const plansCleared = await cascadeDeleteLessonPlans(admin, planIds);
  if (!plansCleared.ok) return plansCleared;

  const hardDeletes: Array<{ table: string; column: string }> = [
    { table: "academic_curriculum_delivery_schedules", column: "release_id" },
    { table: "academic_offering_curriculum_directions", column: "release_id" },
    { table: "academic_curriculum_adoptions", column: "release_id" },
    { table: "curriculum_week_tracking", column: "curriculum_release_id" },
    { table: "assignments", column: "curriculum_release_id" },
    { table: "cbt_exams", column: "curriculum_release_id" },
    { table: "exams", column: "curriculum_release_id" },
    { table: "flashcard_decks", column: "curriculum_release_id" },
    { table: "lesson_materials", column: "curriculum_release_id" },
    { table: "academic_curriculum_quality_runs", column: "release_id" },
  ];

  for (const { table, column } of hardDeletes) {
    const result = await step(`Delete ${table}`, () =>
      admin.from(table).delete().in(column, releaseIds)
    );
    if (!result.ok && !/does not exist|Could not find|column/i.test(result.error)) {
      return result;
    }
  }

  // Detach student history (do not delete transcripts)
  for (const table of [
    "student_progress_reports",
    "enrollment_term_grades",
    "academic_assessment_evidence",
  ]) {
    await admin
      .from(table)
      .update({ curriculum_release_id: null })
      .in("curriculum_release_id", releaseIds);
  }

  const delReleases = await step("Delete curriculum releases", () =>
    admin.from("academic_curriculum_releases").delete().in("id", releaseIds)
  );
  if (!delReleases.ok) {
    return {
      ok: false,
      error: `${delReleases.error}. Apply migrations 20260929000015 + 20260929000016 for cascade purge.`,
    };
  }
  return { ok: true };
}

export async function forceDeleteCurriculumDraft(
  admin: AdminClient,
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: holdingPlans, error: plansErr } = await admin
    .from("lesson_plans")
    .select("id, status")
    .eq("curriculum_version_id", id);
  if (plansErr) return { ok: false, error: plansErr.message };

  const plans = holdingPlans ?? [];
  const allPlanIds = plans.map((p: { id: string }) => p.id);
  const blocked = await refuseIfPlansHoldLearnerWork(admin, allPlanIds);
  if (!blocked.ok) return blocked;

  const trackErr = await step("Clear week tracking for draft", () =>
    admin.from("curriculum_week_tracking").delete().eq("curriculum_id", id)
  );
  if (!trackErr.ok) return trackErr;

  // Cascade-delete every plan still pointing at this draft (including live ones
  // on a full wipe — CASCADE FKs after migration 16 do the same at DB level).
  const plansCleared = await cascadeDeleteLessonPlans(admin, allPlanIds);
  if (!plansCleared.ok) return plansCleared;

  const { data: releases, error: relErr } = await admin
    .from("academic_curriculum_releases")
    .select("id")
    .eq("source_curriculum_id", id);
  if (relErr) return { ok: false, error: relErr.message };

  if (releases && releases.length > 0) {
    const releaseIds = releases.map((r: { id: string }) => r.id);
    const purged = await purgeCurriculumReleases(admin, releaseIds);
    if (!purged.ok) return purged;
  }

  await admin
    .from("academic_curriculum_quality_runs")
    .delete()
    .eq("curriculum_id", id);

  const { error } = await admin.from("course_curricula").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function inspectTeachingOrphans(
  admin: AdminClient
): Promise<TeachingOrphanScan> {
  const empty: TeachingOrphanScan = {
    orphan_lesson_plans: [],
    orphan_lessons: [],
    orphan_assignments: [],
    orphan_flashcards: [],
    orphan_exams: [],
    orphan_cbt_exams: [],
    counts: {
      lesson_plans: 0,
      lessons: 0,
      assignments: 0,
      flashcards: 0,
      exams: 0,
      cbt_exams: 0,
    },
  };

  try {
    const { data, error } = await admin.rpc("admin_inspect_teaching_orphans");
    if (!error && data) {
      return {
        orphan_lesson_plans: data.orphan_lesson_plans ?? [],
        orphan_lessons: data.orphan_lessons ?? [],
        orphan_assignments: data.orphan_assignments ?? [],
        orphan_flashcards: data.orphan_flashcards ?? [],
        orphan_exams: data.orphan_exams ?? [],
        orphan_cbt_exams: data.orphan_cbt_exams ?? [],
        counts: {
          lesson_plans: data.counts?.lesson_plans ?? 0,
          lessons: data.counts?.lessons ?? 0,
          assignments: data.counts?.assignments ?? 0,
          flashcards: data.counts?.flashcards ?? 0,
          exams: data.counts?.exams ?? 0,
          cbt_exams: data.counts?.cbt_exams ?? 0,
        },
      };
    }
  } catch {
    // Fall through to client-side scan
  }

  // Fallback: detect rows whose canonical foreign key points at a removed plan.
  const { data: plans } = await admin.from("lesson_plans").select("id");
  const planIds = new Set((plans ?? []).map((p: { id: string }) => p.id));

  const { data: lessons } = await admin
    .from("lessons")
    .select("id, title, lesson_plan_id")
    .limit(2000);
  const orphan_lessons = (lessons ?? []).filter((l: any) =>
    l.lesson_plan_id && !planIds.has(l.lesson_plan_id)
  );

  const { data: assignments } = await admin
    .from("assignments")
    .select("id, title, lesson_plan_id")
    .limit(2000);
  const orphan_assignments = (assignments ?? []).filter((a: any) =>
    a.lesson_plan_id && !planIds.has(a.lesson_plan_id)
  );

  const { data: decks } = await admin
    .from("flashcard_decks")
    .select("id, title, lesson_plan_id, lesson_id")
    .limit(2000);
  const orphan_flashcards = (decks ?? []).filter(
    (d: any) => d.lesson_plan_id && !planIds.has(d.lesson_plan_id)
  );

  return {
    ...empty,
    orphan_lessons,
    orphan_assignments,
    orphan_flashcards,
    counts: {
      ...empty.counts,
      lessons: orphan_lessons.length,
      assignments: orphan_assignments.length,
      flashcards: orphan_flashcards.length,
    },
  };
}

export async function purgeTeachingOrphans(
  admin: AdminClient
): Promise<
  | { ok: true; purged: TeachingOrphanCounts }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await admin.rpc("admin_purge_teaching_orphans");
    if (!error && data) {
      if (data.ok === false) {
        return { ok: false, error: data.error || "Teaching orphan purge failed" };
      }
      return {
        ok: true,
        purged: {
          lesson_plans: data.purged?.lesson_plans ?? 0,
          lessons: data.purged?.lessons ?? 0,
          assignments: data.purged?.assignments ?? 0,
          flashcards: data.purged?.flashcards ?? 0,
          exams: data.purged?.exams ?? 0,
          cbt_exams: data.purged?.cbt_exams ?? 0,
        },
      };
    }
    if (
      error &&
      !/Could not find the function|function .* does not exist|PGRST202/i.test(
        error.message || ""
      )
    ) {
      return { ok: false, error: error.message };
    }
  } catch {
    // Fall through
  }

  const scan = await inspectTeachingOrphans(admin);
  const lessonIds = scan.orphan_lessons.map((x) => x.id).filter(Boolean);
  const assignmentIds = scan.orphan_assignments.map((x) => x.id).filter(Boolean);
  const flashIds = scan.orphan_flashcards.map((x) => x.id).filter(Boolean);
  const planIds = scan.orphan_lesson_plans.map((x) => x.id).filter(Boolean);

  if (planIds.length) {
    const r = await cascadeDeleteLessonPlans(admin, planIds);
    if (!r.ok) return r;
  }
  if (lessonIds.length) {
    await admin.from("flashcard_decks").delete().in("lesson_id", lessonIds);
    await admin.from("lessons").delete().in("id", lessonIds);
  }
  if (assignmentIds.length) {
    await admin.from("assignments").delete().in("id", assignmentIds);
  }
  if (flashIds.length) {
    await admin.from("flashcard_decks").delete().in("id", flashIds);
  }

  return {
    ok: true,
    purged: {
      lesson_plans: planIds.length,
      lessons: lessonIds.length,
      assignments: assignmentIds.length,
      flashcards: flashIds.length,
      exams: 0,
      cbt_exams: 0,
    },
  };
}

/**
 * Inventory + purge curriculum debris that survives after drafts are gone
 * (orphan releases, plus teaching orphans).
 */
export async function inspectCurriculumDebris(admin: AdminClient): Promise<{
  orphan_releases: Array<{
    id: string;
    title: string | null;
    status: string | null;
    course_id: string | null;
    version_tag: string | null;
  }>;
  delivery_schedules: number;
  adoptions: number;
  offering_directions: number;
  week_tracking_on_orphans: number;
  teaching: TeachingOrphanScan;
}> {
  const { data: allReleases } = await admin
    .from("academic_curriculum_releases")
    .select("id, title, status, course_id, source_curriculum_id");

  const releases = allReleases ?? [];
  const sourceIds = [
    ...new Set(
      releases
        .map((r: any) => r.source_curriculum_id)
        .filter(Boolean) as string[]
    ),
  ];

  let existingSources = new Set<string>();
  if (sourceIds.length > 0) {
    const { data: rows } = await admin
      .from("course_curricula")
      .select("id")
      .in("id", sourceIds);
    existingSources = new Set((rows ?? []).map((r: { id: string }) => r.id));
  }

  const orphan_releases = releases.filter(
    (r: any) =>
      !r.source_curriculum_id || !existingSources.has(r.source_curriculum_id)
  );

  const orphanIds = orphan_releases.map((r: any) => r.id);

  let delivery_schedules = 0;
  let adoptions = 0;
  let offering_directions = 0;
  let week_tracking_on_orphans = 0;

  if (orphanIds.length > 0) {
    const [sched, adopt, dir, track] = await Promise.all([
      admin
        .from("academic_curriculum_delivery_schedules")
        .select("id", { count: "exact", head: true })
        .in("release_id", orphanIds),
      admin
        .from("academic_curriculum_adoptions")
        .select("id", { count: "exact", head: true })
        .in("release_id", orphanIds),
      admin
        .from("academic_offering_curriculum_directions")
        .select("id", { count: "exact", head: true })
        .in("release_id", orphanIds),
      admin
        .from("curriculum_week_tracking")
        .select("id", { count: "exact", head: true })
        .in("curriculum_release_id", orphanIds),
    ]);
    delivery_schedules = sched.count ?? 0;
    adoptions = adopt.count ?? 0;
    offering_directions = dir.count ?? 0;
    week_tracking_on_orphans = track.count ?? 0;
  }

  const teaching = await inspectTeachingOrphans(admin);

  return {
    orphan_releases: orphan_releases.map((r: any) => ({
      id: r.id,
      title: r.title ?? null,
      status: r.status ?? null,
      course_id: r.course_id ?? null,
      version_tag: null,
    })),
    delivery_schedules,
    adoptions,
    offering_directions,
    week_tracking_on_orphans,
    teaching,
  };
}

export async function purgeCurriculumDebris(
  admin: AdminClient
): Promise<
  | {
      ok: true;
      purged_releases: number;
      teaching: TeachingOrphanCounts;
    }
  | { ok: false; error: string }
> {
  const debris = await inspectCurriculumDebris(admin);
  let purged_releases = 0;

  if (debris.orphan_releases.length > 0) {
    const ids = debris.orphan_releases.map((r) => r.id);
    const purged = await purgeCurriculumReleases(admin, ids);
    if (!purged.ok) return purged;
    purged_releases = ids.length;
  }

  const teaching = await purgeTeachingOrphans(admin);
  if (!teaching.ok) return teaching;

  return { ok: true, purged_releases, teaching: teaching.purged };
}

/**
 * One live row per (course_id, school_id). Keep `keepId`, remove same-scope
 * siblings so regenerate bumps a version number instead of spawning copies.
 */
export async function consolidateSameScopeCurricula(
  admin: AdminClient,
  opts: {
    courseId: string;
    schoolId: string | null;
    keepId: string;
  }
): Promise<{ removed: number; error?: string }> {
  let q = admin
    .from("course_curricula")
    .select("id")
    .eq("course_id", opts.courseId)
    .neq("id", opts.keepId);
  q = opts.schoolId
    ? q.eq("school_id", opts.schoolId)
    : q.is("school_id", null);

  const { data: siblings, error } = await q;
  if (error) return { removed: 0, error: error.message };

  let removed = 0;
  for (const row of siblings ?? []) {
    const result = await forceDeleteCurriculumDraft(admin, row.id);
    if (!result.ok) return { removed, error: result.error };
    removed += 1;
  }
  return { removed };
}
