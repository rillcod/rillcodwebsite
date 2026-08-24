import { describe, expect, it } from 'vitest';
import { requireActiveParent } from './access';

function authClient(user: { id: string } | null, error: unknown = null) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error }),
    },
  } as any;
}

function profileClient(profile: Record<string, unknown> | null, error: unknown = null) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: profile, error }),
  };
  return { from: () => query } as any;
}

describe('canonical parent entrance gate', () => {
  it('asks an anonymous visitor to sign in', async () => {
    const result = await requireActiveParent(authClient(null), profileClient(null));

    expect(result).toMatchObject({ ok: false, code: 'authentication_required', status: 401 });
  });

  it('does not allow a different role through a parent endpoint', async () => {
    const result = await requireActiveParent(
      authClient({ id: 'teacher-1' }),
      profileClient({ id: 'teacher-1', role: 'teacher', is_active: true, is_deleted: false }),
    );

    expect(result).toMatchObject({ ok: false, code: 'parent_required', status: 403 });
  });

  it.each([
    { is_active: false, is_deleted: false },
    { is_active: true, is_deleted: true },
  ])('blocks an inactive or deleted parent profile: %o', async (accountState) => {
    const result = await requireActiveParent(
      authClient({ id: 'parent-1' }),
      profileClient({ id: 'parent-1', role: 'parent', ...accountState }),
    );

    expect(result).toMatchObject({ ok: false, code: 'account_inactive', status: 403 });
  });

  it('returns the one verified parent identity used by downstream ownership checks', async () => {
    const result = await requireActiveParent(
      authClient({ id: 'parent-1' }),
      profileClient({
        id: 'parent-1',
        role: 'parent',
        email: 'parent@example.com',
        full_name: 'Verified Parent',
        is_active: true,
        is_deleted: false,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      profile: { id: 'parent-1', role: 'parent', email: 'parent@example.com' },
    });
  });
});
