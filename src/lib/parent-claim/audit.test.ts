import { describe, expect, it, vi } from 'vitest';
import { recordParentClaimAudit } from './audit';

function mockAdmin(specializedError: unknown = null, centralError: unknown = null) {
  const inserts: Array<{ table: string; payload: unknown }> = [];
  const admin = {
    from(table: string) {
      return {
        insert: vi.fn(async (payload: unknown) => {
          inserts.push({ table, payload });
          return { error: table === 'parent_claim_audit' ? specializedError : centralError };
        }),
      };
    },
  };
  return { admin: admin as any, inserts };
}

describe('recordParentClaimAudit', () => {
  it('writes the specialized and central audit trails from one event', async () => {
    const { admin, inserts } = mockAdmin();
    const result = await recordParentClaimAudit(admin, {
      studentId: 'student-1',
      parentId: 'parent-1',
      action: 'linked',
      note: 'Parent verified and linked',
    });

    expect(result).toEqual({ specialized: true, central: true });
    expect(inserts.map((row) => row.table)).toEqual(['parent_claim_audit', 'audit_logs']);
    expect(inserts[1]?.payload).toMatchObject({
      action: 'parent_claim_linked',
      resource_id: 'student-1',
      new_value: 'The parent account was linked to this child.',
      new_values: expect.objectContaining({
        summary: 'The parent account was linked to this child.',
      }),
    });
  });

  it('still records centrally when the specialized table returns an error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { admin } = mockAdmin({ code: '42P01', message: 'missing relation' });

    await expect(recordParentClaimAudit(admin, {
      studentId: 'student-1',
      action: 'completion_failed',
    })).resolves.toEqual({ specialized: false, central: true });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
