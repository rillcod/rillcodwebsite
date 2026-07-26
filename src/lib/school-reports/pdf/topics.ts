import { buildReportTopicsPresentation, buildTopicsCoveredDraft } from '../delivered-topics';
import { formatCourseDisplay, formatProgrammeDisplay } from '../display-labels';
import type { resolveSchoolReportInsights } from '../insights';
import {
  buildTopicsCoveredPdfBodyForReport,
  resolveLeadershipNarrativeForDisplay,
} from '../topics-covered-presentation';
import type { SchoolPerformanceReportRow } from '../types';

/**
 * "What we taught" resolution for the PDF.
 *
 * The wording has several possible sources and a definite order of preference:
 * a leadership narrative that was actually authored beats a generated
 * presentation, which beats an insight seed, which beats a raw draft. Keeping
 * that ladder in one place stops the PDF and the on-screen preview from
 * disagreeing about which version of the story a school is shown.
 */

export function buildTopicsPresentation(
  snapshot: SchoolPerformanceReportRow['snapshot'],
): ReturnType<typeof buildReportTopicsPresentation> {
  return buildReportTopicsPresentation(snapshot);
}

export function reportTermLabel(snapshot: SchoolPerformanceReportRow['snapshot']): string {
  return snapshot.period?.termLabel || 'this term';
}

export function topicsCoveredText(
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

export function topicsCoveredPdfBody(
  narrative: SchoolPerformanceReportRow['narrative'],
  snapshot: SchoolPerformanceReportRow['snapshot'],
  colors: { ink: string; brand: string; muted: string },
  nextLines?: string[],
): object[] {
  const presentation = buildTopicsPresentation(snapshot);
  // Only programmes with learners actually enrolled are named, so the section
  // never advertises a course the school did not run.
  const enrolledCourseLabels = (snapshot.schoolProgrammes || [])
    .filter((row) => (row.enrolledStudents ?? 0) > 0)
    .map((row) => `${formatProgrammeDisplay(row.programme)} · ${formatCourseDisplay(row.course)}`);

  return buildTopicsCoveredPdfBodyForReport(narrative, presentation, colors, {
    enrolledCourseLabels,
    fallbackDraft: buildTopicsCoveredDraft(snapshot),
    nextLines,
  });
}
