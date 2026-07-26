import { resolveCommunityMessageForReport } from '../../report-content-dedup';
import { buildStudentRecommendations } from '../../student-recommendations';
import { borderedSegment, numberedRecommendationCards } from '../layout';
import { INK, MUTED } from '../tokens';
import type { SchoolReportPdfContext } from '../context';

/**
 * Message for the school community.
 *
 * Falls back to the executive summary when no dedicated message exists, and
 * renders nothing at all if that resolves empty — an empty bordered panel reads
 * as a mistake. The review-date note rides inside the same panel because it is
 * addressed to the same audience.
 */
export function buildCommunityMessageSection(ctx: SchoolReportPdfContext): object[] {
  const { showSec, insights, narrative, design, brand } = ctx;
  if (!showSec('communityMessage')) return [];

  const communityText = resolveCommunityMessageForReport(
    insights?.communityMessage,
    narrative.executiveSummary,
  );
  if (!communityText) return [];

  const reviewNote = design.reviewDateNote || insights?.suggestedPartnershipReview || '';

  return [
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
        ...(reviewNote
          ? [{ text: reviewNote, fontSize: 7.5, color: MUTED, italics: true }]
          : []),
      ],
      brand,
    ),
  ];
}

/**
 * Recommendations for students — always present.
 *
 * Unlike most sections this has no toggle: a report that tells a school how
 * their learners performed without saying what to do next is incomplete. The
 * card component supplies its own empty-state copy.
 */
export function buildStudentRecommendationsSection(ctx: SchoolReportPdfContext): object[] {
  const { snapshot, reportPolicy, brand } = ctx;
  const max = reportPolicy.display.maxRecommendations;

  return [
    borderedSegment(
      'Recommendations for students',
      [numberedRecommendationCards(buildStudentRecommendations(snapshot, max), max)],
      brand,
    ),
  ];
}
