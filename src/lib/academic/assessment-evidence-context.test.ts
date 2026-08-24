import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => readFileSync(join(ROOT, relativePath), 'utf8');

describe('durable academic assessment evidence context', () => {
  it('refreshes the full lineage for every evidence source and excludes practice from results', () => {
    const migration = read('../supabase/migrations/20260929000104_make_assessment_evidence_context_durable.sql');

    expect(migration).toContain("elsif tg_table_name = 'cbt_sessions'");
    expect(migration).toContain("elsif tg_table_name = 'exam_attempts'");
    expect(migration).toContain('academic_offering_id = excluded.academic_offering_id');
    expect(migration).toContain('offering_period_id = excluded.offering_period_id');
    expect(migration).toContain("coalesce(v_cbt.metadata ->> 'result_eligible', 'true') = 'false'");
    expect(migration).toContain("then 'recorded'");
  });

  it('propagates parent context repairs without modifying learner work', () => {
    const migration = read('../supabase/migrations/20260929000104_make_assessment_evidence_context_durable.sql');
    const parentRefresh = migration.slice(
      migration.indexOf('create or replace function public.refresh_assessment_evidence_parent_context()'),
      migration.indexOf('drop trigger if exists refresh_assignment_evidence_parent_context'),
    );

    expect(parentRefresh).toContain('class_id = new.class_id');
    expect(parentRefresh).toContain('academic_offering_id = new.academic_offering_id');
    expect(parentRefresh).toContain('offering_period_id = new.offering_period_id');
    expect(parentRefresh).not.toContain('raw_score =');
    expect(parentRefresh).not.toContain('maximum_score =');
    expect(parentRefresh).not.toContain('evidence_snapshot =');
  });

  it('makes result eligibility explicit and provides a guarded legacy recovery path', () => {
    const createApi = read('app/api/cbt/exams/route.ts');
    const updateApi = read('app/api/cbt/exams/[id]/route.ts');
    const creator = read('app/dashboard/cbt/new/page.tsx');
    const editor = read('app/dashboard/cbt/[id]/edit/page.tsx');

    expect(createApi).toContain("code: 'CLASS_REQUIRED_FOR_RESULT'");
    expect(createApi).toContain("code: 'CLASS_ACADEMIC_CONTEXT_INCOMPLETE'");
    expect(createApi).toContain("baseMeta.result_eligible = assessmentScope === 'class_result'");
    expect(updateApi).toContain("code: 'CLASS_CONTEXT_MISMATCH'");
    expect(updateApi).toContain("code: 'PROTECTED_ACADEMIC_EVIDENCE'");
    expect(updateApi).toContain("assessment_scope: 'class_result'");
    expect(creator).toContain('Where should this assessment be used?');
    expect(creator).toContain('Practice only');
    expect(editor).toContain('Keep as practice only');
    expect(editor).toContain('Linking repairs context only. It does not recalculate, replace or delete any learner mark.');
  });

  it('keeps the production audit aggregate-only', () => {
    const audit = read('../scripts/audit-academic-evidence-context.ts');
    const queriedColumns = [...audit.matchAll(/all\('[^']+', '([^']+)'\)/g)]
      .map(match => match[1])
      .join(',');
    const unsafeSelects = ['full_name', 'email', 'answers', 'feedback', 'raw_score', 'percentage'];

    expect(audit).toContain('aggregate only');
    expect(audit).toContain('Practice-only evidence by type');
    expect(audit).toContain('Unresolved result evidence by type');
    for (const unsafe of unsafeSelects) expect(queriedColumns).not.toContain(unsafe);
  });
});
