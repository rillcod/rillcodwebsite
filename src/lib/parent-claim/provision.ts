import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { generateTempPassword } from '@/lib/utils/password';
import { syncExplicitParentStudentLink, resolveOrCreateStudentRowId } from '@/lib/parents/links';

type Db = SupabaseClient<Database>;

export interface ProvisionInput {
  email: string;
  phone: string | null;
  fullName: string;
  relationship?: string | null;
  studentId: string; // scanned child — portal_users.id
  /** When reusing an existing parent portal, do not overwrite name/profile. Default true. */
  preserveExistingProfile?: boolean;
}

export interface ProvisionResult {
  ok: boolean;
  error?: string;
  status?: number;
  parentId?: string;
  childName?: string | null;
  schoolId?: string | null;
  schoolName?: string | null;
  accountCreated?: boolean;
  generatedPassword?: string | null;
}

/**
 * Self-service core: find-or-create a parent account (deduped by email, email
 * pre-confirmed), then link the scanned child. Returns a generated password only
 * when a NEW account was created, so the caller can deliver the login.
 */
export async function provisionParentAndLinkChild(admin: Db, input: ProvisionInput): Promise<ProvisionResult> {
  const { email, phone, fullName, relationship, studentId } = input;

  const { data: existing } = await admin
    .from('portal_users').select('id, role').eq('email', email).maybeSingle();
  if (existing && existing.role !== 'parent') {
    return { ok: false, status: 409, error: `This email is already registered as a ${existing.role} account. Please use a different email.` };
  }

  let parentId: string;
  let generatedPassword: string | null = null;
  const preserve = input.preserveExistingProfile !== false;
  if (existing?.id) {
    parentId = existing.id;
    const patch: Record<string, unknown> = { is_active: true, updated_at: new Date().toISOString() };
    if (!preserve) {
      patch.full_name = fullName;
      patch.phone = phone;
    } else if (phone) {
      const { data: current } = await admin.from('portal_users').select('phone').eq('id', parentId).maybeSingle();
      if (!current?.phone) patch.phone = phone;
    }
    await admin.from('portal_users').update(patch).eq('id', parentId);
  } else {
    generatedPassword = generateTempPassword();
    const { data: created, error } = await admin.auth.admin.createUser({
      email, password: generatedPassword, email_confirm: true,
      user_metadata: { full_name: fullName, role: 'parent' },
    });
    if (error || !created?.user) {
      return { ok: false, status: 500, error: 'Could not create your parent account. Please try again.' };
    }
    parentId = created.user.id;
    const { error: upsertErr } = await admin.from('portal_users').upsert({
      id: parentId, email, full_name: fullName, phone, role: 'parent',
      is_active: true, updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (upsertErr) {
      // Roll back the auth user so a failed profile never leaves an orphan login.
      try { await admin.auth.admin.deleteUser(parentId); } catch { /* best-effort */ }
      return { ok: false, status: 500, error: 'Could not set up your parent account. Please try again.' };
    }
  }

  const { data: childPU } = await admin
    .from('portal_users').select('full_name, school_id, school_name').eq('id', studentId).maybeSingle();

  const childRowId = await resolveOrCreateStudentRowId(admin, studentId);
  if (childRowId) {
    await admin.from('students').update({
      parent_email: email, parent_name: fullName, parent_phone: phone,
      parent_relationship: relationship ?? 'Guardian', updated_at: new Date().toISOString(),
    }).eq('id', childRowId);
    await syncExplicitParentStudentLink(admin, parentId, childRowId);
  }

  return {
    ok: true, parentId,
    childName: childPU?.full_name ?? null,
    schoolId: childPU?.school_id ?? null,
    schoolName: childPU?.school_name ?? null,
    accountCreated: !!generatedPassword, generatedPassword,
  };
}

/**
 * Auto-link every other child at the same school already carrying this parent's
 * contact on file (parent_email / parent_phone). Safe: only links students whose
 * record already names this contact, so a stranger can't be attached. Returns the
 * names linked.
 */
export async function autoLinkSiblings(
  admin: Db,
  input: { parentId: string; email: string; phone: string | null; fullName: string; relationship?: string | null; schoolName: string | null; studentId: string },
): Promise<string[]> {
  const { parentId, email, phone, fullName, relationship, schoolName, studentId } = input;
  const cols = 'id, user_id, full_name, school_name';
  const byId = new Map<string, { id: string; user_id: string | null; full_name: string }>();

  let q1 = admin.from('students').select(cols).eq('parent_email', email);
  if (schoolName) q1 = q1.ilike('school_name', schoolName);
  const { data: byEmail } = await q1;
  for (const s of byEmail ?? []) byId.set(s.id, s as any);

  if (phone) {
    let q2 = admin.from('students').select(cols).eq('parent_phone', phone);
    if (schoolName) q2 = q2.ilike('school_name', schoolName);
    const { data: byPhone } = await q2;
    for (const s of byPhone ?? []) byId.set(s.id, s as any);
  }

  const { data: existingLinks } = await admin
    .from('parent_student_links').select('student_id').eq('parent_id', parentId);
  const linked = new Set((existingLinks ?? []).map(l => l.student_id));
  const { data: scanned } = await admin.from('students').select('id').eq('user_id', studentId).maybeSingle();
  const scannedRowId = scanned?.id ?? null;

  const names: string[] = [];
  for (const s of byId.values()) {
    if (s.id === scannedRowId || s.user_id === studentId || linked.has(s.id)) continue;
    await admin.from('students')
      .update({
        parent_email: email, parent_phone: phone, parent_name: fullName,
        parent_relationship: relationship ?? 'Guardian', updated_at: new Date().toISOString(),
      })
      .eq('id', s.id);
    await syncExplicitParentStudentLink(admin, parentId, s.id);
    names.push(s.full_name);
  }
  return names;
}
