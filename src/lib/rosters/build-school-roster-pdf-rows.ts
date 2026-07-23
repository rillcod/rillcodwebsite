import { buildStudentRosterRows, type StudentRosterRow } from '@/lib/cards/exportRoster';
import { schoolRosterToExportInput, type SchoolRosterRow } from '@/lib/school-reports/loaders/roster';

/** Build printable RC roster rows from a loaded school report roster snapshot. */
export function buildSchoolRosterPdfRows(
  data: {
    studentRows: SchoolRosterRow[];
    classNameById: Map<string, string>;
  },
  origin: string,
): StudentRosterRow[] {
  return buildStudentRosterRows(schoolRosterToExportInput(data), origin);
}
