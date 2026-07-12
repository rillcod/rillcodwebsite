/**
 * Derive school-invoice builder fields from a stored school invoice's
 * line items + metadata. Shared by Invoice Builder and Billing Docs.
 */

export type DerivedPricingMode = 'per_student' | 'fixed_package' | 'tiered';

export type DerivedPricingTier = {
  label: string;
  count: string;
  rate: string;
};

export type DerivedSchoolPricing = {
  pricing_mode: DerivedPricingMode;
  rate_per_child: string;
  fixed_package_price: string;
  tiers: DerivedPricingTier[];
  currency: 'NGN' | 'USD';
  payment_method: string;
  commission_rate: string;
  deposit_amount: string;
  manual_student_count: string;
  show_revenue_share: boolean;
  /** Flat per-student rate when one programme line has qty > 1 (Billing Docs). */
  flat_rate: string | null;
};

type InvoiceItem = {
  description?: string;
  quantity?: number;
  unit_price?: number;
  total?: number;
};

type InvoiceLike = {
  currency?: string | null;
  items?: InvoiceItem[] | null;
  metadata?: {
    payment_method?: string;
    commission_rate?: number | string;
    academic_year?: number | string;
    term_number?: number | string;
  } | null;
};

function isSkipLine(description: string | undefined): boolean {
  const d = String(description ?? '').toLowerCase();
  return d.includes('commission') || d.includes('deposit');
}

function tierLabel(description: string | undefined): string {
  return (
    String(description ?? '')
      .split('—')[0]
      ?.trim()
      .split('–')[0]
      ?.trim() || 'Students'
  );
}

export function deriveSchoolPricingFromInvoice(inv: InvoiceLike | null | undefined): DerivedSchoolPricing | null {
  if (!inv) return null;

  const items = Array.isArray(inv.items) ? inv.items : [];
  const positiveItems = items.filter((it) => (it.unit_price ?? 0) > 0 && !isSkipLine(it.description));
  const depositItem = items.find((it) => String(it.description ?? '').toLowerCase().includes('deposit'));
  const commissionItem = items.find((it) => String(it.description ?? '').toLowerCase().includes('commission'));
  const meta = inv.metadata ?? {};

  const hasMultipleItems = positiveItems.length > 1;
  const firstItem = positiveItems[0] ?? null;
  const isFixed = !hasMultipleItems && (!firstItem?.quantity || firstItem.quantity === 1);
  const pricingMode: DerivedPricingMode = hasMultipleItems ? 'tiered' : isFixed ? 'fixed_package' : 'per_student';

  const restoredTiers: DerivedPricingTier[] = hasMultipleItems
    ? positiveItems.map((it) => ({
        label: tierLabel(it.description),
        count: String(it.quantity ?? 0),
        rate: String(it.unit_price ?? 0),
      }))
    : [{ label: '', count: '', rate: '' }];

  const currency = ((inv.currency ?? 'NGN') === 'USD' ? 'USD' : 'NGN') as 'NGN' | 'USD';
  const commission =
    meta.commission_rate != null && meta.commission_rate !== ''
      ? String(meta.commission_rate)
      : '';

  let flat_rate: string | null = null;
  if (firstItem && (firstItem.quantity ?? 0) > 1 && (firstItem.unit_price ?? 0) > 0) {
    flat_rate = String(firstItem.unit_price);
  }

  return {
    pricing_mode: pricingMode,
    rate_per_child: pricingMode === 'per_student' ? String(firstItem?.unit_price ?? '') : '',
    fixed_package_price: pricingMode === 'fixed_package' ? String(firstItem?.unit_price ?? firstItem?.total ?? '') : '',
    tiers: restoredTiers,
    currency,
    payment_method: String(meta.payment_method ?? 'bank_transfer'),
    commission_rate: commission,
    deposit_amount: depositItem ? String(Math.abs(Number(depositItem.unit_price) || 0)) : '',
    manual_student_count: pricingMode === 'per_student' ? String(firstItem?.quantity ?? '') : '',
    show_revenue_share: !!commissionItem || !!meta.commission_rate,
    flat_rate,
  };
}

/** Map Nigerian calendar term label → builder term number. */
export function termLabelToNumber(label: string): '1' | '2' | '3' {
  const l = label.toLowerCase();
  if (l.includes('first')) return '1';
  if (l.includes('third')) return '3';
  return '2';
}

/**
 * Builder stores a single session-start calendar year (e.g. "2025"),
 * aligned with Sept–Aug academic calendar.
 */
export function defaultBuilderAcademicYear(now = new Date()): string {
  const m = now.getMonth() + 1;
  return String(m >= 9 ? now.getFullYear() : now.getFullYear() - 1);
}

export function priorTermRef(academicYear: string, termNumber: string): { academicYear: string; termNumber: string } {
  const t = parseInt(termNumber, 10) || 1;
  const y = parseInt(academicYear, 10) || new Date().getFullYear();
  if (t > 1) return { academicYear: String(y), termNumber: String(t - 1) };
  return { academicYear: String(y - 1), termNumber: '3' };
}
