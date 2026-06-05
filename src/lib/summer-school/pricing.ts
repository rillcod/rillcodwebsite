/** Summer School 2026 tuition (NGN). Onsite vs Online/Hybrid. */
export function getSummerTotalTuition(preferredMode: string, hasSibling?: boolean): number {
  if (preferredMode === "Onsite") return 100_000;
  return hasSibling ? 50_000 : 70_000;
}

export function getSummerDepositAmount(preferredMode: string, hasSibling?: boolean): number {
  if (preferredMode === "Onsite") return 50_000;
  return hasSibling ? 25_000 : 35_000;
}

export function getSummerTuitionAmount(preferredMode: string, paymentPlan: string, hasSibling?: boolean): number {
  if (paymentPlan === "installment") {
    return getSummerDepositAmount(preferredMode, hasSibling);
  }
  return getSummerTotalTuition(preferredMode, hasSibling);
}

export function getSummerBalanceDue(preferredMode: string, amountPaid: number, hasSibling?: boolean): number {
  return Math.max(0, getSummerTotalTuition(preferredMode, hasSibling) - amountPaid);
}

export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

export function tuitionLabels(preferredMode: string, hasSibling?: boolean) {
  const isOnsite = preferredMode === "Onsite";
  const total = isOnsite ? 100_000 : (hasSibling ? 50_000 : 70_000);
  const deposit = isOnsite ? 50_000 : (hasSibling ? 25_000 : 35_000);
  return {
    total: formatNaira(total),
    deposit: formatNaira(deposit),
    fullShort: isOnsite ? "Full (₦100k)" : (hasSibling ? "Full (₦50k)" : "Full (₦70k)"),
    splitShort: isOnsite ? "Split (₦50k)" : (hasSibling ? "Split (₦25k)" : "Split (₦35k)"),
    isOnsite,
  };
}
