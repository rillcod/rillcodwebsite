import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOrCreateStudentRowId } from '@/lib/parents/links';

type AnySupabase = SupabaseClient<any>;

const VALID_GENDERS = new Set(['male', 'female']);

export type StudentRecordGaps = {
  needsGender: boolean;
  needsAge: boolean;
};

export type RecordEnrichmentResult = {
  genderRecorded: boolean;
  ageRecorded: boolean;
  whatsappOptInSet: boolean;
};

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

async function fetchStudentRow(admin: AnySupabase, studentUserId: string) {
  const { data } = await admin
    .from('students')
    .select('id, gender, age, date_of_birth')
    .eq('user_id', studentUserId)
    .maybeSingle();
  return data;
}

/** Which student identity fields are still blank and can be parent-supplied (fill-only). */
export async function getStudentRecordGaps(admin: AnySupabase, studentUserId: string): Promise<StudentRecordGaps> {
  try {
    const row = await fetchStudentRow(admin, studentUserId);
    if (!row) return { needsGender: false, needsAge: false };
    const needsGender = !String(row.gender ?? '').trim();
    const needsAge = row.age == null && !String(row.date_of_birth ?? '').trim();
    return { needsGender, needsAge };
  } catch {
    return { needsGender: false, needsAge: false };
  }
}

/** @deprecated use getStudentRecordGaps */
export async function studentNeedsGender(admin: AnySupabase, studentUserId: string): Promise<boolean> {
  return (await getStudentRecordGaps(admin, studentUserId)).needsGender;
}

/**
 * Fill-only: parent-supplied gender is written when the student record is blank.
 */
export async function applyParentSuppliedChildGender(
  admin: AnySupabase,
  studentUserId: string,
  rawGender: string | null | undefined,
): Promise<boolean> {
  const gender = normaliseChildGender(rawGender);
  if (!gender) return false;

  const childRowId = await resolveOrCreateStudentRowId(admin, studentUserId);
  if (!childRowId) return false;

  const { data: existing } = await admin.from('students').select('gender').eq('id', childRowId).maybeSingle();
  if (String(existing?.gender ?? '').trim()) return false;

  const now = new Date().toISOString();
  await admin.from('students').update({ gender, updated_at: now }).eq('id', childRowId);
  try {
    await admin.from('portal_users').update({ gender, updated_at: now }).eq('id', studentUserId);
  } catch { /* best-effort */ }
  return true;
}

/**
 * Fill-only: parent-supplied age when age and date_of_birth are both blank.
 * Also sets an approximate date_of_birth (Jan 1 of birth year) for reporting.
 */
export async function applyParentSuppliedChildAge(
  admin: AnySupabase,
  studentUserId: string,
  rawAge: string | number | null | undefined,
): Promise<boolean> {
  const age = normaliseChildAge(rawAge);
  if (age == null) return false;

  const childRowId = await resolveOrCreateStudentRowId(admin, studentUserId);
  if (!childRowId) return false;

  const { data: existing } = await admin
    .from('students')
    .select('age, date_of_birth')
    .eq('id', childRowId)
    .maybeSingle();
  if (existing?.age != null || String(existing?.date_of_birth ?? '').trim()) return false;

  const birthYear = new Date().getFullYear() - age;
  const approxDob = `${birthYear}-01-01`;
  const now = new Date().toISOString();
  await admin.from('students').update({ age, date_of_birth: approxDob, updated_at: now }).eq('id', childRowId);
  return true;
}

/** Opt the parent into WhatsApp updates when they tick the box on the claim form. */
export async function applyParentWhatsappOptIn(
  admin: AnySupabase,
  parentId: string,
  phone: string | null,
  optedIn: boolean,
): Promise<boolean> {
  if (!optedIn) return false;
  const now = new Date().toISOString();
  await admin.from('portal_users').update({
    whatsapp_opt_in: true,
    ...(phone ? { phone } : {}),
    updated_at: now,
  }).eq('id', parentId);
  return true;
}

/** Run all fill-only enrichments from a parent claim in one place. */
export async function applyParentRecordEnrichment(
  admin: AnySupabase,
  input: {
    studentUserId: string;
    parentId: string;
    phone: string | null;
    childGender?: string | null;
    childAge?: string | number | null;
    whatsappOptIn?: boolean;
  },
): Promise<RecordEnrichmentResult> {
  const [genderRecorded, ageRecorded, whatsappOptInSet] = await Promise.all([
    applyParentSuppliedChildGender(admin, input.studentUserId, input.childGender),
    applyParentSuppliedChildAge(admin, input.studentUserId, input.childAge),
    applyParentWhatsappOptIn(admin, input.parentId, input.phone, !!input.whatsappOptIn),
  ]);
  return { genderRecorded, ageRecorded, whatsappOptInSet };
}
