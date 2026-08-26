import { describe, expect, it, vi } from 'vitest';
import {
  deliverNotificationsOnce,
  notificationKey,
  stampNotifications,
} from './deliver-once';

/**
 * The property under test is "a family is not told the same thing twice".
 *
 * These notifications land in a parent's inbox. A cron that re-fires, or a
 * sweep that re-examines the same rows tomorrow, must not repeat an invoice
 * reminder or a published report — while a genuine second event still must
 * come through.
 */

function fakeDb(behaviour: {
  returns?: Array<Array<{ user_id: string }>>;
  error?: string;
}) {
  const calls: any[][] = [];
  let call = 0;
  const db = {
    from: () => ({
      upsert: (rows: any[], opts: any) => {
        calls.push(rows);
        const result = behaviour.error
          ? { data: null, error: { message: behaviour.error } }
          : { data: behaviour.returns?.[call] ?? rows.map((r) => ({ user_id: r.user_id })), error: null };
        call += 1;
        return { select: () => result, ...result, opts };
      },
    }),
  };
  return { db, calls };
}

describe('the key', () => {
  it('is stable for the same event and recipient', () => {
    const source = { sourceType: 'invoice_reminder', sourceId: 'inv-1', version: '2026-08' };
    expect(notificationKey(source, 'user-1')).toBe(notificationKey(source, 'user-1'));
  });

  it('separates recipients, so one parent being told does not silence another', () => {
    const source = { sourceType: 'invoice_reminder', sourceId: 'inv-1' };
    expect(notificationKey(source, 'user-1')).not.toBe(notificationKey(source, 'user-2'));
  });

  it('lets a genuine repeat through via the version', () => {
    // Re-publishing a report should notify again; a retry of the same
    // publication should not.
    const base = { sourceType: 'report_published', sourceId: 'rep-1' };
    expect(notificationKey({ ...base, version: 'v1' }, 'u1')).not.toBe(
      notificationKey({ ...base, version: 'v2' }, 'u1'),
    );
  });

  it('defaults to notify-at-most-once when no version is given', () => {
    const a = notificationKey({ sourceType: 'welcome', sourceId: 's-1' }, 'u1');
    const b = notificationKey({ sourceType: 'welcome', sourceId: 's-1' }, 'u1');
    expect(a).toBe(b);
    expect(a.endsWith(':once')).toBe(true);
  });

  it('cannot be shifted by a value containing a colon', () => {
    // Without stripping, sourceId 'a:b' + user 'c' would collide with
    // sourceId 'a' + user 'b:c'.
    const one = notificationKey({ sourceType: 't', sourceId: 'a:b' }, 'c');
    const two = notificationKey({ sourceType: 't', sourceId: 'a' }, 'b:c');
    expect(one).not.toBe(two);
  });

  it('never produces an empty part', () => {
    const key = notificationKey({ sourceType: '', sourceId: '' }, '');
    expect(key.split(':').every((part) => part.length > 0)).toBe(true);
  });
});

describe('stamping rows', () => {
  it('adds source and key without disturbing the row', () => {
    const [row] = stampNotifications(
      [{ user_id: 'u1', title: 'Hello', message: 'Body' }],
      { sourceType: 'welcome', sourceId: 's1' },
    );
    expect(row.title).toBe('Hello');
    expect(row.source_type).toBe('welcome');
    expect(row.source_id).toBe('s1');
    expect(row.idempotency_key).toContain('welcome:s1:u1');
  });
});

describe('delivering', () => {
  it('reports only the rows that were genuinely new', async () => {
    // The unique index drops the retry, so the second parent gets no push.
    const { db } = fakeDb({ returns: [[{ user_id: 'u1' }]] });
    const result = await deliverNotificationsOnce(
      db,
      [{ user_id: 'u1' }, { user_id: 'u2' }],
      { sourceType: 'invoice_reminder', sourceId: 'inv-1' },
    );
    expect(result.created).toBe(1);
    expect(result.createdUserIds).toEqual(['u1']);
    expect(result.skipped).toBe(1);
  });

  it('batches a school-wide send rather than one huge statement', async () => {
    const { db, calls } = fakeDb({});
    const rows = Array.from({ length: 120 }, (_, i) => ({ user_id: `u${i}` }));
    await deliverNotificationsOnce(db, rows, { sourceType: 'broadcast', sourceId: 'b1' });
    expect(calls.length).toBe(3);
    expect(calls[0].length).toBe(50);
    expect(calls[2].length).toBe(20);
  });

  it('uses the unique index rather than reading first', async () => {
    const { db, calls } = fakeDb({});
    await deliverNotificationsOnce(db, [{ user_id: 'u1' }], {
      sourceType: 't',
      sourceId: 's',
    });
    expect(calls[0][0].idempotency_key).toBeTruthy();
  });

  it('returns an error instead of throwing', async () => {
    // These callers are finishing something that already succeeded — a payment,
    // a publication. Throwing would retry or undo the wrong half.
    const { db } = fakeDb({ error: 'connection reset' });
    const result = await deliverNotificationsOnce(db, [{ user_id: 'u1' }], {
      sourceType: 't',
      sourceId: 's',
    });
    expect(result.error).toBe('connection reset');
    expect(result.created).toBe(0);
  });

  it('does nothing for an empty batch', async () => {
    const { db, calls } = fakeDb({});
    const result = await deliverNotificationsOnce(db, [], { sourceType: 't', sourceId: 's' });
    expect(result.created).toBe(0);
    expect(calls.length).toBe(0);
  });
});
