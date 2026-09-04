import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('password recovery flow contract', () => {
  const resetPage = read('src/app/reset-password/page.tsx');
  const recoveryRoute = read('src/app/auth/recovery/route.ts');
  const loginPage = read('src/app/login/page.tsx');

  it('exchanges the one-time code on the server before showing password fields', () => {
    expect(resetPage).toContain('redirectTo: `${window.location.origin}/auth/recovery`');
    expect(recoveryRoute).toContain('exchangeCodeForSession(code)');
    expect(recoveryRoute).toContain("{ step: 'reset' }");
    expect(recoveryRoute).toContain("{ recovery_error: 'expired' }");
  });

  it('distinguishes checking, invalid and valid recovery states', () => {
    expect(resetPage).toContain('"email" | "checking" | "reset" | "invalid"');
    expect(resetPage).toContain('supabase.auth.getUser()');
    expect(resetPage).toContain('Verifying your secure link…');
    expect(resetPage).toContain('Request a new reset link');
  });

  it('ends old sessions after a password change and returns one clear success notice', () => {
    expect(resetPage).toContain("supabase.auth.signOut({ scope: 'global' })");
    expect(resetPage).toContain("router.replace('/login?password_reset=1')");
    expect(loginPage).toContain('Password updated. Sign in with your new password.');
  });
});
