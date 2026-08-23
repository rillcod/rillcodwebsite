import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('lesson-plan cleanup retention contract', () => {
  it('uses the atomic evidence-preserving database path first', () => {
    const route = read('src/app/api/lesson-plans/[id]/route.ts');
    expect(route).toContain("rpc('delete_lesson_plan_preserving_learner_work'");
    expect(route).toContain('preserved_learner_assignments');
    expect(route).toContain('preserved_written_exams');
    expect(route).toContain('preserved_cbt_exams');
  });

  it('detaches assessments with attempts and deletes only unused drafts in one transaction', () => {
    const migration = read('supabase/migrations/20260929000100_delete_lesson_plan_preserve_learner_work.sql');
    expect(migration).toContain('exists (select 1 from public.assignment_submissions');
    expect(migration).toContain('exists (select 1 from public.exam_attempts');
    expect(migration).toContain('exists (select 1 from public.cbt_sessions');
    expect(migration).toContain("metadata=coalesce(metadata,'{}'::jsonb)-'lesson_plan_id'");
    expect(migration).toContain('delete from public.lesson_plans where id=p_plan_id');
    expect(migration).not.toContain('delete from public.assignment_submissions');
    expect(migration).not.toContain('delete from public.exam_attempts');
    expect(migration).not.toContain('delete from public.cbt_sessions');
  });
});
