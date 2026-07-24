import { isAllowedReceiptStorageUrl, normalizeReceiptPublicUrl } from '@/lib/summer-school/receipt-upload';

export type ProspectPaymentProof = {
  receiptUrl: string | null;
  transferReference: string | null;
  transactionReference: string | null;
  amountCharged?: number | null;
  balanceDue?: number | null;
  totalTuition?: number | null;
};

/** Extract uploaded bank-transfer proof from payment transaction metadata. */
export function extractProspectPaymentProof(
  gatewayResponse: Record<string, unknown> | null | undefined,
  transactionReference?: string | null,
): ProspectPaymentProof {
  const meta = gatewayResponse || {};
  const rawReceipt = typeof meta.receipt_url === 'string' ? meta.receipt_url.trim() : '';
  const receiptUrl = rawReceipt
    ? normalizeReceiptPublicUrl(rawReceipt)
    : null;
  const transferReference =
    typeof meta.transfer_reference === 'string' && meta.transfer_reference.trim()
      ? meta.transfer_reference.trim()
      : null;

  return {
    receiptUrl: receiptUrl && isAllowedReceiptStorageUrl(receiptUrl) ? receiptUrl : null,
    transferReference,
    transactionReference: transactionReference?.trim() || null,
    amountCharged: Number.isFinite(Number(meta.amount_charged)) ? Number(meta.amount_charged) : null,
    balanceDue: Number.isFinite(Number(meta.balance_due)) ? Number(meta.balance_due) : null,
    totalTuition: Number.isFinite(Number(meta.total_tuition)) ? Number(meta.total_tuition) : null,
  };
}

/** Prefer authoritative tx metadata; fall back to legacy notes `[Ref: …]` parsing. */
export function resolveProspectProofDisplay(
  notes: string | null | undefined,
  gatewayResponse?: Record<string, unknown> | null,
  transactionReference?: string | null,
): ProspectPaymentProof {
  const fromMeta = extractProspectPaymentProof(gatewayResponse, transactionReference);
  if (fromMeta.receiptUrl || fromMeta.transferReference) return fromMeta;

  const refMatch = String(notes || '').match(/\[Ref:\s*([^\]]+)\]/);
  const legacyRef = refMatch?.[1]?.trim() || null;
  if (!legacyRef) {
    return { receiptUrl: null, transferReference: null, transactionReference: fromMeta.transactionReference };
  }
  if (legacyRef.startsWith('http')) {
    const url = normalizeReceiptPublicUrl(legacyRef);
    return {
      receiptUrl: url && isAllowedReceiptStorageUrl(url) ? url : null,
      transferReference: null,
      transactionReference: fromMeta.transactionReference,
    };
  }
  return {
    receiptUrl: null,
    transferReference: legacyRef,
    transactionReference: fromMeta.transactionReference,
  };
}

export function isPdfProofUrl(url: string): boolean {
  return /\.pdf($|\?)/i.test(url);
}
