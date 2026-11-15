import { describe, expect, it } from 'vitest';
import {
  buildAssessmentBlueprint,
  buildCurriculumAlignmentBrief,
  convertPremadeToCbtQuestion,
  convertPremadeToWrittenQuestion,
  parsePremadeQuestionsFromText,
} from './question-bank-catalog';

describe('question-bank-catalog smart parser & blueprint engine', () => {
  it('parses premade MCQ, True/False, and Theory questions from raw TXT/PDF text', () => {
    const raw = `
1. What is the output of print(2 ** 3) in Python? [5 marks]
A) 6
B) 8
C) 9
D) 5
Answer: B
Explanation: ** is the exponentiation operator.

2. In HTML5, the <nav> tag is used for primary navigation links. (4 pts)
Answer: True

3. Explain two differences between a list and a tuple in Python. [10 marks]
Rubric: Award 5 marks for mutability vs immutability and 5 marks for syntax examples.
`;

    const parsed = parsePremadeQuestionsFromText(raw, {
      sourceName: 'midterm_questions.txt',
      defaultTrack: 'Python & Web',
    });

    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({
      question_type: 'multiple_choice',
      options: ['6', '8', '9', '5'],
      correct_answer: '8',
      points: 5,
      section: 'objective',
    });
    expect(parsed[1]).toMatchObject({
      question_type: 'true_false',
      options: ['True', 'False'],
      correct_answer: 'True',
      points: 4,
    });
    expect(parsed[2]).toMatchObject({
      question_type: 'essay',
      points: 10,
      section: 'subjective',
    });
  });

  it('builds a structured Assessment Blueprint with section weights, cognitive levels, and topic coverage', () => {
    const questions = parsePremadeQuestionsFromText(
      `1. Which operator calculates the remainder?
A) //
B) %
C) **
D) /
Answer: B

2. Design an algorithm that checks if a number is prime and explain its time complexity. [10 marks]
Answer: Check divisors up to sqrt(n).`,
      { sourceName: 'Week 2 Notes.pdf', defaultTrack: 'Algorithms' },
    );

    const blueprint = buildAssessmentBlueprint(questions, {
      title: 'Algorithms Assessment',
      courseTitle: 'Python Programming',
      sourceName: 'Week 2 Notes.pdf',
    });

    expect(blueprint.totalQuestions).toBe(2);
    expect(blueprint.totalPoints).toBe(15);
    expect(blueprint.sections.objective.count).toBe(1);
    expect(blueprint.sections.subjective.count).toBe(1);
    expect(blueprint.alignmentScore).toBeGreaterThanOrEqual(90);
    expect(blueprint.topicCoverage[0].questionNumbers).toEqual([1, 2]);
  });

  it('builds a curriculum alignment brief and converts parsed questions to CBT and Written formats', () => {
    const brief = buildCurriculumAlignmentBrief(
      [
        {
          week: 1,
          title: 'Variables & Data Types',
          objectives: ['Declare variables in Python'],
          keyConcepts: ['int', 'str', 'float'],
          taught: true,
        },
      ],
      'Python Programming',
    );
    expect(brief.topicSummary).toContain('Python Programming — Week 1: Variables & Data Types');

    const [sample] = parsePremadeQuestionsFromText(
      `1. Which type stores whole numbers?\nA) int\nB) str\nAnswer: A`,
    );
    const cbtQ = convertPremadeToCbtQuestion(sample);
    expect(cbtQ.correct_answer).toBe('int');
    const writtenQ = convertPremadeToWrittenQuestion(sample);
    expect(writtenQ.correct_answer).toBe('0');
  });
});
