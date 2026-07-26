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
import { sectionTitle } from './pdf/layout';
import { buildSchoolReportPdfContext } from './pdf/context';
import { buildReportSections } from './pdf/sections/registry';
import { generateSectionLeads, type SectionLeads } from './pdf/section-leads';
import {
  buildTopicsPresentation,
  reportTermLabel,
  topicsCoveredPdfBody,
  topicsCoveredText,
} from './pdf/topics';
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
import { countNoun } from './wording';


/** Open metric cell - no filled cards; keeps the page calm and official. */

/** Compact pie + legend in one column. */
export function buildSchoolReportPdfDefinition(
  report: SchoolPerformanceReportRow,
  opts?: { narrative?: SchoolPerformanceReportRow['narrative']; verificationQrDataUrl?: string; sectionLeads?: SectionLeads },
) {
  // All shared state is derived once, up front, as an explicit typed value.
  // Sections can then be peeled out of this function one at a time as plain
  // functions of the context, rather than closures over ambient locals.
  const ctx = buildSchoolReportPdfContext(report, opts);
  const {
    snapshot,
    narrative,
    programmeCourseRows,
    reportPolicy,
    verificationCode,
    verificationUrl,
    design,
    showSec,
    learners,
    sortedLearners,
    attendanceSourceNote,
    overallTopScorer,
    logo,
    officialSignature,
    isPublished,
    period,
    curriculumRange,
    generatedLabel,
    insights,
    hasStaffDelivery,
    topicsPresentation,
    topicsText,
    deliveryLedger,
    showDelivery,
    programmeReflections,
    programmeReflectionByKey,
    showWhatWeTaught,
    programmeScopeText,
    pdfStrengthItems,
    pdfFocusItems,
    filteredNextPhaseSchool,
    filteredInvolvement,
    showNextPhaseSection,
    learningPhase,
  } = ctx;
  // Intentionally shadows the default BRAND token with the school's accent —
  // see the note in pdf/tokens.ts.
  const BRAND = ctx.brand;




  const { programmeEnrolments: cumulativeProgrammeEnrolments, totalStudents: uniqueLearners } =
    reconcileSchoolReportEnrolments({
      schoolProgrammes: snapshot.schoolProgrammes,
      programmeCoursePerformance: snapshot.programmeCoursePerformance,
      learnerIds: sortedLearners.map((learner) => learner.id),
      activeStudents: snapshot.summary.activeStudents,
    });





  const curriculumBands: Band[] = [
    { label: 'Completed', count: snapshot.curriculum.completedWeeks, color: '#059669' },
    { label: 'In progress', count: snapshot.curriculum.inProgressWeeks, color: '#d97706' },
    ...(hasStaffDelivery || snapshot.curriculum.skippedWeeks <= 0
      ? []
      : [{ label: 'Skipped', count: snapshot.curriculum.skippedWeeks, color: '#e11d48' }]),
  ];

  const financeBands: Band[] = [
    { label: 'Paid', count: Math.max(0, Math.round(snapshot.finance.totalPaid)), color: '#059669' },
    {
      label: 'Outstanding',
      count: Math.max(0, Math.round(snapshot.finance.totalOutstanding)),
      color: '#b42318',
    },
  ].filter((band) => band.count > 0);

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
          // Labelled "Outstanding", not "Term invoice": the value is
          // totalOutstanding, so a fully-paid school with one N100,000 invoice
          // used to read "Term invoice: N0 - 1 invoice(s) on file" and could
          // reasonably conclude they had been billed nothing. The invoiced total
          // now rides along in the note so both figures are present and named.
          compactMetric(
            'Outstanding balance',
            snapshot.finance.attached
              ? formatMoney(snapshot.finance.totalOutstanding, snapshot.finance.currency, reportPolicy.finance.locale)
              : 'Not linked',
            snapshot.finance.attached
              ? `${countNoun(snapshot.finance.invoiceCount, 'invoice')} · ${formatMoney(snapshot.finance.totalInvoiced, snapshot.finance.currency, reportPolicy.finance.locale)} invoiced`
              : 'Pending invoice',
            snapshot.finance.attached ? '#2563eb' : '#b42318',
          ),
        ],
        columnGap: 8,
        margin: [0, 0, 0, 6],
        },
        PDF_MIN_METRICS,
      ),

      // Section order and inclusion live in the registry, not here.
      ...buildReportSections(ctx),

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
  // Leads are resolved here, before the synchronous build. Failures return {}
  // so the book renders unchanged rather than waiting on a sentence.
  const [verificationQrDataUrl, sectionLeads] = await Promise.all([
    qrDataUrl(schoolReportVerificationUrl(report.id), HD_QR_PRINT_PX),
    generateSectionLeads(enriched),
  ]);
  return renderPdfToBuffer(buildSchoolReportPdfDefinition(enriched, { ...opts, verificationQrDataUrl, sectionLeads }));
}
