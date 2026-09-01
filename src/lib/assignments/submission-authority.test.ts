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
    const gradeAliasRoute = read('src/app/api/assignments/[id]/grade/route.ts');

    expect(learnerRoute).toContain('hasProtectedAssignmentScoreEvidence(existingSub)');
    expect(learnerRoute).toContain(".eq('version', existingSub.version)");
    expect(learnerRoute).not.toContain('.upsert(upsertData');
    expect(gradingRoute).toContain('buildAssignmentGradeTransition');
    expect(gradingRoute).toContain('callerCanManageAssignmentWork');
    expect(gradeAliasRoute).toContain('forwardToCanonicalSubmissionReview');
    expect(gradeAliasRoute).toContain('submitted_at:    null');
    expect(gradeAliasRoute).toContain("source: 'staff_recorded_without_portal_submission'");
    expect(gradeAliasRoute).not.toContain('upsert(insertPayload');
  });

  it('fails closed on missing review-safety columns instead of silently dropping them', () => {
    const gradingRoute = read('src/app/api/assignment-submissions/[id]/route.ts');
    const writtenService = read('src/services/grading.service.ts');

    expect(gradingRoute).toContain("code: 'ACADEMIC_REVIEW_SCHEMA_REQUIRED'");
    expect(gradingRoute).not.toContain('delete allowed.status_changed_by');
    expect(writtenService).toContain("{ code: 'ACADEMIC_REVIEW_SCHEMA_REQUIRED' }");
    expect(writtenService).not.toContain('updateResult = await runUpdate(updateFields, null)');
  });

  it('does not let delayed automation overwrite a newer learner or teacher review', () => {
    const learnerRoute = read('src/app/api/assignments/[id]/submit/route.ts');
    const aiRoute = read('src/app/api/assignments/[id]/ai-grade/route.ts');

    expect(learnerRoute).toContain(".eq('version', data.version)");
    expect(learnerRoute).toContain(".is('grade', null)");
    expect(learnerRoute).not.toContain("grade: null,\n              weighted_score: null");
    expect(aiRoute).toContain(".eq('version', sub.version)");
    expect(aiRoute).toContain('skipped_newer_review_preserved');
  });

  it('sends the loaded review version from every teacher grading surface', () => {
    const canonical = read('src/app/api/assignment-submissions/[id]/route.ts');
    const queue = read('src/app/dashboard/grading/page.tsx');
    const assignment = read('src/app/dashboard/assignments/[id]/page.tsx');
    const project = read('src/app/dashboard/projects/[id]/page.tsx');
    const grades = read('src/app/dashboard/grades/page.tsx');
    const klass = read('src/app/dashboard/classes/[id]/page.tsx');

    expect(canonical).toContain("code: 'REVIEW_VERSION_REQUIRED'");
    for (const surface of [queue, assignment, project, grades, klass]) {
      expect(surface).toContain('expected_version');
    }
  });

  it('enforces physical score ranges in the database without rewriting historical marks', () => {
    const migration = read('supabase/migrations/20260929000110_harden_academic_score_writes.sql');

    expect(migration).toContain('cbt_sessions_score_range');
    expect(migration).toContain('exam_attempts_percentage_range');
    expect(migration).toContain('validate_assignment_submission_grade_ceiling');
    expect(migration).toContain('not valid');
    expect(migration).not.toMatch(/update\s+public\.(cbt_sessions|assignment_submissions|exam_attempts)\s+set/i);
  });

  it('binds new submission files to durable upload receipts while preserving historical evidence', () => {
    const learnerRoute = read('src/app/api/assignments/[id]/submit/route.ts');
    const uploadRoute = read('src/app/api/files/upload/route.ts');
    const filesService = read('src/services/files.service.ts');
    const assignmentPage = read('src/app/dashboard/assignments/[id]/page.tsx');

    expect(uploadRoute).toContain('validateAllowedUploadSignature');
    expect(uploadRoute).toContain('buildUploadReceipt(fileData)');
    expect(assignmentPage).toContain('attachmentFromUpload');
    expect(learnerRoute).toContain('receiptMatchesStoredFile');
    expect(learnerRoute).toContain("byPath.get(mediaStoragePath(url) ?? '')");
    expect(learnerRoute).toContain("code: 'UPLOAD_RECEIPT_REQUIRED'");
    expect(learnerRoute).toContain("integrity_status: 'legacy_preserved'");
    expect(filesService).not.toContain("virus_scan_result: 'clean'");
    expect(filesService).toContain("virus_scan_result: 'pending_external_scan'");
  });
});
