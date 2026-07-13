import { describe, expect, it } from 'vitest';
import { describeLedgerEntry } from './ledger-description';

describe('describeLedgerEntry', () => {
  it('uses invoice item and number', () => {
    expect(describeLedgerEntry({ payment_method: 'bank_transfer', invoices: { invoice_number: 'INV-10', items: [{ description: 'First Term Fees' }] } })).toEqual({ description: 'First Term Fees - Invoice INV-10', source: 'invoice via bank transfer', sourceType: 'invoice' });
  });
  it('identifies special programme balance payments (legacy + new)', () => {
    expect(describeLedgerEntry({ payment_method: 'cash', payment_gateway_response: { payment_type: 'summer_school_balance' }, portal_users: { full_name: 'Ada' } }).description).toContain('Special programme balance');
    expect(describeLedgerEntry({ payment_method: 'cash', payment_gateway_response: { payment_type: 'special_program_balance' }, portal_users: { full_name: 'Ada' } }).description).toContain('Special programme balance');
  });
});