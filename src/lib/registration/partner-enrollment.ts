/**
 * Partner-school public enrolment — term vs holiday tracks.
 *
 * Policy:
 *   - Only schools with `public_enrollment_open` (or listed below) appear on the form.
 *   - Term: ₦30,000 — school delivery settlement + Rillcod online platform access.
 *   - Holiday: ₦30,000 subsidised — tracked separately from term (same fee).
 *   - Summer / special centre seats stay on the special-program funnel (different fees).
 */

import {
  PARTNER_SCHOOL_HOLIDAY_FEE_LABEL,
  PARTNER_SCHOOL_TERM_FEE,
  PARTNER_SCHOOL_TERM_FEE_LABEL,
} from '@/lib/registration/programme-map';

type PartnerScheduleOption = {
  value: string;
  label: string;
  fee: number;
  feeLabel: string;
};

/** Term classes at the partner school (academic session). */
export const PARTNER_TERM_SCHEDULE_VALUE = 'Termly Programme';
/** Vacation / holiday cohort at the same partner school — separate track. */
export const PARTNER_HOLIDAY_SCHEDULE_VALUE = 'Holiday Programme';

/** Legacy schedule labels still accepted on payment (map → term track). */
export const PARTNER_LEGACY_TERM_SCHEDULE_VALUES = [
  'Weekday Afternoons',
  'Weekend In-Person',
] as const;

export type PartnerProgramTrack = 'term' | 'holiday';

export const PARTNER_TERM_SCHEDULE: PartnerScheduleOption = {
  value: PARTNER_TERM_SCHEDULE_VALUE,
  label: 'During school term (at your partner school)',
  fee: PARTNER_SCHOOL_TERM_FEE,
  feeLabel: PARTNER_SCHOOL_TERM_FEE_LABEL,
};

export const PARTNER_HOLIDAY_SCHEDULE: PartnerScheduleOption = {
  value: PARTNER_HOLIDAY_SCHEDULE_VALUE,
  label: 'Holiday / vacation programme (subsidised)',
  fee: PARTNER_SCHOOL_TERM_FEE,
  feeLabel: PARTNER_SCHOOL_HOLIDAY_FEE_LABEL,
};

/** Public form schedules — exactly two partner tracks. */
export const PARTNER_PUBLIC_SCHEDULES: PartnerScheduleOption[] = [
  PARTNER_TERM_SCHEDULE,
  PARTNER_HOLIDAY_SCHEDULE,
];

export const PARTNER_FEE_EXPLAINER = {
  term:
    '₦30,000 per term: we settle your partner school for in-school delivery; the remainder funds Rillcod online platform access for your child.',
  holiday:
    '₦30,000 subsidised holiday fee for current partner-school families — tracked separately from the school-term programme.',
  shortTerm: 'School settled · online platform included',
  shortHoliday: 'Holiday cohort · subsidised partner rate',
} as const;

/**
 * Optional hard allowlist by exact `schools.name` (case-insensitive).
 * Prefer DB flag `public_enrollment_open`; use this as a second gate when set.
 * Leave empty to rely on the DB flag only.
 */
export const PUBLIC_PARTNER_ENROLLMENT_SCHOOL_NAMES: readonly string[] = [
  // Set exact names of the two live partners, e.g.:
  // 'WORD OF FAITH GROUP OF SCHOOL',
  // 'Christ The Redeem School (Prov-6)',
];

export function normalizeSchoolNameKey(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function isListedPublicPartnerSchoolName(name: string | null | undefined): boolean {
  if (!PUBLIC_PARTNER_ENROLLMENT_SCHOOL_NAMES.length) return true;
  const key = normalizeSchoolNameKey(name || '');
  return PUBLIC_PARTNER_ENROLLMENT_SCHOOL_NAMES.some(
    (n) => normalizeSchoolNameKey(n) === key,
  );
}

export function partnerTrackFromSchedule(
  preferredSchedule: string | null | undefined,
): PartnerProgramTrack | null {
  const v = String(preferredSchedule || '').trim();
  if (!v) return null;
  if (v === PARTNER_HOLIDAY_SCHEDULE_VALUE) return 'holiday';
  if (
    v === PARTNER_TERM_SCHEDULE_VALUE
    || (PARTNER_LEGACY_TERM_SCHEDULE_VALUES as readonly string[]).includes(v)
  ) {
    return 'term';
  }
  return null;
}

export function isPartnerHolidaySchedule(preferredSchedule: string | null | undefined): boolean {
  return partnerTrackFromSchedule(preferredSchedule) === 'holiday';
}

export function partnerTrackLabel(track: PartnerProgramTrack | null | undefined): string {
  if (track === 'holiday') return 'Partner holiday';
  if (track === 'term') return 'Partner term';
  return 'Partner school';
}

export function partnerFeeExplainer(track: PartnerProgramTrack | null | undefined): string {
  if (track === 'holiday') return PARTNER_FEE_EXPLAINER.holiday;
  return PARTNER_FEE_EXPLAINER.term;
}
