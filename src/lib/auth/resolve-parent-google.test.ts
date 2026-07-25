import { describe, expect, it, vi } from 'vitest';
import { resolveParentGoogleLogin } from './resolve-parent-google';

function mockAdmin(portal: Record<string, unknown> | null, opts?: { update?: ReturnType<typeof vi.fn> }) {
  const maybeSingle = async () => ({ data: portal, error: null });
  const eq = () => ({ maybeSingle, eq: () => ({ maybeSingle }) });
  const update = opts?.update ?? vi.fn(async () => ({ data: null, error: null }));
  return {
    from: () => ({
      select: () => ({
        eq,
      }),
      update: (patch: unknown) => {
        update(patch);
        return { eq: async () => ({ data: null, error: null }) };
      },
    }),
    _update: update,
  } as any;
}

describe('resolveParentGoogleLogin', () => {
  it('rejects missing email', async () => {
    const result = await resolveParentGoogleLogin(mockAdmin(null), { id: 'u1', email: null });
    expect(result.ok).toBe(false);
  });

  it('rejects unknown Google email', async () => {
    const result = await resolveParentGoogleLogin(mockAdmin(null), { id: 'u1', email: 'a@b.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/No Rillcod parent account/i);
  });

  it('rejects non-parent roles', async () => {
    const result = await resolveParentGoogleLogin(
      mockAdmin({
        id: 'u1',
        role: 'teacher',
        school_id: 's1',
        is_active: true,
        is_deleted: false,
        email: 'a@b.com',
        phone: '+2348012345678',
      }),
      { id: 'u1', email: 'a@b.com' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/teacher/i);
  });

  it('allows active parent with matching id, school, and phone', async () => {
    const result = await resolveParentGoogleLogin(
      mockAdmin({
        id: 'u1',
        role: 'parent',
        school_id: 's1',
        is_active: true,
        is_deleted: false,
        email: 'parent@school.com',
        full_name: 'Ada Parent',
        phone: '+2348012345678',
      }),
      { id: 'u1', email: 'parent@school.com' },
    );
    expect(result).toEqual({ ok: true, redirectTo: '/dashboard' });
  });

  it('routes to contact completion when phone is missing', async () => {
    const result = await resolveParentGoogleLogin(
      mockAdmin({
        id: 'u1',
        role: 'parent',
        school_id: 's1',
        is_active: true,
        is_deleted: false,
        email: 'parent@school.com',
        full_name: 'Ada Parent',
        phone: null,
      }),
      { id: 'u1', email: 'parent@school.com' },
      '/dashboard/parent-results',
    );
    expect(result).toEqual({
      ok: true,
      redirectTo: '/dashboard/profile?complete=contact&next=%2Fdashboard%2Fparent-results',
    });
  });

  it('backfills full_name from Google metadata when blank', async () => {
    const admin = mockAdmin({
      id: 'u1',
      role: 'parent',
      school_id: 's1',
      is_active: true,
      is_deleted: false,
      email: 'parent@school.com',
      full_name: '',
      phone: '+2348012345678',
    });
    const result = await resolveParentGoogleLogin(
      admin,
      {
        id: 'u1',
        email: 'parent@school.com',
        user_metadata: { full_name: 'Google Name' },
      },
    );
    expect(result).toEqual({ ok: true, redirectTo: '/dashboard' });
    expect(admin._update).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: 'Google Name' }),
    );
  });
});
