import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => readFileSync(join(ROOT, relativePath), 'utf8');

describe('written exam result context', () => {
  it('requires a verified class for official papers and stamps the central lineage', () => {
    const collection = read('app/api/exams/route.ts');

    expect(collection).toContain("code: 'CLASS_REQUIRED_FOR_RESULT'");
    expect(collection).toContain("code: 'CLASS_ACADEMIC_CONTEXT_INCOMPLETE'");
    expect(collection).toContain("assessment_scope: assessmentScope");
    expect(collection).toContain("result_eligible: assessmentScope === 'class_result'");
    expect(collection).toContain('You can only create written exams for classes you own.');
  });

  it('uses one learner gate at list, detail and start boundaries', () => {
    const collection = read('app/api/exams/route.ts');
    const item = read('app/api/exams/[id]/route.ts');
    const start = read('app/api/exams/[id]/start/route.ts');

    for (const source of [collection, item, start]) {
      expect(source).toContain('assessmentVisibleToStudent');
    }
    expect(item).toContain('!exam.is_active');
  });

  it('allows a compatible context recovery without reopening protected attempts', () => {
    const item = read('app/api/exams/[id]/route.ts');

    expect(item).toContain('const isClassRecovery = !existing.class_id && !!requestedClassId');
    expect(item).toContain("code: 'CLASS_CONTEXT_MISMATCH'");
    expect(item).toContain("code: 'PROTECTED_ACADEMIC_EVIDENCE'");
    expect(item).toContain("assessment_scope: assessmentScope");
  });

  it('preserves practice and unresolved attempts outside automatic results', () => {
    const migration = read('../supabase/migrations/20260929000106_keep_practice_written_exams_out_of_results.sql');

    expect(migration).toContain('zzz_apply_written_exam_result_eligibility');
    expect(migration).toContain("then 'recorded'");
    expect(migration).toContain("metadata ->> 'result_eligible'");
    expect(migration).toContain("new.moderation_status = 'approved'");
    expect(migration).not.toContain('delete from public.exam_attempts');
    expect(migration).not.toContain('raw_score =');
  });

  it('gives staff explicit creation and recovery controls', () => {
    const creator = read('app/dashboard/exams/new/page.tsx');
    const editor = read('app/dashboard/exams/[id]/edit/page.tsx');
    const list = read('app/dashboard/exams/page.tsx');

    expect(creator).toContain('Where should this exam be used?');
    expect(creator).toContain('Practice only');
    expect(editor).toContain('Keep as practice only');
    expect(editor).toContain('without changing an answer, score, feedback or moderation decision');
    expect(list).toContain('Resolve result use');
  });
});
