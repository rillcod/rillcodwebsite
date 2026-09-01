import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const project = readFileSync(join(ROOT, 'app/dashboard/projects/[id]/page.tsx'), 'utf8');
const createProject = readFileSync(join(ROOT, 'app/dashboard/projects/new/page.tsx'), 'utf8');
const submitRoute = readFileSync(join(ROOT, 'app/api/assignments/[id]/submit/route.ts'), 'utf8');

describe('project submission and grading integrity', () => {
  it('never lets the student submission handler call the staff grading endpoint', () => {
    const submitHandler = project.slice(
      project.indexOf('async function handleSubmit'),
      project.indexOf('// ── Teacher grade'),
    );

    expect(submitHandler).toContain('/submit`');
    expect(submitHandler).not.toContain('/grade`');
    expect(submitHandler).toContain("j.data?.status === 'graded'");
    expect(submitHandler).toContain("j.data?.status === 'pending_review'");
  });

  it('keeps completeness guidance separate from an academic score', () => {
    expect(project).toContain('Submission readiness');
    expect(project).toContain('This is not a grade.');
    expect(project).not.toContain('Auto-Grade Preview');
    expect(project).not.toContain('Submitted & auto-graded');
    expect(createProject).toContain('Guided Teacher Review');
    expect(createProject).toContain("grading_mode: 'manual'");
    expect(createProject).toContain("submission_readiness: gradingMode === 'guided'");
  });

  it('stores rubrics using the canonical grading canvas field names', () => {
    expect(createProject).toContain('criterion: criterion.name');
    expect(createProject).toContain('description: criterion.desc');
    expect(createProject).toContain('maxPoints: criterion.maxPts');
    expect(project).toContain('gradeAssignmentRubric(rubric, rubricScores, max)');
    expect(project).toContain('payload.rubric_scores = rubricScores');
    expect(project).toContain('/api/assignment-submissions/${sub.id}');
  });

  it('leaves authoritative objective auto-grading on the canonical server route', () => {
    expect(submitRoute).toContain("gradingMode === 'auto'");
    expect(submitRoute).toContain('gradeAssignmentAnswers(questions, answers, maxPts)');
    expect(submitRoute).toContain("status: 'pending_review'");
  });

  it('uses the same verified upload receipts as ordinary assignments', () => {
    expect(project).toContain("fetch('/api/files/upload'");
    expect(project).toContain('payload.data?.receipt as UploadReceipt');
    expect(project).toContain('attachments: fUrl && fileAttachment');
    expect(project).toContain('snapshots: types.includes(\'screenshot\') && screenshotAttachment');
    expect(project).toContain('SubmissionAttachmentCard');
    expect(project).not.toContain('📎 File URL');
    expect(project).not.toContain('🖼️ Screenshot URL');
  });
});
