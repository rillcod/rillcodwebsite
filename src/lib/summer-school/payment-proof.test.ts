import { describe, expect, it } from 'vitest';
import { extractProspectPaymentProof, resolveProspectProofDisplay } from './payment-proof';

describe('payment proof helpers', () => {
  it('prefers transaction metadata over legacy notes', () => {
    const proof = resolveProspectProofDisplay(
      '[Ref: legacy-ref]',
      {
        receipt_url: 'https://www.rillcod.com/api/media/summer-school-receipts/a.jpg',
        transfer_reference: 'GTB-123',
      },
      'RCPT-1',
    );
    expect(proof.receiptUrl).toContain('summer-school-receipts/a.jpg');
    expect(proof.transferReference).toBe('GTB-123');
    expect(proof.transactionReference).toBe('RCPT-1');
  });

  it('falls back to notes ref when metadata is empty', () => {
    const proof = resolveProspectProofDisplay('[Ref: Providus Jane Doe]');
    expect(proof.transferReference).toBe('Providus Jane Doe');
    expect(proof.receiptUrl).toBeNull();
  });

  it('extracts receipt url from gateway response', () => {
    const proof = extractProspectPaymentProof({
      receipt_url: '/api/media/summer-school-receipts/x.pdf',
    });
    expect(proof.receiptUrl).toContain('/api/media/summer-school-receipts/x.pdf');
  });
});
