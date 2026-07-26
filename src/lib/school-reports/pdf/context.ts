import { compareLearnersForRoster } from '../aggregate';
import { buildDeliveryLedger, type DeliveryLedger } from '../delivery-structure';
import { resolveReportDensity, type DensityMetrics } from './density';
import type { SectionLeads } from './section-leads';
import { buildTopicsCoveredDraft } from '../delivered-topics';
import { resolveSchoolReportInsights } from '../insights';
import { dedupeStringList, filterNextPhaseItems } from '../report-content-dedup';
import { schoolReportPhaseLabel } from '../report-policy';
import { resolveLeadershipNarrativeForDisplay } from '../topics-covered-presentation';
import { briefExecutiveItems, formatProgrammeScopeText } from './text';
import { buildTopicsPresentation, topicsCoveredText } from './topics';
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
  /** Pre-rendered QR image. Null when the caller did not supply one. */
  verificationQrDataUrl: string | null;
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

  // ── Derived layer ────────────────────────────────────────────────────────
  // Computed from the fields above and shared by several sections. These were
  // declared partway down the builder, which meant any section depending on
  // them could not be lifted out with a (ctx) => object[] signature. They live
  // here rather than being threaded through an `extras` parameter, because an
  // extras bag is just the closure problem again with more typing.
  insights: ReturnType<typeof resolveSchoolReportInsights>;
  /** True when staff explicitly confirmed delivery topics for this period. */
  hasStaffDelivery: boolean;
  topicsPresentation: ReturnType<typeof buildTopicsPresentation>;
  topicsText: string;
  deliveryLedger: DeliveryLedger;
  /** Whether the curriculum delivery section has anything worth printing. */
  showDelivery: boolean;

  // ── Briefing / delivery narrative cluster ────────────────────────────────
  // These feed the three mutually exclusive "curriculum delivery" variants and
  // the partnership briefing. They are grouped because the exclusivity between
  // those sections is decided by these values together — splitting them apart
  // is how a book ends up printing two delivery sections, or none.
  programmeReflections: Array<{ programme: string; course: string; summary: string; nextIntro: string }>;
  programmeReflectionByKey: Map<string, { programme: string; course: string; summary: string; nextIntro: string }>;
  showWhatWeTaught: boolean;
  programmesInScope: string[];
  programmeScopeText: string;
  leadershipNarrativeText: string;
  /** Text already said elsewhere — used to stop the briefing repeating itself. */
  briefingCorpus: string[];
  pdfStrengthItems: string[];
  pdfFocusItems: string[];
  filteredNextPhaseSchool: Array<{ actions: string[] } & Record<string, unknown>>;
  filteredInvolvement: string[];
  showNextPhaseSection: boolean;
  learningPhase: string;
  /** Page density derived from roster size — see pdf/density.ts. */
  densityMetrics: DensityMetrics;
  /** Optional AI-written section openers. Empty when unavailable. */
  sectionLeads: SectionLeads;
};

export function buildSchoolReportPdfContext(
  report: SchoolPerformanceReportRow,
  opts?: { narrative?: SchoolPerformanceReportRow['narrative']; verificationQrDataUrl?: string; sectionLeads?: SectionLeads },
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

  const narrative = opts?.narrative || report.narrative;
  const showSec = (key: SchoolReportSectionKey) => showReportSection(design, key);
  const curriculumRange = `Term ${report.curriculum_start_term} Week ${report.curriculum_start_week}  to  Term ${report.curriculum_end_term} Week ${report.curriculum_end_week}`;

  const insights = resolveSchoolReportInsights(snapshot);
  const topicsPresentation = buildTopicsPresentation(snapshot);
  const topicsText = topicsCoveredText(narrative, insights, snapshot);

  const sourceDeliveryLedger: DeliveryLedger =
    insights?.deliveryLedger ||
    buildDeliveryLedger(snapshot, {
      nextLines: narrative.nextPeriodFocus?.length
        ? narrative.nextPeriodFocus
        : insights?.deliveryCommitment?.next || insights?.nextModuleFocus || [],
      curriculumRange,
      programmeNames: Array.from(
        new Set((snapshot.curriculum.courses || []).map((row) => row.programme).filter(Boolean)),
      ),
      evidenceQualityPct: insights?.evidenceQualityPct ?? 0,
    });

  const deliveryLedger: DeliveryLedger = {
    ...sourceDeliveryLedger,
    // Restate pacing depth using the reconciled coverage figure so the prose
    // cannot contradict the number printed elsewhere in the same book.
    evidenceLines: sourceDeliveryLedger.evidenceLines.map((line) =>
      line.includes('Term delivery confirmed across') || line.includes('Term delivery pacing depth')
        ? line.replace(/\(\d+% pacing depth\)/, `(${snapshot.summary.curriculumCoverage}% pacing depth)`)
        : line,
    ),
  };

  const programmeReflections = deliveryLedger.topicRows.map((row) => {
    const spotlight = insights?.programmeSpotlights?.find(
      (item) => item.programme === row.programme && item.course === row.course,
    );
    return {
      programme: row.programme,
      course: row.course,
      summary: spotlight?.summary || row.evidence,
      nextIntro: spotlight?.nextIntro || `Continue ${row.programme} | ${row.course} from this term's evidence.`,
    };
  });

  const leadershipNarrativeText = resolveLeadershipNarrativeForDisplay(
    narrative.topicsCovered,
    topicsPresentation,
    { fallbackDraft: buildTopicsCoveredDraft(snapshot) },
  );

  // Anything already said in the summary or the delivery lines, so the briefing
  // can be de-duplicated against it rather than restating the same points.
  const briefingCorpus = [
    narrative.executiveSummary,
    leadershipNarrativeText,
    ...deliveryLedger.nextLines,
  ].filter(Boolean);

  const pdfStrengthItems = dedupeStringList(
    briefExecutiveItems(narrative.achievements.length ? narrative.achievements : insights?.strengths || [], 3, 115),
    briefingCorpus,
    3,
  );
  const pdfFocusItems = dedupeStringList(
    briefExecutiveItems(insights?.partnershipFocus?.length ? insights.partnershipFocus : narrative.concerns || [], 3, 125),
    [...briefingCorpus, ...pdfStrengthItems],
    3,
  );

  const nextPhaseCorpus = [
    ...briefingCorpus,
    ...pdfStrengthItems,
    ...pdfFocusItems,
    ...(narrative.nextPeriodFocus || []),
  ];
  const filteredNextPhaseSchool = (insights?.nextPhaseSchool || [])
    .map((phase) => ({
      ...phase,
      actions: filterNextPhaseItems(phase.actions, nextPhaseCorpus),
    }))
    .filter((phase) => phase.actions.length > 0);
  const filteredInvolvement = filterNextPhaseItems(insights?.involvement || [], nextPhaseCorpus);

  const programmesInScope = Array.from(
    new Set(
      [
        ...deliveryLedger.topicRows.map((row) => row.programme),
        ...snapshot.programmeCoursePerformance.map((row) => row.programme),
        ...(snapshot.schoolProgrammes || []).map((row) => row.programme),
      ].filter(Boolean),
    ),
  );

  return {
    report,
    snapshot,
    narrative,
    programmeCourseRows: mergeProgrammeCoursePerformanceWithEnrolment(
      snapshot.programmeCoursePerformance || [],
      snapshot.schoolProgrammes || [],
    ),
    reportPolicy,
    verificationCode: report.verification_code || schoolReportVerificationCode(report.id),
    verificationUrl: schoolReportVerificationUrl(report.id),
    verificationQrDataUrl: opts?.verificationQrDataUrl ?? null,
    design,
    brand: design.accentColor,
    showSec,
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
    curriculumRange,
    generatedLabel: issuedAt.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),

    insights,
    hasStaffDelivery: Boolean(snapshot.deliveryDeclaration?.selectedTopics?.length),
    topicsPresentation,
    topicsText,
    deliveryLedger,
    showDelivery:
      showSec('deliverySummary')
      || Boolean(topicsText)
      || Boolean(topicsPresentation)
      || Boolean(snapshot.deliveryDeclaration?.selectedTopics?.length),

    programmeReflections,
    programmeReflectionByKey: new Map(
      programmeReflections.map((row) => [`${row.programme}::${row.course}`, row]),
    ),
    // Note: unlike showDelivery this does NOT consider showSec('deliverySummary'),
    // so the "what we taught" body can be suppressed while the surrounding
    // delivery section still renders.
    showWhatWeTaught:
      Boolean(topicsText)
      || Boolean(topicsPresentation)
      || Boolean(snapshot.deliveryDeclaration?.selectedTopics?.length),
    programmesInScope,
    programmeScopeText: formatProgrammeScopeText(programmesInScope),
    leadershipNarrativeText,
    briefingCorpus,
    pdfStrengthItems,
    pdfFocusItems,
    filteredNextPhaseSchool,
    filteredInvolvement,
    showNextPhaseSection:
      showSec('nextPhase')
      && (filteredNextPhaseSchool.length > 0
        || filteredInvolvement.length > 0
        || (insights?.nextPhaseLearners?.length || 0) > 0),
    learningPhase: schoolReportPhaseLabel(
      reportPolicy,
      snapshot.period.academicTermNumber || snapshot.period.curriculumStart.term || 1,
    ),
    densityMetrics: resolveReportDensity(learners.length),
    sectionLeads: opts?.sectionLeads ?? {},
  };
}
