import { describe, expect, it } from 'vitest';
import { programmeHasProtectedLearnerWork } from './programme-use';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

type QueryResult = { data?: unknown[] | null; count?: number | null; error?: { message: string } | null };

function database(results: Record<string, QueryResult>) {
  return {
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        or: () => chain,
        in: () => chain,
        then: (resolve: (value: QueryResult) => unknown) => Promise.resolve({
          data: [], count: 0, error: null, ...(results[table] ?? {}),
        }).then(resolve),
      };
      return chain;
    },
  };
}

describe('programme learner-work retention', () => {
  it('protects course-scoped submissions even when no class row survives', async () => {
    const db = database({
      classes: { data: [] },
      courses: { data: [{ id: 'course-1' }] },
      enrollments: { data: [] },
      assignments: { data: [{ id: 'assignment-1' }] },
      assignment_submissions: { data: [{ id: 'submission-1', submission_text: 'Learner work' }] },
    });

    await expect(programmeHasProtectedLearnerWork(db as any, 'program-1')).resolves.toBe(true);
  });

  it('protects written attempts linked through a programme assessment', async () => {
    const db = database({
      exams: { data: [{ id: 'exam-1' }] },
      exam_attempts: { count: 1 },
    });

    await expect(programmeHasProtectedLearnerWork(db as any, 'program-1')).resolves.toBe(true);
  });

  it('does not confuse empty assessment definitions with learner evidence', async () => {
    const db = database({
      assignments: { data: [{ id: 'assignment-1' }] },
      cbt_exams: { data: [{ id: 'cbt-1' }] },
      exams: { data: [{ id: 'exam-1' }] },
    });

    await expect(programmeHasProtectedLearnerWork(db as any, 'program-1')).resolves.toBe(false);
  });

  it('fails closed when any evidence source cannot be verified', async () => {
    const db = database({
      courses: { error: { message: 'database unavailable' } },
    });

    await expect(programmeHasProtectedLearnerWork(db as any, 'program-1'))
      .rejects.toMatchObject({ message: 'database unavailable' });
  });

  it('keeps application and database delete paths on the same retention policy', () => {
    const route = readFileSync(join(ROOT, 'app/api/programs/[id]/route.ts'), 'utf8');
    const migration = readFileSync(join(
      ROOT,
      '../supabase/migrations/20260929000107_protect_programmes_with_learner_evidence.sql',
    ), 'utf8');

    expect(route).toContain('hasLearnerWork = await programmeHasProtectedLearnerWork');
    expect(route).not.toContain('usage.classes > 0 && await programmeHasProtectedLearnerWork');
    expect(route).toContain('program.retire_after_delete_guard');
    expect(migration).toContain('PROTECTED_PROGRAMME_EVIDENCE');
    expect(migration).toContain('before delete on public.programs');
    expect(migration).toContain('public.exam_attempts');
    expect(migration).not.toContain('delete from public.assignment_submissions');
  });
});
