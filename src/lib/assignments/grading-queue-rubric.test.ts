import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const queue = readFileSync(join(ROOT, 'app/dashboard/grading/page.tsx'), 'utf8');

describe('unified grading queue rubric workflow', () => {
  it('calculates rubrics with the shared grading policy', () => {
    expect(queue).toContain("import { gradeAssignmentRubric } from '@/lib/assignments/grading'");
    expect(queue).toContain('gradeAssignmentRubric(rubric, activeRubricScores, maxPts)');
    expect(queue).toContain('gradeAssignmentRubric(rubric, scores, maxPoints)');
  });

  it('submits criterion evidence through the canonical grading adapter', () => {
    expect(queue).toContain('/api/grading/submissions/${id}');
    expect(queue).toContain('rubric_scores: scores');
    expect(queue).toContain('feedback: feedback[id] || null');
    expect(queue).toContain('expected_version: submissions.find');
    expect(queue).toContain('Save Rubric & Next');
  });

  it('keeps direct score entry for non-rubric assessments only', () => {
    expect(queue).toContain('isRubric ? (');
    expect(queue).toContain('Enter a score from 0 to {maxPts}.');
  });
});
