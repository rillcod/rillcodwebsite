import { describe, expect, it } from 'vitest';
import { resolveOptedInUsers } from './opt-in';

type Row = Record<string, unknown>;

/**
 * Minimal PostgREST-shaped stub: supports the chained calls resolveOptedInUsers makes
 * and resolves to { data, error } from `range()`.
 */
function stubDb(tables: {
  portal_users: Row[];
  notification_preferences: Row[];
  failOn?: 'portal_users' | 'notification_preferences';
}) {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      const builder: any = {
        select: () => builder,
        order: () => builder,
        eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return builder; },
        neq: (col: string, val: unknown) => { filters.push((r) => r[col] !== val); return builder; },
        range: (from: number, to: number) => {
          if (tables.failOn === table) {
            return Promise.resolve({ data: null, error: { message: `${table} exploded` } });
          }
          const source = (tables as any)[table] as Row[];
          const rows = source.filter((r) => filters.every((f) => f(r)));
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
      return builder;
    },
  } as any;
}

const student = (id: string, extra: Row = {}): Row => ({
  id, full_name: `Student ${id}`, email: `${id}@example.com`,
  role: 'student', is_active: true, is_deleted: false, ...extra,
});

describe('resolveOptedInUsers', () => {
  it('treats a missing preferences row as opted IN', async () => {
    // This is the whole bug: notification_preferences was empty, so the old
    // `.eq('streak_reminder', true)` filter matched nobody.
    const db = stubDb({ portal_users: [student('a'), student('b')], notification_preferences: [] });
    const result = await resolveOptedInUsers(db, { role: 'student', prefKey: 'streak_reminder' });
    expect(result.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('excludes only users who explicitly set the category to false', async () => {
    const db = stubDb({
      portal_users: [student('a'), student('b'), student('c')],
      notification_preferences: [{ portal_user_id: 'b', streak_reminder: false }],
    });
    const result = await resolveOptedInUsers(db, { role: 'student', prefKey: 'streak_reminder' });
    expect(result.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('keeps a user who opted out of a DIFFERENT category', async () => {
    const db = stubDb({
      portal_users: [student('a')],
      // Row exists but only weekly_summary is off; streak_reminder was never declined.
      notification_preferences: [{ portal_user_id: 'a', weekly_summary: false }],
    });
    const result = await resolveOptedInUsers(db, { role: 'student', prefKey: 'streak_reminder' });
    expect(result.map((r) => r.id)).toEqual(['a']);
  });

  it('ignores inactive and soft-deleted accounts', async () => {
    const db = stubDb({
      portal_users: [
        student('live'),
        student('off', { is_active: false }),
        student('gone', { is_deleted: true }),
      ],
      notification_preferences: [],
    });
    const result = await resolveOptedInUsers(db, { role: 'student', prefKey: 'streak_reminder' });
    expect(result.map((r) => r.id)).toEqual(['live']);
  });

  it('scopes to the requested role', async () => {
    const db = stubDb({
      portal_users: [
        student('kid'),
        { id: 'mum', full_name: 'Mum', email: 'm@x.com', role: 'parent', is_active: true, is_deleted: false },
      ],
      notification_preferences: [],
    });
    const parents = await resolveOptedInUsers(db, { role: 'parent', prefKey: 'weekly_summary' });
    expect(parents.map((r) => r.id)).toEqual(['mum']);
  });

  it('throws rather than silently returning an empty audience when the read fails', async () => {
    // A swallowed error here would look exactly like "nobody is subscribed", which is how
    // this went unnoticed. Callers turn the throw into a 503.
    const db = stubDb({ portal_users: [student('a')], notification_preferences: [], failOn: 'portal_users' });
    await expect(resolveOptedInUsers(db, { role: 'student', prefKey: 'streak_reminder' }))
      .rejects.toThrow(/Could not load student accounts/);
  });

  it('throws when the preferences read fails, so opt-outs are never ignored', async () => {
    const db = stubDb({
      portal_users: [student('a')],
      notification_preferences: [{ portal_user_id: 'a', streak_reminder: false }],
      failOn: 'notification_preferences',
    });
    await expect(resolveOptedInUsers(db, { role: 'student', prefKey: 'streak_reminder' }))
      .rejects.toThrow(/Could not load notification preferences/);
  });
});
