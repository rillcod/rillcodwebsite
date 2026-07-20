import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderSchoolReportPdf } from '../src/lib/school-reports/pdf';
import type { SchoolPerformanceReportRow } from '../src/lib/school-reports/types';

const report: SchoolPerformanceReportRow = {
  id: 'sample', school_id: 'school-sample', title: 'Term One Learning and Performance Review',
  period_start: '2026-09-01', period_end: '2026-10-31',
  curriculum_start_term: 1, curriculum_start_week: 1, curriculum_end_term: 1, curriculum_end_week: 8,
  academic_term_id: 'term-sample', academic_year: '2026/2027', term_label: 'First Term',
  status: 'published', created_by: 'staff-sample', published_by: 'staff-sample',
  published_at: '2026-11-02T10:00:00.000Z', created_at: '2026-11-01T10:00:00.000Z', updated_at: '2026-11-02T10:00:00.000Z',
  narrative: {
    executiveSummary: 'The school recorded steady learner participation and strong curriculum delivery during the selected period. Performance was positive overall, with targeted support recommended for classes below the school average.',
    achievements: ['Attendance remained above 80%.', 'Most planned curriculum weeks were completed.', 'Learners submitted a strong volume of assessed work.'],
    concerns: ['One class remains below the school score average.', 'A small number of planned curriculum weeks remain in progress.'],
    recommendations: ['Provide targeted revision for the class below average.', 'Complete and record the remaining curriculum weeks.', 'Continue weekly attendance follow-up.'],
    nextPeriodFocus: ['Close curriculum delivery gaps.', 'Increase graded evidence.', 'Share successful teaching practices across classes.'],
  },
  snapshot: {
    generatedAt: '2026-11-01T10:00:00.000Z', school: { id: 'school-sample', name: 'Bright Future Partner School' },
    period: { startDate: '2026-09-01', endDate: '2026-10-31', academicTermId: 'term-sample', academicYear: '2026/2027', termLabel: 'First Term', academicTermNumber: 1, curriculumStart: { term: 1, week: 1 }, curriculumEnd: { term: 1, week: 8 } },
    summary: { activeStudents: 84, activeStaff: 9, activeTeachers: 8, schoolAccounts: 1, averageScore: 72.4, attendanceRate: 86.2, curriculumCoverage: 81.3, assignmentsCreated: 18, submissionsReceived: 276, studentsWithScores: 79 },
    scoreBands: [{ label: 'Excellent 75-100%', count: 34, color: '#059669' }, { label: 'Developing 50-74%', count: 37, color: '#d97706' }, { label: 'Needs support below 50%', count: 8, color: '#e11d48' }],
    attendanceBands: [{ label: 'Strong 80-100%', count: 58, color: '#2563eb' }, { label: 'Watch 60-79%', count: 20, color: '#7c3aed' }, { label: 'Needs action below 60%', count: 6, color: '#e11d48' }],
    classPerformance: [{ className: 'Primary 4', students: 28, averageScore: 78, attendanceRate: 89, submissions: 96 }, { className: 'Primary 5', students: 30, averageScore: 72, attendanceRate: 86, submissions: 102 }, { className: 'Primary 6', students: 26, averageScore: 66, attendanceRate: 83, submissions: 78 }],
    programmeCoursePerformance: [{ programme: 'Digital Skills', course: 'Coding Foundations', students: 52, submissions: 110, averageScore: 78 }, { programme: 'Digital Skills', course: 'Web Design', students: 48, submissions: 96, averageScore: 72 }, { programme: 'STEM', course: 'Robotics', students: 41, submissions: 70, averageScore: 67 }],
    curriculum: { plannedWeeks: 32, completedWeeks: 26, inProgressWeeks: 4, skippedWeeks: 1, courses: [{ course: 'Coding Foundations', programme: 'Digital Skills', planned: 8, completed: 7, inProgress: 1, skipped: 0, coverage: 87.5 }, { course: 'Web Design', programme: 'Digital Skills', planned: 8, completed: 6, inProgress: 1, skipped: 1, coverage: 75 }, { course: 'Robotics', programme: 'STEM', planned: 8, completed: 7, inProgress: 1, skipped: 0, coverage: 87.5 }, { course: 'Digital Citizenship', programme: 'Digital Skills', planned: 8, completed: 6, inProgress: 1, skipped: 0, coverage: 75 }] },
    finance: { currency: 'NGN', invoiceCount: 2, totalInvoiced: 850000, totalPaid: 600000, totalOutstanding: 250000, invoices: [{ id: 'invoice-1', invoiceNumber: 'INV-2026-104', status: 'partially_paid', amount: 600000, paid: 350000, outstanding: 250000, dueDate: '2026-10-15' }, { id: 'invoice-2', invoiceNumber: 'INV-2026-118', status: 'paid', amount: 250000, paid: 250000, outstanding: 0, dueDate: '2026-10-30' }] },
    dataNotes: ['Figures are a frozen aggregate snapshot created from records available at generation time.', 'Five active learners had no graded submission in the selected period.'],
  },
};

async function main() {
  const outputDir = resolve('output/pdf');
  await mkdir(outputDir, { recursive: true });
  const buffer = await renderSchoolReportPdf(report);
  const output = resolve(outputDir, 'school-performance-report-sample.pdf');
  await writeFile(output, buffer);
  process.stdout.write(output);
}

void main();
