import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('assignment submission mutation authority', () => {
  it('removes the unused parallel assignment service', () => {
    expect(existsSync(join(process.cwd(), 'src/services/assignments.service.ts'))).toBe(false);
  });

  it('keeps the dashboard service read-oriented and routes cleanup to the protected API', () => {
    const dashboard = read('src/services/dashboard.service.ts');
    const submissionSection = dashboard.slice(dashboard.indexOf('export async function fetchSubmissionsForGrading'));
    const compact = submissionSection.replace(/\s+/g, '');

    expect(compact).not.toContain(".from('assignment_submissions').update(");
    expect(compact).not.toContain(".from('assignment_submissions').upsert(");
    expect(submissionSection).toContain('/api/assignment-submissions/');
  });

  it('enforces the shared review lifecycle and monotonic versions in the database', () => {
    const migration = read('supabase/migrations/20260929000093_unify_submission_review_lifecycle.sql');

    expect(migration).toContain("'returned_for_revision', 'resubmitted', 'graded', 'moderated'");
    expect(migration).toContain('guard_assignment_submission_transition');
    expect(migration).toContain('new.version := old.version + 1');
    expect(migration).toContain("Invalid submission transition from % to %");
  });

  it('keeps learner and teacher writes behind their scoped server routes', () => {
    const learnerRoute = read('src/app/api/assignments/[id]/submit/route.ts');
    const gradingRoute = read('src/app/api/assignment-submissions/[id]/route.ts');

    expect(learnerRoute).toContain('hasProtectedAssignmentScoreEvidence(existingSub)');
    expect(gradingRoute).toContain('buildAssignmentGradeTransition');
    expect(gradingRoute).toContain('callerCanManageAssignmentWork');
  });
});
