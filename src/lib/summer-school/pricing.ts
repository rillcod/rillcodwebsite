/** Summer / special programme duration tuition (NGN).
 *
 * Public / Batch B (2nd cohort) — Facebook ads:
 *   Onsite (physical)  ₦40,000  — centre seats
 *   Online / Hybrid    ₦50,000
 *
 * Batch A / earlier online attendees who were charged ₦60,000 keep that
 * locked total for balance payments (see resolveLockedTuitionTotal).
 */

export const SUMMER_ONSITE_FEE = 40_000;
/** Batch B public online rate. */
export const SUMMER_ONLINE_FEE = 50_000;
/** Batch A online quote — grandfather balance payers who started at ₦60k. */
export const SUMMER_ONLINE_LEGACY_FEE = 60_000;

/** Public batch label for ads / landing. */
export const SUMMER_BATCH_LABEL = 'Batch B · 2nd cohort';
/** Tentative live class days for Batch B (online / hybrid). */
export const SUMMER_BATCH_B_CLASS_DAYS =
  'Tentatively Tuesday, Thursday & Saturday';

export function getSummerTotalTuition(preferredMode: string): number {
  if (preferredMode === 'Onsite') return SUMMER_ONSITE_FEE;
  return SUMMER_ONLINE_FEE;
}

export function getSummerDepositAmount(preferredMode: string): number {
  return Math.round(getSummerTotalTuition(preferredMode) / 2);
}

export function getSummerTuitionAmount(preferredMode: string, paymentPlan: string): number {
  if (paymentPlan === 'installment') {
    return getSummerDepositAmount(preferredMode);
  }
  return getSummerTotalTuition(preferredMode);
}

/**
 * Resolve the tuition total that should apply to an existing partial payer.
 * Prefer the `total_tuition` stamped on their first payment; otherwise infer
 * Batch A (₦60k) from classic deposit patterns.
 */
export function resolveLockedTuitionTotal(opts: {
  preferredMode: string;
  amountPaid: number;
  lockedFromPayments?: number | null;
}): number {
  const locked = Number(opts.lockedFromPayments);
  if (Number.isFinite(locked) && locked > 0) return locked;

  const paid = Number(opts.amountPaid) || 0;
  const mode = opts.preferredMode || 'Online';

  // Batch A online: ₦30k deposit of ₦60k, or full ₦60k already paid.
  if (mode !== 'Onsite') {
    if (paid === 30_000 || paid === 60_000) return SUMMER_ONLINE_LEGACY_FEE;
    if (paid > 0 && paid < SUMMER_ONLINE_LEGACY_FEE && paid === Math.round(SUMMER_ONLINE_LEGACY_FEE / 2)) {
      return SUMMER_ONLINE_LEGACY_FEE;
    }
  }

  return getSummerTotalTuition(mode);
}

export function getSummerBalanceDueFromTotal(totalTuition: number, amountPaid: number): number {
  return Math.max(0, totalTuition - amountPaid);
}

export function getSummerBalanceDue(preferredMode: string, amountPaid: number): number {
  return getSummerBalanceDueFromTotal(getSummerTotalTuition(preferredMode), amountPaid);
}

export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG')}`;
}

export function tuitionLabels(preferredMode: string) {
  const isOnsite = preferredMode === 'Onsite';
  const total = getSummerTotalTuition(preferredMode);
  const deposit = getSummerDepositAmount(preferredMode);
  const short = (n: number) => {
    if (n >= 1000 && n % 1000 === 0) return `₦${n / 1000}k`;
    return formatNaira(n);
  };
  return {
    total: formatNaira(total),
    deposit: formatNaira(deposit),
    fullShort: `Full (${short(total)})`,
    splitShort: `Split (${short(deposit)})`,
    isOnsite,
  };
}

/** Ad / landing comparison copy helpers. */
export function summerPriceCompareLabels() {
  return {
    onsite: formatNaira(SUMMER_ONSITE_FEE),
    online: formatNaira(SUMMER_ONLINE_FEE),
    savingsVsOnline: formatNaira(SUMMER_ONLINE_FEE - SUMMER_ONSITE_FEE),
    batchLabel: SUMMER_BATCH_LABEL,
    classDays: SUMMER_BATCH_B_CLASS_DAYS,
  };
}
