import type { SchoolReportSnapshot } from './types';
import { normalizeSchoolReportDesign, type SchoolReportDesignSettings } from './design';
import { buildSchoolReportBillingHref } from './finance-links';
import { normalizeProgrammeLabel, programmeCourseKey } from './school-curriculum-scope';
import { isPlaceholderDeliveryLabel } from './topics-covered-presentation';
import { countNoun, nounFor } from './wording';

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
export function buildSchoolReportCompleteness(
  snapshot: SchoolReportSnapshot,
  design?: Partial<SchoolReportDesignSettings> | null,
): CompletenessReport {
  const normalizedDesign = normalizeSchoolReportDesign(design);
  const excludeBilling = normalizedDesign.excludeBilling === true;
  const invoiceAttached = (snapshot.finance?.invoiceCount || 0) > 0;
  const invoiceDiagnostics = snapshot.finance?.matchDiagnostics;
  const learners = Array.isArray(snapshot.learners) ? snapshot.learners : [];
  const hasScores = (snapshot.summary?.studentsWithScores || 0) > 0;
  const learnersWithAttendance = Number(snapshot.summary?.learnersWithAttendance ?? 0);
  const bandAttendanceCount = (snapshot.attendanceBands || []).reduce(
    (sum, band) => sum + Number(band.count || 0),
    0,
  );
  const attendanceHeadcount = learnersWithAttendance || bandAttendanceCount;
  const hasAttendance = attendanceHeadcount > 0;
  const scoreOnlyWithoutAttendance = Math.max(
    0,
    Number(snapshot.summary?.studentsWithScores || 0) - attendanceHeadcount,
  );
  const enrolledCourses = [
    ...(snapshot.schoolProgrammes || [])
      .filter((row) => Number(row.enrolledStudents || 0) > 0 && String(row.course || '').trim())
      .map((row) => ({
        programme: normalizeProgrammeLabel(row.programme),
        course: String(row.course).trim(),
      })),
    ...(snapshot.curriculum?.courses || [])
      .filter((row) => Number(row.enrolledStudents || 0) > 0 && String(row.course || '').trim())
      .map((row) => ({
        programme: normalizeProgrammeLabel(row.programme),
        course: String(row.course).trim(),
      })),
  ];
  const enrolledKeys = [...new Map(enrolledCourses.map((row) => [programmeCourseKey(row.programme, row.course), row])).values()];
  const selectedTopics = snapshot.deliveryDeclaration?.selectedTopics || [];
  const placeholderTicks = selectedTopics.filter((topic) =>
    isPlaceholderDeliveryLabel(topic.topic, topic.key),
  );
  const realTicks = selectedTopics.filter((topic) => !isPlaceholderDeliveryLabel(topic.topic, topic.key));
  const coveredByDelivery = new Set(
    realTicks.map((topic) => programmeCourseKey(normalizeProgrammeLabel(topic.programme), topic.course)),
  );
  const missingDeliveryCourses = enrolledKeys.filter(
    (row) => !coveredByDelivery.has(programmeCourseKey(row.programme, row.course)),
  );
  const hasConfirmedDelivery = Boolean(snapshot.deliveryDeclaration?.updatedAt) && realTicks.length > 0;
  const hasCurriculum = hasConfirmedDelivery && placeholderTicks.length === 0 && missingDeliveryCourses.length === 0;
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
      key: 'curriculum',
      label: 'Confirmed curriculum delivery',
      ok: hasCurriculum,
      required: true,
      detail: placeholderTicks.length
        ? `Placeholder topics cannot be published (e.g. "Core concepts & guided practice"). Generate real programme topics for this term, then tick only what was taught.`
        : missingDeliveryCourses.length
          ? `Confirm real topics for ${missingDeliveryCourses.map((row) => `${row.programme} · ${row.course}`).join(', ')}. If this term has no authored syllabus, generate programme topics first.`
          : !hasConfirmedDelivery
            ? enrolledKeys.length
              ? `A teacher or administrator must review the programme-course checklist and confirm the topics delivered for ${enrolledKeys.map((row) => `${row.programme} · ${row.course}`).join(', ')}.`
              : 'No programme/courses are mapped for this school yet. Refresh after classes are linked, or generate programme topics for the report window.'
            : `${realTicks.length} real ${nounFor(realTicks.length, 'topic')} confirmed${enrolledKeys.length ? ` across ${countNoun(enrolledKeys.length, 'course')}` : ''}.`,
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
        ? `${snapshot.summary.studentsWithScores} learners have verified term assessments or gradebook scores for this term.`
        : 'No verified term assessments or graded gradebook scores for this term. Complete Report Builder or class grades, then refresh.',
    },
    {
      key: 'attendance',
      label: 'Published attendance coverage',
      ok: hasAttendance,
      required: true,
      detail: hasAttendance
        ? `${countNoun(attendanceHeadcount, 'learner')} have attendance evidence (${snapshot.summary.attendanceFromManualRoll ?? 0} from class roll, ${snapshot.summary.attendanceFromResultEntry ?? 0} from Report Builder)${scoreOnlyWithoutAttendance > 0 ? `. ${countNoun(scoreOnlyWithoutAttendance, 'learner')} still have scores without an attendance column — mark class roll or Attendance % in Report Builder, then refresh.` : '.'}`
        : 'No published attendance score or term attendance roll was found for this period — learners with term scores may still appear without an attendance column.',
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
        ? `${snapshot.programmeCoursePerformance.length} programme-course rows from verified term assessments and/or the gradebook.`
        : 'No programme/course results from verified term assessments or the gradebook for this term.',
    },
    {
      key: 'invoice',
      label: excludeBilling ? 'School invoice (excluded)' : invoiceAttached ? 'School invoice for this term' : 'Term invoice missing',
      ok: excludeBilling || invoiceAttached,
      required: !excludeBilling,
      detail: excludeBilling
        ? normalizedDesign.excludeBillingReason
          ? `Billing excluded for this book: ${normalizedDesign.excludeBillingReason}`
          : 'Billing appendix and invoice requirement are turned off for this report book (Layout & PDF tab).'
        : invoiceAttached
          ? snapshot.finance.invoiceCount > 1
            ? `${snapshot.finance.invoiceCount} invoices matched ${term}, ${year} — review duplicates in Finance Center if needed.`
            : snapshot.finance.enrollmentAligned === false
              ? `${snapshot.finance.invoiceCount} invoice attached — billed ${snapshot.finance.billedStudents ?? '?'} vs ${snapshot.finance.enrolledStudents ?? '?'} enrolled in classes. Align quantities in Finance Center.`
              : `${snapshot.finance.invoiceCount} matching ${nounFor(snapshot.finance.invoiceCount, 'invoice')} attached for ${term}, ${year}${snapshot.finance.billedStudents ? ` (${snapshot.finance.billedStudents} billed)` : ''}.`
          : invoiceDiagnostics?.nearMisses?.length
            ? `${invoiceDiagnostics.candidateCount} school ${nounFor(invoiceDiagnostics.candidateCount, 'invoice')} exist but none match ${term}, ${year}. See Data tab for mismatch reasons.`
            : `Create the ${term}, ${year} invoice for ${schoolName} in Finance Center, then refresh snapshot here.`,
      actionHref: excludeBilling ? undefined : billingHref,
      actionLabel: excludeBilling ? undefined : invoiceAttached ? 'Open in Finance Center' : 'Create invoice in Finance Center',
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
