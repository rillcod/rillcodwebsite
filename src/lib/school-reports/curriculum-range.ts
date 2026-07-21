import type { SupabaseClient } from '@supabase/supabase-js';

type AnyClient = SupabaseClient<any>;

export type SuggestedCurriculumRange = {
  curriculumStartTerm: number;
  curriculumStartWeek: number;
  curriculumEndTerm: number;
  curriculumEndWeek: number;
  source: 'delivery_tracking' | 'term_default';
  trackedWeekCount: number;
  syllabusCount: number;
  hint: string;
};

type TrackingRow = {
  term_number: number;
  week_number: number;
  status: string;
};

const ACTIVE_STATUSES = new Set(['completed', 'in_progress', 'skipped']);

/** Report-only: infer curriculum window from marked delivery weeks (not full curriculum integration). */
export function suggestReportCurriculumRange(input: {
  academicTermNumber: number;
  trackingRows: TrackingRow[];
  syllabusCount?: number;
  defaultEndWeek?: number;
}): SuggestedCurriculumRange {
  const termNum = Math.max(1, Number(input.academicTermNumber) || 1);
  const defaultEnd = Math.max(1, Number(input.defaultEndWeek) || 12);
  const syllabusCount = Number(input.syllabusCount) || 0;

  const active = (input.trackingRows || []).filter(
    (row) =>
      ACTIVE_STATUSES.has(String(row.status || '').toLowerCase()) &&
      Number(row.term_number) === termNum &&
      Number(row.week_number) > 0,
  );

  if (!active.length) {
    return {
      curriculumStartTerm: termNum,
      curriculumStartWeek: 1,
      curriculumEndTerm: termNum,
      curriculumEndWeek: defaultEnd,
      source: 'term_default',
      trackedWeekCount: 0,
      syllabusCount,
      hint:
        syllabusCount > 0
          ? `No marked weeks for Term ${termNum} yet. Using Weeks 1–${defaultEnd} for this report. Mark weeks in Course Syllabus, then click Detect from delivery.`
          : `No syllabi or week marks for this school. Using Term ${termNum}, Weeks 1–${defaultEnd}. Build syllabi in Course Syllabus when ready.`,
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
  };
}

export async function loadReportCurriculumRangeSuggestion(
  admin: AnyClient,
  schoolId: string,
  academicTermId: string,
): Promise<SuggestedCurriculumRange | null> {
  if (!schoolId || !academicTermId) return null;

  const [{ data: academicTerm }, { data: tracking }, { count: syllabusCount }] = await Promise.all([
    admin.from('academic_terms').select('term_number').eq('id', academicTermId).maybeSingle(),
    admin
      .from('curriculum_week_tracking')
      .select('term_number,week_number,status')
      .eq('school_id', schoolId)
      .limit(5000),
    admin
      .from('course_curricula')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_visible_to_school', true),
  ]);

  const termNumber = Number(academicTerm?.term_number) || 1;

  return suggestReportCurriculumRange({
    academicTermNumber: termNumber,
    trackingRows: (tracking ?? []) as TrackingRow[],
    syllabusCount: syllabusCount ?? 0,
  });
}
