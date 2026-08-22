import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isAutoGradableAssignmentQuestion } from './grading';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const collectionRoute = readFileSync(join(ROOT, 'app/api/assignments/route.ts'), 'utf8');
const itemRoute = readFileSync(join(ROOT, 'app/api/assignments/[id]/route.ts'), 'utf8');

describe('central assignment grading-mode policy', () => {
  it('recognizes every objective question type supported by the grader', () => {
    for (const question_type of ['multiple_choice', 'true_false', 'fill_blank', 'coding_blocks', 'block_sequence']) {
      expect(isAutoGradableAssignmentQuestion({ id: question_type, question_type, correct_answer: 'answer' })).toBe(true);
    }
    expect(isAutoGradableAssignmentQuestion({ id: 'essay', question_type: 'essay', correct_answer: 'model answer' })).toBe(false);
    expect(isAutoGradableAssignmentQuestion({ id: 'missing-key', question_type: 'multiple_choice', correct_answer: '' })).toBe(false);
  });

  it('uses that shared policy for both creation and editing', () => {
    for (const source of [collectionRoute, itemRoute]) {
      expect(source).toContain('questions.every(isAutoGradableAssignmentQuestion)');
      expect(source).toContain("? 'auto'");
      expect(source).toContain(": 'manual'");
      expect(source).not.toContain('const autoTypes = new Set');
    }
  });

  it('applies the same bounded assignment weight validation to create and edit', () => {
    for (const source of [collectionRoute, itemRoute]) {
      expect(source).toContain('weight < 0 || weight > 100');
      expect(source).toContain('weight must be between 0 and 100');
    }
  });
});
