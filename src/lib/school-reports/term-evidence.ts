import type { SchoolReportRange } from './loaders/types';
import {
  attendanceBelongsToSchoolTerm,
  evidenceBelongsToSchoolTerm,
} from '@/lib/academic/teaching-period';

/** True when a gradebook submission belongs to the report academic window. */
export function submissionInReportTerm(row: any, range: SchoolReportRange): boolean {
  return evidenceBelongsToSchoolTerm(
    row,
    {
      academicTermId: range.academicTermId,
      startDate: range.startDate,
      endDate: range.endDate,
    },
    { dateStamp: 'graded_submitted' },
  );
}

/** True when an attendance row belongs to the report academic window. */
export function attendanceInReportTerm(row: any, range: SchoolReportRange): boolean {
  return attendanceBelongsToSchoolTerm(row, {
    academicTermId: range.academicTermId,
    startDate: range.startDate,
    endDate: range.endDate,
  });
}
