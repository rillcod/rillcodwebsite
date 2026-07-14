/**
 * Public learner schedule + retail fee tables (NGN).
 * Partner-school schedules stay in programme-map; special/summer fees live in
 * summer-school/pricing + special_program_pages rows.
 *
 * Policy (2026):
 *   - Online term: Live (Wed/Fri evenings) or Weekend (Sat+Sun). No self-paced.
 *   - In-person centre term path is retired — face-to-face seats are Summer / special only.
 */

import { PARTNER_SCHOOL_TERM_FEE, PARTNER_SCHOOL_TERM_FEE_LABEL, PARTNER_SCHOOL_HOLIDAY_FEE_LABEL } from '@/lib/registration/programme-map';

export type RegistrationScheduleOption = {
  value: string;
  label: string;
  fee: number;
  feeLabel: string;
};

export const ONLINE_LIVE_SCHEDULE = 'Online Live Classes';
export const ONLINE_WEEKEND_SCHEDULE = 'Online Weekend';

/** Live online — Wed & Fri 8:00–9:00pm */
export const ONLINE_LIVE_FEE = 35_000;
export const ONLINE_LIVE_FEE_LABEL = '₦35,000 / term';

/** Weekend online — Sat 9:00am–1:00pm · Sun 12:00–1:00pm */
export const ONLINE_WEEKEND_FEE = 25_000;
export const ONLINE_WEEKEND_FEE_LABEL = '₦25,000 / term';

/** Summer / special onsite (full cohort duration — not a term fee). */
export const SUMMER_ONSITE_FEE = 40_000;

export const SCHOOL_SCHEDULES: RegistrationScheduleOption[] = [
  { value: 'Weekday Afternoons', label: 'Weekday Afternoons (at school)', fee: PARTNER_SCHOOL_TERM_FEE, feeLabel: PARTNER_SCHOOL_TERM_FEE_LABEL },
  { value: 'Weekend In-Person', label: 'Weekend In-Person Sessions', fee: PARTNER_SCHOOL_TERM_FEE, feeLabel: PARTNER_SCHOOL_TERM_FEE_LABEL },
  { value: 'Termly Programme', label: 'Full Termly Programme', fee: PARTNER_SCHOOL_TERM_FEE, feeLabel: PARTNER_SCHOOL_TERM_FEE_LABEL },
  { value: 'Holiday Programme', label: 'Holiday / Vacation Programme', fee: PARTNER_SCHOOL_TERM_FEE, feeLabel: PARTNER_SCHOOL_HOLIDAY_FEE_LABEL },
];

export const ONLINE_SCHEDULES: RegistrationScheduleOption[] = [
  {
    value: ONLINE_LIVE_SCHEDULE,
    label: 'Online Live — Wed & Fri (8:00pm–9:00pm)',
    fee: ONLINE_LIVE_FEE,
    feeLabel: ONLINE_LIVE_FEE_LABEL,
  },
  {
    value: ONLINE_WEEKEND_SCHEDULE,
    label: 'Online Weekend — Sat (9:00am–1:00pm) & Sun (12:00–1:00pm)',
    fee: ONLINE_WEEKEND_FEE,
    feeLabel: ONLINE_WEEKEND_FEE_LABEL,
  },
];

/** Fee lookup for Paystack / API (includes legacy aliases that still appear on old drafts). */
export const NON_SCHOOL_SCHEDULE_FEES: Record<string, number> = {
  [ONLINE_LIVE_SCHEDULE]: ONLINE_LIVE_FEE,
  'Online Live Sessions': ONLINE_LIVE_FEE,
  [ONLINE_WEEKEND_SCHEDULE]: ONLINE_WEEKEND_FEE,
  // Retired self-paced — keep keyed so stale drafts still resolve a fee if someone pays
  'Online Self-Paced': ONLINE_WEEKEND_FEE,
};

export function schedulesForEnrollmentType(
  enrollmentType: string,
): RegistrationScheduleOption[] {
  if (enrollmentType === 'school') return SCHOOL_SCHEDULES;
  if (enrollmentType === 'online') return ONLINE_SCHEDULES;
  // in_person is not offered on the term door anymore
  return [];
}

export function typeFeeLabel(enrollmentType: string): string {
  if (enrollmentType === 'school') return PARTNER_SCHOOL_TERM_FEE_LABEL;
  if (enrollmentType === 'online') return `From ${ONLINE_WEEKEND_FEE_LABEL}`;
  return '';
}
