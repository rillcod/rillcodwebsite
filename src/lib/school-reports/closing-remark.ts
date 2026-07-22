import type { SchoolPerformanceReportRow } from './types';

/** Warm official sign-off for the school-facing report (no internal tooling language). */
export function buildOfficialClosingRemark(
  snapshot: SchoolPerformanceReportRow['snapshot'],
  narrative: SchoolPerformanceReportRow['narrative'],
): string {
  const term = snapshot.period?.termLabel || 'this term';
  const year = snapshot.period?.academicYear || '';
  const school = snapshot.school?.name || 'our partner school';
  const rawHighlight =
    narrative.achievements[0]?.replace(/\.$/, '') ||
    (snapshot.summary.averageScore >= 65
      ? 'the solid progress your learners made'
      : 'the dedication your teachers and learners showed');
  const highlight = rawHighlight
    .replace(/manual result entry/gi, 'verified term assessments')
    .replace(/manual results?/gi, 'verified term assessments')
    .replace(/staff-entered(?: term)? results?/gi, 'teacher-recorded assessment evidence');
  return `Rillcod Technologies sincerely appreciates ${school} for the trust and collaboration shared throughout ${term}${year ? `, ${year}` : ''}. We are proud to celebrate ${highlight.toLowerCase()}, while remaining committed to purposeful support that helps every learner grow in confidence and ability. Together, we look forward to the next learning period with renewed energy, clear priorities, and even stronger outcomes.`;
}
