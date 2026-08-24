/**
 * Read-only production audit for the assessment-evidence handoff consumed by
 * Academic Auto-fill. It prints aggregate counts only: never learner names,
 * answers, marks, source IDs, or credentials.
 *
 *   npm run audit:academic-evidence
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const db = createClient(url, key, { auth: { persistSession: false } }) as any;

async function all(table: string, select: string): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

const contextFields = [
  ['school_id', 'school_id'],
  ['class_id', 'class_id'],
  ['course_id', 'course_id'],
  ['academic_term_id', 'term_id'],
  ['curriculum_release_id', 'curriculum_release_id'],
  ['lesson_plan_id', 'lesson_plan_id'],
  ['lesson_id', 'lesson_id'],
  ['academic_offering_id', 'academic_offering_id'],
  ['offering_period_id', 'offering_period_id'],
] as const;

function grouped(rows: any[], predicate: (row: any) => boolean): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows.filter(predicate)) {
    const type = String(row.evidence_type ?? 'unknown');
    out[type] = (out[type] ?? 0) + 1;
  }
  return out;
}

async function main() {
  const [evidence, assignments, cbtExams, exams, plans, submissions, cbtSessions, examAttempts, weekly] = await Promise.all([
    all('academic_assessment_evidence', 'evidence_type,source_id,assessment_id,school_id,class_id,course_id,academic_term_id,curriculum_release_id,lesson_plan_id,lesson_id,academic_offering_id,offering_period_id,context_status'),
    all('assignments', 'id,school_id,class_id,course_id,term_id,curriculum_release_id,lesson_plan_id,lesson_id,academic_offering_id,offering_period_id,metadata'),
    all('cbt_exams', 'id,school_id,class_id,course_id,term_id,curriculum_release_id,lesson_plan_id,lesson_id,academic_offering_id,offering_period_id,metadata'),
    all('exams', 'id,school_id,class_id,course_id,term_id,curriculum_release_id,lesson_plan_id,lesson_id,academic_offering_id,offering_period_id,metadata'),
    all('lesson_plans', 'id,school_id,class_id,course_id,term_id,curriculum_release_id,academic_offering_id,offering_period_id'),
    all('assignment_submissions', 'id,assignment_id,portal_user_id,student_id,user_id'),
    all('cbt_sessions', 'id,exam_id,user_id'),
    all('exam_attempts', 'id,exam_id,portal_user_id'),
    all('curriculum_week_performance', 'id,lesson_plan_id,student_id'),
  ]);

  const maps = {
    assignment_submission: new Map(assignments.map((row) => [row.id, row])),
    cbt_session: new Map(cbtExams.map((row) => [row.id, row])),
    exam_attempt: new Map(exams.map((row) => [row.id, row])),
    weekly_practical: new Map(plans.map((row) => [row.id, row])),
  } as const;

  const sourceIds = new Set(evidence.map((row) => `${row.evidence_type}:${row.source_id}`));
  const expectedSources = [
    ...submissions.filter((row) => row.assignment_id && (row.portal_user_id || row.student_id || row.user_id)).map((row) => ['assignment_submission', row.id] as const),
    ...cbtSessions.filter((row) => row.exam_id && row.user_id).map((row) => ['cbt_session', row.id] as const),
    ...examAttempts.filter((row) => row.exam_id && row.portal_user_id).map((row) => ['exam_attempt', row.id] as const),
    ...weekly.filter((row) => row.lesson_plan_id && row.student_id).map((row) => ['weekly_practical', row.id] as const),
  ];
  const missingByType: Record<string, number> = {};
  for (const [type, id] of expectedSources) {
    if (sourceIds.has(`${type}:${id}`)) continue;
    missingByType[type] = (missingByType[type] ?? 0) + 1;
  }

  const relevant = evidence.filter((row) => row.evidence_type in maps);
  const resultRelevant = relevant.filter((row) => {
    if (row.evidence_type === 'assignment_submission') {
      const assignment = row.assessment_id ? maps.assignment_submission.get(row.assessment_id) : null;
      return assignment?.metadata?.result_eligible !== false;
    }
    if (row.evidence_type === 'cbt_session') {
      const exam = row.assessment_id ? maps.cbt_session.get(row.assessment_id) : null;
      return exam?.metadata?.result_eligible !== false;
    }
    if (row.evidence_type === 'exam_attempt') {
      const exam = row.assessment_id ? maps.exam_attempt.get(row.assessment_id) : null;
      if (exam?.metadata?.result_eligible === false) return false;
      return !!exam?.class_id || exam?.metadata?.assessment_scope === 'class_result';
    }
    return true;
  });
  const practiceEvidence = relevant.filter((row) => {
    if (row.evidence_type === 'assignment_submission') {
      const assignment = row.assessment_id ? maps.assignment_submission.get(row.assessment_id) : null;
      return assignment?.metadata?.result_eligible === false;
    }
    if (row.evidence_type === 'cbt_session') {
      const exam = row.assessment_id ? maps.cbt_session.get(row.assessment_id) : null;
      return exam?.metadata?.result_eligible === false;
    }
    if (row.evidence_type === 'exam_attempt') {
      const exam = row.assessment_id ? maps.exam_attempt.get(row.assessment_id) : null;
      return exam?.metadata?.result_eligible === false;
    }
    return false;
  });
  const orphaned = relevant.filter((row) => {
    const type = row.evidence_type as keyof typeof maps;
    const sourceKey = type === 'weekly_practical' ? row.lesson_plan_id : row.assessment_id;
    return !sourceKey || !maps[type].has(sourceKey);
  });
  const drifted = resultRelevant.filter((row) => {
    const type = row.evidence_type as keyof typeof maps;
    const sourceKey = type === 'weekly_practical' ? row.lesson_plan_id : row.assessment_id;
    const expected = sourceKey ? maps[type].get(sourceKey) : null;
    if (!expected) return false;
    return contextFields.some(([evidenceField, sourceField]) =>
      expected[sourceField] != null && row[evidenceField] !== expected[sourceField],
    );
  });
  const unresolvedWrittenDecisions = relevant.filter((row) => {
    if (row.evidence_type !== 'exam_attempt') return false;
    const exam = row.assessment_id ? maps.exam_attempt.get(row.assessment_id) : null;
    return !!exam && !exam.class_id && !exam.metadata?.assessment_scope;
  });
  const unscoped = [...resultRelevant.filter((row) =>
    row.context_status !== 'traceable'
    || !row.class_id
    || !row.course_id
    || !row.academic_offering_id
    || !row.offering_period_id,
  ), ...unresolvedWrittenDecisions];

  console.log('\nAcademic evidence context audit (read-only, aggregate only)');
  console.log(`Evidence rows: ${evidence.length}`);
  console.log(`Evidence by type: ${JSON.stringify(grouped(evidence, () => true))}`);
  console.log(`Practice-only evidence by type: ${JSON.stringify(grouped(practiceEvidence, () => true))}`);
  console.log(`Unresolved result evidence by type: ${JSON.stringify(grouped(unscoped, () => true))}`);
  console.log(`Source-context drift by type: ${JSON.stringify(grouped(drifted, () => true))}`);
  console.log(`Orphaned by type: ${JSON.stringify(grouped(orphaned, () => true))}`);
  console.log(`Missing evidence by type: ${JSON.stringify(missingByType)}`);
  console.log('');

  const actionableOrphans = orphaned.filter(row => row.context_status !== 'legacy_unscoped');
  if (unscoped.length || drifted.length || actionableOrphans.length || Object.keys(missingByType).length) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
