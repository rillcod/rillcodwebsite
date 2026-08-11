import type { SupabaseClient } from '@supabase/supabase-js';
import { logAudit } from '@/lib/audit/log';
import {
  parentClaimActivitySummary,
  type ParentClaimAuditAction,
} from '@/lib/parent-claim/audit-display';

type AnySupabase = SupabaseClient<any>;

export type { ParentClaimAuditAction } from '@/lib/parent-claim/audit-display';

export type ParentClaimAuditEntry = {
  studentId: string;
  parentId?: string | null;
  actorId?: string | null;
  email?: string | null;
  phone?: string | null;
  action: ParentClaimAuditAction;
  siblingsLinked?: number;
  ip?: string | null;
  note?: string | null;
};

/**
 * Write the parent-claim operational trail and the platform-wide audit trail.
 * Neither write may block a legitimate family workflow, but returned Supabase
 * errors are always inspected and reported instead of being silently ignored.
 */
export async function recordParentClaimAudit(
  admin: AnySupabase,
  entry: ParentClaimAuditEntry,
): Promise<{ specialized: boolean; central: boolean }> {
  let specialized = false;
  try {
    const { error } = await admin.from('parent_claim_audit').insert({
      student_id: entry.studentId,
      parent_id: entry.parentId ?? null,
      email: entry.email ?? null,
      phone: entry.phone ?? null,
      action: entry.action,
      siblings_linked: entry.siblingsLinked ?? 0,
      ip: entry.ip ?? null,
      note: entry.note ?? null,
    });
    if (error) {
      console.error('[parent-claim/audit] specialized write failed', {
        action: entry.action,
        code: error.code,
        message: error.message,
      });
    } else {
      specialized = true;
    }
  } catch (error) {
    console.error('[parent-claim/audit] specialized write threw', error);
  }

  const summary = parentClaimActivitySummary(entry.action, entry.siblingsLinked);
  const central = await logAudit(admin, {
    action: `parent_claim_${entry.action}`,
    actorId: entry.actorId ?? null,
    resourceType: 'student_parent_link',
    resourceId: entry.studentId,
    tableName: 'parent_claim_audit',
    recordId: entry.studentId,
    newValue: summary,
    newValues: {
      summary,
      student_id: entry.studentId,
      parent_id: entry.parentId ?? null,
      action: entry.action,
      siblings_linked: entry.siblingsLinked ?? 0,
      contact_email: entry.email ?? null,
    },
    ip: entry.ip ?? null,
  });

  return { specialized, central };
}
