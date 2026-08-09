import { describe, expect, it } from 'vitest';
import { parsePaymentAccountInput } from './payment-account-input';

describe('parsePaymentAccountInput', () => {
  it('normalizes a complete bank account', () => {
    const result = parsePaymentAccountInput({
      label: ' Main account ',
      bank_name: ' Example Bank ',
      account_number: '0123-456 789',
      account_name: ' Rillcod Ltd ',
      account_type: 'current',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        label: 'Main account',
        bank_name: 'Example Bank',
        account_number: '0123456789',
        account_name: 'Rillcod Ltd',
        account_type: 'current',
        is_active: true,
      },
    });
  });

  it('rejects malformed account numbers and unsupported account types', () => {
    expect(parsePaymentAccountInput({
      label: 'Main', bank_name: 'Bank', account_number: '12AB', account_name: 'Owner',
    }).ok).toBe(false);
    expect(parsePaymentAccountInput({ account_type: 'checking' }, { partial: true }).ok).toBe(false);
  });

  it('accepts a supported partial update but no unknown fields', () => {
    expect(parsePaymentAccountInput({ label: ' Operations ', ignored: 'x' }, { partial: true }))
      .toEqual({ ok: true, value: { label: 'Operations' } });
  });
});
