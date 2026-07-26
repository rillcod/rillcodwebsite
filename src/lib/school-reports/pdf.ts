import { brandContact, brandContactLine } from '@/config/brand';
import {
  APPENDIX_A_ACCENT,
  APPENDIX_B_ACCENT,
  APPENDIX_C_ACCENT,
  APPENDIX_D_ACCENT,
  APPENDIX_GRADEBOOK_TINT,
  APPENDIX_ROSTER_TINT,
  BORDER,
  BRAND,
  HEADER_BG,
  INK,
  MUTED,
  PAGE_WIDTH_CONTENT,
  PDF_MIN_APPENDIX,
  PDF_MIN_CHART,
  PDF_MIN_METRICS,
  PDF_MIN_PANEL,
  PDF_MIN_SECTION,
  PDF_MIN_TABLE,
  PRINT_BORDER,
  PRINT_BORDER_LIGHT,
  PRINT_GROUP_BAR,
  RULE,
} from './pdf/tokens';
import { loadBrandLogoDataUrl, loadOfficialSignatureDataUrl } from './pdf/assets';
import {
  appendixSectionStack,
  appendixStatChip,
  buildGroupedLearnerTableRows,
  fmtPct,
  formatSchoolDisplayName,
  formatTermPeriod,
  metaCaption,
  type GroupedLearnerRow,
} from './pdf/blocks';
import {
  borderedPanelLayout,
  borderedSegment,
  brandAccentRule,
  compactMetric,
  flowingDataTable,
  headerCells,
  numberedRecommendationCards,
  pairedSegmentColumns,
  panelBorderLayout,
  progressBar,
  tableLayout,
} from './pdf/layout';
import {
  appendixHeaderCells,
  appendixHero,
  appendixTableLayout,
  buildAppendixCSummaryRows,
  datasheetTextCell,
  printableAppendixTable,
  scorePctCell,
  statusBadgeCell,
} from './pdf/appendix';
import { barChartBlock, pieChartBlock, scoreColor, type Band, type NamedValue } from './pdf/charts';
import {
  briefExecutiveItems,
  briefLearnerLine,
  classListPdfCell,
  cleanDisplayText,
  formatMoney,
  formatProgrammeScopeText,
  plainStatus,
  smartTruncateWords,
  textList,
  toTitleCase,
  withMinPresence,
  wrapPdfText,
} from './pdf/text';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeSchoolReportDesign, showReportSection, type SchoolReportSectionKey } from './design';
import { compareLearnersForRoster, resolveLearnerGradeForDisplay } from './aggregate';
import { resolveSchoolReportInsights } from './insights';
import { buildOfficialClosingRemark } from './closing-remark';
import { buildReportTopicsPresentation, buildTopicsCoveredDraft } from './delivered-topics';
import {
  buildTopicsCoveredPdfBodyForReport,
  buildCelebrationWallPdfStack,
  buildProgrammeSpotlightPdfStack,
  resolveLeadershipNarrativeForDisplay,
} from './topics-covered-presentation';
import {
  dedupeStringList,
  filterNextPhaseItems,
  resolveCommunityMessageForReport,
} from './report-content-dedup';
import { buildDeliveryLedger, type DeliveryLedger } from './delivery-structure';
import { buildCurriculumDeliveryPdfStack } from './delivery-presentation';
import { loadSchoolReportPaymentAccounts, type SchoolReportPaymentAccount } from './payment-accounts';
import { DEFAULT_SCHOOL_REPORT_POLICY, schoolReportPhaseLabel, type SchoolReportPolicy } from './report-policy';
import { reconcileSchoolReportEnrolments } from './enrolment-counts';
import { renderPdfToBuffer } from '@/lib/pdfmake-server';
import { qrDataUrl } from '@/lib/cards/qr';
import { HD_QR_PRINT_PX } from '@/lib/qr/hd-qr';
import { schoolReportVerificationCode, schoolReportVerificationUrl } from './verification';
import {
  buildGradebookSummarySheet,
} from './gradebook-detail';
import { buildStudentRecommendations } from './student-recommendations';
import {
  formatClassDisplay,
  formatCourseDisplay,
  formatProgrammeCourseDisplay,
  formatProgrammeDisplay,
  REPORT_METRIC_LABELS,
} from './display-labels';
import { mergeProgrammeCoursePerformanceWithEnrolment } from './programme-course-performance';
import type { SchoolPerformanceReportRow, SchoolReportSnapshot } from './types';


/** Open metric cell - no filled cards; keeps the page calm and official. */

function paymentAccountsBlock(accounts: SchoolReportPaymentAccount[], policy: SchoolReportPolicy) {
  if (!accounts.length) {
    return {
      stack: [
        { text: 'Payment instructions', style: 'subsection' },
        {
          text: `Bank transfer details are not included here. Please contact ${policy.payment.whatsappDisplay} and quote your invoice number.`,
          color: MUTED,
          fontSize: 8,
          lineHeight: 1.35,
        },
      ],
      margin: [0, 4, 0, 8] as [number, number, number, number],
    };
  }

  return {
    stack: [
      { text: 'Payment instructions - bank transfer', style: 'subsection' },
      {
        text: `Quote your invoice number as the payment reference. Use the account below, then send the receipt by WhatsApp to the official line: ${policy.payment.whatsappDisplay}.`,
        color: MUTED,
        fontSize: 7.5,
        margin: [0, 0, 0, 4] as [number, number, number, number],
      },
      {
        table: {
          widths: ['*'],
          body: accounts.slice(0, 1).map((acct) => [
            {
              columns: [
                {
                  width: '*',
                  stack: [
                    { text: acct.label || 'Rillcod account', fontSize: 8, bold: true, color: BRAND },
                    { text: acct.bankName, fontSize: 7.5, color: MUTED },
                    ...(acct.paymentNote
                      ? [{ text: acct.paymentNote, fontSize: 7, color: MUTED, italics: true, margin: [0, 2, 0, 0] as [number, number, number, number] }]
                      : []),
                  ],
                },
                {
                  width: 'auto',
                  stack: [
                    { text: 'ACCOUNT NUMBER', fontSize: 6.5, bold: true, color: MUTED, alignment: 'right' as const },
                    {
                      text: acct.accountNumber,
                      fontSize: 12,
                      bold: true,
                      alignment: 'right' as const,
                      characterSpacing: 1,
                      margin: [0, 2, 0, 2] as [number, number, number, number],
                    },
                    { text: acct.accountName, fontSize: 7.5, alignment: 'right' as const },
                  ],
                },
              ],
              margin: [10, 8, 10, 8] as [number, number, number, number],
            },
          ]),
        },
        layout: {
          fillColor: () => '#faf5ff',
          hLineColor: () => '#e9d5ff',
          vLineColor: () => '#e9d5ff',
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
      },
    ],
    margin: [0, 6, 0, 8] as [number, number, number, number],
  };
}

/** Compact pie + legend in one column. */
function sectionTitle(text: string) {
  return withMinPresence(
    {
      stack: [
        { text, style: 'section' },
        {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: PAGE_WIDTH_CONTENT, y2: 0, lineWidth: 0.75, lineColor: RULE }],
          margin: [0, 1, 0, 4],
        },
      ],
    },
    PDF_MIN_SECTION,
  );
}

function buildTopicsPresentation(
  snapshot: SchoolPerformanceReportRow['snapshot'],
): ReturnType<typeof buildReportTopicsPresentation> {
  return buildReportTopicsPresentation(snapshot);
}

function topicsCoveredText(
  narrative: SchoolPerformanceReportRow['narrative'],
  insights: ReturnType<typeof resolveSchoolReportInsights> | undefined,
  snapshot: SchoolPerformanceReportRow['snapshot'],
): string {
  const presentation = buildTopicsPresentation(snapshot);
  const fallbackDraft = buildTopicsCoveredDraft(snapshot);
  const leadershipNarrative = resolveLeadershipNarrativeForDisplay(
    narrative.topicsCovered,
    presentation,
    { fallbackDraft },
  );
  if (leadershipNarrative) return leadershipNarrative;
  if (presentation?.plainText) return presentation.plainText;
  if (insights?.topicsProseSeed) return insights.topicsProseSeed;
  if (fallbackDraft.trim()) return fallbackDraft;
  if (insights?.academicCoverage?.length) return insights.academicCoverage.slice(0, 3).join(' ');
  return '';
}

function reportTermLabel(snapshot: SchoolPerformanceReportRow['snapshot']): string {
  return snapshot.period?.termLabel || 'this term';
}

function topicsCoveredPdfBody(
  narrative: SchoolPerformanceReportRow['narrative'],
  snapshot: SchoolPerformanceReportRow['snapshot'],
  colors: { ink: string; brand: string; muted: string },
  nextLines?: string[],
): object[] {
  const presentation = buildTopicsPresentation(snapshot);
  const enrolledCourseLabels = (snapshot.schoolProgrammes || [])
    .filter((row) => (row.enrolledStudents ?? 0) > 0)
    .map((row) => `${formatProgrammeDisplay(row.programme)} · ${formatCourseDisplay(row.course)}`);

  return buildTopicsCoveredPdfBodyForReport(narrative, presentation, colors, {
    enrolledCourseLabels,
    fallbackDraft: buildTopicsCoveredDraft(snapshot),
    nextLines,
  });
}

export function buildSchoolReportPdfDefinition(
  report: SchoolPerformanceReportRow,
  opts?: { narrative?: SchoolPerformanceReportRow['narrative']; verificationQrDataUrl?: string },
) {
  const rawSnapshot = report.snapshot;
  const mappedCoverage = rawSnapshot.curriculum.plannedWeeks > 0
    ? Math.round((rawSnapshot.curriculum.completedWeeks / rawSnapshot.curriculum.plannedWeeks) * 100)
    : 0;
  const reliableCoverage = rawSnapshot.deliveryDeclaration ? rawSnapshot.summary.curriculumCoverage : mappedCoverage;
  const snapshot = {
    ...rawSnapshot,
    summary: { ...rawSnapshot.summary, curriculumCoverage: reliableCoverage },
  };
  const programmeCourseRows = mergeProgrammeCoursePerformanceWithEnrolment(
    snapshot.programmeCoursePerformance || [],
    snapshot.schoolProgrammes || [],
  );
  const reportPolicy = snapshot.reportPolicy || DEFAULT_SCHOOL_REPORT_POLICY;
  const verificationCode = report.verification_code || schoolReportVerificationCode(report.id);
  const verificationUrl = schoolReportVerificationUrl(report.id);
  const narrative = opts?.narrative || report.narrative;
  const design = normalizeSchoolReportDesign(report.design);
  const BRAND = design.accentColor;
  const showSec = (key: SchoolReportSectionKey) => showReportSection(design, key);
  const learners = Array.isArray(snapshot.learners) ? snapshot.learners : [];
  const sortedLearners = [...learners].sort(compareLearnersForRoster);
  const attendanceSourceNote = `${snapshot.summary.activeStudents} learner${snapshot.summary.activeStudents === 1 ? '' : 's'} with attendance records this term`;
  const overallTopScorer = [...learners]
    .filter((learner) => Number.isFinite(Number(learner.averageScore)) && Number(learner.averageScore) > 0)
    .sort((a, b) => Number(b.averageScore) - Number(a.averageScore) || a.name.localeCompare(b.name))[0] || null;
  const logo = design.showLogo ? loadBrandLogoDataUrl() : null;
  const issuedAt = new Date(snapshot.generatedAt || report.updated_at || Date.now());
  const signatoryActive =
    (!reportPolicy.signatory.activeFrom || issuedAt >= new Date(reportPolicy.signatory.activeFrom)) &&
    (!reportPolicy.signatory.activeUntil || issuedAt <= new Date(reportPolicy.signatory.activeUntil));
  const officialSignature = signatoryActive
    ? loadOfficialSignatureDataUrl(reportPolicy.signatory.signatureAsset)
    : null;
  const isPublished = report.status === 'published';
  const period = `${new Date(report.period_start).toLocaleDateString('en-GB')} - ${new Date(report.period_end).toLocaleDateString('en-GB')}`;
  const curriculumRange = `Term ${report.curriculum_start_term} Week ${report.curriculum_start_week}  to  Term ${report.curriculum_end_term} Week ${report.curriculum_end_week}`;
  const generatedLabel = new Date(snapshot.generatedAt || report.updated_at || Date.now()).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const classRows = snapshot.classPerformance.length
    ? snapshot.classPerformance.map((row) => [
        wrapPdfText(formatClassDisplay(row.className), { fontSize: 8, lineHeight: 1.2 }),
        wrapPdfText(row.teacherName || '-', { fontSize: 7.5, color: MUTED, lineHeight: 1.2 }),
        { text: String(row.students), fontSize: 8, alignment: 'center' },
        { text: fmtPct(row.averageScore), fontSize: 8, alignment: 'right', bold: true },
        { text: fmtPct(row.attendanceRate), fontSize: 8, alignment: 'right' },
        { text: String(row.submissions), fontSize: 8, alignment: 'center' },
      ])
    : [[{ text: 'No class data', colSpan: 6, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}, {}, {}]];

  const staffTeachers = Array.isArray(snapshot.staff?.teachers) ? snapshot.staff.teachers : [];
  const staffRows = staffTeachers.length
    ? staffTeachers.map((row) => [
        wrapPdfText(row.name, { fontSize: 8, bold: true, lineHeight: 1.2 }),
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

  const curriculumRows = snapshot.curriculum.courses.length
    ? snapshot.curriculum.courses.map((row) => [
        wrapPdfText(formatCourseDisplay(row.course), { fontSize: 8, lineHeight: 1.2 }),
        wrapPdfText(formatProgrammeDisplay(row.programme), { fontSize: 7.5, color: MUTED, lineHeight: 1.2 }),
        { text: `${row.completed}/${row.planned}`, fontSize: 8, alignment: 'center' },
        { text: String(row.inProgress), fontSize: 8, alignment: 'center' },
        { text: String(row.skipped), fontSize: 8, alignment: 'center' },
        { text: fmtPct(row.coverage), fontSize: 8, alignment: 'right', bold: true },
      ])
    : [[{ text: 'No curriculum data', colSpan: 6, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}, {}, {}]];

  const programmeRows = programmeCourseRows.length
    ? programmeCourseRows.map((row) => [
        wrapPdfText(formatProgrammeDisplay(row.programme), { fontSize: 8, lineHeight: 1.2 }),
        wrapPdfText(formatCourseDisplay(row.course), { fontSize: 8, lineHeight: 1.2 }),
        { text: String(row.enrolledStudents || row.students), fontSize: 8, alignment: 'center' },
        { text: String(row.submissions), fontSize: 8, alignment: 'center' },
        {
          text: row.submissions > 0 ? fmtPct(row.averageScore) : '—',
          fontSize: 8,
          alignment: 'right',
          bold: true,
        },
      ])
    : [[{ text: 'No programme/course outcomes recorded', colSpan: 5, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}, {}]];

  const { programmeEnrolments: cumulativeProgrammeEnrolments, totalStudents: uniqueLearners } =
    reconcileSchoolReportEnrolments({
      schoolProgrammes: snapshot.schoolProgrammes,
      programmeCoursePerformance: snapshot.programmeCoursePerformance,
      learnerIds: sortedLearners.map((learner) => learner.id),
      activeStudents: snapshot.summary.activeStudents,
    });

  const invoiceRows = snapshot.finance.invoices.length
    ? snapshot.finance.invoices.map((invoice) => [
        { text: invoice.invoiceNumber, fontSize: 8 },
        { text: plainStatus(invoice.status), fontSize: 7.5 },
        { text: formatMoney(invoice.amount, snapshot.finance.currency, reportPolicy.finance.locale), fontSize: 8, alignment: 'right' },
        { text: formatMoney(invoice.paid, snapshot.finance.currency, reportPolicy.finance.locale), fontSize: 8, alignment: 'right' },
        { text: formatMoney(invoice.outstanding, snapshot.finance.currency, reportPolicy.finance.locale), fontSize: 8, alignment: 'right', bold: true },
      ])
    : [[{ text: 'Invoice for this term will be issued separately.', colSpan: 5, color: MUTED, italics: true, fontSize: 8 }, {}, {}, {}, {}]];

  const learnersWithAssignmentEvidence = sortedLearners.filter(
    (row) =>
      row.gradebook?.fromPublishedReport
      || row.gradebook?.classworkScore != null
      || row.gradebook?.assignmentAverage != null
      || row.gradebook?.assessmentScore != null,
  ).length;
  const rosterAssessedCount = sortedLearners.filter((row) => row.gradebook?.examScore != null || row.averageScore != null).length;
  const rosterExcellentCount = sortedLearners.filter((row) => row.status === 'Excellent').length;

  const learnerRows = sortedLearners.length
    ? buildGroupedLearnerTableRows(sortedLearners, 8, (row, labels) => {
        const gradebook = row.gradebook;
        const examScore = gradebook?.examScore ?? row.averageScore;
        return [
          { text: row.name, fontSize: 8, bold: true, color: INK },
          { text: labels.gradeLabel, fontSize: 7.5, bold: true, color: INK },
          { text: cleanDisplayText(labels.classLabel), fontSize: 7, color: MUTED },
          scorePctCell(gradebook?.theoryScore),
          scorePctCell(gradebook?.practicalScore),
          scorePctCell(examScore, true),
          scorePctCell(row.attendanceRate),
          statusBadgeCell(row.status),
        ];
      }, APPENDIX_A_ACCENT)
    : [
        [
          {
            text: 'Learner roster is not included in this report.',
            colSpan: 8,
            color: MUTED,
            italics: true,
            fontSize: 8,
          },
          {}, {}, {}, {}, {}, {}, {},
        ],
      ];

  const appendixCSummaryRows = buildAppendixCSummaryRows(sortedLearners);

  const hasStaffDelivery = Boolean(snapshot.deliveryDeclaration?.selectedTopics?.length);
  const curriculumBands: Band[] = [
    { label: 'Completed', count: snapshot.curriculum.completedWeeks, color: '#059669' },
    { label: 'In progress', count: snapshot.curriculum.inProgressWeeks, color: '#d97706' },
    ...(hasStaffDelivery || snapshot.curriculum.skippedWeeks <= 0
      ? []
      : [{ label: 'Skipped', count: snapshot.curriculum.skippedWeeks, color: '#e11d48' }]),
  ];
  const programmeCoverageMap = new Map<string, { completed: number; planned: number }>();
  for (const row of programmeCourseRows) {
    if (!programmeCoverageMap.has(row.programme)) {
      programmeCoverageMap.set(row.programme, { completed: 0, planned: 0 });
    }
  }
  for (const row of snapshot.curriculum.courses) {
    const current = programmeCoverageMap.get(row.programme) || { completed: 0, planned: 0 };
    current.completed += Number(row.completed || 0);
    current.planned += Number(row.planned || 0);
    programmeCoverageMap.set(row.programme, current);
  }
  const declaredProgrammeCoverage = snapshot.deliveryDeclaration?.programmeCoverage || [];
  const programmeCoverageRows = declaredProgrammeCoverage.length
    ? declaredProgrammeCoverage.map((row) => ({ label: row.programme, value: row.coverage, color: scoreColor(row.coverage) }))
    : [...programmeCoverageMap.entries()].map(([programme, totals]) => ({
        label: programme,
        value: totals.planned > 0 ? Math.round((totals.completed / totals.planned) * 100) : 0,
        color: scoreColor(totals.planned > 0 ? Math.round((totals.completed / totals.planned) * 100) : 0),
      }));

  const financeBands: Band[] = [
    { label: 'Paid', count: Math.max(0, Math.round(snapshot.finance.totalPaid)), color: '#059669' },
    {
      label: 'Outstanding',
      count: Math.max(0, Math.round(snapshot.finance.totalOutstanding)),
      color: '#b42318',
    },
  ].filter((band) => band.count > 0);

  const insights = resolveSchoolReportInsights(snapshot);
  const paymentAccounts = snapshot.finance.paymentAccounts || [];
  const topicsPresentation = buildTopicsPresentation(snapshot);
  const topicsText = topicsCoveredText(narrative, insights, snapshot);
  const sourceDeliveryLedger: DeliveryLedger =
    insights?.deliveryLedger ||
    buildDeliveryLedger(snapshot, {
      nextLines: narrative.nextPeriodFocus?.length
        ? narrative.nextPeriodFocus
        : insights?.deliveryCommitment?.next || insights?.nextModuleFocus || [],
      curriculumRange: curriculumRange,
      programmeNames: Array.from(
        new Set((snapshot.curriculum.courses || []).map((row) => row.programme).filter(Boolean)),
      ),
      evidenceQualityPct: insights?.evidenceQualityPct ?? 0,
    });
  const deliveryLedger: DeliveryLedger = {
    ...sourceDeliveryLedger,
    evidenceLines: sourceDeliveryLedger.evidenceLines.map((line) =>
      line.includes('Term delivery confirmed across') || line.includes('Term delivery pacing depth')
        ? line.replace(/\(\d+% pacing depth\)/, `(${reliableCoverage}% pacing depth)`)
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
  const programmeReflectionByKey = new Map(
    programmeReflections.map((row) => [`${row.programme}::${row.course}`, row]),
  );
  const showWhatWeTaught =
    Boolean(topicsText) ||
    Boolean(topicsPresentation) ||
    Boolean(snapshot.deliveryDeclaration?.selectedTopics?.length);
  const showDelivery =
    showSec('deliverySummary') ||
    Boolean(topicsText) ||
    Boolean(topicsPresentation) ||
    Boolean(snapshot.deliveryDeclaration?.selectedTopics?.length);
  const leadershipNarrativeText = resolveLeadershipNarrativeForDisplay(
    narrative.topicsCovered,
    topicsPresentation,
    { fallbackDraft: buildTopicsCoveredDraft(snapshot) },
  );
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
  const showNextPhaseSection =
    showSec('nextPhase') &&
    (filteredNextPhaseSchool.length > 0 ||
      filteredInvolvement.length > 0 ||
      (insights?.nextPhaseLearners?.length || 0) > 0);
  const learningPhase = schoolReportPhaseLabel(reportPolicy, snapshot.period.academicTermNumber || snapshot.period.curriculumStart.term || 1);
  const programmesInScope = Array.from(
    new Set(
      [
        ...deliveryLedger.topicRows.map((row) => row.programme),
        ...snapshot.programmeCoursePerformance.map((row) => row.programme),
        ...(snapshot.schoolProgrammes || []).map((row) => row.programme),
      ].filter(Boolean),
    ),
  );
  const programmeScopeText = formatProgrammeScopeText(programmesInScope);
  const logoStack = logo
    ? [{ image: logo, width: 40, height: 40, margin: [0, 0, 0, 0] as [number, number, number, number] }]
    : [{ text: '', width: 40 }];

  return {
    pageSize: 'A4',
    pageMargins: [40, 32, 40, 40],
    info: {
      title: report.title,
      author: brandContact.displayName,
      subject: 'School Performance & Curriculum Report',
      creator: brandContact.legalName,
      keywords: 'Rillcod, school performance, STEM education',
    },
    header: (currentPage: number) =>
      currentPage === 1
        ? null
        : {
            margin: [40, 16, 40, 0],
            columns: [
              {
                width: '*',
                stack: [
                  {
                    text: brandContact.legalName,
                    color: BRAND,
                    bold: true,
                    fontSize: 7.5,
                    characterSpacing: 0.6,
                  },
                  {
                    text: 'School Performance & Curriculum Report',
                    color: MUTED,
                    fontSize: 7,
                    margin: [0, 1, 0, 0],
                  },
                ],
              },
              {
                width: '*',
                stack: [
                  { text: snapshot.school.name, color: INK, fontSize: 7.5, alignment: 'right', bold: true },
                  { text: period, color: MUTED, fontSize: 7, alignment: 'right', margin: [0, 1, 0, 0] },
                ],
              },
            ],
          },
    footer: (currentPage: number, pageCount: number) => ({
      margin: [40, 0, 40, 18],
      stack: [
        {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: PAGE_WIDTH_CONTENT, y2: 0, lineWidth: 0.6, lineColor: RULE }],
          margin: [0, 0, 0, 6],
        },
        {
          columns: [
            {
              width: '*',
              text: `${isPublished ? 'Official school report' : 'Draft copy — for review before release'}  |  ${brandContactLine('  |  ')}`,
              color: MUTED,
              fontSize: 6.5,
            },
            {
              width: 70,
              text: `Page ${currentPage} of ${pageCount}`,
              color: MUTED,
              fontSize: 6.5,
              alignment: 'right',
            },
          ],
        },
      ],
    }),
    content: [
      // Letterhead
      {
        table: {
          widths: [58, '*'],
          body: [[
            {
              stack: logoStack,
              border: [false, false, false, false],
              margin: [0, 1, 0, 1],
            },
            {
              columns: [
                {
                  width: '*',
                  stack: [
                    { text: brandContact.legalName, color: BRAND, bold: true, fontSize: 13, characterSpacing: 1 },
                    { text: brandContact.tagline, color: INK, fontSize: 7.5, margin: [0, 2, 0, 3] },
                    { text: brandContact.addressShort, color: MUTED, fontSize: 6.5 },
                  ],
                },
                {
                  width: 210,
                  stack: [
                    { text: brandContactLine('   |   '), color: MUTED, fontSize: 6.5, alignment: 'right' },
                    { text: 'STEM, ROBOTICS & AI EDUCATION PARTNER', color: BRAND, bold: true, fontSize: 6.5, alignment: 'right', margin: [0, 5, 0, 0] },
                  ],
                },
              ],
              border: [false, false, false, false],
              margin: [0, 2, 0, 0],
            },
          ]],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          widths: ['*', 176],
          body: [[
            {
              stack: [
                { text: 'School performance and curriculum report', color: '#ffffff', bold: true, fontSize: 12 },
              ],
              fillColor: HEADER_BG,
              margin: [14, 11, 12, 10],
            },
            {
              stack: [
                { text: 'Partner school', color: '#fecaca', bold: true, fontSize: 6.5, alignment: 'right' },
                { text: formatSchoolDisplayName(snapshot.school.name), color: '#ffffff', bold: true, fontSize: 8.25, alignment: 'right', margin: [0, 3, 0, 0] },
                { text: isPublished ? 'Published revision' : 'Draft preview', color: isPublished ? '#86efac' : '#fca5a5', bold: true, fontSize: 6.25, alignment: 'right', margin: [0, 4, 0, 0] },
              ],
              fillColor: '#111827',
              margin: [10, 9, 12, 9],
            },
          ]],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 0],
      },
      brandAccentRule(),

      // Period & snapshot meta (single panel)
      {
        table: {
          widths: ['*', 172],
          body: [[
            {
              stack: [
                { text: 'ACADEMIC PERIOD', style: 'metaLabel' },
                { text: `${snapshot.period.termLabel}  |  ${snapshot.period.academicYear}`, style: 'metaValue', fontSize: 10, bold: true, color: INK },
                { text: period, color: MUTED, fontSize: 7.5, margin: [0, 3, 0, 0] },
                {
                  columns: [
                    { text: snapshot.curriculum.courses.length > 1 ? 'Course-specific delivery windows' : `Term ${snapshot.period.curriculumStart.term}, Weeks ${snapshot.period.curriculumStart.week}-${snapshot.period.curriculumEnd.week}`, color: MUTED, fontSize: 7, margin: [0, 4, 0, 0] },
                    { text: `${toTitleCase(learningPhase)} phase`, color: BRAND, bold: true, fontSize: 7, alignment: 'right', margin: [0, 4, 0, 0] },
                  ],
                },
              ],
            },
            {
              stack: [
                { text: 'GENERATED', style: 'metaLabel' },
                { text: generatedLabel, style: 'metaValue', fontSize: 9, bold: true },
                { text: isPublished ? 'Published revision on file' : 'Draft — verify before sharing', color: MUTED, fontSize: 7.25, margin: [0, 3, 0, 0] },
                { text: `${snapshot.summary.activeTeachers} teachers  |  ${snapshot.summary.activeStaff} staff`, color: MUTED, fontSize: 7.25, margin: [0, 2, 0, 0] },
              ],
            },
          ]],
        },
        layout: borderedPanelLayout('#f8fafc'),
        margin: [0, 0, 0, 8],
      },
      // Key metrics (one row - no duplicate blocks)
      withMinPresence(
        {
          unbreakable: true,
          columns: [
          compactMetric(
            'Enrolments  |  Students',
            `${cumulativeProgrammeEnrolments || uniqueLearners}  |  ${uniqueLearners}`,
            'Course placements  |  unique learners',
            '#1d4ed8',
          ),
          compactMetric(
            'Avg score',
            fmtPct(snapshot.summary.averageScore),
            `${snapshot.summary.studentsWithScores}/${snapshot.summary.activeStudents} learners assessed`,
            '#059669',
          ),
          compactMetric(
            'Attendance',
            fmtPct(snapshot.summary.attendanceRate),
            attendanceSourceNote,
            '#0f766e',
          ),
          compactMetric(
            'Curriculum coverage',
            fmtPct(snapshot.summary.curriculumCoverage),
            `${snapshot.curriculum.completedWeeks} of ${snapshot.curriculum.plannedWeeks} modules delivered`,
            BRAND,
          ),
          compactMetric(
            'Term invoice',
            snapshot.finance.attached
              ? formatMoney(snapshot.finance.totalOutstanding, snapshot.finance.currency, reportPolicy.finance.locale)
              : 'Not linked',
            snapshot.finance.attached
              ? `${snapshot.finance.invoiceCount} invoice(s) on file`
              : 'Pending invoice',
            snapshot.finance.attached ? '#2563eb' : '#b42318',
          ),
        ],
        columnGap: 8,
        margin: [0, 0, 0, 6],
        },
        PDF_MIN_METRICS,
      ),

      ...(showDelivery
        ? [
            sectionTitle('Curriculum delivery'),
            ...buildCurriculumDeliveryPdfStack({
              ledger: deliveryLedger,
              colors: { ink: INK, brand: BRAND, muted: MUTED, emerald: '#059669' },
              programmeScopeText: programmeScopeText || undefined,
              showWhatWeTaught,
              whatWeTaughtBody: showWhatWeTaught
                ? topicsCoveredPdfBody(narrative, snapshot, { ink: INK, brand: BRAND, muted: MUTED })
                : [],
              reflectionByKey: programmeReflectionByKey,
              phaseLabelFor: (programme) =>
                `${schoolReportPhaseLabel(
                  reportPolicy,
                  snapshot.period.academicTermNumber || snapshot.period.curriculumStart.term || 1,
                  programme,
                )} phase`,
            }),
            ...(insights?.programmeSpotlights?.length && !deliveryLedger.topicRows.length
              ? [
                  borderedSegment(
                    'Programmes & courses this term',
                    buildProgrammeSpotlightPdfStack(insights.programmeSpotlights, {
                      ink: INK,
                      brand: BRAND,
                      muted: MUTED,
                    }),
                    BRAND,
                  ),
                ]
              : []),
          ]
        : []),

      ...(showSec('moduleCoverage') && !deliveryLedger.topicRows.length && insights?.moduleCoverage?.length
        ? [
            sectionTitle('Topics & module coverage'),
            flowingDataTable(
              ['Programme', 'Course', 'Done', 'Plan', 'Cover %', 'Status'],
              insights.moduleCoverage.map((row) => [
                wrapPdfText(row.programme, { fontSize: 7.5, lineHeight: 1.2 }),
                wrapPdfText(row.course, { fontSize: 7.5, lineHeight: 1.2 }),
                { text: String(row.completed), fontSize: 8, alignment: 'center' },
                { text: String(row.planned), fontSize: 8, alignment: 'center' },
                { text: fmtPct(row.coverage), fontSize: 8, alignment: 'right' },
                wrapPdfText(row.status, { fontSize: 7.5, color: row.status === 'Complete' ? '#067647' : MUTED, lineHeight: 1.15 }),
              ]),
              ['*', '*', 42, 42, 42, 58],
            ),
          ]
        : []),
      ...(!programmeReflections.length && insights?.programmeSpotlights?.length && !showSec('moduleCoverage') && !showDelivery
          ? [
              borderedSegment(
                'Curriculum delivery',
                buildProgrammeSpotlightPdfStack(insights.programmeSpotlights, {
                  ink: INK,
                  brand: BRAND,
                  muted: MUTED,
                }),
                BRAND,
              ),
            ]
          : []),
      ...(!programmeReflections.length && !insights?.programmeSpotlights?.length && insights?.programmeSpotlight && !showSec('moduleCoverage')
          ? [
              {
                stack: [
                  { text: 'Curriculum delivery', style: 'subsection', color: BRAND },
                  {
                    text: `${insights.programmeSpotlight.programme}  |  ${insights.programmeSpotlight.course}`,
                    bold: true,
                    fontSize: 9,
                    color: INK,
                    margin: [0, 0, 0, 2],
                  },
                  { text: insights.programmeSpotlight.summary, fontSize: 8, color: MUTED, margin: [0, 0, 0, 2] },
                  { text: insights.programmeSpotlight.nextIntro, fontSize: 8, color: INK },
                ],
                margin: [0, 0, 0, 8] as [number, number, number, number],
              },
            ]
          : []),
      ...(showSec('learnerHighlights') &&
      (insights?.learnerHighlights?.length || insights?.celebrationWall?.length)
        ? [
            {
              ...pairedSegmentColumns(
                borderedSegment(
                  'Learner highlights',
                  [textList((insights?.learnerHighlights || []).slice(0, 3).map(briefLearnerLine), '#067647')],
                  '#067647',
                  '#f0fdf4',
                ),
                borderedSegment(
                  'Celebration wall',
                  insights?.celebrationWall?.length
                    ? buildCelebrationWallPdfStack(
                        insights.celebrationWall.map((row) => ({
                          name: row.name,
                          classLabel: formatClassDisplay(row.className),
                          highlight: briefLearnerLine(`Result: ${String(row.highlight)}`).replace(/^Result:\s*/, ''),
                        })),
                        { ink: INK, brand: BRAND, muted: MUTED },
                      )
                    : [{ text: 'No Excellent band learners this term.', color: MUTED, italics: true, fontSize: 8 }],
                  BRAND,
                  '#fff7f7',
                ),
              ),
            },
          ]
        : []),
      ...(showSec('communityMessage')
        ? (() => {
            const communityText = resolveCommunityMessageForReport(
              insights?.communityMessage,
              narrative.executiveSummary,
            );
            return communityText
              ? [
                  borderedSegment(
                    'Message for your school community',
                    [
                      {
                        text: communityText,
                        fontSize: 8.5,
                        lineHeight: 1.35,
                        color: INK,
                        margin: [0, 0, 0, 4],
                      },
                      ...(design.reviewDateNote || insights?.suggestedPartnershipReview
                        ? [{
                            text: design.reviewDateNote || insights?.suggestedPartnershipReview || '',
                            fontSize: 7.5,
                            color: MUTED,
                            italics: true,
                          }]
                        : []),
                    ],
                    BRAND,
                  ),
                ]
              : [];
          })()
        : []),

      borderedSegment(
        'Recommendations for students',
        [numberedRecommendationCards(buildStudentRecommendations(snapshot, reportPolicy.display.maxRecommendations), reportPolicy.display.maxRecommendations)],
        BRAND,
      ),

      ...(showSec('boardBriefing')
        ? [
            sectionTitle('Partnership briefing'),
      {
        ...pairedSegmentColumns(
          borderedSegment(
            'Strengths & excellence',
            [
              ...(overallTopScorer
                ? [{
                    table: {
                      widths: [58, '*'],
                      body: [[
                        {
                          stack: [
                            { text: fmtPct(overallTopScorer.averageScore), color: '#ffffff', bold: true, fontSize: 13, alignment: 'center' },
                            { text: 'Top score', color: '#d1fae5', bold: true, fontSize: 6, alignment: 'center', margin: [0, 2, 0, 0] },
                          ],
                          fillColor: '#067647',
                          margin: [4, 8, 4, 8],
                        },
                        {
                          stack: [
                            { text: 'Overall top scorer', color: '#067647', bold: true, fontSize: 6.5 },
                            { text: overallTopScorer.name, color: INK, bold: true, fontSize: 9, margin: [0, 2, 0, 1] },
                            { text: formatClassDisplay(overallTopScorer.className), color: MUTED, fontSize: 7 },
                          ],
                          fillColor: '#ecfdf3',
                          margin: [8, 6, 7, 6],
                        },
                      ]],
                    },
                    layout: 'noBorders',
                    margin: [0, 0, 0, 7],
                  }]
                : []),
              textList(pdfStrengthItems, '#067647'),
            ],
            '#067647',
            '#f0fdf4',
          ),
          borderedSegment(
            'Partnership focus',
            [textList(pdfFocusItems, BRAND)],
            BRAND,
            '#fff7f7',
          ),
        ),
        margin: [0, 0, 0, 6],
      },
      ...(insights?.risks?.length
        ? [
            {
              stack: [
                { text: 'Cases needing immediate joint care', style: 'subsection', color: '#b42318' },
                textList(insights.risks, '#b42318'),
              ],
              margin: [0, 0, 0, 6] as [number, number, number, number],
            },
          ]
        : []),
          ]
        : []),
      ...(showNextPhaseSection
        ? [
            sectionTitle('Progressive next phase'),
      ...(filteredNextPhaseSchool.map((phase) => ({
        stack: [
          { text: phase.phase, bold: true, fontSize: 9, color: INK, margin: [0, 0, 0, 1] },
          { text: phase.horizon, color: MUTED, fontSize: 7.5, margin: [0, 0, 0, 2] },
          textList(phase.actions),
        ],
        margin: [0, 0, 0, 4],
      })) as any[]),
      ...(filteredInvolvement.length
        ? [{
        stack: [
          { text: 'How everyone stays involved', style: 'subsection' },
          textList(filteredInvolvement),
        ],
        margin: [0, 2, 0, 8],
      }]
        : []),
      ...(insights?.nextPhaseLearners?.length
        ? [
            flowingDataTable(
              ['Learner band', 'Count', 'Next phase for this band'],
              insights.nextPhaseLearners.map((row) => [
                wrapPdfText(row.band, { fontSize: 8, bold: true, lineHeight: 1.2 }),
                { text: String(row.count), fontSize: 8, alignment: 'center' },
                wrapPdfText(row.nextStep, { fontSize: 7.5, color: MUTED, lineHeight: 1.25 }),
              ]),
              [90, 36, '*'],
            ),
          ]
        : []),
          ]
        : []),

      ...(showSec('charts')
        ? [
            { text: 'Score and attendance distribution', style: 'subsection', color: BRAND },
      {
        columns: [
          {
            width: '*',
            ...pieChartBlock('Score bands', snapshot.scoreBands, { size: 92 }),
          },
          {
            width: '*',
            ...pieChartBlock('Attendance bands', snapshot.attendanceBands, { size: 92 }),
          },
        ],
        columnGap: 10,
        margin: [0, 0, 0, 4],
      },
      ...(programmeCoverageRows.length && !deliveryLedger.topicRows.length
        ? [
            barChartBlock('Curriculum coverage by programme', programmeCoverageRows, {
              maxBars: 8,
            }),
          ]
        : []),
      {
        text: 'Class comparison',
        style: 'subsection',
        color: BRAND,
        margin: [0, 4, 0, 2],
      },
      barChartBlock(
        REPORT_METRIC_LABELS.classMeanScores,
        snapshot.classPerformance.map((row) => ({
          label: formatClassDisplay(row.className),
          value: row.averageScore,
          color: scoreColor(row.averageScore),
        })),
        { maxBars: 10 },
      ),
      flowingDataTable(['Class', 'Teacher', 'Learners', 'Mean %', 'Attend %', 'Subs'], classRows, ['*', 70, 42, 48, 52, 42], { margin: [0, 4, 0, 6] }),
      ...(programmeCourseRows.length
        ? [
            {
              text: REPORT_METRIC_LABELS.programmeCourseOutcomes,
              style: 'subsection',
              color: BRAND,
              margin: [0, 4, 0, 2],
            },
            barChartBlock(
              REPORT_METRIC_LABELS.meanByProgrammeCourse,
              programmeCourseRows.map((row) => ({
                label: formatProgrammeCourseDisplay(row.programme, row.course),
                value: row.submissions > 0 ? row.averageScore : 0,
                color: row.submissions > 0 ? scoreColor(row.averageScore) : '#94a3b8',
              })),
              { maxBars: 12 },
            ),
            flowingDataTable(
              ['Programme', 'Course', REPORT_METRIC_LABELS.enrolledLearners, REPORT_METRIC_LABELS.assessedLearners, REPORT_METRIC_LABELS.meanPercent],
              programmeRows,
              [88, '*', 42, 48, 42],
              { margin: [0, 6, 0, 8] },
            ),
          ]
        : []),
          ]
        : []),
      ...(!showSec('charts') && programmeCourseRows.length
        ? [
            sectionTitle(REPORT_METRIC_LABELS.programmeCourseOutcomes),
            flowingDataTable(
              ['Programme', 'Course', REPORT_METRIC_LABELS.enrolledLearners, REPORT_METRIC_LABELS.assessedLearners, REPORT_METRIC_LABELS.meanPercent],
              programmeRows,
              [88, '*', 42, 48, 42],
            ),
          ]
        : []),
      ...(showSec('teacherRoster')
        ? [
            sectionTitle('Assigned teachers'),
            flowingDataTable(['Teacher', 'How assigned', 'Classes', 'Class list'], staffRows, ['*', 100, 42, '*']),
          ]
        : []),

      ...(!showSec('moduleCoverage') && !deliveryLedger.topicRows.length && !showDelivery
        ? [
            sectionTitle('Programme delivery summary'),
      {
        text: hasStaffDelivery
          ? `${snapshot.deliveryDeclaration?.selectedTopics.length || 0} module topic(s) confirmed for this reporting period  |  ${snapshot.curriculum.completedWeeks} module unit(s) delivered  |  ${snapshot.curriculum.plannedWeeks}-unit reporting window`
          : `${snapshot.curriculum.completedWeeks} completed  |  ${snapshot.curriculum.inProgressWeeks} in progress  |  ${snapshot.curriculum.plannedWeeks} planned`,
        color: MUTED,
        fontSize: 8,
        margin: [0, 0, 0, 6],
      },
      flowingDataTable(
        ['Course', 'Programme', 'Delivered', 'Active', 'Deferred', 'Coverage'],
        curriculumRows,
        ['*', 72, 40, 40, 40, 42],
      ),
          ]
        : []),

      ...(snapshot.previousTerm
        ? [
            sectionTitle('Previous-term comparison'),
            withMinPresence(
              {
                unbreakable: true,
                stack: [
                  {
                    text: `Compared with ${snapshot.previousTerm.termLabel}, ${snapshot.previousTerm.academicYear}. Figures show the published report for each period.`,
                    color: MUTED,
                    fontSize: 8,
                    margin: [0, 0, 0, 5],
                  },
                  {
                    table: {
                      widths: ['*', 75, 75, 75],
                      body: [
                        headerCells(['Period', REPORT_METRIC_LABELS.meanScore, 'Attendance', 'Curriculum']),
                        [
                          { text: `${snapshot.previousTerm.termLabel}, ${snapshot.previousTerm.academicYear}`, fontSize: 8 },
                          { text: fmtPct(snapshot.previousTerm.averageScore), alignment: 'right', fontSize: 8 },
                          { text: fmtPct(snapshot.previousTerm.attendanceRate), alignment: 'right', fontSize: 8 },
                          { text: fmtPct(snapshot.previousTerm.curriculumCoverage), alignment: 'right', fontSize: 8 },
                        ],
                        [
                          { text: `${snapshot.period.termLabel}, ${snapshot.period.academicYear}`, bold: true, fontSize: 8 },
                          { text: fmtPct(snapshot.summary.averageScore), alignment: 'right', bold: true, fontSize: 8 },
                          { text: fmtPct(snapshot.summary.attendanceRate), alignment: 'right', bold: true, fontSize: 8 },
                          { text: fmtPct(snapshot.summary.curriculumCoverage), alignment: 'right', bold: true, fontSize: 8 },
                        ],
                      ],
                    },
                    layout: tableLayout(),
                  },
                ],
              },
              PDF_MIN_TABLE,
            ),
          ]
        : []),

      sectionTitle('Closing remark'),
      {
        text: buildOfficialClosingRemark(snapshot, narrative),
        fontSize: 9,
        lineHeight: 1.4,
        color: INK,
        italics: true,
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          widths: [190, '*'],
          body: [[
            {
              stack: [
                { text: 'AUTHORISED SIGNATORY', style: 'metaLabel', color: BRAND },
                ...(officialSignature
                  ? [{ image: officialSignature, width: 118, height: 44, margin: [0, 5, 0, 1] as [number, number, number, number] }]
                  : [{ text: '', margin: [0, 36, 0, 0] as [number, number, number, number] }]),
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 150, y2: 0, lineWidth: 0.8, lineColor: INK }] },
                { text: reportPolicy.signatory.name, bold: true, fontSize: 9, margin: [0, 3, 0, 0] },
                { text: reportPolicy.signatory.title, color: MUTED, fontSize: 7.5 },
              ],
            },
            {
              stack: [
                { text: isPublished ? 'OFFICIALLY ISSUED' : 'DRAFT PREVIEW', style: 'metaLabel', color: isPublished ? '#067647' : BRAND, alignment: 'right' },
                { text: `${snapshot.period.termLabel}  |  ${snapshot.period.academicYear}`, bold: true, fontSize: 9, alignment: 'right', margin: [0, 8, 0, 2] },
                { text: `Generated ${generatedLabel}`, color: MUTED, fontSize: 7.5, alignment: 'right' },
                ...(isPublished
                  ? [{ text: 'This signature authenticates the published report.', color: MUTED, fontSize: 7, alignment: 'right', margin: [0, 8, 0, 0] as [number, number, number, number] }]
                  : []),
              ],
            },
          ]],
        },
        layout: borderedPanelLayout('#f9fafb'),
        margin: [0, 8, 0, 8],
      },
      {
        table: {
          widths: [58, '*'],
          body: [[
            opts?.verificationQrDataUrl
              ? { image: opts.verificationQrDataUrl, width: 48, height: 48, margin: [3, 3, 3, 3] }
              : { text: 'VERIFY', bold: true, alignment: 'center', margin: [3, 18, 3, 3] },
            {
              stack: [
                { text: 'REPORT VERIFICATION', style: 'metaLabel', color: BRAND },
                { text: verificationCode, bold: true, fontSize: 8.5, margin: [0, 3, 0, 2] },
                { text: verificationUrl, color: MUTED, fontSize: 6.5 },
                { text: `Revision ${report.published_revision_number || 1} | Scan or enter the code to confirm this report.`, color: MUTED, fontSize: 7, margin: [0, 3, 0, 0] },
              ],
              margin: [6, 6, 6, 6],
            },
          ]],
        },
        layout: borderedPanelLayout('#ffffff'),
        margin: [0, 0, 0, 7],
      },
      ...(report.acknowledged_at
        ? [{
            text: `Acknowledged by ${report.acknowledgement_name || 'school leadership'} on ${new Date(report.acknowledged_at).toLocaleDateString('en-GB')}${report.acknowledgement_note ? `. ${report.acknowledgement_note}` : '.'}`,
            color: '#067647',
            bold: true,
            fontSize: 7,
            margin: [0, 0, 0, 5] as [number, number, number, number],
          }]
        : []),
      {
        text: `Prepared by ${brandContact.displayName}  |  ${brandContact.web}. Official school performance report for ${snapshot.period.termLabel}, ${snapshot.period.academicYear}.`,
        color: MUTED,
        fontSize: 7,
        margin: [0, 2, 0, 0],
      },

      ...(showSec('learnerRoster')
        ? [
            appendixSectionStack(
              appendixHero({
                letter: 'A',
                title: 'Learner roster',
                subtitle: `${snapshot.period.termLabel}, ${snapshot.period.academicYear} — printable roster with exam scores, attendance, and status. Detach and archive for school records.`,
                accent: APPENDIX_A_ACCENT,
                chips: [
                  { label: 'Active learners', value: String(sortedLearners.length) },
                  { label: 'Assessed', value: String(rosterAssessedCount) },
                  { label: 'Excellent', value: String(rosterExcellentCount) },
                ],
              }),
              printableAppendixTable(
                [
                  appendixHeaderCells(['Learner', 'Grade', 'Class', 'Theory', 'Practical', 'Exam', 'Attend', 'Status']),
                  ...learnerRows,
                ],
                ['*', 34, 64, 30, 30, 30, 34, 54],
                APPENDIX_ROSTER_TINT,
              ),
            ),
          ]
        : []),

      ...(showSec('finance')
        ? [
            {
              stack: [
                appendixSectionStack(
                  appendixHero({
                    letter: 'B',
                    title: 'School invoice',
                    subtitle: snapshot.finance.attached
                      ? `${snapshot.period.termLabel}, ${snapshot.period.academicYear} — term invoice summary.`
                      : `${snapshot.period.termLabel}, ${snapshot.period.academicYear} — invoice details to follow.`,
                    accent: APPENDIX_B_ACCENT,
                    chips: [
                      { label: 'Invoiced', value: formatMoney(snapshot.finance.totalInvoiced, snapshot.finance.currency, reportPolicy.finance.locale) },
                      { label: 'Paid', value: formatMoney(snapshot.finance.totalPaid, snapshot.finance.currency, reportPolicy.finance.locale) },
                      { label: 'Outstanding', value: formatMoney(snapshot.finance.totalOutstanding, snapshot.finance.currency, reportPolicy.finance.locale) },
                    ],
                  }),
                  printableAppendixTable(
                    [appendixHeaderCells(['Invoice', 'Status', 'Amount', 'Paid', 'Balance']), ...invoiceRows],
                    ['*', 70, 70, 66, 66],
                    APPENDIX_ROSTER_TINT,
                  ),
                ),
            ...(snapshot.finance.attached
              ? []
              : [{
                  text: 'Term invoice is not included in this edition.',
                  color: MUTED,
                  fontSize: 7,
                  margin: [0, 0, 0, 4] as [number, number, number, number],
                }]),
            paymentAccountsBlock(paymentAccounts, reportPolicy),
              ],
              margin: [0, 0, 0, 4],
            },
          ]
        : []),

      ...(showSec('appendixGradebook')
        ? [appendixSectionStack(
          appendixHero({
            letter: 'C',
            title: 'Classwork, assignments and assessment',
            subtitle: `${formatTermPeriod(snapshot)}. One row per learner with published progress report component scores. Theory, practical and exam results are in Appendix A.`,
            accent: APPENDIX_C_ACCENT,
            chips: [
              { label: 'With evidence', value: `${learnersWithAssignmentEvidence}/${sortedLearners.length}` },
              { label: 'Learners', value: String(sortedLearners.length) },
            ],
          }),
          printableAppendixTable(
            [
              appendixHeaderCells(['Learner', 'Classwork', 'Assignments', 'Assessment']),
              ...appendixCSummaryRows,
            ],
            ['*', 52, 52, 52],
            APPENDIX_GRADEBOOK_TINT,
          ),
        )]
        : []),

      ...(showSec('appendixPayment') && snapshot.finance.totalPaid > 0 ? [appendixSectionStack(
          appendixHero({
            letter: 'D',
            title: 'Payment confirmation',
            subtitle: `${snapshot.period.termLabel}, ${snapshot.period.academicYear} — printable payment schedule for reconciliation. Keep with your bank receipt.`,
            accent: APPENDIX_D_ACCENT,
            chips: [
              { label: 'Paid', value: formatMoney(snapshot.finance.totalPaid, snapshot.finance.currency, reportPolicy.finance.locale) },
              { label: 'Invoices', value: String(snapshot.finance.invoices.filter((row) => row.paid > 0).length) },
              { label: 'Outstanding', value: formatMoney(snapshot.finance.totalOutstanding, snapshot.finance.currency, reportPolicy.finance.locale) },
            ],
          }),
          printableAppendixTable(
            [
              appendixHeaderCells(['Invoice', 'Payment recorded', 'Balance', 'Status']),
              ...snapshot.finance.invoices.filter((row) => row.paid > 0).map((row) => [
                { text: row.invoiceNumber, bold: true, fontSize: 7, color: INK },
                { text: formatMoney(row.paid, snapshot.finance.currency, reportPolicy.finance.locale), fontSize: 7, color: INK, alignment: 'right' as const },
                { text: formatMoney(row.outstanding, snapshot.finance.currency, reportPolicy.finance.locale), fontSize: 7, color: INK, alignment: 'right' as const },
                { text: row.status || (row.outstanding > 0 ? 'Part paid' : 'Paid'), fontSize: 7, color: INK },
              ]),
            ],
            ['*', 82, 82, 70],
            APPENDIX_ROSTER_TINT,
          ),
        )] : []),

    ],
    styles: {
      section: {
        fontSize: 11,
        bold: true,
        color: INK,
        margin: [0, 5, 0, 0],
      },
      subsection: {
        fontSize: 9,
        bold: true,
        color: INK,
        margin: [0, 2, 0, 2],
      },
      metaLabel: {
        fontSize: 6.5,
        bold: true,
        color: MUTED,
        characterSpacing: 0.7,
        margin: [0, 0, 0, 2],
      },
      metaValue: {
        fontSize: 9,
        bold: true,
        color: INK,
      },
      tableHeader: { color: '#ffffff', bold: true, fontSize: 7 },
    },
    defaultStyle: { font: 'Roboto', fontSize: 8.5, color: INK },
  };
}

export async function renderSchoolReportPdf(
  report: SchoolPerformanceReportRow,
  opts?: { narrative?: SchoolPerformanceReportRow['narrative'] },
): Promise<Buffer> {
  let enriched = report;
  if (!report.snapshot?.finance?.paymentAccounts?.length) {
    try {
      const admin = createAdminClient() as any;
      const paymentAccounts = await loadSchoolReportPaymentAccounts(admin);
      if (paymentAccounts.length) {
        enriched = {
          ...report,
          snapshot: {
            ...report.snapshot,
            finance: {
              ...report.snapshot.finance,
              paymentAccounts,
            },
          },
        };
      }
    } catch (error) {
      console.warn('[school-report] Could not load payment accounts for PDF:', error);
    }
  }
  const verificationQrDataUrl = await qrDataUrl(schoolReportVerificationUrl(report.id), HD_QR_PRINT_PX);
  return renderPdfToBuffer(buildSchoolReportPdfDefinition(enriched, { ...opts, verificationQrDataUrl }));
}
