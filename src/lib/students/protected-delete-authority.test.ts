import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('protected deletion authority', () => {
  it('keeps destructive school RPCs away from public browser roles and guards protected evidence', () => {
    const migration = source('supabase/migrations/20260929000091_protect_school_and_learner_evidence_from_hard_delete.sql');

    expect(migration).toContain('revoke all on function public.hard_delete_school(uuid) from public, anon, authenticated');
    expect(migration).toContain('revoke all on function public.hard_delete_portal_user(uuid) from public, anon, authenticated');
    expect(migration).toContain('PROTECTED_RECORDS_PRESENT');
    expect(migration).toContain('submission.grading_mode');
    expect(migration).toContain('payment_transactions');
    expect(migration).toContain('consent_responses');
  });

  it('checks protected records before deleting any school cloud objects', () => {
    const route = source('src/app/api/schools/[id]/wipe/route.ts');
    const post = route.slice(route.indexOf('export async function POST'));

    expect(post.indexOf('loadProtectedEvidence(admin, id)')).toBeGreaterThanOrEqual(0);
    expect(post.indexOf("code: 'PROTECTED_RECORDS_PRESENT'")).toBeGreaterThanOrEqual(0);
    expect(post.indexOf('loadProtectedEvidence(admin, id)')).toBeLessThan(post.indexOf('r2Delete(key)'));
    expect(post.indexOf("rpc('hard_delete_school'")).toBeGreaterThan(post.indexOf('r2Delete(key)'));
  });

  it('routes individual and legacy submission deletion through protected server commands', () => {
    const studentRoute = source('src/app/api/students/[id]/route.ts');
    const dashboardService = source('src/services/dashboard.service.ts');

    expect(studentRoute).toContain('wipePortalUserCascade');
    expect(studentRoute).toContain("code: 'PROTECTED_ACADEMIC_EVIDENCE'");
    expect(studentRoute).not.toContain("rpc('hard_delete_portal_user'");
    expect(dashboardService).toContain('/api/assignment-submissions/');
    expect(dashboardService).not.toMatch(/from\(['"]assignment_submissions['"]\)\s*\.delete\(/);
  });
});
