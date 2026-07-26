import type { SchoolReportPdfContext } from '../context';
import { buildAppendixFinanceSection } from './appendix-finance';
import { buildAppendixGradebookSection } from './appendix-gradebook';
import { buildAppendixLearnerRosterSection } from './appendix-learner-roster';
import { buildAppendixPaymentSection } from './appendix-payment';
import { buildChartsSection } from './charts';
import { buildClosingRemarkSection } from './closing-remark';
import { buildCommunityMessageSection, buildStudentRecommendationsSection } from './community-message';
import { buildCurriculumDeliverySection } from './curriculum-delivery';
import { buildLearnerHighlightsSection } from './learner-highlights';
import { buildNextPhaseSection } from './next-phase';
import { buildPartnershipBriefingSection } from './partnership-briefing';
import { buildPreviousTermComparisonSection } from './previous-term-comparison';
import { buildProgrammeDeliverySummarySection } from './programme-delivery-summary';
import { buildTeacherRosterSection } from './teacher-roster';

/**
 * The report book, as data.
 *
 * Section order used to be the physical order of fifteen spread expressions in
 * one array literal, so reordering or inserting a section meant editing the
 * document builder. It is now a list: `order` decides position, and each entry
 * points at a self-contained builder.
 *
 * Orders are spaced by 10 so a section can be slotted between two existing ones
 * without renumbering the rest.
 *
 * Appearance is NOT decided here. Every builder returns [] when it has nothing
 * to show, which keeps the "should I appear?" rule next to the content it
 * governs — several of those rules are subtle (a payment schedule with no
 * payments reads as a demand; a briefing item already stated elsewhere is
 * dropped) and would be lost if flattened into a boolean on this table.
 *
 * The letterhead is deliberately absent: it is a fixed prelude with no toggle
 * and no meaningful position, not a section.
 */
export type ReportSectionDefinition = {
  /** Stable identifier — used for ordering, diagnostics and future overrides. */
  key: string;
  order: number;
  build: (ctx: SchoolReportPdfContext) => object[];
};

export const REPORT_SECTIONS: ReportSectionDefinition[] = [
  { key: 'curriculumDelivery', order: 10, build: buildCurriculumDeliverySection },
  { key: 'learnerHighlights', order: 20, build: buildLearnerHighlightsSection },
  { key: 'communityMessage', order: 30, build: buildCommunityMessageSection },
  { key: 'studentRecommendations', order: 40, build: buildStudentRecommendationsSection },
  { key: 'partnershipBriefing', order: 50, build: buildPartnershipBriefingSection },
  { key: 'nextPhase', order: 60, build: buildNextPhaseSection },
  { key: 'charts', order: 70, build: buildChartsSection },
  { key: 'teacherRoster', order: 80, build: buildTeacherRosterSection },
  { key: 'programmeDeliverySummary', order: 90, build: buildProgrammeDeliverySummarySection },
  { key: 'previousTermComparison', order: 100, build: buildPreviousTermComparisonSection },
  { key: 'closingRemark', order: 110, build: buildClosingRemarkSection },
  // Appendices last: each starts a new page and is detached for filing.
  { key: 'appendixLearnerRoster', order: 200, build: buildAppendixLearnerRosterSection },
  { key: 'appendixFinance', order: 210, build: buildAppendixFinanceSection },
  { key: 'appendixGradebook', order: 220, build: buildAppendixGradebookSection },
  { key: 'appendixPayment', order: 230, build: buildAppendixPaymentSection },
];

/** Ordered section list. Sorted on a copy so the exported table is never mutated. */
export function orderedReportSections(): ReportSectionDefinition[] {
  return [...REPORT_SECTIONS].sort((a, b) => a.order - b.order);
}

/** Build every section body in order. */
export function buildReportSections(ctx: SchoolReportPdfContext): object[] {
  return orderedReportSections().flatMap((section) => section.build(ctx));
}
