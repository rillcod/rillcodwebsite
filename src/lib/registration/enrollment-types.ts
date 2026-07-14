/**
 * Canonical student / portal enrollment types (DB CHECK + app writes).
 *
 *   school      — partner school
 *   online      — online school
 *   in_person   — centre / direct
 *   special     — seasonal / AI / featured special programmes (was summer_school / bootcamp)
 *
 * All legacy "summer_*" / "bootcamp" values map here so backend wiring stays united.
 *
 * Public registration doors (do not mix):
 *   STUDENT_REGISTRATION_PATH — term chooser only (school / online)
 *   SCHOOL_REGISTRATION_PATH  — institution partnership only
 *   Special programmes         — /special/[slug] (Summer / seasonal + in-person centre seats)
 *   in_person                   — not a term product; route to special onsite */

export const CANONICAL_ENROLLMENT_TYPES = ['school', 'online', 'in_person', 'special'] as const;
export type CanonicalEnrollmentType = (typeof CANONICAL_ENROLLMENT_TYPES)[number];

/** Types shown on the main learner registration chooser (special + in-person summer are separate doors). */
export const TERM_ENROLLMENT_TYPES = ['school', 'online'] as const;
export type TermEnrollmentType = (typeof TERM_ENROLLMENT_TYPES)[number];

/** Single public student enrolment page. Deep-link with ?type=school|online
 *  (?type=in_person redirects to the featured Summer / special registration). */
export const STUDENT_REGISTRATION_PATH = '/student-registration';
/** Institution partnership signup — not a student enrollment_type path. */
export const SCHOOL_REGISTRATION_PATH = '/school-registration';
/** Legacy online URL — permanently redirects to STUDENT_REGISTRATION_PATH?type=online */
export const ONLINE_REGISTRATION_LEGACY_PATH = '/online-registration';

export function isTermEnrollmentType(value: string | null | undefined): value is TermEnrollmentType {
  return (TERM_ENROLLMENT_TYPES as readonly string[]).includes(String(value || '').trim().toLowerCase());
}

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
  special_program: 'special',
  special_programme: 'special',
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

/** CRM / audit / invoice metadata source tag (new writes). */
export const SPECIAL_SOURCE = 'special_program';

/** Public balance URL (legacy path kept; /summer-school redirects to featured special). */
export const SPECIAL_BALANCE_PATH = '/summer-school/pay-balance';
export const SPECIAL_LEGACY_PUBLIC_PATH = '/summer-school';

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

/** Normalize any payment_type to the canonical special_* write value when applicable. */
export function canonicalSpecialPaymentType(
  value: string | null | undefined,
): typeof SPECIAL_PAYMENT_TYPE | typeof SPECIAL_BALANCE_PAYMENT_TYPE | string {
  const v = String(value || '').toLowerCase();
  if (isSpecialProgramBalancePaymentType(v)) return SPECIAL_BALANCE_PAYMENT_TYPE;
  if (isSpecialProgramTuitionPaymentType(v)) return SPECIAL_PAYMENT_TYPE;
  return v;
}

/** Finance reminder streams — summer_school is a legacy alias of special_program. */
export type CanonicalReminderStream =
  | 'invoice'
  | 'school_billing'
  | 'individual_billing'
  | 'special_program';

export function normalizeReminderStream(
  value: string | null | undefined,
): CanonicalReminderStream | string {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'summer_school' || v === 'special_program' || v === 'special') return 'special_program';
  return v;
}

/**
 * programs.program_scope — seasonal scopes map to `special`.
 * Legacy DB may still hold summer_school / bootcamp until migration remaps.
 */
export const CANONICAL_PROGRAM_SCOPES = ['regular_school', 'online', 'special'] as const;
export type CanonicalProgramScope = (typeof CANONICAL_PROGRAM_SCOPES)[number];

export function normalizeProgramScope(
  value: string | null | undefined,
  fallback: CanonicalProgramScope = 'regular_school',
): CanonicalProgramScope {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return fallback;
  if (v === 'online') return 'online';
  if (v === 'special' || v === 'summer_school' || v === 'bootcamp' || v === 'seasonal') return 'special';
  if (v === 'regular_school' || v === 'school') return 'regular_school';
  return fallback;
}

export function isSeasonalProgramScope(value: string | null | undefined): boolean {
  return normalizeProgramScope(value) === 'special' || normalizeProgramScope(value) === 'online';
}

/** True for any special-programme related source tag (CRM, metadata). */
export function isSpecialSource(value: string | null | undefined): boolean {
  const v = String(value || '').toLowerCase();
  return (
    v === SPECIAL_SOURCE ||
    v === 'summer_school' ||
    v === 'summer_school_onboard' ||
    v === 'summer_school_payment' ||
    v === 'summer_school_manual_payment' ||
    v === 'summer_school_manual_balance' ||
    v === 'summer_balance_payment' ||
    v === 'special_program_payment' ||
    v === 'special_program_onboard' ||
    v === 'special_program_manual_payment' ||
    v === 'special_program_manual_balance' ||
    v === 'special_balance_payment'
  );
}
