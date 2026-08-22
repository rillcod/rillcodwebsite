import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('child-scoped parent consent', () => {
  const migration = read('supabase/migrations/20260929000092_scope_consent_signatures_to_children.sql');
  const signRoute = read('src/app/api/consent-forms/[id]/sign/route.ts');
  const accessAuthority = read('src/lib/consent/result-access.ts');
  const parentPage = read('src/app/dashboard/consent-forms/page.tsx');

  it('allows one durable response per parent, form and linked child', () => {
    expect(migration).toContain('add column if not exists student_id uuid');
    expect(migration).toContain('uq_consent_responses_child');
    expect(migration).toContain('(form_id, parent_id, student_id)');
    expect(migration).toContain('guard_consent_response_child_link');
    expect(migration).toContain('parent_student_links');
  });

  it('removes anonymous table access while keeping signed-in parent inserts', () => {
    expect(migration).toContain('revoke all on table public.consent_responses from anon');
    expect(migration).toContain('revoke all on table public.consent_responses from authenticated');
    expect(migration).toContain('grant select, insert on table public.consent_responses to authenticated');
  });

  it('resolves the submitted child and preserves safe migration ordering', () => {
    expect(signRoute).toContain("from('parent_student_links')");
    expect(signRoute).toContain('student_id: studentId');
    expect(signRoute).toContain("error?.code === '42703'");
    expect(accessAuthority).toContain("response.student_id === studentRowId || response.student_id == null");
  });

  it('does not prevent a multi-child parent from opening the form again', () => {
    expect(parentPage).toContain('Add another child response');
    expect(parentPage).toContain('Submit for another child');
  });
});
