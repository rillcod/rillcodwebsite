/** Summer School 2026 tuition (NGN). Onsite vs Online/Hybrid. */
export function getSummerTotalTuition(preferredMode: string): number {
  return preferredMode === "Onsite" ? 100_000 : 70_000;
}

export function getSummerDepositAmount(preferredMode: string): number {
  return preferredMode === "Onsite" ? 50_000 : 35_000;
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
  return {
    total: formatNaira(isOnsite ? 100_000 : 70_000),
    deposit: formatNaira(isOnsite ? 50_000 : 35_000),
    fullShort: isOnsite ? "Full (₦100k)" : "Full (₦70k)",
    splitShort: isOnsite ? "Split (₦50k)" : "Split (₦35k)",
    isOnsite,
  };
}
