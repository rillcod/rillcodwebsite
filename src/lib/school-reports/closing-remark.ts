import type { SchoolPerformanceReportRow } from './types';

/** Professional sign-off for the school-facing report (no internal tooling language). */
export function buildOfficialClosingRemark(
  snapshot: SchoolPerformanceReportRow['snapshot'],
  narrative: SchoolPerformanceReportRow['narrative'],
): string {
  const term = snapshot.period?.termLabel || 'this term';
  const year = snapshot.period?.academicYear || '';
  const school = snapshot.school?.name || 'our partner school';
  const focus =
    narrative.achievements[0]?.replace(/\.$/, '') ||
    (snapshot.summary.curriculumCoverage >= 50
      ? 'the term delivery recorded in this report'
      : 'the term delivery and learner evidence captured here');

  return `This report documents ${school}'s ${term}${year ? ` (${year})` : ''} STEM delivery with Rillcod, with emphasis on ${focus.toLowerCase()}. We will continue structured support through the next module cycle and agree priorities with school leadership at the appropriate review point.`;
}
