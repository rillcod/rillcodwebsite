/**
 * Finance formatting helpers — currency, dates, VAT.
 * Shared by UI and PDF templates so the numbers on a learner's
 * screen always match the numbers on the printed receipt.
 */

const SYMBOLS: Record<string, string> = {
  NGN: '₦',
  USD: '$',
  EUR: '€',
  GBP: '£',
  ZAR: 'R',
  KES: 'KSh',
  GHS: 'GH₵',
};

export function currencySymbol(code: string | null | undefined): string {
  if (!code) return '₦';
  return SYMBOLS[code.toUpperCase()] ?? code.toUpperCase();
}

export function formatMoney(
  amount: number | string | null | undefined,
  currency = 'NGN',
  opts: { withCode?: boolean; minFrac?: number; maxFrac?: number } = {},
): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return `${currencySymbol(currency)}0`;
  const formatted = n.toLocaleString('en-NG', {
    minimumFractionDigits: opts.minFrac ?? 0,
    maximumFractionDigits: opts.maxFrac ?? 2,
  });
  const prefix = currencySymbol(currency);
  return opts.withCode ? `${prefix}${formatted} ${currency.toUpperCase()}` : `${prefix}${formatted}`;
}

export function formatLongDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '—';
  }
}

export function formatShortDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

/** Default Rillcod VAT rate — currently 0% (non-VAT registered). Update here when that changes. */
export const VAT_RATE = 0;
export function calculateVAT(subtotal: number) {
  return +(subtotal * VAT_RATE).toFixed(2);
}
