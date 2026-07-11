import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOrCreateStudentRowId } from '@/lib/parents/links';
import { cleanGrade, canonicalGrade, SINGLE_GRADES } from '@/lib/classes/naming';

type AnySupabase = SupabaseClient<any>;

const VALID_GENDERS = new Set(['male', 'female']);

/** Normalise parent-supplied gender to the values used across consent forms. */
export function normaliseChildGender(raw: string | null | undefined): 'male' | 'female' | null {
  const g = String(raw ?? '').trim().toLowerCase();
  return VALID_GENDERS.has(g) ? (g as 'male' | 'female') : null;
}

/** Parse parent-supplied age (consent forms use a plain number). */
export function normaliseChildAge(raw: string | number | null | undefined): number | null {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n) || n < 3 || n > 25) return null;
  return n;
}

/** Parse YYYY-MM-DD; rejects future dates and unreasonably old births. */
export function normaliseChildDob(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  if (d > now) return null;
  const ageYears = (now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (ageYears < 2 || ageYears > 30) return null;
  return s;
}

export type SyncMode = 'fill-only' | 'overwrite';

export type ChildIdentityInput = {
  gender?: string | null;
  age?: string | number | null;
  date_of_birth?: string | null;
  full_name?: string | null;
  /** Cohort / registered class label — never the specific grade. */
  section_class?: string | null;
  /** Specific canonical grade (Basic 2, JSS 1 …). */
  grade?: string | null;
};

export type ParentContactInput = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp_opt_in?: boolean;
};

export type LeadIdentitySnapshot = {
  child_gender?: string;
  child_age?: string;
  child_dob?: string;
  parent_whatsapp?: string;
  parent_whatsapp_opt_in?: boolean;
};

function ageFromDob(dob: string): number {
  const born = new Date(`${dob}T12:00:00`);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--;
  return age;
}

function shouldWrite(existing: unknown, mode: SyncMode): boolean {
  if (mode === 'overwrite') return true;
  if (existing == null) return true;
  if (typeof existing === 'string') return !existing.trim();
  return false;
}

/** Read canonical child identity from the students row (source of truth for age). */
export async function readStudentIdentitySnapshot(
  admin: AnySupabase,
  studentUserId: string,
): Promise<{ gender: string | null; age: number | null; date_of_birth: string | null; full_name: string | null; section_class: string | null } | null> {
  const { data: student } = await admin
    .from('students')
    .select('gender, age, date_of_birth, full_name, current_class, section_class, grade_level')
    .eq('user_id', studentUserId)
    .maybeSingle();
  if (!student) return null;
  const { data: portal } = await admin
    .from('portal_users')
    .select('full_name, section_class, gender, date_of_birth')
    .eq('id', studentUserId)
    .maybeSingle();
  return {
    gender: String(student.gender ?? portal?.gender ?? '').trim() || null,
    age: student.age ?? null,
    date_of_birth: String(student.date_of_birth ?? portal?.date_of_birth ?? '').trim() || null,
    full_name: student.full_name ?? portal?.full_name ?? null,
    section_class: student.current_class ?? student.section_class ?? student.grade_level ?? portal?.section_class ?? null,
  };
}

/**
 * Keep student identity aligned across students, portal_users (student), and auth metadata.
 * Derives age from DOB when needed; mirrors DOB/age/gender to portal_users.
 */
export async function syncStudentIdentityAcrossStores(
  admin: AnySupabase,
  studentUserId: string,
  input: ChildIdentityInput,
  mode: SyncMode = 'fill-only',
): Promise<boolean> {
  const childRowId = await resolveOrCreateStudentRowId(admin, studentUserId);
  if (!childRowId) return false;

  const [{ data: studentRow }, { data: portalRow }] = await Promise.all([
    admin.from('students').select('gender, age, date_of_birth, full_name, current_class, section_class, grade_level, grade').eq('id', childRowId).maybeSingle(),
    admin.from('portal_users').select('gender, date_of_birth, full_name, section_class, grade').eq('id', studentUserId).maybeSingle(),
  ]);

  const gender = normaliseChildGender(input.gender);
  const dob = normaliseChildDob(input.date_of_birth);
  let age = normaliseChildAge(input.age);
  if (age == null && dob) age = ageFromDob(dob);
  const approxDob = dob ?? (age != null ? `${new Date().getFullYear() - age}-01-01` : null);

  const studentPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const portalPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const authMeta: Record<string, unknown> = {};
  let changed = false;

  if (gender && shouldWrite(studentRow?.gender, mode)) {
    studentPatch.gender = gender;
    portalPatch.gender = gender;
    authMeta.gender = gender;
    changed = true;
  }
  if (approxDob && shouldWrite(studentRow?.date_of_birth, mode)) {
    studentPatch.date_of_birth = approxDob;
    portalPatch.date_of_birth = approxDob;
    authMeta.date_of_birth = approxDob;
    changed = true;
  }
  if (age != null && shouldWrite(studentRow?.age, mode)) {
    studentPatch.age = age;
    changed = true;
  }
  if (input.full_name?.trim() && shouldWrite(studentRow?.full_name, mode)) {
    studentPatch.full_name = input.full_name.trim();
    studentPatch.name = input.full_name.trim();
    portalPatch.full_name = input.full_name.trim();
    authMeta.full_name = input.full_name.trim();
    changed = true;
  }
  const klass = input.section_class?.trim();
  if (klass && shouldWrite(studentRow?.current_class ?? studentRow?.section_class, mode)) {
    studentPatch.current_class = klass;
    studentPatch.section = klass;
    portalPatch.section_class = klass;
    authMeta.section_class = klass;
    changed = true;
  }

  const gradeCandidate = canonicalGrade(input.grade) || cleanGrade(input.grade);
  const specificGrade =
    gradeCandidate && (SINGLE_GRADES as readonly string[]).includes(gradeCandidate)
      ? gradeCandidate
      : null;
  if (specificGrade && shouldWrite(studentRow?.grade_level ?? studentRow?.grade ?? portalRow?.grade, mode)) {
    studentPatch.grade = specificGrade;
    studentPatch.grade_level = specificGrade;
    portalPatch.grade = specificGrade;
    authMeta.grade = specificGrade;
    changed = true;
  }

  if (!changed) return false;

  await admin.from('students').update(studentPatch).eq('id', childRowId);
  if (Object.keys(portalPatch).length > 1) {
    await admin.from('portal_users').update(portalPatch).eq('id', studentUserId);
  }
  if (Object.keys(authMeta).length > 0) {
    try {
      await admin.auth.admin.updateUserById(studentUserId, { user_metadata: authMeta });
    } catch { /* best-effort */ }
  }
  return true;
}

/** Cascade parent contact fields to portal_users (parent) and linked student rows. */
export async function syncParentContactAcrossStores(
  admin: AnySupabase,
  parentId: string,
  input: ParentContactInput,
): Promise<boolean> {
  const parentPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.full_name?.trim()) parentPatch.full_name = input.full_name.trim();
  if (input.email?.trim()) parentPatch.email = input.email.trim().toLowerCase();
  if (input.phone != null) parentPatch.phone = input.phone;
  if (input.whatsapp_opt_in === true) parentPatch.whatsapp_opt_in = true;

  if (Object.keys(parentPatch).length <= 1) return false;
  await admin.from('portal_users').update(parentPatch).eq('id', parentId);

  const studentPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.full_name?.trim()) studentPatch.parent_name = input.full_name.trim();
  if (input.email?.trim()) studentPatch.parent_email = input.email.trim().toLowerCase();
  if (input.phone != null) studentPatch.parent_phone = input.phone;

  if (Object.keys(studentPatch).length <= 1) return true;

  const { data: links } = await admin
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_id', parentId);
  const studentRowIds = (links ?? []).map(l => l.student_id).filter(Boolean);
  if (studentRowIds.length) {
    await admin.from('students').update(studentPatch).in('id', studentRowIds);
  }
  if (input.email?.trim()) {
    await admin.from('students').update(studentPatch).eq('parent_email', input.email.trim().toLowerCase());
  }
  return true;
}

/** Refresh matched consent / result-checker leads so response_data matches operational records. */
export async function refreshMatchedLeadIdentity(
  admin: AnySupabase,
  params: {
    studentUserId?: string | null;
    parentId?: string | null;
    snapshot: LeadIdentitySnapshot;
  },
): Promise<void> {
  const { studentUserId, parentId, snapshot } = params;
  if (!studentUserId && !parentId) return;

  let query = admin.from('form_leads').select('id, response_data');
  if (studentUserId && parentId) {
    query = query.or(`matched_student_id.eq.${studentUserId},matched_parent_id.eq.${parentId}`);
  } else if (studentUserId) {
    query = query.eq('matched_student_id', studentUserId);
  } else {
    query = query.eq('matched_parent_id', parentId!);
  }

  const { data: leads } = await query.limit(50);
  for (const lead of leads ?? []) {
    const rd = { ...((lead.response_data as Record<string, unknown>) ?? {}) };
    if (snapshot.child_gender) rd.child_gender = snapshot.child_gender;
    if (snapshot.child_age) rd.child_age = snapshot.child_age;
    if (snapshot.child_dob) rd.child_dob = snapshot.child_dob;
    if (snapshot.parent_whatsapp) rd.parent_whatsapp = snapshot.parent_whatsapp;
    if (snapshot.parent_whatsapp_opt_in != null) rd.parent_whatsapp_opt_in = snapshot.parent_whatsapp_opt_in;
    await admin.from('form_leads').update({ response_data: rd, updated_at: new Date().toISOString() }).eq('id', lead.id);
  }
}

/** Build lead/CRM snapshot from consent-style response_data. */
export function leadSnapshotFromResponseData(rd: Record<string, unknown>): LeadIdentitySnapshot {
  return {
    child_gender: String(rd.child_gender ?? '').trim() || undefined,
    child_age: String(rd.child_age ?? '').trim() || undefined,
    child_dob: String(rd.child_dob ?? '').trim() || undefined,
    parent_whatsapp: String(rd.parent_whatsapp ?? '').trim() || undefined,
    parent_whatsapp_opt_in: rd.parent_whatsapp_opt_in === true,
  };
}

/** Apply consent lead child fields to student stores (fill-only by default). */
export async function syncStudentFromLeadResponse(
  admin: AnySupabase,
  studentUserId: string,
  responseData: Record<string, unknown>,
  mode: SyncMode = 'fill-only',
): Promise<boolean> {
  // child_class on the form is the SPECIFIC grade (labeled "Class / Grade"), not the
  // registered section/cohort. Never write it into section_class.
  return syncStudentIdentityAcrossStores(admin, studentUserId, {
    gender: String(responseData.child_gender ?? ''),
    age: String(responseData.child_age ?? ''),
    date_of_birth: String(responseData.child_dob ?? ''),
    full_name: String(responseData.child_name ?? ''),
    grade: String(responseData.child_class ?? ''),
  }, mode);
}

/** After any student/parent identity change, push canonical values to leads + return CRM fields. */
export async function harmonizeStudentParentIdentity(
  admin: AnySupabase,
  params: {
    studentUserId: string;
    parentId?: string | null;
    parentPhone?: string | null;
    parentWhatsappOptIn?: boolean;
  },
): Promise<LeadIdentitySnapshot | null> {
  const snap = await readStudentIdentitySnapshot(admin, params.studentUserId);
  if (!snap) return null;

  const leadSnap: LeadIdentitySnapshot = {
    child_gender: snap.gender ?? undefined,
    child_age: snap.age != null ? String(snap.age) : undefined,
    child_dob: snap.date_of_birth ?? undefined,
    parent_whatsapp: params.parentPhone ?? undefined,
    parent_whatsapp_opt_in: params.parentWhatsappOptIn,
  };

  await refreshMatchedLeadIdentity(admin, {
    studentUserId: params.studentUserId,
    parentId: params.parentId,
    snapshot: leadSnap,
  });

  return leadSnap;
}
