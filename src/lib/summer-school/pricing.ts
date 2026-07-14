/** Summer / special programme duration tuition (NGN).
 *
 * Public / new registrations (Facebook ads):
 *   Onsite (physical)  ₦35,000  — cheaper centre seats
 *   Online / Hybrid    ₦60,000
 *
 * Legacy online clients already on the system at the earlier ₦50,000 quote
 * keep that locked total for balance payments (see resolveLockedTuitionTotal).
 */

export const SUMMER_ONSITE_FEE = 35_000;
export const SUMMER_ONLINE_FEE = 60_000;
/** Grandfathered online quote for learners who started before the ₦60k public rate. */
export const SUMMER_ONLINE_LEGACY_FEE = 50_000;

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
 * the legacy ₦50k online plan from classic deposit amounts.
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

  // Classic legacy online instalments: ₦25k deposit of ₦50k, or full ₦50k paid.
  if (mode !== 'Onsite') {
    if (paid === 25_000 || paid === 50_000) return SUMMER_ONLINE_LEGACY_FEE;
    // Half of legacy (any other half-pattern still under new price)
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
  };
}
