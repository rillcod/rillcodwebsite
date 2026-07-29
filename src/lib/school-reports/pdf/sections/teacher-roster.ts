import { classListPdfCell, wrapPdfText } from '../text';
import { formatPersonDisplayName } from '../../display-labels';
import { flowingDataTable, sectionTitle } from '../layout';
import { MUTED } from '../tokens';
import type { SchoolReportPdfContext } from '../context';

/**
 * Assigned teachers.
 *
 * First section extracted from the monolithic builder. The shape is the pattern
 * the rest follow: a plain function of the context that returns its own content
 * blocks, owns the row derivation it alone uses, and answers the "should I
 * appear?" question itself by returning an empty array.
 *
 * Returning [] rather than null keeps the call site a spread, so the document
 * body stays a flat list and a hidden section leaves no empty slot behind.
 */
export function buildTeacherRosterSection(ctx: SchoolReportPdfContext): object[] {
  if (!ctx.showSec('teacherRoster')) return [];

  const staffTeachers = Array.isArray(ctx.snapshot.staff?.teachers) ? ctx.snapshot.staff.teachers : [];
  const staffRows = staffTeachers.length
    ? staffTeachers.map((row) => [
        wrapPdfText(formatPersonDisplayName(row.name, 'Teacher'), { fontSize: 8, bold: true, lineHeight: 1.2 }),
        wrapPdfText(
          row.source === 'both'
            ? 'Assigned + class owner'
            : row.source === 'teacher_schools'
              ? 'School assignment'
              : 'Class owner',
          { fontSize: 7.5, color: MUTED, lineHeight: 1.2 },
        ),
        { text: String(row.classCount), fontSize: 8, alignment: 'center' },
        classListPdfCell(row.classNames),
      ])
    : [[{ text: 'No teachers assigned to this school', colSpan: 4, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}]];

  return [
    sectionTitle('Assigned teachers'),
    flowingDataTable(['Teacher', 'How assigned', 'Classes', 'Class list'], staffRows, ['*', 100, 42, '*']),
  ];
}
