import type { SupabaseClient } from '@supabase/supabase-js';

type AnyClient = SupabaseClient<any>;

export type CurriculumDetectionStatus =
  | 'detected'
  | 'no_tracking'
  | 'no_curriculum'
  | 'query_failed'
  | 'migration_missing';

export type SuggestedCurriculumRange = {
  curriculumStartTerm: number;
  curriculumStartWeek: number;
  curriculumEndTerm: number;
  curriculumEndWeek: number;
  source: 'delivery_tracking' | 'term_default';
  trackedWeekCount: number;
  syllabusCount: number;
  hint: string;
  status: CurriculumDetectionStatus;
  checkedAt: string;
  sourceChecked: string;
  correctiveAction?: string;
};

export type CurriculumDetectionResult = SuggestedCurriculumRange;

type TrackingRow = {
  term_number: number;
  week_number: number;
  status: string;
};

const ACTIVE_STATUSES = new Set(['completed', 'in_progress', 'skipped']);

function isMissingRelationError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('does not exist') ||
    lower.includes('relation') && lower.includes('curriculum_week_tracking') ||
    lower.includes('schema cache') && lower.includes('curriculum_week_tracking')
  );
}

function detectionStatusFromSuggestion(input: {
  source: 'delivery_tracking' | 'term_default';
  syllabusCount: number;
}): CurriculumDetectionStatus {
  if (input.source === 'delivery_tracking') return 'detected';
  if (input.syllabusCount > 0) return 'no_tracking';
  return 'no_curriculum';
}

function correctiveActionFor(status: CurriculumDetectionStatus): string | undefined {
  switch (status) {
    case 'no_tracking':
      return 'Mark delivery weeks in Course Syllabus, then click Detect from delivery again.';
    case 'no_curriculum':
      return 'Build visible syllabi in Course Syllabus for this school, then retry detection.';
    case 'query_failed':
      return 'Check your connection and retry. If this persists, contact support.';
    case 'migration_missing':
      return 'The curriculum tracking table is not available in this environment. Apply pending database migrations.';
    default:
      return undefined;
  }
}

/** Report-only: infer curriculum window from marked delivery weeks (not full curriculum integration). */
export function suggestReportCurriculumRange(input: {
  academicTermNumber: number;
  trackingRows: TrackingRow[];
  syllabusCount?: number;
  defaultEndWeek?: number;
  checkedAt?: string;
}): SuggestedCurriculumRange {
  const termNum = Math.max(1, Number(input.academicTermNumber) || 1);
  const defaultEnd = Math.max(1, Number(input.defaultEndWeek) || 12);
  const syllabusCount = Number(input.syllabusCount) || 0;
  const checkedAt = input.checkedAt || new Date().toISOString();

  const active = (input.trackingRows || []).filter(
    (row) =>
      ACTIVE_STATUSES.has(String(row.status || '').toLowerCase()) &&
      Number(row.term_number) === termNum &&
      Number(row.week_number) > 0,
  );

  if (!active.length) {
    const status = detectionStatusFromSuggestion({ source: 'term_default', syllabusCount });
    return {
      curriculumStartTerm: termNum,
      curriculumStartWeek: 1,
      curriculumEndTerm: termNum,
      curriculumEndWeek: defaultEnd,
      source: 'term_default',
      trackedWeekCount: 0,
      syllabusCount,
      hint:
        status === 'no_curriculum'
          ? `No syllabi or week marks for this school. Using Term ${termNum}, Weeks 1–${defaultEnd}. Build syllabi in Course Syllabus when ready.`
          : `No marked weeks for Term ${termNum} yet. Using Weeks 1–${defaultEnd} for this report. Mark weeks in Course Syllabus, then click Detect from delivery.`,
      status,
      checkedAt,
      sourceChecked: 'curriculum_week_tracking, course_curricula',
      correctiveAction: correctiveActionFor(status),
    };
  }

  const points = active.map((row) => ({
    term: Number(row.term_number),
    week: Number(row.week_number),
  }));
  const min = points.reduce((best, row) =>
    row.term * 100 + row.week < best.term * 100 + best.week ? row : best,
  );
  const max = points.reduce((best, row) =>
    row.term * 100 + row.week > best.term * 100 + best.week ? row : best,
  );

  return {
    curriculumStartTerm: min.term,
    curriculumStartWeek: min.week,
    curriculumEndTerm: max.term,
    curriculumEndWeek: max.week,
    source: 'delivery_tracking',
    trackedWeekCount: active.length,
    syllabusCount,
    hint: `Detected ${active.length} marked week(s) from delivery tracking: Term ${min.term} Week ${min.week} → Term ${max.term} Week ${max.week}. Adjust below if needed.`,
    status: 'detected',
    checkedAt,
    sourceChecked: 'curriculum_week_tracking',
    correctiveAction: undefined,
  };
}

export async function loadReportCurriculumRangeSuggestion(
  admin: AnyClient,
  schoolId: string,
  academicTermId: string,
): Promise<CurriculumDetectionResult | null> {
  if (!schoolId || !academicTermId) return null;

  const checkedAt = new Date().toISOString();

  const { data: academicTerm, error: termError } = await admin
    .from('academic_terms')
    .select('term_number')
    .eq('id', academicTermId)
    .maybeSingle();

  if (termError) {
    const migrationMissing = isMissingRelationError(termError.message);
    return {
      curriculumStartTerm: 1,
      curriculumStartWeek: 1,
      curriculumEndTerm: 1,
      curriculumEndWeek: 12,
      source: 'term_default',
      trackedWeekCount: 0,
      syllabusCount: 0,
      hint: migrationMissing
        ? 'Academic term lookup failed — database schema may be incomplete.'
        : 'Could not load the academic term for this report.',
      status: migrationMissing ? 'migration_missing' : 'query_failed',
      checkedAt,
      sourceChecked: 'academic_terms',
      correctiveAction: correctiveActionFor(migrationMissing ? 'migration_missing' : 'query_failed'),
    };
  }

  const termNumber = Number(academicTerm?.term_number) || 1;

  const { data: tracking, error: trackingError } = await admin
    .from('curriculum_week_tracking')
    .select('term_number,week_number,status')
    .eq('school_id', schoolId)
    .limit(5000);

  if (trackingError) {
    const migrationMissing = isMissingRelationError(trackingError.message);
    return {
      curriculumStartTerm: termNumber,
      curriculumStartWeek: 1,
      curriculumEndTerm: termNumber,
      curriculumEndWeek: 12,
      source: 'term_default',
      trackedWeekCount: 0,
      syllabusCount: 0,
      hint: migrationMissing
        ? 'Delivery tracking is not available in this environment.'
        : 'Delivery tracking lookup failed — this is a system error, not missing curriculum.',
      status: migrationMissing ? 'migration_missing' : 'query_failed',
      checkedAt,
      sourceChecked: 'curriculum_week_tracking',
      correctiveAction: correctiveActionFor(migrationMissing ? 'migration_missing' : 'query_failed'),
    };
  }

  const { count: syllabusCount, error: syllabusError } = await admin
    .from('course_curricula')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('is_visible_to_school', true);

  if (syllabusError) {
    return {
      curriculumStartTerm: termNumber,
      curriculumStartWeek: 1,
      curriculumEndTerm: termNumber,
      curriculumEndWeek: 12,
      source: 'term_default',
      trackedWeekCount: 0,
      syllabusCount: 0,
      hint: 'Syllabus lookup failed — this is a system error, not missing curriculum.',
      status: 'query_failed',
      checkedAt,
      sourceChecked: 'course_curricula',
      correctiveAction: correctiveActionFor('query_failed'),
    };
  }

  return suggestReportCurriculumRange({
    academicTermNumber: termNumber,
    trackingRows: (tracking ?? []) as TrackingRow[],
    syllabusCount: syllabusCount ?? 0,
    checkedAt,
  });
}
