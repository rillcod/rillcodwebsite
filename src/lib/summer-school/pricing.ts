/** Summer / special programme duration tuition (NGN).
 *  Onsite = full in-person cohort fee (not a term product).
 *  Online / Hybrid = seasonal online fee for the same cohort window.
 */
export function getSummerTotalTuition(preferredMode: string): number {
  if (preferredMode === 'Onsite') return 35_000;
  return 50_000;
}

export function getSummerDepositAmount(preferredMode: string): number {
  // 50% instalment deposit
  return Math.round(getSummerTotalTuition(preferredMode) / 2);
}

export function getSummerTuitionAmount(preferredMode: string, paymentPlan: string): number {
  if (paymentPlan === 'installment') {
    return getSummerDepositAmount(preferredMode);
  }
  return getSummerTotalTuition(preferredMode);
}

export function getSummerBalanceDue(preferredMode: string, amountPaid: number): number {
  return Math.max(0, getSummerTotalTuition(preferredMode) - amountPaid);
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
