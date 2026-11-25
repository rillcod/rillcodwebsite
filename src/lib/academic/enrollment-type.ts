import type { SupabaseClient } from '@supabase/supabase-js';

export type CanonicalEnrollmentType = 'school' | 'online' | 'in_person' | 'special';

const ONLINE_CUE_RE = /\b(online\s*school|virtual\s*school|virtual\s*class)\b/i;
const SPECIAL_CUE_RE = /\b(summer\s*school|bootcamp|coding\s*club|holiday|seasonal|speciali[sz]ed)\b/i;
const IN_PERSON_CUE_RE = /\b(in[\s-]*person|onsite\s*hub|academy\s*hub)\b/i;

/**
 * Mirrors Postgres `public.canonical_academic_enrollment_type(text)` 1-to-1
 * so any write to `portal_users.enrollment_type` or `academic_offerings.enrollment_type`
 * satisfies `guard_portal_student_class_pathway`.
 */
export function canonicalizeEnrollmentType(raw?: string | null): CanonicalEnrollmentType | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'school' || v === 'school_term' || v === 'partner_school') return 'school';
  if (v === 'online' || v === 'online_school' || v === 'virtual') return 'online';
  if (v === 'in_person' || v === 'in-person' || v === 'onsite') return 'in_person';
  if (
    v === 'special'
    || v === 'summer_school'
    || v === 'summer'
    || v === 'bootcamp'
    || v === 'seasonal'
    || v === 'holiday'
    || v === 'special_program'
    || v === 'special_programme'
    || v === 'independent'
  ) {
    return 'special';
  }
  return null;
}

/**
 * Returns true when an enrollment pathway follows the 3-term academic year
 * (`First Term / Second Term / Third Term` + September session rollover),
 * and false for fixed-date / cohort programmes (`in_person` and `special`).
 */
export function isTermlySchoolCalendar(enrollmentType?: string | null): boolean {
  const canon = canonicalizeEnrollmentType(enrollmentType);
  if (!canon) return true;
  return canon === 'school' || canon === 'online';
}

export function extractOfferingEnrollmentType(academicOfferings: unknown): CanonicalEnrollmentType | null {
  const item = Array.isArray(academicOfferings) ? academicOfferings[0] : academicOfferings;
  if (!item || typeof item !== 'object') return null;
  return canonicalizeEnrollmentType((item as { enrollment_type?: string | null }).enrollment_type);
}

/**
 * Authoritatively resolves the canonical `enrollment_type` required for a learner
 * joining or confirmed in a class so `guard_portal_student_class_pathway` never throws.
 */
export function inferCanonicalEnrollmentTypeForClass(opts: {
  offeringEnrollmentType?: string | null;
  academicOfferings?: unknown;
  className?: string | null;
  schoolId?: string | null;
  schoolName?: string | null;
  fallbackEnrollmentType?: string | null;
}): CanonicalEnrollmentType {
  const fromOffering =
    canonicalizeEnrollmentType(opts.offeringEnrollmentType)
    ?? extractOfferingEnrollmentType(opts.academicOfferings);
  if (fromOffering) return fromOffering;

  const combinedLabels = `${opts.className ?? ''} ${opts.schoolName ?? ''}`.trim();
  if (combinedLabels) {
    if (ONLINE_CUE_RE.test(combinedLabels)) return 'online';
    if (SPECIAL_CUE_RE.test(combinedLabels)) return 'special';
    if (IN_PERSON_CUE_RE.test(combinedLabels)) return 'in_person';
  }

  const fromFallback = canonicalizeEnrollmentType(opts.fallbackEnrollmentType);
  if (fromFallback) {
    // If placing into a partner school class without an offering yet, regular school wins over stale 'special'
    if (opts.schoolId && fromFallback === 'special' && !SPECIAL_CUE_RE.test(combinedLabels)) {
      return 'school';
    }
    return fromFallback;
  }

  return opts.schoolId ? 'school' : 'special';
}

/**
 * Loads the target class's `academic_offerings(enrollment_type)` when needed and returns
 * a guaranteed non-null `CanonicalEnrollmentType` before writing `portal_users.class_id`.
 */
export async function resolveClassCanonicalEnrollmentType(
  admin: SupabaseClient<any>,
  classId?: string | null,
  opts: {
    schoolId?: string | null;
    schoolName?: string | null;
    className?: string | null;
    fallbackEnrollmentType?: string | null;
  } = {},
): Promise<CanonicalEnrollmentType> {
  if (classId) {
    try {
      const { data: cls } = await admin
        .from('classes')
        .select('name, school_id, academic_offerings(enrollment_type)')
        .eq('id', classId)
        .maybeSingle();
      if (cls) {
        return inferCanonicalEnrollmentTypeForClass({
          academicOfferings: (cls as any).academic_offerings,
          className: (cls as any).name ?? opts.className,
          schoolId: (cls as any).school_id ?? opts.schoolId,
          schoolName: opts.schoolName,
          fallbackEnrollmentType: opts.fallbackEnrollmentType,
        });
      }
    } catch {
      // Safe fallback for unit test mocks that do not stub `classes`
    }
  }

  return inferCanonicalEnrollmentTypeForClass(opts);
}
