import { describe, expect, it } from 'vitest';
import { classifyDocumentRole, normalizeExtractedAcademicText } from '@/lib/files/extract-document-text';
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

  it('never misclassifies numbered lesson notes or slide decks as a premade question paper', () => {
    const lessonNotes = [
      '[Slide 1]',
      'JSS 2 Exam Revision Notes',
      '1. Introduction to Variables and Data Types',
      '2. Arithmetic Operators in Python',
      '3. Conditional Statements (if / else)',
      '4. Loops and Iteration',
      '5. Functions and Reusability',
    ].join('\n');

    expect(classifyDocumentRole('JSS2_Exam_Revision_Notes.pptx', lessonNotes)).toBe('study_material');

    const realExamPaper = [
      'SECTION A: OBJECTIVE',
      '1. Which keyword defines a function in Python?',
      'A. func  B. def  C. define  D. lambda',
      '2. What is the output of print(7 // 2)?',
      'A. 3.5  B. 3  C. 1  D. 14',
    ].join('\n');

    expect(classifyDocumentRole('JSS2_Test.pdf', realExamPaper)).toBe('question_paper');
  });
});
