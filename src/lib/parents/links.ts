import type { SupabaseClient } from '@supabase/supabase-js';
import { removeStudentFromParentLeadLinks } from '@/lib/consent/lead-child-links';

type AnySupabase = SupabaseClient<any>;

export class ParentLinkConflictError extends Error {
  readonly code = 'STUDENT_ALREADY_LINKED';
  readonly status = 409;

  constructor(
    public readonly studentId: string,
    public readonly existingParentId: string,
  ) {
    super('This student is already linked to another parent. Unlink the current parent before linking a new one.');
    this.name = 'ParentLinkConflictError';
  }
}

export function isParentLinkConflict(error: unknown): error is ParentLinkConflictError {
  return error instanceof ParentLinkConflictError
    || (
      !!error
      && typeof error === 'object'
      && (error as { code?: string }).code === 'STUDENT_ALREADY_LINKED'
    );
}

export function assertSingleParentLink(
  studentId: string,
  requestedParentId: string,
  existingParentId?: string | null,
): void {
  if (existingParentId && existingParentId !== requestedParentId) {
    throw new ParentLinkConflictError(studentId, existingParentId);
  }
}

export type ParentLinkScope = {
  studentIds: string[];
  studentUserIds: string[];
};

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

// Returns true when a Supabase/PostgreSQL error is "relation does not exist"
// (code 42P01). We only want to silently skip that specific case — all other
// errors should surface so they are not hidden.
function isRelationMissing(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  return e['code'] === '42P01' || String(e['message'] ?? '').includes('relation') && String(e['message'] ?? '').includes('does not exist');
}

export async function getParentLinkScope(
  admin: AnySupabase,
  parent: { id: string; email?: string | null },
): Promise<ParentLinkScope> {
  const normalizedEmail = parent.email?.trim().toLowerCase() || '';

  // ── Explicit junction table (primary path) ─────────────────────────────────
  let explicitStudentIds: string[] = [];
  const { data: linkData, error: linkErr } = await admin
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_id', parent.id);

  if (linkErr) {
    if (!isRelationMissing(linkErr)) throw linkErr;
    // Table not yet migrated — fall through to email-only path
  } else {
    const rows = (linkData ?? []) as unknown as Array<{ student_id: string }>;
    explicitStudentIds = unique(rows.map((row) => row.student_id));
  }

  let explicitRows: Array<{ id: string; user_id: string | null }> = [];
  if (explicitStudentIds.length > 0) {
    const { data, error } = await admin
      .from('students')
      .select('id, user_id')
      .in('id', explicitStudentIds);
    if (error) throw error;
    explicitRows = data ?? [];
  }

  // ── Email-based fallback (legacy denormalized path) ────────────────────────
  // Skip students already claimed by a *different* parent via the junction table
  // so wrong/stale parent_email cannot grant access across households.
  let legacyRows: Array<{ id: string; user_id: string | null }> = [];
  if (normalizedEmail) {
    const { data, error } = await admin
      .from('students')
      .select('id, user_id')
      .ilike('parent_email', normalizedEmail);
    if (error) throw error;
    const candidates = data ?? [];
    if (candidates.length > 0) {
      const candidateIds = candidates.map((r) => r.id);
      const ownedByOther = new Set<string>();
      const { data: otherLinks, error: otherErr } = await admin
        .from('parent_student_links')
        .select('student_id, parent_id')
        .in('student_id', candidateIds);
      if (otherErr) {
        if (!isRelationMissing(otherErr)) throw otherErr;
      } else {
        for (const row of otherLinks ?? []) {
          if (row.parent_id && row.parent_id !== parent.id && row.student_id) {
            ownedByOther.add(row.student_id);
          }
        }
      }
      legacyRows = candidates.filter((r) => !ownedByOther.has(r.id));
    }
  }

  return {
    studentIds: unique([
      ...explicitStudentIds,
      ...explicitRows.map((row) => row.id),
      ...legacyRows.map((row) => row.id),
    ]),
    studentUserIds: unique([
      ...explicitRows.map((row) => row.user_id),
      ...legacyRows.map((row) => row.user_id),
    ]),
  };
}

/**
 * Resolve a student's `students.id` from a value that may be EITHER a
 * `portal_users.id` (what the matcher writes into match_candidate_id /
 * matched_student_id) or already a `students.id`.
 *
 * `parent_student_links.student_id` and the `students` table are keyed on
 * `students.id` — but `students.id !== portal_users.id` (students has its own PK
 * plus a `user_id` FK to the portal account). So any code linking or updating a
 * *matched* student MUST resolve through here first, or the link points at a
 * non-existent row and the child never appears on the parent dashboard.
 *
 * Resolution order: students.user_id == id  →  students.id == id.
 * Returns null when neither matches (no student row exists yet).
 */
export async function resolveStudentRowId(
  admin: AnySupabase,
  idOrUserId: string,
): Promise<string | null> {
  if (!idOrUserId) return null;
  const { data: byUser } = await admin
    .from('students').select('id').eq('user_id', idOrUserId).limit(1);
  if ((byUser ?? [])[0]?.id) return (byUser as Array<{ id: string }>)[0].id;
  const { data: byId } = await admin
    .from('students').select('id').eq('id', idOrUserId).maybeSingle();
  return (byId as { id: string } | null)?.id ?? null;
}

/**
 * Like {@link resolveStudentRowId} but, when no `students` row exists for the
 * given portal student, provisions a minimal one (denormalised from the portal
 * account) so the parent-student link can always be created. Used by the manual
 * "Link Child" action so it never silently fails for portal-only students
 * (e.g. summer/online accounts created without a students row).
 */
export async function resolveOrCreateStudentRowId(
  admin: AnySupabase,
  portalUserId: string,
): Promise<string | null> {
  const existing = await resolveStudentRowId(admin, portalUserId);
  if (existing) return existing;

  const { data: pu } = await admin
    .from('portal_users')
    .select('id, full_name, email, school_id, school_name, section_class, grade, phone')
    .eq('id', portalUserId)
    .maybeSingle();
  if (!pu) return null;

  const now = new Date().toISOString();
  // NOTE: the students table has NO class_id column (class placement lives on
  // portal_users). Including it here errors the insert (PGRST204) and was the
  // cause of "Could not resolve or create student record".
  const { data: inserted, error } = await admin
    .from('students')
    .insert({
      full_name: (pu as any).full_name ?? 'Student',
      name: (pu as any).full_name ?? 'Student',
      email: (pu as any).email ?? null,
      student_email: (pu as any).email ?? null,
      user_id: (pu as any).id,
      school_id: (pu as any).school_id ?? null,
      school_name: (pu as any).school_name ?? null,
      grade: (pu as any).grade ?? null,
      grade_level: (pu as any).grade ?? null,
      current_class: (pu as any).section_class ?? null,
      section: (pu as any).section_class ?? null,
      status: 'approved',
      is_active: true,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();
  if (error) return null;
  return (inserted as { id: string } | null)?.id ?? null;
}

export async function getExistingParentLink(
  admin: AnySupabase,
  studentId: string,
): Promise<{ parentId: string } | null> {
  const { data, error } = await admin
    .from('parent_student_links')
    .select('parent_id')
    .eq('student_id', studentId)
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isRelationMissing(error)) return null;
    throw error;
  }
  return data?.parent_id ? { parentId: data.parent_id } : null;
}

export async function assertParentStudentLinkAllowed(
  admin: AnySupabase,
  parentId: string,
  studentId: string,
): Promise<void> {
  const existing = await getExistingParentLink(admin, studentId);
  assertSingleParentLink(studentId, parentId, existing?.parentId);
}

export async function syncExplicitParentStudentLink(
  admin: AnySupabase,
  parentId: string,
  studentId: string,
  opts?: { actorId?: string | null; source?: string },
): Promise<void> {
  // A student has one active parent link. This application guard provides a
  // useful 409 before the database unique constraint handles concurrent races.
  await assertParentStudentLinkAllowed(admin, parentId, studentId);

  const { error } = await admin
    .from('parent_student_links')
    .upsert(
      { parent_id: parentId, student_id: studentId, updated_at: new Date().toISOString() },
      { onConflict: 'parent_id,student_id' },
    );
  if (error) {
    if (isRelationMissing(error)) return; // table not migrated yet — no-op
    // The database invariant is the final guard against two concurrent link
    // attempts that both passed the check above.
    if ((error as { code?: string }).code === '23505') {
      const { data: winner } = await admin
        .from('parent_student_links')
        .select('parent_id')
        .eq('student_id', studentId)
        .limit(1)
        .maybeSingle();
      if (winner?.parent_id && winner.parent_id !== parentId) {
        throw new ParentLinkConflictError(studentId, winner.parent_id);
      }
    }
    throw new Error(`Failed to sync parent-student link: ${error.message}`);
  }

  const { data: parent, error: parentError } = await admin
    .from('portal_users')
    .select('full_name, email, phone')
    .eq('id', parentId)
    .maybeSingle();
  if (parentError) throw parentError;
  if (parent) {
    const { error: mirrorError } = await admin.from('students').update({
      parent_name: parent.full_name ?? null,
      parent_email: parent.email?.trim().toLowerCase() || null,
      parent_phone: parent.phone ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', studentId);
    if (mirrorError) throw mirrorError;

    try {
      const { autoPromoteParentPipeline } = await import('@/lib/crm/auto-promote-parent');
      await autoPromoteParentPipeline(admin, {
        parentId,
        email: parent.email,
        phone: parent.phone,
        contactName: parent.full_name,
        forceStage: true,
      });
    } catch (crmErr) {
      console.error('[syncExplicitParentStudentLink] CRM update failed:', crmErr);
    }
  }

  await auditParentLinkChange(admin, {
    action: 'parent_student_linked',
    parentId,
    studentId,
    actorId: opts?.actorId ?? null,
    source: opts?.source ?? 'syncExplicitParentStudentLink',
  });
}

/** Remove one unlinked child from the parent's consent provenance. */
export async function clearStudentFromParentConsentLeads(
  admin: AnySupabase,
  parentId: string,
  studentUserId: string,
): Promise<void> {
  await removeStudentFromParentLeadLinks(admin, parentId, studentUserId);
}

export async function unlinkExplicitParentStudentLink(
  admin: AnySupabase,
  parentId: string,
  studentId: string,
  opts?: { actorId?: string | null; source?: string },
): Promise<void> {
  const { data: student, error: studentError } = await admin
    .from('students')
    .select('user_id')
    .eq('id', studentId)
    .maybeSingle();
  if (studentError) throw studentError;

  const { error } = await admin
    .from('parent_student_links')
    .delete()
    .eq('parent_id', parentId)
    .eq('student_id', studentId);
  if (error && !isRelationMissing(error)) throw error;

  const { error: mirrorError } = await admin.from('students').update({
    parent_name: null,
    parent_email: null,
    parent_phone: null,
    parent_relationship: null,
    updated_at: new Date().toISOString(),
  }).eq('id', studentId);
  if (mirrorError) throw mirrorError;
  if (student?.user_id) {
    await removeStudentFromParentLeadLinks(admin, parentId, student.user_id);
  }

  await auditParentLinkChange(admin, {
    action: 'parent_student_unlinked',
    parentId,
    studentId,
    actorId: opts?.actorId ?? null,
    source: opts?.source ?? 'unlinkExplicitParentStudentLink',
  });
}

/**
 * Resolve parents linked to a student when the caller only has a portal_users.id
 * (progress reports, certificates) or a students.id.
 */
export async function getParentsForStudentPortalId(
  admin: AnySupabase,
  portalOrStudentId: string,
): Promise<Array<{ id: string; email: string | null; full_name: string | null; phone: string | null }>> {
  const studentRowId = await resolveStudentRowId(admin, portalOrStudentId);
  if (!studentRowId) return [];

  const { data: links, error } = await admin
    .from('parent_student_links')
    .select('parent_id')
    .eq('student_id', studentRowId);
  if (error) {
    if (isRelationMissing(error)) return [];
    throw error;
  }
  const parentIds = unique((links ?? []).map((l: any) => l.parent_id));
  if (parentIds.length === 0) return [];

  const { data: parents, error: parentErr } = await admin
    .from('portal_users')
    .select('id, email, full_name, phone')
    .in('id', parentIds)
    .eq('role', 'parent');
  if (parentErr) throw parentErr;
  return (parents ?? []) as Array<{ id: string; email: string | null; full_name: string | null; phone: string | null }>;
}

/** Detach every child from a parent (junction + denorm + consent lead child links). */
export async function detachAllChildren(
  admin: AnySupabase,
  parentId: string,
  opts?: { actorId?: string | null; source?: string },
): Promise<number> {
  const { data: links, error } = await admin
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_id', parentId);
  if (error) {
    if (isRelationMissing(error)) return 0;
    throw error;
  }
  const studentIds = unique((links ?? []).map((l: any) => l.student_id));
  for (const studentId of studentIds) {
    await unlinkExplicitParentStudentLink(admin, parentId, studentId, {
      actorId: opts?.actorId,
      source: opts?.source ?? 'detachAllChildren',
    });
  }
  return studentIds.length;
}

/**
 * When staff change `students.parent_email`, keep the junction table in sync:
 * unlink the previous portal parent if needed, then link the new one when a
 * parent portal already exists for that email.
 */
export async function reconcileStudentParentEmail(
  admin: AnySupabase,
  studentRowId: string,
  newParentEmail: string | null | undefined,
  opts?: { actorId?: string | null; source?: string },
): Promise<void> {
  const email = newParentEmail?.trim().toLowerCase() || '';
  const existing = await getExistingParentLink(admin, studentRowId);
  const source = opts?.source ?? 'reconcileStudentParentEmail';

  if (!email) {
    if (existing?.parentId) {
      await unlinkExplicitParentStudentLink(admin, existing.parentId, studentRowId, {
        actorId: opts?.actorId,
        source,
      });
    }
    return;
  }

  const { data: parentPortal } = await admin
    .from('portal_users')
    .select('id')
    .eq('email', email)
    .eq('role', 'parent')
    .neq('is_deleted', true)
    .maybeSingle();

  if (!parentPortal?.id) {
    // Denorm email updated; no portal yet — leave junction alone until activation/claim.
    if (existing?.parentId) {
      const { data: oldParent } = await admin
        .from('portal_users')
        .select('email')
        .eq('id', existing.parentId)
        .maybeSingle();
      const oldEmail = oldParent?.email?.trim().toLowerCase() || '';
      if (oldEmail && oldEmail !== email) {
        await unlinkExplicitParentStudentLink(admin, existing.parentId, studentRowId, {
          actorId: opts?.actorId,
          source,
        });
      }
    }
    return;
  }

  if (existing?.parentId && existing.parentId !== parentPortal.id) {
    await unlinkExplicitParentStudentLink(admin, existing.parentId, studentRowId, {
      actorId: opts?.actorId,
      source,
    });
  }

  await syncExplicitParentStudentLink(admin, parentPortal.id, studentRowId, {
    actorId: opts?.actorId,
    source,
  });
}

/**
 * Heal email-matched students onto an explicit link for this parent only when
 * no other parent already owns the child. Returns how many new links were written.
 */
export async function healParentEmailLinks(
  admin: AnySupabase,
  parent: { id: string; email?: string | null },
  opts?: { actorId?: string | null },
): Promise<number> {
  const email = parent.email?.trim().toLowerCase();
  if (!email) return 0;
  const { data: byEmail } = await admin
    .from('students')
    .select('id')
    .ilike('parent_email', email);
  let linked = 0;
  for (const s of (byEmail ?? []) as Array<{ id: string }>) {
    try {
      const existing = await getExistingParentLink(admin, s.id);
      if (existing?.parentId && existing.parentId !== parent.id) continue;
      await syncExplicitParentStudentLink(admin, parent.id, s.id, {
        actorId: opts?.actorId ?? parent.id,
        source: 'healParentEmailLinks',
      });
      linked += 1;
    } catch (err) {
      if (isParentLinkConflict(err)) continue;
      throw err;
    }
  }
  return linked;
}

async function auditParentLinkChange(
  admin: AnySupabase,
  entry: {
    action: 'parent_student_linked' | 'parent_student_unlinked';
    parentId: string;
    studentId: string;
    actorId?: string | null;
    source?: string;
  },
): Promise<void> {
  try {
    const { logAudit } = await import('@/lib/audit/log');
    await logAudit(admin as any, {
      action: entry.action,
      actorId: entry.actorId ?? null,
      resourceType: 'parent_student_link',
      resourceId: entry.studentId,
      tableName: 'parent_student_links',
      newValues: {
        parent_id: entry.parentId,
        student_id: entry.studentId,
        source: entry.source ?? null,
      },
    });
  } catch (err) {
    console.error('[auditParentLinkChange] failed:', err);
  }
}
