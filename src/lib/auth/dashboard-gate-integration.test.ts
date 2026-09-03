import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('central dashboard account gate', () => {
  it('uses the Next 16 proxy convention and a signed short-lived profile snapshot', () => {
    expect(() => read('src/middleware.ts')).toThrow();
    const proxy = read('src/proxy.ts');
    expect(proxy).toContain('export async function proxy');
    expect(proxy).toContain('verifyDashboardGateToken');
    expect(proxy).toContain(".select('role,is_active,is_deleted')");
    expect(proxy).toContain('if (profileError) return getResponse()');
  });

  it('keeps deleted-account handling aligned across login, profile and sign-out', () => {
    expect(read('src/app/api/auth/me/route.ts')).toContain('role, is_active, is_deleted');
    const login = read('src/app/login/page.tsx');
    expect(login).toContain('!profileData.is_active || profileData.is_deleted');
    expect(login).toContain('if (profileMissing || accountInactive)');
    expect(login).toContain("supabase.auth.signOut({ scope: 'global' })");
    expect(read('src/components/layout/DashboardAccessGuard.tsx')).toContain('profile.is_deleted === true');
    expect(read('src/app/api/auth/signout/route.ts')).toContain('DASHBOARD_GATE_COOKIE');
  });
});
