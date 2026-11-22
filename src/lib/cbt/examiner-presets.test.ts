import { describe, expect, it } from 'vitest';
import {
  EXAMINER_PRESETS,
  auditExamReadiness,
  autoBalanceQuestionMarks,
  composeSmartExamTitle,
  enforceExactQuestionMix,
  recommendExamDurationMinutes,
} from './examiner-presets';

describe('examiner-presets', () => {
  it('exposes 4 distinct presets with sensible defaults', () => {
    expect(EXAMINER_PRESETS.map((p) => p.id)).toEqual([
      'quick_quiz',
      'ca_test',
      'midterm',
      'term_exam',
    ]);
    for (const preset of EXAMINER_PRESETS) {
      expect(preset.durationMinutes).toBeGreaterThanOrEqual(15);
      expect(preset.targetMarks).toBeGreaterThanOrEqual(20);
    }
  });

  it('composes official exam titles from course, preset/type, and class', () => {
    expect(
      composeSmartExamTitle({
        courseTitle: 'Python Programming',
        className: 'Basic 5A',
        examType: 'examination',
        presetLabel: 'Full Term Examination',
      }),
    ).toBe('Python Programming — Full Term Examination (Basic 5A)');

    expect(
      composeSmartExamTitle({
        programName: 'Coding & Robotics',
        examType: 'evaluation',
      }),
    ).toBe('Coding & Robotics — Evaluation Test');
  });

  it('balances mixed objective + theory questions to exact target marks', () => {
    const qs = [
      ...Array.from({ length: 15 }, () => ({ question_type: 'multiple_choice', points: 5 })),
      ...Array.from({ length: 3 }, () => ({ question_type: 'essay', points: 10 })),
    ];
    const balanced = autoBalanceQuestionMarks(qs, 100);
    const sum = balanced.reduce((acc, q) => acc + q.points, 0);
    expect(sum).toBe(100);
    const objMax = Math.max(...balanced.slice(0, 15).map((q) => q.points));
    const theoryMin = Math.min(...balanced.slice(15).map((q) => q.points));
    expect(theoryMin).toBeGreaterThan(objMax);
  });

  it('recommends fair rounded exam duration', () => {
    const qs = [
      ...Array.from({ length: 20 }, () => ({ question_text: 'Q', question_type: 'multiple_choice' })),
      ...Array.from({ length: 3 }, () => ({ question_text: 'T', question_type: 'essay' })),
    ];
    // 20 * 1.5 + 3 * 6 = 48 -> rounded up to 50 min
    expect(recommendExamDurationMinutes(qs)).toBe(50);
  });

  it('enforces exact objective + theory counts and orders Section A before Section B', () => {
    const raw = [
      ...Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, question_type: 'essay' })),
      ...Array.from({ length: 22 }, (_, i) => ({ id: `m${i}`, question_type: 'multiple_choice' })),
    ];
    const res = enforceExactQuestionMix(raw, 15, 5);
    expect(res.mcqCount).toBe(15);
    expect(res.theoryCount).toBe(5);
    expect(res.questions).toHaveLength(20);
    expect(res.trimmedCount).toBe(10);
    // Objective first, then Theory
    expect(res.questions[0].question_type).toBe('multiple_choice');
    expect(res.questions[14].question_type).toBe('multiple_choice');
    expect(res.questions[15].question_type).toBe('essay');
    expect(res.questions[19].question_type).toBe('essay');
  });

  it('audits exam readiness and flags missing answer keys', () => {
    const summary = auditExamReadiness([
      {
        question_text: 'What is RAM?',
        question_type: 'multiple_choice',
        options: ['Volatile', 'Non-volatile'],
        correct_answer: 'Volatile',
        points: 2,
      },
      {
        question_text: 'What is CPU?',
        question_type: 'multiple_choice',
        options: ['Brain', 'Disk'],
        correct_answer: '',
        points: 2,
      },
    ]);
    expect(summary.isReady).toBe(false);
    expect(summary.issues).toEqual([{ index: 1, reason: 'pick correct answer' }]);
    expect(summary.totalMarks).toBe(4);
  });
});
