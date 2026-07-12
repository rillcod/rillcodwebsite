/**
 * CRM school-boundary helpers for service-role Route Handlers.
 * Prevents cross-school PII leaks when staff call CRM APIs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isTeacherIsolationOn } from '@/lib/server/teacher-scope';

export type CrmCaller = {
  id: string;
  role: string;
  school_id: string | null;
  full_name?: string | null;
};

type AnySupabase = SupabaseClient<any>;

/** School IDs the caller may access (empty → teacher with no assignment). */
export async function getCallerSchoolIds(admin: AnySupabase, caller: CrmCaller): Promise<string[] | 'all'> {
  if (caller.role === 'admin') return 'all';
  const ids = new Set<string>();
  if (caller.school_id) ids.add(caller.school_id);
  if (caller.role === 'teacher') {
    const { data: ts } = await admin
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', caller.id);
    (ts ?? []).forEach((r: any) => { if (r.school_id) ids.add(r.school_id); });
  }
  return [...ids];
}

/** Contact IDs a teacher may see under class-privacy isolation. */
export async function getIsolatedTeacherContactIds(
  admin: AnySupabase,
  teacherId: string,
): Promise<Set<string>> {
  const idSet = new Set<string>();
  const { data: ownClasses } = await admin.from('classes').select('id').eq('teacher_id', teacherId);
  const classIds = (ownClasses ?? []).map((c: any) => c.id);
  if (!classIds.length) return idSet;

  const { data: studs } = await admin
    .from('portal_users')
    .select('id')
    .in('class_id', classIds)
    .eq('role', 'student');
  const studentPortalIds = (studs ?? []).map((s: any) => s.id);
  studentPortalIds.forEach((id: string) => idSet.add(id));

  if (studentPortalIds.length) {
    const { data: srows } = await admin.from('students').select('id').in('user_id', studentPortalIds);
    const studentRowIds = (srows ?? []).map((s: any) => s.id);
    if (studentRowIds.length) {
      const { data: links } = await admin
        .from('parent_student_links')
        .select('parent_id')
        .in('student_id', studentRowIds);
      (links ?? []).forEach((l: any) => { if (l.parent_id) idSet.add(l.parent_id); });
    }
  }
  return idSet;
}

export type ContactAccess =
  | { ok: true; kind: 'portal' | 'book' | 'whatsapp'; schoolId: string | null; schoolName: string | null; row: any }
  | { ok: false; status: 403 | 404; error: string };

/**
 * Resolve a CRM contact id and enforce school / isolation access.
 * Accepts portal_users, customer_contact_book, or whatsapp_conversations ids.
 */
export async function assertCrmContactAccess(
  admin: AnySupabase,
  caller: CrmCaller,
  contactId: string,
): Promise<ContactAccess> {
  if (!contactId) return { ok: false, status: 404, error: 'Contact not found' };

  const { data: portal } = await admin
    .from('portal_users')
    .select('id, full_name, email, phone, role, school_id, school_name, section_class, is_active, created_at, updated_at, metadata, bio, date_of_birth, student_id, class_id')
    .eq('id', contactId)
    .maybeSingle();

  if (portal) {
    const allowed = await callerMayAccessSchool(admin, caller, portal.school_id ?? null, portal.id);
    if (!allowed) return { ok: false, status: 403, error: 'Forbidden' };
    return {
      ok: true,
      kind: 'portal',
      schoolId: portal.school_id ?? null,
      schoolName: portal.school_name ?? null,
      row: portal,
    };
  }

  const { data: book } = await admin
    .from('customer_contact_book')
    .select('*')
    .eq('id', contactId)
    .maybeSingle();

  if (book) {
    const schoolIds = await resolveSchoolIdsByName(admin, book.school_name ?? null);
    const allowed = await callerMayAccessBookRow(admin, caller, schoolIds, book.school_name ?? null);
    if (!allowed) return { ok: false, status: 403, error: 'Forbidden' };
    return {
      ok: true,
      kind: 'book',
      schoolId: schoolIds[0] ?? null,
      schoolName: book.school_name ?? null,
      row: book,
    };
  }

  const { data: wa } = await admin
    .from('whatsapp_conversations')
    .select('id, contact_name, phone_number, last_message_at, created_at, portal_user_id')
    .eq('id', contactId)
    .maybeSingle();

  if (wa) {
    // Unlinked WA: admin only (no school to scope). Linked: follow portal user.
    if (wa.portal_user_id) {
      return assertCrmContactAccess(admin, caller, wa.portal_user_id);
    }
    if (caller.role !== 'admin') {
      return { ok: false, status: 403, error: 'Forbidden' };
    }
    return {
      ok: true,
      kind: 'whatsapp',
      schoolId: null,
      schoolName: null,
      row: wa,
    };
  }

  return { ok: false, status: 404, error: 'Contact not found' };
}

async function resolveSchoolIdsByName(admin: AnySupabase, schoolName: string | null): Promise<string[]> {
  if (!schoolName?.trim()) return [];
  const { data } = await admin
    .from('schools')
    .select('id')
    .ilike('name', schoolName.trim());
  return (data ?? []).map((s: any) => s.id).filter(Boolean);
}

async function callerMayAccessSchool(
  admin: AnySupabase,
  caller: CrmCaller,
  schoolId: string | null,
  contactId: string,
): Promise<boolean> {
  if (caller.role === 'admin') return true;

  if (caller.role === 'teacher') {
    const isolated = await isTeacherIsolationOn(admin);
    if (isolated) {
      const allowed = await getIsolatedTeacherContactIds(admin, caller.id);
      return allowed.has(contactId);
    }
    const schoolIds = await getCallerSchoolIds(admin, caller);
    if (schoolIds === 'all') return true;
    if (!schoolId) return false; // unscoped contact: teachers cannot open
    return schoolIds.includes(schoolId);
  }

  if (caller.role === 'school') {
    if (!caller.school_id || !schoolId) return false;
    return caller.school_id === schoolId;
  }

  return false;
}

async function callerMayAccessBookRow(
  admin: AnySupabase,
  caller: CrmCaller,
  schoolIdsFromName: string[],
  schoolName: string | null,
): Promise<boolean> {
  if (caller.role === 'admin') return true;

  const allowedSchools = await getCallerSchoolIds(admin, caller);
  if (allowedSchools === 'all') return true;
  if (!allowedSchools.length) return false;

  if (schoolIdsFromName.some((id) => allowedSchools.includes(id))) return true;

  // Fallback: school-name substring match against caller's school names
  if (schoolName?.trim()) {
    const { data: schools } = await admin
      .from('schools')
      .select('id, name')
      .in('id', allowedSchools);
    const needle = schoolName.trim().toLowerCase();
    return (schools ?? []).some((s: any) => String(s.name ?? '').toLowerCase().includes(needle)
      || needle.includes(String(s.name ?? '').toLowerCase()));
  }

  return false;
}

/** Map lead/pipeline stages into the CRM UI vocabulary. */
export function normalizeCrmStage(stage: string | null | undefined): string {
  const s = (stage || 'prospect').toLowerCase();
  if (s === 'enquiry' || s === 'lead') return 'prospect';
  if (s === 'contacted' || s === 'trial') return 'active';
  if (s === 'enrolled') return 'won';
  if (['prospect', 'active', 'at_risk', 'won', 'churned'].includes(s)) return s;
  return 'prospect';
}

/** Require contact_id on list endpoints for non-admins (blocks global dumps). */
export function requireContactIdForNonAdmin(
  caller: CrmCaller,
  contactId: string | null,
): string | null {
  if (caller.role === 'admin') return null;
  if (!contactId) return 'contact_id is required';
  return null;
}
