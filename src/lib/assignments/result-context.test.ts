import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => readFileSync(join(ROOT, relativePath), 'utf8');

describe('assignment result context', () => {
  it('requires a traceable class for official work and stamps the result decision', () => {
    const collection = read('app/api/assignments/route.ts');

    expect(collection).toContain("code: 'CLASS_REQUIRED_FOR_RESULT'");
    expect(collection).toContain("code: 'CLASS_ACADEMIC_CONTEXT_INCOMPLETE'");
    expect(collection).toContain("assessment_scope: assessmentScope");
    expect(collection).toContain("result_eligible: assessmentScope === 'class_result'");
    expect(collection).toContain('You can only use lesson plans for classes you own');
  });

  it('allows only a compatible null-to-class recovery without reopening marks', () => {
    const item = read('app/api/assignments/[id]/route.ts');

    expect(item).toContain('const isClassRecovery = !existing.class_id && !!requestedClassId');
    expect(item).toContain("!(field === 'class_id' && isClassRecovery)");
    expect(item).toContain("code: 'CLASS_CONTEXT_MISMATCH'");
    expect(item).toContain("code: 'CLASS_ACADEMIC_CONTEXT_INCOMPLETE'");
    expect(item).toContain("assessment_scope: 'class_result'");
    expect(item).toContain('hasProtectedAssignmentScoreEvidence');
  });

  it('preserves practice submissions while excluding them from automatic results', () => {
    const migration = read('../supabase/migrations/20260929000105_keep_practice_assignments_out_of_results.sql');

    expect(migration).toContain('zz_apply_assignment_result_eligibility');
    expect(migration).toContain("then 'recorded'");
    expect(migration).toContain("metadata ->> 'result_eligible' = 'false'");
    expect(migration).not.toContain('delete from public.assignment_submissions');
    expect(migration).not.toContain('raw_score =');
  });

  it('gives staff an explicit creation and legacy resolution workflow', () => {
    const creator = read('app/dashboard/assignments/new/page.tsx');
    const editor = read('app/dashboard/assignments/[id]/edit/page.tsx');
    const list = read('app/dashboard/assignments/page.tsx');

    expect(creator).toContain('Where should this work be used?');
    expect(creator).toContain('Practice only');
    expect(editor).toContain('Keep as practice only');
    expect(editor).toContain('It never changes a learner submission, score, feedback, or moderation decision.');
    expect(list).toContain('Resolve result use');
  });
});
