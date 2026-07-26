import { compareLearnersForRoster } from '../aggregate';
import { normalizeSchoolReportDesign, showReportSection, type SchoolReportSectionKey } from '../design';
import { mergeProgrammeCoursePerformanceWithEnrolment } from '../programme-course-performance';
import { DEFAULT_SCHOOL_REPORT_POLICY } from '../report-policy';
import type { SchoolPerformanceReportRow } from '../types';
import { schoolReportVerificationCode, schoolReportVerificationUrl } from '../verification';
import { loadBrandLogoDataUrl, loadOfficialSignatureDataUrl } from './assets';

/**
 * Everything a report section needs, derived once.
 *
 * The document builder previously computed all of this as locals and every
 * section reached into that closure. That is the single reason the sections
 * could not be split into their own modules: they had no declared inputs, only
 * ambient ones. Making the shared state an explicit, typed value is the
 * enabling step - a section can now be moved out as a plain function of this
 * context without dragging the rest of the builder with it.
 */
export type SchoolReportPdfContext = {
  report: SchoolPerformanceReportRow;
  /** Snapshot with curriculum coverage reconciled — see buildSchoolReportPdfContext. */
  snapshot: SchoolPerformanceReportRow['snapshot'];
  narrative: SchoolPerformanceReportRow['narrative'];
  programmeCourseRows: ReturnType<typeof mergeProgrammeCoursePerformanceWithEnrolment>;
  reportPolicy: typeof DEFAULT_SCHOOL_REPORT_POLICY;
  verificationCode: string;
  verificationUrl: string;
  design: ReturnType<typeof normalizeSchoolReportDesign>;
  /** The SCHOOL's accent colour — deliberately shadows the default BRAND token. */
  brand: string;
  showSec: (key: SchoolReportSectionKey) => boolean;
  learners: SchoolPerformanceReportRow['snapshot']['learners'];
  sortedLearners: SchoolPerformanceReportRow['snapshot']['learners'];
  attendanceSourceNote: string;
  overallTopScorer: SchoolPerformanceReportRow['snapshot']['learners'][number] | null;
  logo: string | null;
  issuedAt: Date;
  officialSignature: string | null;
  isPublished: boolean;
  period: string;
  curriculumRange: string;
  generatedLabel: string;
};

export function buildSchoolReportPdfContext(
  report: SchoolPerformanceReportRow,
  opts?: { narrative?: SchoolPerformanceReportRow['narrative']; verificationQrDataUrl?: string },
): SchoolReportPdfContext {
  const rawSnapshot = report.snapshot;

  // Coverage has two possible sources. When staff have confirmed a delivery
  // declaration, the summary figure reflects what they actually ticked; without
  // one, fall back to the mapped completed/planned week ratio.
  const mappedCoverage = rawSnapshot.curriculum.plannedWeeks > 0
    ? Math.round((rawSnapshot.curriculum.completedWeeks / rawSnapshot.curriculum.plannedWeeks) * 100)
    : 0;
  const reliableCoverage = rawSnapshot.deliveryDeclaration ? rawSnapshot.summary.curriculumCoverage : mappedCoverage;
  const snapshot = {
    ...rawSnapshot,
    summary: { ...rawSnapshot.summary, curriculumCoverage: reliableCoverage },
  };

  const reportPolicy = snapshot.reportPolicy || DEFAULT_SCHOOL_REPORT_POLICY;
  const design = normalizeSchoolReportDesign(report.design);
  const learners = Array.isArray(snapshot.learners) ? snapshot.learners : [];
  const issuedAt = new Date(snapshot.generatedAt || report.updated_at || Date.now());

  // A signature is stamped only while the signatory was actually in post, so a
  // reissued historical report cannot be signed by someone who had left.
  const signatoryActive =
    (!reportPolicy.signatory.activeFrom || issuedAt >= new Date(reportPolicy.signatory.activeFrom)) &&
    (!reportPolicy.signatory.activeUntil || issuedAt <= new Date(reportPolicy.signatory.activeUntil));

  return {
    report,
    snapshot,
    narrative: opts?.narrative || report.narrative,
    programmeCourseRows: mergeProgrammeCoursePerformanceWithEnrolment(
      snapshot.programmeCoursePerformance || [],
      snapshot.schoolProgrammes || [],
    ),
    reportPolicy,
    verificationCode: report.verification_code || schoolReportVerificationCode(report.id),
    verificationUrl: schoolReportVerificationUrl(report.id),
    design,
    brand: design.accentColor,
    showSec: (key: SchoolReportSectionKey) => showReportSection(design, key),
    learners,
    sortedLearners: [...learners].sort(compareLearnersForRoster),
    attendanceSourceNote: `${snapshot.summary.activeStudents} learner${snapshot.summary.activeStudents === 1 ? '' : 's'} with attendance records this term`,
    overallTopScorer: [...learners]
      .filter((learner) => Number.isFinite(Number(learner.averageScore)) && Number(learner.averageScore) > 0)
      .sort((a, b) => Number(b.averageScore) - Number(a.averageScore) || a.name.localeCompare(b.name))[0] || null,
    logo: design.showLogo ? loadBrandLogoDataUrl() : null,
    issuedAt,
    officialSignature: signatoryActive
      ? loadOfficialSignatureDataUrl(reportPolicy.signatory.signatureAsset)
      : null,
    isPublished: report.status === 'published',
    period: `${new Date(report.period_start).toLocaleDateString('en-GB')} - ${new Date(report.period_end).toLocaleDateString('en-GB')}`,
    curriculumRange: `Term ${report.curriculum_start_term} Week ${report.curriculum_start_week}  to  Term ${report.curriculum_end_term} Week ${report.curriculum_end_week}`,
    generatedLabel: issuedAt.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
  };
}
