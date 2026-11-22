import type { CbtExamType } from './predictive-entry';

export interface ExaminerPreset {
  id: 'quick_quiz' | 'ca_test' | 'midterm' | 'term_exam';
  label: string;
  shortLabel: string;
  badge: string;
  examType: CbtExamType;
  mcqCount: number;
  theoryCount: number;
  durationMinutes: number;
  passingScore: number;
  targetMarks: number;
  summary: string;
}

export const EXAMINER_PRESETS: readonly ExaminerPreset[] = [
  {
    id: 'quick_quiz',
    label: 'Quick Class Quiz',
    shortLabel: 'Quick Quiz',
    badge: '10 Obj · 20m',
    examType: 'evaluation',
    mcqCount: 10,
    theoryCount: 0,
    durationMinutes: 20,
    passingScore: 50,
    targetMarks: 20,
    summary: 'Fast auto-graded check of recent lesson mastery.',
  },
  {
    id: 'ca_test',
    label: 'Continuous Assessment (CA)',
    shortLabel: 'CA / Test',
    badge: '15 Obj + 2 Theory · 35m',
    examType: 'evaluation',
    mcqCount: 15,
    theoryCount: 2,
    durationMinutes: 35,
    passingScore: 50,
    targetMarks: 40,
    summary: 'Balanced 1st/2nd CA test with auto-graded objective + written rubric.',
  },
  {
    id: 'midterm',
    label: 'Mid-Term Examination',
    shortLabel: 'Mid-Term',
    badge: '20 Obj + 3 Theory · 45m',
    examType: 'examination',
    mcqCount: 20,
    theoryCount: 3,
    durationMinutes: 45,
    passingScore: 50,
    targetMarks: 60,
    summary: 'Mid-term checkpoint spanning objective recall and structured theory.',
  },
  {
    id: 'term_exam',
    label: 'Full Term Examination',
    shortLabel: 'Term Exam',
    badge: '30 Obj + 5 Theory · 60m',
    examType: 'examination',
    mcqCount: 30,
    theoryCount: 5,
    durationMinutes: 60,
    passingScore: 50,
    targetMarks: 100,
    summary: 'Official end-of-term examination paper balanced to 100 marks.',
  },
] as const;

export function isObjectiveType(questionType: string): boolean {
  return questionType === 'multiple_choice' || questionType === 'true_false';
}

export function composeSmartExamTitle(params: {
  courseTitle?: string | null;
  programName?: string | null;
  className?: string | null;
  examType: CbtExamType;
  presetLabel?: string | null;
  hostKindLabel?: string | null;
}): string {
  const subject = params.courseTitle?.trim() || params.programName?.trim() || '';
  const kindLabel =
    params.hostKindLabel?.trim() ||
    params.presetLabel?.trim() ||
    (params.examType === 'evaluation' ? 'Evaluation Test' : 'Term Examination');
  const cls = params.className?.trim() || '';

  if (subject && cls) return `${subject} — ${kindLabel} (${cls})`;
  if (subject) return `${subject} — ${kindLabel}`;
  if (cls) return `${cls} — ${kindLabel}`;
  return '';
}

export function recommendExamDurationMinutes(
  questions: Array<{ question_text?: string; question_type: string }>,
): number {
  const filled = questions.filter((q) => (q.question_text ?? '').trim().length > 0);
  if (filled.length === 0) return 30;
  let obj = 0;
  let theory = 0;
  for (const q of filled) {
    if (isObjectiveType(q.question_type)) obj += 1;
    else theory += 1;
  }
  const raw = obj * 1.5 + theory * 6;
  const rounded = Math.ceil(raw / 5) * 5;
  return Math.max(15, Math.min(180, rounded));
}

/**
 * Distributes `targetTotal` marks cleanly across objective & theory questions
 * like a Chief Examiner so the paper always sums to the exact target total.
 */
export function autoBalanceQuestionMarks<
  T extends { question_type: string; points: number },
>(questions: T[], targetTotal: number): T[] {
  const n = questions.length;
  if (n === 0 || !Number.isFinite(targetTotal) || targetTotal < n) {
    return questions;
  }
  const total = Math.round(targetTotal);
  const objIndices: number[] = [];
  const theoryIndices: number[] = [];
  questions.forEach((q, idx) => {
    if (isObjectiveType(q.question_type)) objIndices.push(idx);
    else theoryIndices.push(idx);
  });

  const allocateGroup = (indices: number[], budget: number): Map<number, number> => {
    const out = new Map<number, number>();
    if (indices.length === 0) return out;
    const base = Math.max(1, Math.floor(budget / indices.length));
    const rem = budget - base * indices.length;
    for (let i = 0; i < indices.length; i++) {
      // Spread any remainder onto the later questions in the group
      const extra = rem > 0 && i >= indices.length - rem ? 1 : 0;
      out.set(indices[i], base + extra);
    }
    return out;
  };

  let objBudget = 0;
  let theoryBudget = 0;

  if (objIndices.length === 0) {
    theoryBudget = total;
  } else if (theoryIndices.length === 0) {
    objBudget = total;
  } else {
    // Standard exam weighting: ~60% objective, ~40% theory, while keeping
    // at least 1 mark per objective and making each theory worth >= each objective.
    const desiredObj = Math.round(total * 0.6);
    const minObj = objIndices.length;
    const minTheory = theoryIndices.length * 2;
    if (total - minObj < minTheory) {
      objBudget = minObj;
      theoryBudget = total - objBudget;
    } else {
      objBudget = Math.max(minObj, Math.min(desiredObj, total - minTheory));
      theoryBudget = total - objBudget;
    }
  }

  const assigned = new Map<number, number>([
    ...allocateGroup(objIndices, objBudget),
    ...allocateGroup(theoryIndices, theoryBudget),
  ]);

  return questions.map((q, idx) => ({
    ...q,
    points: assigned.get(idx) ?? q.points,
  }));
}

export interface ReadinessIssue {
  index: number;
  reason: string;
}

export interface ExamReadinessSummary {
  objectiveCount: number;
  theoryCount: number;
  totalQuestions: number;
  totalMarks: number;
  recommendedMinutes: number;
  issues: ReadinessIssue[];
  isReady: boolean;
}

export function auditExamReadiness(
  questions: Array<{
    question_text: string;
    question_type: string;
    options?: string[] | null;
    correct_answer?: string | null;
    points?: number;
  }>,
  selectedIndices?: Set<number>,
): ExamReadinessSummary {
  const issues: ReadinessIssue[] = [];
  let objectiveCount = 0;
  let theoryCount = 0;
  let totalMarks = 0;
  const activeQuestions: Array<{ question_text: string; question_type: string }> = [];

  questions.forEach((q, index) => {
    if (selectedIndices && !selectedIndices.has(index)) return;
    const text = (q.question_text ?? '').trim();
    if (!text) {
      issues.push({ index, reason: 'missing question text' });
      return;
    }
    activeQuestions.push({ question_text: text, question_type: q.question_type });
    totalMarks += Math.max(0, Number(q.points) || 0);
    if (isObjectiveType(q.question_type)) {
      objectiveCount += 1;
      const cleanOpts = (q.options ?? []).map((o) => String(o ?? '').trim()).filter(Boolean);
      const ans = String(q.correct_answer ?? '').trim();
      if (cleanOpts.length < 2) {
        issues.push({ index, reason: 'needs 2+ options' });
      } else if (!ans || !cleanOpts.includes(ans)) {
        issues.push({ index, reason: 'pick correct answer' });
      }
    } else {
      theoryCount += 1;
    }
  });

  const totalQuestions = objectiveCount + theoryCount;
  return {
    objectiveCount,
    theoryCount,
    totalQuestions,
    totalMarks,
    recommendedMinutes: recommendExamDurationMinutes(activeQuestions),
    issues,
    isReady: totalQuestions > 0 && issues.length === 0,
  };
}
