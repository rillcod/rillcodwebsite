import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SmartDocument from './SmartDocument';

const invoice = {
  number: 'INV-TEST-001',
  date: '22 Aug 2026',
  dueDate: '30 Aug 2026',
  status: 'sent',
  stream: 'individual' as const,
  items: [{ description: 'Tuition', quantity: 1, unit_price: 30_000, total: 30_000 }],
  amount: 30_000,
  currency: 'NGN',
  studentName: 'Test Learner',
  schoolName: 'Rillcod Technologies',
  depositAccount: {
    bank_name: 'Test Bank',
    account_number: '0123456789',
    account_name: 'Rillcod Technologies',
  },
};

describe('SmartDocument invoice payment instructions', () => {
  it('prints the selected account and current company name on an invoice', () => {
    const html = renderToStaticMarkup(<SmartDocument type="invoice" data={invoice} />);

    expect(html).toContain('Payment Instructions');
    expect(html).toContain('Test Bank');
    expect(html).toContain('0123456789');
    expect(html).toContain('Rillcod');
    expect(html).toContain('Technologies');
    expect(html).not.toContain('>Academy</span>');
  });
});
