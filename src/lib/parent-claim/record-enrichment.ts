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
  dobRecorded: boolean;
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

function ageFromDob(dob: string): number {
  const born = new Date(`${dob}T12:00:00`);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--;
  return age;
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
 * Fill-only: exact date of birth (preferred over age alone).
 */
export async function applyParentSuppliedChildDob(
  admin: AnySupabase,
  studentUserId: string,
  rawDob: string | null | undefined,
): Promise<boolean> {
  const dob = normaliseChildDob(rawDob);
  if (!dob) return false;

  const childRowId = await resolveOrCreateStudentRowId(admin, studentUserId);
  if (!childRowId) return false;

  const { data: existing } = await admin
    .from('students')
    .select('age, date_of_birth')
    .eq('id', childRowId)
    .maybeSingle();
  if (existing?.age != null || String(existing?.date_of_birth ?? '').trim()) return false;

  const age = ageFromDob(dob);
  const now = new Date().toISOString();
  await admin.from('students').update({ date_of_birth: dob, age, updated_at: now }).eq('id', childRowId);
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

/** Reject claim submissions that omit required fill-only record fields. */
export async function validateParentSuppliedRecordGaps(
  admin: AnySupabase,
  studentUserId: string,
  input: { childGender?: string | null; childAge?: string | number | null; childDob?: string | null },
): Promise<string | null> {
  const gaps = await getStudentRecordGaps(admin, studentUserId);
  if (gaps.needsGender && !normaliseChildGender(input.childGender)) {
    return "Please select your child's gender for school records.";
  }
  if (gaps.needsAge && normaliseChildAge(input.childAge) == null) {
    return "Please enter your child's age for school records.";
  }
  return null;
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
    childDob?: string | null;
    whatsappOptIn?: boolean;
  },
): Promise<RecordEnrichmentResult> {
  const dobRecorded = await applyParentSuppliedChildDob(admin, input.studentUserId, input.childDob);
  const [genderRecorded, ageRecorded, whatsappOptInSet] = await Promise.all([
    applyParentSuppliedChildGender(admin, input.studentUserId, input.childGender),
    dobRecorded ? Promise.resolve(false) : applyParentSuppliedChildAge(admin, input.studentUserId, input.childAge),
    applyParentWhatsappOptIn(admin, input.parentId, input.phone, !!input.whatsappOptIn),
  ]);
  return { genderRecorded, ageRecorded, dobRecorded, whatsappOptInSet };
}
