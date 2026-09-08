import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const detail = readFileSync(join(ROOT, 'app/dashboard/assignments/[id]/page.tsx'), 'utf8');

describe('learner assignment submission feedback', () => {
  it('uses the existing score-protection rule before offering edits', () => {
    expect(detail).toContain('if (hasProtectedAssignmentScoreEvidence(submission))');
    expect(detail).toContain('!hasProtectedAssignmentScoreEvidence(submission)');
    expect(detail).toContain('!isGraded && submission.feedback');
    expect(detail).toContain("learnerSubmissionState(submission.status) === 'review'");
    expect(detail).toContain('learnerSubmissionLabel(submission.status)');
  });
  it('uses the authoritative server result in the learner receipt', () => {
    expect(detail).toContain("submission?.status === 'graded' && submission?.grade != null");
    expect(detail).toContain('Your score: ${submission.grade}');
    expect(detail).toContain('Waiting for teacher feedback.');
    expect(detail).not.toContain('graded by the assessment engine');
    expect(detail).not.toContain('work is in the teacher review queue');
  });

  it('makes local draft protection failures visible without implying server loss', () => {
    expect(detail).toContain('Your draft is not saving. Keep this page open until you submit.');
    expect(detail).toContain('Your submitted work is safe.');
    expect(detail).toContain('Work submitted. An older draft may still appear on this device.');
    expect(detail).toContain('Dismiss draft warning');
  });
});
