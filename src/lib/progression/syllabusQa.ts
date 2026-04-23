import {
  getSyllabusTermWeeks,
  type SyllabusContentImport,
  type SyllabusWeekImport,
} from '@/lib/lesson-plans/syllabusImport';
import { extractLessonPlanOperationWeeks } from '@/lib/progression/lessonPlanOperation';
import type { Json } from '@/types/supabase';

type Dict = Record<string, unknown>;

export type QaSeverity = 'info' | 'warn' | 'fail';
export type QaIssue = {
  key: string;
  severity: QaSeverity;
  message: string;
  week?: number | null;
};

export type QaTermReport = {
  key: string;
  year_number: number;
  term_number: number;
  score: number;
  coverage_pct: number;
  readiness: 'excellent' | 'good' | 'watch' | 'critical';
  generated_weeks: number;
  syllabus_weeks: number;
  missing_week_types: number;
  assessment_drift_count: number;
  exam_drift_count: number;
  five_step_break_count: number;
  issues: QaIssue[];
};

export type QaPlanReport = {
  overall_score: number;
  overall_readiness: 'excellent' | 'good' | 'watch' | 'critical';
  total_terms: number;
  coverage_pct: number;
  issues: QaIssue[];
  terms: QaTermReport[];
};

type QaPolicy = {
  min_pass_score: number;
  required_teacher_steps: number;
  required_student_steps: number;
  assessment_drift_mode: 'warn' | 'fail';
  exam_drift_mode: 'warn' | 'fail';
  five_step_mode: 'warn' | 'fail';
};

function asObject(value: unknown): Dict {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Dict)
    : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toReadiness(score: number): QaPlanReport['overall_readiness'] {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 55) return 'watch';
  return 'critical';
}

function normalizeWeekType(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : 'lesson';
}

function buildQaPolicy(policy: Record<string, unknown> | null | undefined): QaPolicy {
  const source = policy ?? {};
  return {
    min_pass_score: Math.max(40, Math.min(100, Number(source.qa_min_pass_score ?? 75) || 75)),
    required_teacher_steps: Math.max(1, Math.min(8, Number(source.qa_required_teacher_steps ?? 5) || 5)),
    required_student_steps: Math.max(1, Math.min(8, Number(source.qa_required_student_steps ?? 5) || 5)),
    assessment_drift_mode: source.qa_assessment_drift_mode === 'fail' ? 'fail' : 'warn',
    exam_drift_mode: source.qa_exam_drift_mode === 'warn' ? 'warn' : 'fail',
    five_step_mode: source.qa_five_step_mode === 'fail' ? 'fail' : 'warn',
  };
}

function getWeekYearTerm(week: Dict) {
  const syllabusRef = asObject(week.syllabus_ref);
  const year = Number(syllabusRef.year_number ?? 1);
  const term = Number(syllabusRef.term_number ?? 1);
  return {
    year: Number.isFinite(year) && year > 0 ? year : 1,
    term: Number.isFinite(term) && term > 0 ? term : 1,
  };
}

function hasFiveStepWeekShape(week: Dict, policy: QaPolicy): boolean {
  const lessonPlan = asObject(week.lesson_plan);
  const weekType = normalizeWeekType(week.type ?? week.syllabus_week_type);
  if (weekType === 'lesson') {
    const teacherActivities = asArray<string>(lessonPlan.teacher_activities).filter(Boolean);
    const studentActivities = asArray<string>(lessonPlan.student_activities).filter(Boolean);
    const objectives = asArray<string>(lessonPlan.objectives).filter(Boolean);
    return teacherActivities.length >= policy.required_teacher_steps
      && studentActivities.length >= policy.required_student_steps
      && objectives.length > 0;
  }
  const assessmentPlan = asObject(week.assessment_plan);
  return typeof assessmentPlan.title === 'string' && assessmentPlan.title.trim().length > 0;
}

function groupWeeksByTerm(planData: Json | null) {
  const weeks = extractLessonPlanOperationWeeks(planData);
  const grouped = new Map<string, Dict[]>();
  for (const rawWeek of weeks) {
    const week = asObject(rawWeek);
    const { year, term } = getWeekYearTerm(week);
    const key = `y${year}t${term}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(week);
    grouped.set(key, bucket);
  }
  return grouped;
}

function buildCoverageIssues(
  syllabusWeeks: SyllabusWeekImport[],
  generatedWeeks: Dict[],
): QaIssue[] {
  const issues: QaIssue[] = [];
  for (const syllabusWeek of syllabusWeeks) {
    const generated = generatedWeeks.find((week) => Number(week.week ?? 0) === syllabusWeek.week);
    if (!generated) {
      issues.push({
        key: `missing-week-${syllabusWeek.week}`,
        severity: 'fail',
        week: syllabusWeek.week,
        message: `Missing generated week ${syllabusWeek.week} from the syllabus route.`,
      });
      continue;
    }
    const expectedType = normalizeWeekType(syllabusWeek.type);
    const actualType = normalizeWeekType(generated.type ?? generated.syllabus_week_type);
    if (expectedType !== actualType) {
      issues.push({
        key: `week-type-${syllabusWeek.week}`,
        severity: 'warn',
        week: syllabusWeek.week,
        message: `Week ${syllabusWeek.week} expects "${expectedType}" but generated "${actualType}".`,
      });
    }
  }
  return issues;
}

export function buildLessonPlanSyllabusQa(input: {
  planData: Json | null;
  curriculum: SyllabusContentImport | null | undefined;
  policy?: Record<string, unknown> | null;
}): QaPlanReport {
  const qaPolicy = buildQaPolicy(input.policy);
  const grouped = groupWeeksByTerm(input.planData);
  const terms: QaTermReport[] = [];
  const planIssues: QaIssue[] = [];

  if (grouped.size === 0) {
    return {
      overall_score: 0,
      overall_readiness: 'critical',
      total_terms: 0,
      coverage_pct: 0,
      issues: [{
        key: 'no-generated-weeks',
        severity: 'fail',
        message: 'No generated or legacy lesson-plan weeks were found for syllabus QA.',
      }],
      terms: [],
    };
  }

  for (const [key, weeks] of grouped.entries()) {
    const match = key.match(/^y(\d+)t(\d+)$/);
    const yearNumber = match ? Number(match[1]) : 1;
    const termNumber = match ? Number(match[2]) : 1;
    const syllabusWeeks = getSyllabusTermWeeks(input.curriculum, termNumber);
    const termIssues: QaIssue[] = [];
    const coverageIssues = buildCoverageIssues(syllabusWeeks, weeks);
    termIssues.push(...coverageIssues);

    const assessmentWeeks = syllabusWeeks.filter((week) => normalizeWeekType(week.type) === 'assessment').map((week) => week.week);
    const examWeeks = syllabusWeeks.filter((week) => normalizeWeekType(week.type) === 'examination').map((week) => week.week);

    for (const week of weeks) {
      const weekNumber = Number(week.week ?? 0);
      const actualType = normalizeWeekType(week.type ?? week.syllabus_week_type);
      if (assessmentWeeks.includes(weekNumber) && actualType !== 'assessment') {
        termIssues.push({
          key: `assessment-drift-${weekNumber}`,
          severity: qaPolicy.assessment_drift_mode,
          week: weekNumber,
          message: `Week ${weekNumber} should operate as an assessment week.`,
        });
      }
      if (examWeeks.includes(weekNumber) && actualType !== 'examination') {
        termIssues.push({
          key: `exam-drift-${weekNumber}`,
          severity: qaPolicy.exam_drift_mode,
          week: weekNumber,
          message: `Week ${weekNumber} should operate as an examination week.`,
        });
      }
      if (!hasFiveStepWeekShape(week, qaPolicy)) {
        termIssues.push({
          key: `five-step-${weekNumber}`,
          severity: qaPolicy.five_step_mode,
          week: weekNumber,
          message: `Week ${weekNumber} does not satisfy the configured 5-step lesson/assessment structure.`,
        });
      }
    }

    const coveragePct = syllabusWeeks.length > 0
      ? clampScore((syllabusWeeks.filter((week) => weeks.some((entry) => Number(entry.week ?? 0) === week.week)).length / syllabusWeeks.length) * 100)
      : 0;
    const missingWeekTypes = coverageIssues.filter((issue) => issue.key.startsWith('week-type')).length;
    const assessmentDriftCount = termIssues.filter((issue) => issue.key.startsWith('assessment-drift')).length;
    const examDriftCount = termIssues.filter((issue) => issue.key.startsWith('exam-drift')).length;
    const fiveStepBreakCount = termIssues.filter((issue) => issue.key.startsWith('five-step')).length;

    const failCount = termIssues.filter((issue) => issue.severity === 'fail').length;
    const warnCount = termIssues.filter((issue) => issue.severity === 'warn').length;
    const score = clampScore(
      coveragePct
      - failCount * 18
      - warnCount * 6
      - examDriftCount * 10
      - assessmentDriftCount * 4
      - fiveStepBreakCount * 5,
    );
    const effectiveScore = score < qaPolicy.min_pass_score && score > 0 ? Math.max(0, score - 5) : score;

    const report: QaTermReport = {
      key,
      year_number: yearNumber,
      term_number: termNumber,
      score: effectiveScore,
      coverage_pct: coveragePct,
      readiness: toReadiness(effectiveScore),
      generated_weeks: weeks.length,
      syllabus_weeks: syllabusWeeks.length,
      missing_week_types: missingWeekTypes,
      assessment_drift_count: assessmentDriftCount,
      exam_drift_count: examDriftCount,
      five_step_break_count: fiveStepBreakCount,
      issues: termIssues,
    };
    terms.push(report);
    planIssues.push(...termIssues.map((issue) => ({ ...issue, key: `${key}:${issue.key}` })));
  }

  const overallScore = terms.length > 0
    ? clampScore(terms.reduce((sum, term) => sum + term.score, 0) / terms.length)
    : 0;
  const totalCoverage = terms.length > 0
    ? clampScore(terms.reduce((sum, term) => sum + term.coverage_pct, 0) / terms.length)
    : 0;

  return {
    overall_score: overallScore,
    overall_readiness: toReadiness(overallScore),
    total_terms: terms.length,
    coverage_pct: totalCoverage,
    issues: planIssues,
    terms: terms.sort((a, b) => a.year_number - b.year_number || a.term_number - b.term_number),
  };
}
