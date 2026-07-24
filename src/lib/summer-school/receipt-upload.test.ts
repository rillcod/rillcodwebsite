import { describe, expect, it } from 'vitest';
import {
  isAllowedReceiptFile,
  isAllowedReceiptStorageUrl,
  normalizeReceiptPublicUrl,
  parseBankTransferReference,
} from './receipt-upload';

describe('receipt upload helpers', () => {
  it('accepts common receipt mime types and extensions', () => {
    expect(isAllowedReceiptFile({ name: 'proof.jpg', type: 'image/jpeg' })).toBe(true);
    expect(isAllowedReceiptFile({ name: 'proof.heic', type: '' })).toBe(true);
    expect(isAllowedReceiptFile({ name: 'proof.pdf', type: 'application/pdf' })).toBe(true);
    expect(isAllowedReceiptFile({ name: 'proof.doc', type: 'application/msword' })).toBe(false);
  });

  it('validates hosted receipt URLs and relative media paths', () => {
    expect(
      isAllowedReceiptStorageUrl('https://www.rillcod.com/api/media/summer-school-receipts/receipt_1.jpg'),
    ).toBe(true);
    expect(
      isAllowedReceiptStorageUrl('/api/media/summer-school-receipts/receipt_1.jpg'),
    ).toBe(true);
    expect(isAllowedReceiptStorageUrl('https://evil.example/receipt.jpg')).toBe(false);
    expect(normalizeReceiptPublicUrl('/api/media/x')).toContain('/api/media/x');
  });

  it('parses text references and receipt URLs', () => {
    expect(parseBankTransferReference('Providus-123')).toEqual({
      ok: true,
      raw: 'Providus-123',
      receiptUrl: null,
      transferReference: 'Providus-123',
    });
    expect(parseBankTransferReference('ab').ok).toBe(false);
    expect(
      parseBankTransferReference('/api/media/summer-school-receipts/x.jpg').ok,
    ).toBe(true);
  });
});
