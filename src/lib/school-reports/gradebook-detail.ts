import {
  averageNullable,
  clampScore,
  mapProgressReportScores,
  parseEngagementMetrics,
  progressReportCourseLabel,
  type StudentProgressReportRow,
} from './progress-report';

export type LearnerAssignmentScore = {
  title: string;
  rawLabel: string;
  percent: number | null;
  source?: 'published_report' | 'class_gradebook';
};

export type LearnerGradebookDetail = {
  theoryScore: number | null;
  practicalScore: number | null;
  examScore: number | null;
  classworkScore: number | null;
  assignmentAverage: number | null;
  assessmentScore: number | null;
  assignments: LearnerAssignmentScore[];
  /** True when assignment/classwork lines came from a published progress report. */
  fromPublishedReport: boolean;
};

export function submissionPercent(row: any): number | null {
  const raw = row.weighted_score ?? row.grade;
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  const value = Number(raw);
  const maxPoints = Number(row.assignments?.max_points || 0);
  if (row.weighted_score == null && maxPoints > 0 && value <= maxPoints) return clampScore((value / maxPoints) * 100);
  return clampScore(value);
}

export function formatSubmissionRawLabel(row: any): string {
  const raw = row.weighted_score ?? row.grade;
  if (raw == null || !Number.isFinite(Number(raw))) return 'Not recorded';
  const value = Number(raw);
  const maxPoints = Number(row.assignments?.max_points || 0);
  if (row.weighted_score != null) return `${value.toFixed(1)}%`;
  if (maxPoints > 0) return `${value}/${maxPoints}`;
  return String(value);
}

function assignmentTitle(row: any): string {
  const title = String(row.assignments?.title || '').trim();
  return title || 'Assignment';
}

function publishedComponentRows(sprPool: StudentProgressReportRow[]): LearnerAssignmentScore[] {
  const rows: LearnerAssignmentScore[] = [];
  for (const spr of sprPool) {
    const course = progressReportCourseLabel(spr);
    const prefix = sprPool.length > 1 ? `${course} · ` : '';
    const mapped = mapProgressReportScores(spr);
    if (mapped.classwork != null) {
      rows.push({
        title: `${prefix}Classwork`,
        rawLabel: `${mapped.classwork.toFixed(1)}%`,
        percent: mapped.classwork,
        source: 'published_report',
      });
    }
    if (mapped.assignments != null) {
      rows.push({
        title: `${prefix}Assignments`,
        rawLabel: `${mapped.assignments.toFixed(1)}%`,
        percent: mapped.assignments,
        source: 'published_report',
      });
    }
    if (mapped.assessment != null) {
      rows.push({
        title: `${prefix}Assessment`,
        rawLabel: `${mapped.assessment.toFixed(1)}%`,
        percent: mapped.assessment,
        source: 'published_report',
      });
    }
  }
  return rows;
}

export function buildLearnerGradebookDetail(
  sprPool: StudentProgressReportRow[],
  studentSubmissions: any[],
): LearnerGradebookDetail {
  const mappedScores = sprPool.map((row) => mapProgressReportScores(row));
  const theoryScores = mappedScores.flatMap((row) => (row.theory == null ? [] : [row.theory]));
  const practicalScores = mappedScores.flatMap((row) => (row.practical == null ? [] : [row.practical]));
  const examScores = mappedScores.flatMap((row) => (row.exam == null ? [] : [row.exam]));
  const classworkScores = mappedScores.flatMap((row) => (row.classwork == null ? [] : [row.classwork]));
  const assessmentScores = mappedScores.flatMap((row) => (row.assessment == null ? [] : [row.assessment]));
  const publishedAssignmentScores = mappedScores.flatMap((row) => (row.assignments == null ? [] : [row.assignments]));

  const submissionAssignments = studentSubmissions
    .map((row) => ({
      title: assignmentTitle(row),
      rawLabel: formatSubmissionRawLabel(row),
      percent: submissionPercent(row),
      sortAt: new Date(row.graded_at || row.submitted_at || 0).getTime(),
      source: 'class_gradebook' as const,
    }))
    .sort((a, b) => a.sortAt - b.sortAt || a.title.localeCompare(b.title))
    .map(({ title, rawLabel, percent, source }) => ({ title, rawLabel, percent, source }));

  const publishedRows = publishedComponentRows(sprPool);
  const assignments = publishedRows.length
    ? [...publishedRows, ...submissionAssignments]
    : submissionAssignments;

  const submissionPercents = submissionAssignments.flatMap((row) => (row.percent == null ? [] : [row.percent]));

  return {
    theoryScore: averageNullable(theoryScores),
    practicalScore: averageNullable(practicalScores),
    examScore: averageNullable(examScores),
    classworkScore: averageNullable(classworkScores),
    assessmentScore: averageNullable(assessmentScores),
    assignmentAverage: publishedAssignmentScores.length
      ? averageNullable(publishedAssignmentScores)
      : submissionPercents.length
        ? averageNullable(submissionPercents)
        : null,
    assignments,
    fromPublishedReport: publishedRows.length > 0,
  };
}

export function formatAssignmentScoresForPdf(assignments: LearnerAssignmentScore[]): string {
  if (!assignments.length) return 'No graded assignments';
  return assignments
    .map((row) => {
      const pct = row.percent == null ? '' : ` (${row.percent.toFixed(1)}%)`;
      return `${row.title}: ${row.rawLabel}${pct}`;
    })
    .join('; ');
}

export type GradebookSummaryRow = {
  learnerId: string;
  learnerName: string;
  classworkScore: number | null;
  assignmentAverage: number | null;
  assessmentScore: number | null;
};

export function buildGradebookSummarySheet(
  learners: Array<{ id: string; name: string; gradebook?: LearnerGradebookDetail | null }>,
): GradebookSummaryRow[] {
  return learners.map((learner) => {
    const gb = learner.gradebook;
    return {
      learnerId: learner.id,
      learnerName: learner.name,
      classworkScore: gb?.classworkScore ?? null,
      assignmentAverage: gb?.assignmentAverage ?? null,
      assessmentScore: gb?.assessmentScore ?? null,
    };
  });
}

// Re-export for consumers that need engagement parsing without full gradebook build.
export { parseEngagementMetrics } from './progress-report';
