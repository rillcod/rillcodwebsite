import type { SupabaseClient } from '@supabase/supabase-js';

// Generic service-role client: the helper works across tables, so the row shapes are
// typed locally (below) rather than via the full generated Database type.
type AnySupabase = SupabaseClient<any>;

interface IdRow { id: string }
interface StudentRefRow { id: string; user_id: string | null }
interface ParentLinkRow { parent_id: string | null; student_id: string | null }

/**
 * Hard-delete a STUDENT portal account and everything uniquely tied to it.
 *
 * DB FKs already cascade most children when the portal_users row is removed
 * (enrollments, attendance, cbt_sessions, assignment_submissions.user_id …) but
 * `students.user_id` is ON DELETE SET NULL, so the students row (and its own
 * cascades: parent_student_links.student_id, attendance.student_id,
 * assignment_submissions.student_id) must be deleted explicitly FIRST.
 *
 * Falls back to a soft deactivate if a RESTRICT-style FK blocks the hard delete,
 * so a single stubborn reference never leaves the operation half-done.
 */
export async function hardDeleteStudentAccount(admin: AnySupabase, portalUserId: string): Promise<void> {
  if (!portalUserId) return;

  const { data: rows } = await admin.from('students').select('id').eq('user_id', portalUserId);
  const studentRowIds = ((rows ?? []) as IdRow[]).map(r => r.id).filter(Boolean);
  if (studentRowIds.length) {
    // Clear references that are NOT ON DELETE CASCADE, then delete the rows.
    await admin.from('students').delete().in('id', studentRowIds);
  }

  const { error: puErr } = await admin.from('portal_users').delete().eq('id', portalUserId);
  if (puErr) {
    // A RESTRICT FK (certificates, activity_logs, audit_logs …) blocked it — soft retire instead.
    await admin.from('portal_users').update({ is_deleted: true, is_active: false, updated_at: new Date().toISOString() }).eq('id', portalUserId);
    return;
  }
  try { await admin.auth.admin.deleteUser(portalUserId); } catch { /* auth user may already be gone */ }
}

/**
 * Hard-delete a PARENT portal account, but ONLY when it is genuinely orphaned —
 * no remaining linked children and no other lead points at it. Shared parents
 * (more than one child / lead) are preserved; we just drop the relevant links.
 */
async function hardDeleteParentIfOrphan(admin: AnySupabase, parentId: string, excludeLeadId?: string): Promise<boolean> {
  const { data: remLinks } = await admin.from('parent_student_links').select('student_id').eq('parent_id', parentId);
  if ((remLinks ?? []).length > 0) return false;

  let otherLeadsQ = admin.from('form_leads').select('id').eq('matched_parent_id', parentId);
  if (excludeLeadId) otherLeadsQ = otherLeadsQ.neq('id', excludeLeadId);
  const { data: otherLeads } = await otherLeadsQ;
  if ((otherLeads ?? []).length > 0) return false;

  await admin.from('parent_student_links').delete().eq('parent_id', parentId);
  const { error } = await admin.from('portal_users').delete().eq('id', parentId);
  if (error) {
    await admin.from('portal_users').update({ is_deleted: true, is_active: false, updated_at: new Date().toISOString() }).eq('id', parentId);
    return true;
  }
  try { await admin.auth.admin.deleteUser(parentId); } catch { /* already gone */ }
  return true;
}

/**
 * CASCADE-delete a consent-form lead AND every account uniquely created from it:
 * the matched/child student accounts (unless shared with another parent) and the
 * parent account (unless shared with another child/lead). Shared records survive
 * with only the relevant link removed, so cleanup never nukes a real family.
 */
export async function cascadeDeleteLead(admin: AnySupabase, leadId: string): Promise<{ ok: boolean; error?: string; deletedStudents: number; parentDeleted: boolean }> {
  const { data: lead } = await admin
    .from('form_leads')
    .select('id, matched_parent_id, matched_student_id, response_data')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: 'Lead not found', deletedStudents: 0, parentDeleted: false };

  const leadRow = lead as { matched_parent_id: string | null; matched_student_id: string | null; response_data: Record<string, unknown> | null };
  const parentId: string | null = leadRow.matched_parent_id ?? null;
  const rd = leadRow.response_data ?? {};
  const childMatches: Array<{ studentId?: string }> = Array.isArray(rd.child_matches) ? rd.child_matches : [];

  // Collect every student portal account this lead is responsible for.
  const studentPortalIds = new Set<string>();
  if (leadRow.matched_student_id) studentPortalIds.add(leadRow.matched_student_id);
  for (const m of childMatches) if (m.studentId) studentPortalIds.add(m.studentId);
  if (parentId) {
    const { data: links } = await admin.from('parent_student_links').select('student_id').eq('parent_id', parentId);
    const rowIds = ((links ?? []) as ParentLinkRow[]).map(l => l.student_id).filter(Boolean);
    if (rowIds.length) {
      const { data: srows } = await admin.from('students').select('user_id').in('id', rowIds);
      for (const s of (srows ?? []) as Array<{ user_id: string | null }>) if (s.user_id) studentPortalIds.add(s.user_id);
    }
  }

  let deletedStudents = 0;
  for (const su of studentPortalIds) {
    const { data: srows } = await admin.from('students').select('id').eq('user_id', su);
    const rowIds = ((srows ?? []) as IdRow[]).map(r => r.id);
    // Is this child shared with a DIFFERENT parent? If so, keep the child — only drop this link.
    let sharedWithOtherParent = false;
    if (rowIds.length) {
      const { data: otherLinks } = await admin.from('parent_student_links').select('parent_id').in('student_id', rowIds);
      sharedWithOtherParent = ((otherLinks ?? []) as ParentLinkRow[]).some(l => l.parent_id && l.parent_id !== parentId);
    }
    if (sharedWithOtherParent) {
      if (parentId && rowIds.length) await admin.from('parent_student_links').delete().eq('parent_id', parentId).in('student_id', rowIds);
      continue;
    }
    await hardDeleteStudentAccount(admin, su);
    deletedStudents++;
  }

  let parentDeleted = false;
  if (parentId) parentDeleted = await hardDeleteParentIfOrphan(admin, parentId, leadId);

  await admin.from('form_leads').delete().eq('id', leadId);
  return { ok: true, deletedStudents, parentDeleted };
}

/**
 * CASCADE-delete a summer prospective student. Unpaid queue rows have no derived
 * account, so this is just a clean hard delete of the row. When an account WAS
 * created (active prospect), also remove the student account it produced — matched
 * by the student login email or by parent_email + name — and the parent if orphaned.
 */
export async function cascadeDeleteProspect(admin: AnySupabase, prospectId: string): Promise<{ ok: boolean; error?: string; deletedStudent: boolean; parentDeleted: boolean }> {
  const { data: p } = await admin
    .from('prospective_students')
    .select('id, full_name, parent_email, email, is_active')
    .eq('id', prospectId)
    .maybeSingle();
  if (!p) return { ok: false, error: 'Prospect not found', deletedStudent: false, parentDeleted: false };

  let deletedStudent = false;
  let parentDeleted = false;

  const prospect = p as { full_name: string | null; parent_email: string | null; email: string | null; is_active: boolean | null };

  // Only chase an account when this prospect was actually onboarded.
  if (prospect.is_active) {
    const norm = (s: string | null | undefined) => (s || '').trim().toLowerCase();
    const fullName = norm(prospect.full_name);
    const parentEmail = norm(prospect.parent_email) || norm(prospect.email);

    // Find the student row this prospect produced (same name + parent email).
    let studentRow: StudentRefRow | null = null;
    if (fullName && parentEmail) {
      const { data: srows } = await admin
        .from('students')
        .select('id, user_id, full_name, parent_email')
        .ilike('parent_email', parentEmail)
        .ilike('full_name', prospect.full_name ?? '');
      studentRow = ((srows ?? []) as StudentRefRow[])[0] ?? null;
    }
    if (studentRow?.user_id) {
      // Capture parent links before deleting the student so we can orphan-check the parent.
      const { data: links } = await admin.from('parent_student_links').select('parent_id').eq('student_id', studentRow.id);
      const parentIds: string[] = Array.from(
        new Set(((links ?? []) as ParentLinkRow[]).map(l => l.parent_id).filter((x): x is string => !!x)),
      );
      await hardDeleteStudentAccount(admin, studentRow.user_id);
      deletedStudent = true;
      for (const pid of parentIds) {
        if (await hardDeleteParentIfOrphan(admin, pid)) parentDeleted = true;
      }
    }
  }

  await admin.from('prospective_students').delete().eq('id', prospectId);
  return { ok: true, deletedStudent, parentDeleted };
}
