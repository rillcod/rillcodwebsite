/**
 * The database half of a session correction.
 *
 * Split from session-rollover.ts the way governance-server.ts is split from
 * governance.ts: the decisions stay pure and tested, this reads and writes.
 *
 * Both the admin endpoint and any operational script go through these two
 * functions, so a correction run from a terminal and one run from Settings
 * cannot diverge — which matters, because the whole point of the feature is
 * that there is exactly one answer to "what session is this".
 */

import {
  adoptionKey,
  buildRolloverPlan,
  planKey,
  rosterKey,
  type RolloverPlan,
  type TermRef,
} from '@/lib/academic/session-rollover';

type DbClient = { from: (table: string) => any };

export type TermRow = TermRef & { is_current?: boolean | null };

export async function loadAcademicTerm(db: DbClient, id: string): Promise<TermRow | null> {
  const { data } = await db
    .from('academic_terms')
    .select('id, academic_year, term_number, term_label, start_date, end_date, is_current')
    .eq('id', id)
    .maybeSingle();
  return (data as TermRow) ?? null;
}

/** Everything the plan builder needs, read in one pass so preview and apply agree. */
export async function gatherRolloverPlan(
  db: DbClient,
  from: TermRow,
  to: TermRow,
): Promise<RolloverPlan> {
  const { data: releases } = await db
    .from('academic_curriculum_releases')
    .select('id, title, academic_session, effective_term_number, status')
    .eq('academic_session', from.academic_year)
    .eq('effective_term_number', from.term_number);
  const releaseIds = (releases ?? []).map((row: any) => row.id);

  const { data: adoptions } = releaseIds.length
    ? await db
      .from('academic_curriculum_adoptions')
      .select('id, school_id, course_id, release_id, academic_session, effective_term_number, effective_academic_term_id')
      .in('release_id', releaseIds)
    : { data: [] };

  const { data: targetAdoptions } = await db
    .from('academic_curriculum_adoptions')
    .select('school_id, course_id, academic_session, effective_term_number')
    .eq('academic_session', to.academic_year)
    .eq('effective_term_number', to.term_number);
  const existingAdoptionKeys = new Set<string>(
    (targetAdoptions ?? []).map((row: any) => adoptionKey(row)),
  );

  // Both terms: classes still to move, and classes an earlier run already moved
  // whose plans may have been left behind. See settledClassIds in the builder.
  const { data: classes } = await db
    .from('classes')
    .select('id, name, term_id, status, start_date')
    .in('term_id', [from.id, to.id]);
  const classIds = (classes ?? []).filter((row: any) => row.term_id === from.id).map((row: any) => row.id);

  const { data: rosters } = classIds.length
    ? await db
      .from('class_term_rosters')
      .select('id, class_id, student_id, term_id, school_id, program_id, status')
      .in('class_id', classIds)
      .in('term_id', [from.id, to.id])
    : { data: [] };
  const existingRosterKeys = new Set<string>(
    (rosters ?? []).filter((row: any) => row.term_id === to.id).map((row: any) => rosterKey(row)),
  );

  const { data: lessonPlans } = await db
    .from('lesson_plans')
    .select('id, class_id, course_id, term, term_id, term_start, term_end, plan_data, status, curriculum_release_id')
    .eq('term_id', from.id);

  // Which editions are still live, so a plan pinned to a retired one is reported
  // rather than attempted — the database would refuse it, and refusing it here
  // keeps the rest of the correction whole.
  const planReleaseIds = Array.from(
    new Set((lessonPlans ?? []).map((row: any) => row.curriculum_release_id).filter(Boolean)),
  );
  const { data: liveReleases } = planReleaseIds.length
    ? await db
      .from('academic_curriculum_releases')
      .select('id')
      .in('id', planReleaseIds)
      .eq('status', 'published')
    : { data: [] };
  const publishedReleaseIds = new Set<string>((liveReleases ?? []).map((row: any) => row.id));

  const { data: targetPlans } = await db
    .from('lesson_plans')
    .select('class_id, course_id, term_id')
    .eq('term_id', to.id)
    .neq('status', 'archived');
  const existingPlanKeys = new Set<string>((targetPlans ?? []).map((row: any) => planKey(row)));

  const planIds = (lessonPlans ?? []).map((row: any) => row.id);
  const [{ data: lessons }, { data: decks }, { data: assignments }] = planIds.length
    ? await Promise.all([
      db.from('lessons').select('id, lesson_plan_id, title').in('lesson_plan_id', planIds),
      db.from('flashcard_decks').select('id, lesson_plan_id, title').in('lesson_plan_id', planIds),
      db.from('assignments').select('id, lesson_plan_id, title, due_date').in('lesson_plan_id', planIds),
    ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  // Work already handed in stays where it was marked, so the submission count is
  // part of the decision rather than something checked after the fact.
  const assignmentIds = (assignments ?? []).map((row: any) => row.id);
  const { data: submissions } = assignmentIds.length
    ? await db.from('assignment_submissions').select('assignment_id').in('assignment_id', assignmentIds)
    : { data: [] };
  const submittedIds = new Set((submissions ?? []).map((row: any) => row.assignment_id));

  return buildRolloverPlan({
    from,
    to,
    releases: releases ?? [],
    adoptions: adoptions ?? [],
    existingAdoptionKeys,
    classes: classes ?? [],
    rosters: rosters ?? [],
    existingRosterKeys,
    lessonPlans: lessonPlans ?? [],
    existingPlanKeys,
    publishedReleaseIds,
    lessons: lessons ?? [],
    flashcardDecks: decks ?? [],
    assignments: (assignments ?? []).map((row: any) => ({
      ...row,
      submission_count: submittedIds.has(row.id) ? 1 : 0,
    })),
  });
}

/**
 * Write the plan. Returns the list of things that failed rather than throwing on
 * the first one: a correction that stops halfway leaves the session split across
 * two terms, which is worse than the state it was called to fix.
 */
export async function applyRolloverPlan(
  db: DbClient,
  plan: RolloverPlan,
  actorId: string | null,
): Promise<string[]> {
  const { to } = plan;
  const now = new Date().toISOString();
  const failures: string[] = [];
  const fail = (label: string, error: { message?: string } | null) => {
    if (error?.message) failures.push(`${label}: ${error.message}`);
  };

  // Releases are deliberately not written. protect_published_curriculum_release
  // rejects any change to academic_session, effective_term_number or title, and
  // that invariant is worth more than the label: an edition is the artefact a
  // school adopted, so correcting it in place would rewrite what they agreed to.
  // plan.releases_needing_new_edition carries them to the operator instead.

  if (plan.adoptions.length) {
    const { error } = await db
      .from('academic_curriculum_adoptions')
      .update({
        academic_session: to.academic_year,
        effective_term_number: to.term_number,
        effective_academic_term_id: to.id,
        updated_at: now,
      })
      .in('id', plan.adoptions);
    fail('adoptions', error);
  }

  if (plan.classes.length) {
    const { error } = await db
      .from('classes')
      .update({ term_id: to.id, updated_at: now })
      .in('id', plan.classes.map((klass) => klass.id));
    fail('classes', error);
  }

  if (plan.roster_carry_forward.length) {
    // A plain insert, not an upsert: uq_class_term_roster_learner is an
    // expression index (it coalesces a null term_id), which ON CONFLICT cannot
    // infer from a column list. Re-running stays safe because the plan is
    // rebuilt from live rows every time and already excludes anyone who has a
    // roster row at the target term.
    const { error } = await db
      .from('class_term_rosters')
      .insert(plan.roster_carry_forward.map((row) => ({ ...row, started_at: now, created_by: actorId })));
    fail('class rosters', error);
  }

  for (const lessonPlan of plan.lesson_plans) {
    const { error } = await db
      .from('lesson_plans')
      .update({
        term: lessonPlan.term,
        term_id: lessonPlan.term_id,
        term_start: lessonPlan.term_start,
        term_end: lessonPlan.term_end,
        plan_data: lessonPlan.plan_data,
        updated_at: now,
      })
      .eq('id', lessonPlan.id);
    fail(`lesson plan ${lessonPlan.id}`, error);
  }

  if (plan.lessons.length) {
    const { error } = await db
      .from('lessons')
      .update({ academic_term_id: to.id, updated_at: now })
      .in('id', plan.lessons);
    fail('lessons', error);
  }

  if (plan.flashcard_decks.length) {
    const { error } = await db
      .from('flashcard_decks')
      .update({ term_id: to.id, updated_at: now })
      .in('id', plan.flashcard_decks);
    fail('flashcard decks', error);
  }

  for (const assignment of plan.assignments) {
    const { error } = await db
      .from('assignments')
      .update({ term_id: to.id, due_date: assignment.due_date, updated_at: now })
      .eq('id', assignment.id);
    fail(`assignment ${assignment.id}`, error);
  }

  return failures;
}
