import type { SupabaseClient } from '@supabase/supabase-js';
import {
  syncParentContactAcrossStores,
  syncStudentIdentityAcrossStores,
} from '@/lib/sync/student-parent-identity';

export {
  normaliseChildGender,
  normaliseChildAge,
  normaliseChildDob,
} from '@/lib/sync/student-parent-identity';

import {
  normaliseChildGender,
  normaliseChildAge,
  normaliseChildDob,
} from '@/lib/sync/student-parent-identity';

type AnySupabase = SupabaseClient<any>;

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
  if (!normaliseChildGender(rawGender)) return false;
  return syncStudentIdentityAcrossStores(admin, studentUserId, { gender: rawGender }, 'fill-only');
}

/**
 * Fill-only: exact date of birth (preferred over age alone).
 */
export async function applyParentSuppliedChildDob(
  admin: AnySupabase,
  studentUserId: string,
  rawDob: string | null | undefined,
): Promise<boolean> {
  if (!normaliseChildDob(rawDob)) return false;
  return syncStudentIdentityAcrossStores(admin, studentUserId, { date_of_birth: rawDob }, 'fill-only');
}

/**
 * Fill-only: parent-supplied age when age and date_of_birth are both blank.
 */
export async function applyParentSuppliedChildAge(
  admin: AnySupabase,
  studentUserId: string,
  rawAge: string | number | null | undefined,
): Promise<boolean> {
  if (normaliseChildAge(rawAge) == null) return false;
  return syncStudentIdentityAcrossStores(admin, studentUserId, { age: rawAge }, 'fill-only');
}

/** Opt the parent into WhatsApp updates when they tick the box on the claim form. */
export async function applyParentWhatsappOptIn(
  admin: AnySupabase,
  parentId: string,
  phone: string | null,
  optedIn: boolean,
): Promise<boolean> {
  if (!optedIn) return false;
  return syncParentContactAcrossStores(admin, parentId, { phone, whatsapp_opt_in: true });
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
