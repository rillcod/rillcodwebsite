/**
 * Server-side permanent wipe: DB cascade (hard_delete_portal_user) + auth.users removal.
 * hard_delete_portal_user already deletes auth.users when the RPC succeeds; auth.admin.deleteUser
 * is a best-effort belt for environments where the SQL path cannot reach auth.
 */
import { clearLeadChildLinks } from '@/lib/consent/lead-child-links';
import {
  getProtectedAcademicEvidence,
  protectedAcademicEvidenceMessage,
} from '@/lib/students/protected-academic-evidence';

export type PermanentWipeResult =
  | { ok: true }
  | { ok: false; error: string };

type AnyAdmin = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  auth: { admin: { deleteUser: (id: string) => Promise<unknown> } };
};

/** Full cascade delete for one portal user id (any role). */
export async function wipePortalUserCascade(admin: AnyAdmin, userId: string): Promise<PermanentWipeResult> {
  const evidence = await getProtectedAcademicEvidence(admin, userId);
  if (evidence.total > 0) {
    return { ok: false, error: protectedAcademicEvidenceMessage(evidence) };
  }

  const { error } = await admin.rpc('hard_delete_portal_user', { p_id: userId });
  if (error) return { ok: false, error: error.message };
  await admin.auth.admin.deleteUser(userId).catch(() => {});
  return { ok: true };
}

/** Parent / school pre-steps that hard_delete cannot infer from FK metadata alone. */
export async function prepareRoleSpecificWipe(
  admin: AnyAdmin,
  user: { id: string; role?: string | null; email?: string | null; school_id?: string | null },
): Promise<void> {
  if (user.role === 'parent') {
    // Explicit links come down through the kernel so the removal is audited and
    // each child's consent lead-child rows are cleaned up, rather than relying on
    // the hard_delete FK cascade to silently drop them.
    const { detachAllChildren } = await import('@/lib/parents/links');
    await detachAllChildren(admin as any, user.id, { source: 'permanent-wipe.prepareRoleSpecificWipe' });

    // Safety net for students that were only ever email-matched (no junction row),
    // which detachAllChildren cannot see.
    if (user.email) {
      await admin.from('students').update({
        parent_email: null,
        parent_name: null,
        parent_phone: null,
        updated_at: new Date().toISOString(),
      }).eq('parent_email', user.email);
    }
    const { data: parentLeads } = await admin
      .from('form_leads')
      .select('id')
      .eq('matched_parent_id', user.id);
    for (const lead of parentLeads ?? []) {
      await clearLeadChildLinks(admin as any, lead.id);
      await admin.from('form_leads').update({
        matched_parent_id: null,
        match_candidate_id: null,
        match_status: 'new_prospect',
      }).eq('id', lead.id);
    }
  }

  if (user.role === 'school' && user.school_id) {
    await admin.from('students').update({ school_id: null, school_name: null }).eq('school_id', user.school_id);
    await admin.from('teacher_schools').delete().eq('school_id', user.school_id);
    await admin.from('schools').delete().eq('id', user.school_id);
  }
}

/** Remove bulk-register archive rows keyed by email and prune empty batches. */
export async function pruneRegistrationArchiveByEmails(admin: AnyAdmin, emails: string[]): Promise<void> {
  const unique = [...new Set(emails.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))];
  if (!unique.length) return;

  const { data: archRows } = await admin.from('registration_results').select('batch_id').in('email', unique);
  const batchIds = [...new Set((archRows ?? []).map((r: { batch_id?: string }) => r.batch_id).filter(Boolean))];
  await admin.from('registration_results').delete().in('email', unique);

  for (const bId of batchIds) {
    const { count } = await admin
      .from('registration_results')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', bId);
    if ((count ?? 0) === 0) await admin.from('registration_batches').delete().eq('id', bId);
    else await admin.from('registration_batches').update({ student_count: count }).eq('id', bId);
  }
}

export async function permanentWipePortalUsers(
  admin: AnyAdmin,
  users: Array<{ id: string; role?: string | null; email?: string | null; school_id?: string | null }>,
): Promise<{ deleted: string[]; failed: Array<{ id: string; error: string }> }> {
  const deleted: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  const deletedEmails: string[] = [];

  for (const user of users) {
    await prepareRoleSpecificWipe(admin, user);
    const result = await wipePortalUserCascade(admin, user.id);
    if (!result.ok) {
      failed.push({ id: user.id, error: result.error });
      continue;
    }
    deleted.push(user.id);
    if (user.email) deletedEmails.push(user.email);
  }

  if (deletedEmails.length) await pruneRegistrationArchiveByEmails(admin, deletedEmails);
  return { deleted, failed };
}
