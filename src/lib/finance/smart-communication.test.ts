import { describe, expect, it } from 'vitest';
import {
  analyzeInvoiceIntelligence,
  buildSmartFinanceWhatsAppText,
  buildWhatsAppShareHref,
  isDeliverableExternalEmail,
  normalizeWhatsAppPhone,
} from './smart-communication';

describe('smart-communication intelligence', () => {
  it('rejects synthetic student login emails and accepts real addresses', () => {
    expect(isDeliverableExternalEmail('ada.obi@rillcod.local')).toBe(false);
    expect(isDeliverableExternalEmail('student@student.local')).toBe(false);
    expect(isDeliverableExternalEmail('parent@gmail.com')).toBe(true);
    expect(isDeliverableExternalEmail('bursar@quincyacademy.edu.ng')).toBe(true);
  });

  it('normalizes Nigerian WhatsApp phone numbers accurately', () => {
    expect(normalizeWhatsAppPhone('0803 123 4567')).toBe('2348031234567');
    expect(normalizeWhatsAppPhone('+234 812 000 9999')).toBe('2348120009999');
    expect(buildWhatsAppShareHref('08031234567', 'Hello')).toBe('https://wa.me/2348031234567?text=Hello');
  });

  it('classifies overdue, partial, and overpaid credit invoices with smart reminder stages', () => {
    const now = Date.parse('2026-11-25T12:00:00Z');

    const overdue = analyzeInvoiceIntelligence(
      {
        amount: 500_000,
        amount_paid: 200_000,
        amount_remaining: 300_000,
        status: 'partially_paid',
        due_date: '2026-11-20T00:00:00Z',
        reminder_1_sent_at: '2026-11-05T00:00:00Z',
      },
      now,
    );
    expect(overdue.urgency).toBe('overdue');
    expect(overdue.recommendedReminderStage).toBe(3);
    expect(overdue.percentPaid).toBe(40);
    expect(overdue.remaining).toBe(300_000);
    expect(overdue.remindersSentCount).toBe(1);

    const partialFuture = analyzeInvoiceIntelligence(
      {
        amount: 400_000,
        amount_paid: 100_000,
        amount_remaining: 300_000,
        status: 'partially_paid',
        due_date: '2026-12-15T00:00:00Z',
      },
      now,
    );
    expect(partialFuture.urgency).toBe('partial');
    expect(partialFuture.recommendedReminderStage).toBe(2);

    const credit = analyzeInvoiceIntelligence(
      {
        amount: 250_000,
        amount_paid: 300_000,
        amount_remaining: 0,
        status: 'paid',
      },
      now,
    );
    expect(credit.urgency).toBe('credit');
    expect(credit.overpaid).toBe(50_000);
  });

  it('builds structured WhatsApp reminder and receipt messages with remaining balance and bank details', () => {
    const msg = buildSmartFinanceWhatsAppText({
      mode: 'reminder_2',
      recipientName: 'Grace High School',
      invoiceNumber: 'INV-2026-009',
      totalAmount: 600_000,
      amountPaid: 250_000,
      remainingAmount: 350_000,
      dueDate: '2026-11-30',
      termLabel: 'First Term 2026/2027',
      bankAccount: {
        bank_name: 'Moniepoint MFB',
        account_number: '1234567890',
        account_name: 'RILLCOD TECHNOLOGIES',
      },
    });
    expect(msg).toContain('INV-2026-009');
    expect(msg).toContain('350,000');
    expect(msg).toContain('1234567890');

    const receiptMsg = buildSmartFinanceWhatsAppText({
      mode: 'receipt',
      recipientName: 'Mrs. Okafor',
      invoiceNumber: 'INV-2026-010',
      totalAmount: 50_000,
      amountPaid: 60_000,
      overpaidAmount: 10_000,
    });
    expect(receiptMsg).toContain('PAID IN FULL');
    expect(receiptMsg).toContain('10,000');
  });
});
