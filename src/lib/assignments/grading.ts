import { isCbtAnswerCorrect, type CbtGradeQuestion } from '@/lib/cbt/grading';

export type AssignmentGradeTransitionInput = {
  currentGrade: number | null;
  currentStatus: string | null;
  grade?: number | null;
  status?: string;
  maxPoints: number;
  weight: number;
  graderId: string;
  now?: string;
};

export type AssignmentGradeTransition = {
  fields: Record<string, unknown>;
  finalized: boolean;
  error?: string;
};

const AUTO_GRADED_ASSIGNMENT_TYPES = new Set([
  'multiple_choice',
  'true_false',
  'fill_blank',
  'coding_blocks',
  'block_sequence',
]);

function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Derive report contribution from the recorded mark; clients never author this value. */
export function computeAssignmentWeightedScore(
  grade: number | null | undefined,
  maxPoints: number | null | undefined,
  weight: number | null | undefined,
): number | null {
  if (grade == null) return null;
  const max = Number(maxPoints);
  const contribution = Number(weight);
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(contribution) || contribution <= 0) return null;
  return roundToTwo(Math.max(0, Math.min(contribution, (Number(grade) / max) * contribution)));
}

/**
 * One finalization policy for every assignment/project grading entry point.
 * A numeric mark always becomes `graded`; clearing a mark also clears grader metadata.
 */
export function buildAssignmentGradeTransition(
  input: AssignmentGradeTransitionInput,
): AssignmentGradeTransition {
  const fields: Record<string, unknown> = {};
  const gradeWasProvided = input.grade !== undefined;
  const effectiveGrade = gradeWasProvided ? input.grade : input.currentGrade;
  const requestedFinal = gradeWasProvided || input.status === 'graded';

  if (!requestedFinal) {
    if (input.status !== undefined) fields.status = input.status;
    return { fields, finalized: false };
  }

  if (effectiveGrade == null) {
    if (input.status === 'graded') {
      return { fields, finalized: false, error: 'A numeric grade is required before a submission can be marked graded.' };
    }
    fields.grade = null;
    fields.weighted_score = null;
    fields.graded_by = null;
    fields.graded_at = null;
    fields.status = input.status && input.status !== 'graded'
      ? input.status
      : input.currentStatus === 'late' ? 'late' : 'submitted';
    return { fields, finalized: false };
  }

  fields.grade = effectiveGrade;
  fields.weighted_score = computeAssignmentWeightedScore(effectiveGrade, input.maxPoints, input.weight);
  fields.status = 'graded';
  fields.graded_by = input.graderId;
  fields.graded_at = input.now ?? new Date().toISOString();
  return { fields, finalized: true };
}

export type AssignmentAutoGradeQuestion = CbtGradeQuestion & {
  question_text?: string | null;
};

export type AssignmentAutoGradeResult = {
  grade: number;
  earnedPoints: number;
  possiblePoints: number;
  needsReview: boolean;
  results: Array<'correct' | 'wrong' | 'skipped' | 'manual'>;
};

export type AssignmentRubricCriterion = {
  criterion?: string | null;
  description?: string | null;
  maxPoints?: number | null;
};

export type AssignmentRubricGradeResult = {
  grade: number;
  earnedPoints: number;
  possiblePoints: number;
  rows: Array<{
    criterionIndex: number;
    criterion: string;
    earned: number;
    maximum: number;
  }>;
  error?: string;
};

/**
 * Canonical rubric calculation. Criterion marks remain auditable while the final
 * grade is normalized to assignment.max_points when a legacy rubric total differs.
 */
export function gradeAssignmentRubric(
  rubric: AssignmentRubricCriterion[],
  scores: Record<string, unknown> | unknown[],
  maxPoints: number,
): AssignmentRubricGradeResult {
  const invalid: AssignmentRubricGradeResult = {
    grade: 0,
    earnedPoints: 0,
    possiblePoints: 0,
    rows: [],
    error: 'A complete, valid rubric is required.',
  };
  if (!Array.isArray(rubric) || rubric.length === 0 || !Number.isFinite(maxPoints) || maxPoints <= 0) {
    return invalid;
  }

  const rows: AssignmentRubricGradeResult['rows'] = [];
  for (let index = 0; index < rubric.length; index += 1) {
    const maximum = Number(rubric[index]?.maxPoints ?? 0);
    const raw = Array.isArray(scores) ? scores[index] : scores?.[String(index)];
    const earned = Number(raw);
    if (!Number.isFinite(maximum) || maximum <= 0) {
      return { ...invalid, error: `Rubric criterion ${index + 1} must have a positive maximum score.` };
    }
    if (raw === '' || raw == null || !Number.isFinite(earned) || earned < 0 || earned > maximum) {
      return { ...invalid, error: `Enter a score from 0 to ${maximum} for rubric criterion ${index + 1}.` };
    }
    rows.push({
      criterionIndex: index,
      criterion: String(rubric[index]?.criterion ?? `Criterion ${index + 1}`),
      earned: roundToTwo(earned),
      maximum: roundToTwo(maximum),
    });
  }

  const earnedPoints = roundToTwo(rows.reduce((sum, row) => sum + row.earned, 0));
  const possiblePoints = roundToTwo(rows.reduce((sum, row) => sum + row.maximum, 0));
  return {
    grade: roundToTwo((earnedPoints / possiblePoints) * maxPoints),
    earnedPoints,
    possiblePoints,
    rows,
  };
}

export function isAutoGradableAssignmentQuestion(question: AssignmentAutoGradeQuestion): boolean {
  return AUTO_GRADED_ASSIGNMENT_TYPES.has(String(question.question_type ?? '').toLowerCase())
    && Boolean(String(question.correct_answer ?? '').trim());
}

/** Identical answer matching and score scaling for learner submission and teacher review UI. */
export function gradeAssignmentAnswers(
  questions: AssignmentAutoGradeQuestion[],
  answers: Record<string, unknown> | unknown[],
  maxPoints: number,
): AssignmentAutoGradeResult | null {
  if (!questions.length || !answers || !Number.isFinite(maxPoints) || maxPoints <= 0) return null;
  const gradeable = questions.filter(isAutoGradableAssignmentQuestion);
  if (!gradeable.length) return null;

  const explicitTotal = gradeable.reduce((sum, q) => sum + Math.max(0, Number(q.points ?? 0)), 0);
  const equalPoints = explicitTotal === 0 ? maxPoints / gradeable.length : null;
  let earnedPoints = 0;
  let possiblePoints = 0;

  const results = questions.map((question, index): AssignmentAutoGradeResult['results'][number] => {
    if (!isAutoGradableAssignmentQuestion(question)) return 'manual';
    const points = equalPoints ?? Math.max(0, Number(question.points ?? 0));
    possiblePoints += points;
    const answer = Array.isArray(answers) ? answers[index] : answers[String(index)] ?? answers[question.id];
    if (String(answer ?? '').trim() === '') return 'skipped';
    if (isCbtAnswerCorrect(question, answer)) {
      earnedPoints += points;
      return 'correct';
    }
    return 'wrong';
  });

  return {
    grade: possiblePoints > 0 ? roundToTwo((earnedPoints / possiblePoints) * maxPoints) : 0,
    earnedPoints: roundToTwo(earnedPoints),
    possiblePoints: roundToTwo(possiblePoints),
    needsReview: results.includes('manual'),
    results,
  };
}
