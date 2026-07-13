/** Summer School 2026 tuition (NGN). Onsite vs Online/Hybrid.
 *  Online is ₦50,000 total; installment allowed (50% = ₦25,000 deposit). */
export function getSummerTotalTuition(preferredMode: string): number {
  if (preferredMode === "Onsite") return 100_000;
  return 50_000;
}

export function getSummerDepositAmount(preferredMode: string): number {
  if (preferredMode === "Onsite") return 50_000;
  return 25_000;
}

export function getSummerTuitionAmount(preferredMode: string, paymentPlan: string): number {
  if (paymentPlan === "installment") {
    return getSummerDepositAmount(preferredMode);
  }
  return getSummerTotalTuition(preferredMode);
}

export function getSummerBalanceDue(preferredMode: string, amountPaid: number): number {
  return Math.max(0, getSummerTotalTuition(preferredMode) - amountPaid);
}

export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

export function tuitionLabels(preferredMode: string) {
  const isOnsite = preferredMode === "Onsite";
  const total = isOnsite ? 100_000 : 50_000;
  const deposit = isOnsite ? 50_000 : 25_000;
  return {
    total: formatNaira(total),
    deposit: formatNaira(deposit),
    fullShort: isOnsite ? "Full (₦100k)" : "Full (₦50k)",
    splitShort: isOnsite ? "Split (₦50k)" : "Split (₦25k)",
    isOnsite,
  };
}
