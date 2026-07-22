const clamp = (value: number) => Math.max(0, Math.min(100, value));

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

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

function parseEngagementMetrics(row: any): { classwork: number | null; assessment: number | null } {
  const metrics = row?.engagement_metrics;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    return { classwork: null, assessment: null };
  }
  const classwork = Number(metrics.classwork_score);
  const assessment = Number(metrics.assessment_score);
  return {
    classwork: Number.isFinite(classwork) ? classwork : null,
    assessment: Number.isFinite(assessment) ? assessment : null,
  };
}

export function submissionPercent(row: any): number | null {
  const raw = row.weighted_score ?? row.grade;
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  const value = Number(raw);
  const maxPoints = Number(row.assignments?.max_points || 0);
  if (row.weighted_score == null && maxPoints > 0 && value <= maxPoints) return clamp((value / maxPoints) * 100);
  return clamp(value);
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

function publishedComponentRows(sprPool: any[]): LearnerAssignmentScore[] {
  const rows: LearnerAssignmentScore[] = [];
  for (const spr of sprPool) {
    const course = String(spr.course_name || 'Course').trim();
    const prefix = sprPool.length > 1 ? `${course} · ` : '';
    const engagement = parseEngagementMetrics(spr);
    if (engagement.classwork != null) {
      rows.push({
        title: `${prefix}Classwork`,
        rawLabel: `${engagement.classwork.toFixed(1)}%`,
        percent: engagement.classwork,
        source: 'published_report',
      });
    }
    const assignmentsPct = Number(spr.attendance_score);
    if (Number.isFinite(assignmentsPct)) {
      rows.push({
        title: `${prefix}Assignments`,
        rawLabel: `${assignmentsPct.toFixed(1)}%`,
        percent: assignmentsPct,
        source: 'published_report',
      });
    }
    if (engagement.assessment != null) {
      rows.push({
        title: `${prefix}Assessment`,
        rawLabel: `${engagement.assessment.toFixed(1)}%`,
        percent: engagement.assessment,
        source: 'published_report',
      });
    }
  }
  return rows;
}

export function buildLearnerGradebookDetail(sprPool: any[], studentSubmissions: any[]): LearnerGradebookDetail {
  const theoryScores = sprPool.map((row) => Number(row.theory_score)).filter((value) => Number.isFinite(value));
  const practicalScores = sprPool.map((row) => Number(row.practical_score)).filter((value) => Number.isFinite(value));
  const examScores = sprPool.map((row) => Number(row.overall_score)).filter((value) => Number.isFinite(value));
  const classworkScores = sprPool
    .map((row) => parseEngagementMetrics(row).classwork)
    .filter((value): value is number => value != null);
  const assessmentScores = sprPool
    .map((row) => parseEngagementMetrics(row).assessment)
    .filter((value): value is number => value != null);
  const publishedAssignmentScores = sprPool
    .map((row) => Number(row.attendance_score))
    .filter((value) => Number.isFinite(value));

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
    theoryScore: theoryScores.length ? average(theoryScores) : null,
    practicalScore: practicalScores.length ? average(practicalScores) : null,
    examScore: examScores.length ? average(examScores) : null,
    classworkScore: classworkScores.length ? average(classworkScores) : null,
    assessmentScore: assessmentScores.length ? average(assessmentScores) : null,
    assignmentAverage: publishedAssignmentScores.length
      ? average(publishedAssignmentScores)
      : submissionPercents.length
        ? average(submissionPercents)
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

export type GradebookDetailRow = {
  learnerId: string;
  learnerName: string;
  component: string;
  rawLabel: string;
  percent: number | null;
  source: 'published_report' | 'class_gradebook';
};

export function buildGradebookDataSheet(
  learners: Array<{ id: string; name: string; gradebook?: LearnerGradebookDetail | null }>,
): { summary: GradebookSummaryRow[]; detail: GradebookDetailRow[] } {
  const summary: GradebookSummaryRow[] = [];
  const detail: GradebookDetailRow[] = [];

  for (const learner of learners) {
    const gb = learner.gradebook;
    summary.push({
      learnerId: learner.id,
      learnerName: learner.name,
      classworkScore: gb?.classworkScore ?? null,
      assignmentAverage: gb?.assignmentAverage ?? null,
      assessmentScore: gb?.assessmentScore ?? null,
    });

    const items = gb?.assignments ?? [];
    if (!items.length) {
      detail.push({
        learnerId: learner.id,
        learnerName: learner.name,
        component: 'No evidence recorded',
        rawLabel: '—',
        percent: null,
        source: 'class_gradebook',
      });
      continue;
    }

    for (const item of items) {
      detail.push({
        learnerId: learner.id,
        learnerName: learner.name,
        component: item.title,
        rawLabel: item.rawLabel,
        percent: item.percent,
        source: item.source === 'published_report' ? 'published_report' : 'class_gradebook',
      });
    }
  }

  return { summary, detail };
}
