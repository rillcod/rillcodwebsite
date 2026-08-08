import { afterEach, describe, expect, it, vi } from 'vitest';
import { logAudit } from './log';

describe('logAudit', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes both actor columns and reports success', async () => {
    let inserted: Record<string, unknown> | null = null;
    const db = {
      from: () => ({
        insert: async (value: Record<string, unknown>) => {
          inserted = value;
          return { error: null };
        },
      }),
    };

    const success = await logAudit(db as any, {
      action: 'grade_submission',
      actorId: 'teacher-1',
      resourceType: 'assignment_submission',
      resourceId: 'submission-1',
    });

    expect(success).toBe(true);
    expect(inserted).toMatchObject({
      actor_id: 'teacher-1',
      user_id: 'teacher-1',
      resource_id: 'submission-1',
      record_id: 'submission-1',
    });
  });

  it('makes a rejected database audit visible without breaking the action', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const db = {
      from: () => ({ insert: async () => ({ error: { message: 'audit unavailable' } }) }),
    };

    await expect(logAudit(db as any, { action: 'publish_result' })).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      '[logAudit] database write failed (non-fatal):',
      'audit unavailable',
    );
  });
});
