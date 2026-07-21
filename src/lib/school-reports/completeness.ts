import type { SchoolReportSnapshot } from './types';
import { buildSchoolReportBillingHref } from './finance-links';

export type CompletenessItem = {
  key: string;
  label: string;
  ok: boolean;
  required: boolean;
  detail: string;
  actionHref?: string;
  actionLabel?: string;
};

export type CompletenessReport = {
  readyToPublish: boolean;
  score: number;
  totalRequired: number;
  completedRequired: number;
  missingRequired: CompletenessItem[];
  items: CompletenessItem[];
};

/** Build a clear checklist so staff know what still blocks a complete school report book. */
export function buildSchoolReportCompleteness(snapshot: SchoolReportSnapshot): CompletenessReport {
  const invoiceAttached = (snapshot.finance?.invoiceCount || 0) > 0;
  const invoiceDiagnostics = snapshot.finance?.matchDiagnostics;
  const learners = Array.isArray(snapshot.learners) ? snapshot.learners : [];
  const hasScores = (snapshot.summary?.studentsWithScores || 0) > 0;
  const hasAttendance = (snapshot.attendanceBands || []).some((b) => b.count > 0);
  const hasCurriculum = (snapshot.curriculum?.plannedWeeks || 0) > 0;
  const hasClasses = (snapshot.classPerformance || []).length > 0;
  const hasProgrammes = (snapshot.programmeCoursePerformance || []).length > 0;
  const term = snapshot.period?.termLabel || 'this term';
  const year = snapshot.period?.academicYear || 'this year';
  const schoolName = snapshot.school?.name || 'this school';
  const billingHref = buildSchoolReportBillingHref({
    schoolId: snapshot.school.id,
    academicTermId: snapshot.period.academicTermId,
    academicYear: year,
    termLabel: term,
    academicTermNumber: snapshot.period.academicTermNumber,
    invoiceId: snapshot.finance?.invoices?.[0]?.id ?? null,
  });

  const requiredFailures = (snapshot.dataSources ?? []).filter((s) => s.required && s.status === 'failed');
  const optionalFailures = (snapshot.dataSources ?? []).filter((s) => !s.required && s.status === 'failed');
  const sourcesHealthy = requiredFailures.length === 0;

  const items: CompletenessItem[] = [
    {
      key: 'source_health',
      label: 'Source data health',
      ok: sourcesHealthy,
      required: true,
      detail:
        requiredFailures.length > 0
          ? `Required source failures: ${requiredFailures.map((s) => s.source).join(', ')}. Refresh snapshot after fixing.`
          : optionalFailures.length > 0
            ? `Optional sources failed: ${optionalFailures.map((s) => s.source).join(', ')} — review before publishing.`
            : (snapshot.dataSources?.length ?? 0) > 0
              ? `${snapshot.dataSources!.length} sources loaded successfully.`
              : 'Source health ledger unavailable on this snapshot — refresh data.',
    },
    {
      key: 'learners',
      label: 'Learner roster',
      ok: learners.length > 0,
      required: true,
      detail: learners.length
        ? `${learners.length} learners included in the book.`
        : 'No learners in the snapshot. Refresh data after students are enrolled.',
    },
    {
      key: 'scores',
      label: 'Academic evidence',
      ok: hasScores,
      required: true,
      detail: hasScores
        ? `${snapshot.summary.studentsWithScores} learners have Manual Result Entry or gradebook scores for this term.`
        : 'No Manual Result Entry or graded gradebook scores for this term. Complete Report Builder or class grades, then refresh.',
    },
    {
      key: 'attendance',
      label: 'Attendance records',
      ok: hasAttendance,
      required: false,
      detail: hasAttendance
        ? 'Attendance bands are available.'
        : 'No attendance was recorded in the period (optional but recommended).',
    },
    {
      key: 'classes',
      label: 'Class comparison',
      ok: hasClasses,
      required: false,
      detail: hasClasses
        ? `${snapshot.classPerformance.length} school classes segmented (by class assignment, with teacher where set).`
        : 'No class groupings available yet.',
    },
    {
      key: 'staff',
      label: 'Assigned teachers',
      ok: (snapshot.staff?.assignedTeachers ?? snapshot.summary?.activeTeachers ?? 0) > 0,
      required: false,
      detail:
        (snapshot.staff?.assignedTeachers ?? snapshot.summary?.activeTeachers ?? 0) > 0
          ? `${snapshot.staff?.assignedTeachers ?? snapshot.summary.activeTeachers} teachers assigned to this school (teacher_schools and/or class owners).`
          : 'No teachers are assigned to this school yet.',
    },
    {
      key: 'programmes',
      label: 'Programme / course results',
      ok: hasProgrammes,
      required: false,
      detail: hasProgrammes
        ? `${snapshot.programmeCoursePerformance.length} programme-course rows from Manual Result Entry and/or gradebook.`
        : 'No programme/course results from Manual Result Entry or gradebook for this term.',
    },
    {
      key: 'curriculum',
      label: 'Curriculum coverage',
      ok: hasCurriculum,
      required: false,
      detail: hasCurriculum
        ? `${snapshot.curriculum.completedWeeks}/${snapshot.curriculum.plannedWeeks} weeks covered.`
        : 'No curriculum weeks in the selected term/week range.',
    },
    {
      key: 'invoice',
      label: invoiceAttached ? 'School invoice for this term' : 'Term invoice missing',
      ok: invoiceAttached,
      required: true,
      detail: invoiceAttached
        ? snapshot.finance.invoiceCount > 1
          ? `${snapshot.finance.invoiceCount} invoices matched ${term}, ${year} — review duplicates in Finance Center if needed.`
          : snapshot.finance.enrollmentAligned === false
            ? `${snapshot.finance.invoiceCount} invoice attached — billed ${snapshot.finance.billedStudents ?? '?'} vs ${snapshot.finance.enrolledStudents ?? '?'} enrolled in classes. Align quantities in Finance Center.`
            : `${snapshot.finance.invoiceCount} matching invoice(s) attached for ${term}, ${year}${snapshot.finance.billedStudents ? ` (${snapshot.finance.billedStudents} billed)` : ''}.`
        : invoiceDiagnostics?.nearMisses?.length
          ? `${invoiceDiagnostics.candidateCount} school invoice(s) exist but none match ${term}, ${year}. See Data tab for mismatch reasons.`
          : `Create the ${term}, ${year} invoice for ${schoolName} in Finance Center, then refresh snapshot here.`,
      actionHref: billingHref,
      actionLabel: invoiceAttached ? 'Open in Finance Center' : 'Create invoice in Finance Center',
    },
  ];

  const required = items.filter((item) => item.required);
  const completedRequired = required.filter((item) => item.ok).length;
  const missingRequired = required.filter((item) => !item.ok);
  const score = required.length ? Math.round((completedRequired / required.length) * 100) : 100;

  return {
    readyToPublish: missingRequired.length === 0,
    score,
    totalRequired: required.length,
    completedRequired,
    missingRequired,
    items,
  };
}
