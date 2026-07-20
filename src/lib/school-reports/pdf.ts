import { renderPdfToBuffer } from '@/lib/pdfmake-server';
import type { SchoolPerformanceReportRow } from './types';

const BRAND = '#7a0606';
const INK = '#172033';
const MUTED = '#667085';
const PALE = '#f7f3f3';
const BORDER = '#e4e7ec';

const textList = (items: string[], color = INK) => items.length
  ? { ul: items, color, fontSize: 9.5, lineHeight: 1.35, margin: [0, 4, 0, 8] }
  : { text: 'No items recorded.', color: MUTED, italics: true, fontSize: 9, margin: [0, 4, 0, 8] };
const formatMoney = (value: number, currency: string) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: currency || 'NGN', maximumFractionDigits: 2 }).format(Number(value || 0));
const plainStatus = (value: string) => String(value || 'pending').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function metricCard(label: string, value: string, note: string, color = BRAND) {
  return {
    stack: [
      { text: label.toUpperCase(), color: MUTED, fontSize: 7.5, bold: true, characterSpacing: 0.7 },
      { text: value, color, fontSize: 22, bold: true, margin: [0, 5, 0, 3] },
      { text: note, color: MUTED, fontSize: 8 },
    ],
    fillColor: '#ffffff', margin: [10, 10, 10, 10],
  };
}

function progressBar(label: string, value: number, color: string) {
  const safe = Math.max(0, Math.min(100, value));
  return {
    stack: [
      { columns: [{ text: label, bold: true, fontSize: 9 }, { text: `${safe}%`, alignment: 'right', bold: true, color, fontSize: 9 }] },
      {
        margin: [0, 4, 0, 8], table: { widths: [`${safe}%`, `${100 - safe}%`], body: [[
          { text: '', fillColor: color, margin: [0, 3, 0, 3], border: [false, false, false, false] },
          { text: '', fillColor: '#eaecf0', margin: [0, 3, 0, 3], border: [false, false, false, false] },
        ]] }, layout: 'noBorders',
      },
    ],
  };
}

export function buildSchoolReportPdfDefinition(report: SchoolPerformanceReportRow) {
  const snapshot = report.snapshot;
  const narrative = report.narrative;
  const period = `${new Date(report.period_start).toLocaleDateString('en-GB')} - ${new Date(report.period_end).toLocaleDateString('en-GB')}`;
  const curriculumRange = `Term ${report.curriculum_start_term}, Week ${report.curriculum_start_week} to Term ${report.curriculum_end_term}, Week ${report.curriculum_end_week}`;
  const classRows = snapshot.classPerformance.length ? snapshot.classPerformance.map((row) => [
    row.className, String(row.students), `${row.averageScore}%`, `${row.attendanceRate}%`, String(row.submissions),
  ]) : [['No class data', '-', '-', '-', '-']];
  const curriculumRows = snapshot.curriculum.courses.length ? snapshot.curriculum.courses.map((row) => [
    row.course, row.programme, `${row.completed}/${row.planned}`, String(row.inProgress), String(row.skipped), `${row.coverage}%`,
  ]) : [['No curriculum data', '-', '-', '-', '-', '-']];
  const programmeRows = snapshot.programmeCoursePerformance.length ? snapshot.programmeCoursePerformance.map((row) => [
    row.programme, row.course, String(row.students), String(row.submissions), `${row.averageScore}%`,
  ]) : [['No graded programme or course data', '-', '-', '-', '-']];
  const invoiceRows = snapshot.finance.invoices.length ? snapshot.finance.invoices.map((invoice) => [
    invoice.invoiceNumber, plainStatus(invoice.status), formatMoney(invoice.amount, snapshot.finance.currency),
    formatMoney(invoice.paid, snapshot.finance.currency), formatMoney(invoice.outstanding, snapshot.finance.currency),
  ]) : [['No invoice matched this term and academic year', '-', '-', '-', '-']];

  return {
    pageSize: 'A4',
    pageMargins: [42, 52, 42, 48],
    info: { title: report.title, author: 'Rillcod Technologies', subject: 'School Performance Report' },
    header: (currentPage: number) => currentPage === 1 ? null : ({
      margin: [42, 20, 42, 0], columns: [
        { text: 'RILLCOD TECHNOLOGIES', color: BRAND, bold: true, fontSize: 8 },
        { text: `${snapshot.school.name} | ${period}`, color: MUTED, fontSize: 8, alignment: 'right' },
      ],
    }),
    footer: (currentPage: number, pageCount: number) => ({
      margin: [42, 0, 42, 18], columns: [
        { text: report.status === 'published' ? 'Published school report' : 'DRAFT - FOR STAFF REVIEW', color: report.status === 'published' ? MUTED : BRAND, bold: true, fontSize: 7.5 },
        { text: `Page ${currentPage} of ${pageCount}`, color: MUTED, fontSize: 7.5, alignment: 'right' },
      ],
    }),
    content: [
      { text: 'RILLCOD', color: BRAND, bold: true, fontSize: 13, characterSpacing: 2 },
      { text: 'SCHOOL PERFORMANCE REPORT', color: MUTED, bold: true, fontSize: 9, characterSpacing: 1.5, margin: [0, 8, 0, 34] },
      { text: report.title, color: INK, bold: true, fontSize: 28, lineHeight: 1.05, margin: [0, 0, 0, 14] },
      { text: snapshot.school.name, color: BRAND, bold: true, fontSize: 17, margin: [0, 0, 0, 24] },
      { table: { widths: ['*', '*'], body: [[
        { stack: [{ text: 'REPORTING PERIOD', style: 'eyebrow' }, { text: period, style: 'coverValue' }], fillColor: PALE, margin: [12, 12, 12, 12] },
        { stack: [{ text: 'CURRICULUM RANGE', style: 'eyebrow' }, { text: curriculumRange, style: 'coverValue' }], fillColor: PALE, margin: [12, 12, 12, 12] },
      ], [
        { stack: [{ text: 'ACADEMIC TERM', style: 'eyebrow' }, { text: `${snapshot.period.termLabel} - ${snapshot.period.academicYear}`, style: 'coverValue' }], fillColor: PALE, margin: [12, 12, 12, 12] },
        { stack: [{ text: 'ATTACHED STAFF', style: 'eyebrow' }, { text: `${snapshot.summary.activeStaff} active staff (${snapshot.summary.activeTeachers} teachers)`, style: 'coverValue' }], fillColor: PALE, margin: [12, 12, 12, 12] },
      ]] }, layout: { hLineColor: () => BORDER, vLineColor: () => BORDER } },
      { text: 'A clear, evidence-based view of learner performance, participation, work completed and curriculum delivery.', color: MUTED, fontSize: 11, lineHeight: 1.4, margin: [0, 28, 0, 18] },
      { text: report.status === 'published' ? `Published ${new Date(report.published_at || report.updated_at).toLocaleDateString('en-GB')}` : 'Draft report - review and curate before publishing', color: report.status === 'published' ? '#067647' : BRAND, bold: true, fontSize: 9 },

      { text: 'Executive overview', style: 'section', pageBreak: 'before' },
      { text: narrative.executiveSummary, fontSize: 11, color: INK, lineHeight: 1.45, margin: [0, 4, 0, 18] },
      { table: { widths: ['*', '*'], body: [[
        metricCard('Active learners', String(snapshot.summary.activeStudents), `${snapshot.summary.studentsWithScores} with graded evidence`, '#2563eb'),
        metricCard('Average score', `${snapshot.summary.averageScore}%`, `${snapshot.summary.submissionsReceived} submissions`, '#059669'),
      ], [
        metricCard('Attendance', `${snapshot.summary.attendanceRate}%`, 'Present and late counted as attended', '#7c3aed'),
        metricCard('Curriculum coverage', `${snapshot.summary.curriculumCoverage}%`, `${snapshot.curriculum.completedWeeks}/${snapshot.curriculum.plannedWeeks} selected weeks`, BRAND),
      ], [
        metricCard('Attached staff', String(snapshot.summary.activeStaff), `${snapshot.summary.activeTeachers} teachers and ${snapshot.summary.schoolAccounts} school accounts`, '#0f766e'),
        metricCard('Assignments created', String(snapshot.summary.assignmentsCreated), 'Within the selected reporting period', '#2563eb'),
      ]] }, layout: { hLineColor: () => BORDER, vLineColor: () => BORDER } },
      { text: 'Performance at a glance', style: 'subsection', margin: [0, 22, 0, 8] },
      progressBar('Average learner score', snapshot.summary.averageScore, '#059669'),
      progressBar('Attendance rate', snapshot.summary.attendanceRate, '#7c3aed'),
      progressBar('Curriculum coverage', snapshot.summary.curriculumCoverage, BRAND),

      { text: 'Performance distribution', style: 'section', pageBreak: 'before' },
      { columns: [
        { width: '*', stack: [{ text: 'Score bands', style: 'subsection' }, ...snapshot.scoreBands.map((band) => ({ columns: [{ text: band.label, fontSize: 9 }, { text: String(band.count), bold: true, alignment: 'right', color: band.color }], margin: [0, 5, 8, 5] }))] },
        { width: '*', stack: [{ text: 'Attendance bands', style: 'subsection' }, ...snapshot.attendanceBands.map((band) => ({ columns: [{ text: band.label, fontSize: 9 }, { text: String(band.count), bold: true, alignment: 'right', color: band.color }], margin: [8, 5, 0, 5] }))] },
      ], columnGap: 18 },
      { text: 'Class comparison', style: 'subsection', margin: [0, 22, 0, 8] },
      { table: { headerRows: 1, widths: ['*', 48, 58, 62, 58], body: [
        ['Class', 'Learners', 'Avg score', 'Attendance', 'Submissions'].map((text) => ({ text, style: 'tableHeader' })),
        ...classRows,
      ] }, layout: { fillColor: (rowIndex: number) => rowIndex === 0 ? BRAND : rowIndex % 2 ? '#ffffff' : '#f9fafb', hLineColor: () => BORDER, vLineColor: () => BORDER } },

      { text: 'Curriculum delivery', style: 'section', pageBreak: 'before' },
      { text: `${snapshot.curriculum.completedWeeks} completed, ${snapshot.curriculum.inProgressWeeks} in progress and ${snapshot.curriculum.skippedWeeks} skipped across ${snapshot.curriculum.plannedWeeks} planned weeks in the selected range.`, color: MUTED, fontSize: 10, margin: [0, 4, 0, 14] },
      { table: { headerRows: 1, widths: ['*', 78, 52, 48, 42, 48], body: [
        ['Course', 'Programme', 'Done', 'Ongoing', 'Skipped', 'Coverage'].map((text) => ({ text, style: 'tableHeader' })),
        ...curriculumRows,
      ] }, layout: { fillColor: (rowIndex: number) => rowIndex === 0 ? BRAND : rowIndex % 2 ? '#ffffff' : '#f9fafb', hLineColor: () => BORDER, vLineColor: () => BORDER } },
      { text: 'Work completed', style: 'subsection', margin: [0, 22, 0, 8] },
      { columns: [
        metricCard('Assignments created', String(snapshot.summary.assignmentsCreated), 'Within the date range', '#2563eb'),
        metricCard('Submissions received', String(snapshot.summary.submissionsReceived), 'Learner work received', '#059669'),
      ], columnGap: 12 },
      { text: 'Programme and course performance', style: 'section', pageBreak: 'before' },
      { text: `Results are grouped by the programme and course attached to each graded assignment during ${snapshot.period.termLabel}, ${snapshot.period.academicYear}.`, color: MUTED, fontSize: 10, margin: [0, 4, 0, 14] },
      ...snapshot.programmeCoursePerformance.slice(0, 10).map((row) => progressBar(`${row.programme} - ${row.course}`, row.averageScore, row.averageScore >= 75 ? '#059669' : row.averageScore >= 50 ? '#d97706' : '#e11d48')),
      { text: 'Programme and course evidence', style: 'subsection', margin: [0, 18, 0, 8] },
      { table: { headerRows: 1, widths: [92, '*', 48, 58, 52], body: [
        ['Programme', 'Course', 'Learners', 'Graded work', 'Average'].map((text) => ({ text, style: 'tableHeader' })),
        ...programmeRows,
      ] }, layout: { fillColor: (rowIndex: number) => rowIndex === 0 ? BRAND : rowIndex % 2 ? '#ffffff' : '#f9fafb', hLineColor: () => BORDER, vLineColor: () => BORDER } },

      { text: 'School invoice appendix', style: 'section', pageBreak: 'before' },
      { text: `Invoices are included only when they match ${snapshot.period.termLabel}, ${snapshot.period.academicYear}. This prevents an invoice from another term or year being mixed into this report book.`, color: MUTED, fontSize: 10, lineHeight: 1.35, margin: [0, 4, 0, 16] },
      { table: { widths: ['*', '*'], body: [[
        metricCard('Total invoiced', formatMoney(snapshot.finance.totalInvoiced, snapshot.finance.currency), `${snapshot.finance.invoiceCount} matching invoice(s)`, '#2563eb'),
        metricCard('Total paid', formatMoney(snapshot.finance.totalPaid, snapshot.finance.currency), 'Payments recorded against matching invoices', '#059669'),
      ], [
        metricCard('Outstanding balance', formatMoney(snapshot.finance.totalOutstanding, snapshot.finance.currency), 'Balance still due for the selected term', '#b42318'),
        metricCard('Academic period', snapshot.period.academicYear, snapshot.period.termLabel, BRAND),
      ]] }, layout: { hLineColor: () => BORDER, vLineColor: () => BORDER } },
      { text: 'Matching invoice records', style: 'subsection', margin: [0, 22, 0, 8] },
      { table: { headerRows: 1, widths: ['*', 62, 82, 76, 82], body: [
        ['Invoice', 'Status', 'Amount', 'Paid', 'Balance'].map((text) => ({ text, style: 'tableHeader' })),
        ...invoiceRows,
      ] }, layout: { fillColor: (rowIndex: number) => rowIndex === 0 ? BRAND : rowIndex % 2 ? '#ffffff' : '#f9fafb', hLineColor: () => BORDER, vLineColor: () => BORDER } },

      { text: 'Findings and next actions', style: 'section', pageBreak: 'before' },
      { text: 'Key achievements', style: 'subsection' }, textList(narrative.achievements, '#067647'),
      { text: 'Areas needing attention', style: 'subsection' }, textList(narrative.concerns, '#b42318'),
      { text: 'Recommended actions', style: 'subsection' }, textList(narrative.recommendations),
      { text: 'Next reporting period focus', style: 'subsection' }, textList(narrative.nextPeriodFocus),
      { text: 'Data notes', style: 'subsection', margin: [0, 18, 0, 4] }, textList(snapshot.dataNotes, MUTED),
      { text: 'Prepared through the Rillcod school reporting system. AI may assist the wording, but the figures come from the saved aggregate snapshot and staff approve the report before publication.', color: MUTED, fontSize: 8, lineHeight: 1.35, margin: [0, 18, 0, 0] },
    ],
    styles: {
      section: { fontSize: 20, bold: true, color: INK, margin: [0, 0, 0, 12] },
      subsection: { fontSize: 12, bold: true, color: INK, margin: [0, 8, 0, 5] },
      eyebrow: { fontSize: 7, bold: true, color: MUTED, characterSpacing: 0.8 },
      coverValue: { fontSize: 10, bold: true, color: INK, margin: [0, 5, 0, 0] },
      tableHeader: { color: '#ffffff', bold: true, fontSize: 8 },
    },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: INK },
  };
}

export async function renderSchoolReportPdf(report: SchoolPerformanceReportRow): Promise<Buffer> {
  return renderPdfToBuffer(buildSchoolReportPdfDefinition(report));
}
