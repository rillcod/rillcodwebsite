import { describe, expect, it } from 'vitest';
import { normalizeExtractedAcademicText } from '@/lib/files/extract-document-text';
import { parsePremadeQuestionsFromText } from '@/lib/cbt/question-bank-catalog';

describe('formal document extraction & cohesive single-question parsing', () => {
  it('normalizes raw PDF/Office text into formal academic prose without breaking structure', () => {
    const raw = [
      '[Page 1]',
      'Introduction to Pro-',
      'gramming in Python',
      ' Variables store data',
      'in memory for reuse.',
      'Page 1 of 10',
      'SECTION A: OBJECTIVE',
      '1. Which keyword defines a',
      'function in Python?',
      'A. func',
      'B. def',
      'C. define',
      'D. lambda',
    ].join('\n');

    const cleaned = normalizeExtractedAcademicText(raw);
    expect(cleaned).toContain('Programming in Python');
    expect(cleaned).toContain('- Variables store data');
    expect(cleaned).not.toContain('Page 1 of 10');
    expect(cleaned).toContain('SECTION A: OBJECTIVE');
    expect(cleaned).toContain('B. def');
  });

  it('keeps multi-part theory questions with (a)/(b)/(c) as ONE cohesive essay question', () => {
    const raw = [
      'SECTION B: THEORY',
      '1. Computer Systems [10 marks]',
      '(a) Define a computer system.',
      '(b) List two input devices.',
      '(c) Explain the role of the CPU.',
    ].join('\n');

    const parsed = parsePremadeQuestionsFromText(raw, { sourceName: 'Theory Paper' });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].question_type).toBe('essay');
    expect(parsed[0].options).toHaveLength(0);
    expect(parsed[0].question_text).toContain('(a) Define a computer system.');
    expect(parsed[0].question_text).toContain('(c) Explain the role of the CPU.');
  });

  it('keeps wrapped MCQ stems as ONE crisp question with 4 clean options', () => {
    const raw = [
      '1. Which of the following Python',
      'keywords is used to define a',
      'reusable function?',
      'A. func',
      'B. def',
      'C. method',
      'D. proc',
      'Answer: B',
    ].join('\n');

    const parsed = parsePremadeQuestionsFromText(raw, { sourceName: 'MCQ Paper' });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].question_type).toBe('multiple_choice');
    expect(parsed[0].question_text).toBe('Which of the following Python keywords is used to define a reusable function?');
    expect(parsed[0].options).toEqual(['func', 'def', 'method', 'proc']);
    expect(parsed[0].correct_answer).toBe('def');
  });
});
