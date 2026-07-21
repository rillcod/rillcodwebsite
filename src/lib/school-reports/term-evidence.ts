import type { SchoolReportRange } from './loaders/types';

const isoStart = (date: string) => `${date}T00:00:00.000Z`;
const isoEnd = (date: string) => `${date}T23:59:59.999Z`;

/** True when a gradebook submission belongs to the report academic window. */
export function submissionInReportTerm(row: any, range: SchoolReportRange): boolean {
  const assignmentTerm = row.assignments?.term_id;
  if (range.academicTermId && assignmentTerm) {
    if (assignmentTerm === range.academicTermId) return true;
  }
  const stamp = row.graded_at || row.submitted_at;
  if (!stamp) return false;
  const t = new Date(stamp).getTime();
  return (
    t >= new Date(isoStart(range.startDate)).getTime() &&
    t <= new Date(isoEnd(range.endDate)).getTime()
  );
}

/** True when an attendance row belongs to the report academic window. */
export function attendanceInReportTerm(row: any, range: SchoolReportRange): boolean {
  if (range.academicTermId && row.term_id) return row.term_id === range.academicTermId;
  const t = new Date(row.created_at).getTime();
  return (
    t >= new Date(isoStart(range.startDate)).getTime() &&
    t <= new Date(isoEnd(range.endDate)).getTime()
  );
}
