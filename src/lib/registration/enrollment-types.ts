/**
 * Canonical student / portal enrollment types (DB CHECK + app writes).
 *
 *   school      — partner school
 *   online      — online school
 *   in_person   — centre / direct
 *   special     — seasonal / AI / featured special programmes (was summer_school / bootcamp)
 *
 * Legacy aliases are normalised on read/write so old rows and metadata keep working.
 */

export const CANONICAL_ENROLLMENT_TYPES = ['school', 'online', 'in_person', 'special'] as const;
export type CanonicalEnrollmentType = (typeof CANONICAL_ENROLLMENT_TYPES)[number];

/** UI-only path for “open special programme page” — never persisted. */
export type RegistrationPathType = CanonicalEnrollmentType | 'special_handoff' | '';

const LEGACY_TO_CANONICAL: Record<string, CanonicalEnrollmentType> = {
  school: 'school',
  online: 'online',
  online_school: 'online',
  in_person: 'in_person',
  'in-person': 'in_person',
  special: 'special',
  summer_school: 'special',
  summer: 'special',
  bootcamp: 'special',
  seasonal: 'special',
};

export function normalizeEnrollmentType(
  value: string | null | undefined,
  fallback: CanonicalEnrollmentType = 'in_person',
): CanonicalEnrollmentType {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return fallback;
  return LEGACY_TO_CANONICAL[key] ?? fallback;
}

export function isSpecialEnrollment(value: string | null | undefined): boolean {
  return normalizeEnrollmentType(value, 'school') === 'special';
}

export function isOnlineEnrollment(value: string | null | undefined): boolean {
  return normalizeEnrollmentType(value, 'school') === 'online';
}

export function enrollmentTypeLabel(value: string | null | undefined): string {
  switch (normalizeEnrollmentType(value, 'school')) {
    case 'school':
      return 'Partner school';
    case 'online':
      return 'Online';
    case 'in_person':
      return 'In-person';
    case 'special':
      return 'Special programme';
    default:
      return 'Enrolment';
  }
}

/** Gateway payment_type for special-programme Paystack (new writes). */
export const SPECIAL_PAYMENT_TYPE = 'special_program';
export const SPECIAL_BALANCE_PAYMENT_TYPE = 'special_program_balance';

/** Accept legacy summer_* and new special_* payment types. */
export function isSpecialProgramPaymentType(value: string | null | undefined): boolean {
  const v = String(value || '').toLowerCase();
  return (
    v === SPECIAL_PAYMENT_TYPE ||
    v === SPECIAL_BALANCE_PAYMENT_TYPE ||
    v === 'summer_school' ||
    v === 'summer_school_balance'
  );
}

export function isSpecialProgramBalancePaymentType(value: string | null | undefined): boolean {
  const v = String(value || '').toLowerCase();
  return v === SPECIAL_BALANCE_PAYMENT_TYPE || v === 'summer_school_balance';
}

export function isSpecialProgramTuitionPaymentType(value: string | null | undefined): boolean {
  const v = String(value || '').toLowerCase();
  return v === SPECIAL_PAYMENT_TYPE || v === 'summer_school';
}
