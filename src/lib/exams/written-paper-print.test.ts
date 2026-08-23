import { describe, expect, it } from 'vitest';
import { buildWrittenPaperHtml } from './written-paper-print';

const exam = {
  id: 'exam-1',
  title: 'Term <One> Examination',
  description: 'Answer carefully',
  duration_minutes: 60,
  passing_score: 50,
  max_attempts: 1,
  courses: { title: 'Mathematics' },
};
const questions = [{
  id: 'q1',
  question_text: 'What is 2 < 3?',
  question_type: 'multiple_choice',
  points: 2,
  options: ['Yes', 'No'],
  correct_answer: 'Yes',
  explanation: 'Two is smaller',
}];

describe('written paper output', () => {
  it('never puts answer evidence in the candidate copy', () => {
    const html = buildWrittenPaperHtml({ exam, questions, copy: 'candidate', reference: 'WRT-1', generatedAt: new Date('2026-08-23T00:00:00Z') });
    expect(html).toContain('Candidate copy');
    expect(html).not.toContain('Marking guide');
    expect(html).not.toContain('Two is smaller');
    expect(html).not.toContain('Teacher copy · confidential');
  });

  it('puts answer evidence only in a clearly confidential teacher page', () => {
    const html = buildWrittenPaperHtml({ exam, questions, copy: 'teacher', reference: 'WRT-2', generatedAt: new Date('2026-08-23T00:00:00Z') });
    expect(html).toContain('Teacher copy · confidential');
    expect(html).toContain('Marking guide');
    expect(html).toContain('Two is smaller');
  });

  it('escapes question and exam content before writing a printable document', () => {
    const html = buildWrittenPaperHtml({ exam, questions, copy: 'candidate', reference: 'WRT-3' });
    expect(html).toContain('Term &lt;One&gt; Examination');
    expect(html).toContain('What is 2 &lt; 3?');
    expect(html).not.toContain('What is 2 < 3?');
  });
});
