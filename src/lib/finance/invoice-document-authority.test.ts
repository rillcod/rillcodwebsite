import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const source = (relativePath: string) => readFileSync(join(ROOT, relativePath), 'utf8');

describe('invoice document authority', () => {
  it('uses one persisted document for preview and PDF instead of rebuilding without an account', () => {
    const panel = source('src/components/finance/ops/InvoicesPanel.tsx');
    expect(panel).toContain('documentUrl: `/api/invoices/${inv.id}/pdf`');
    expect(panel).not.toContain('payToAcc: null');
    expect(panel).not.toContain('buildSchoolInvoiceHTML');
  });

  it('server-verifies payment metadata on issue and correction', () => {
    const creator = source('src/lib/finance/create-invoice.ts');
    const updater = source('src/app/api/invoices/[id]/route.ts');
    expect(creator).toContain('prepareInvoicePaymentMetadata');
    expect(updater).toContain('prepareUpdatedInvoicePaymentMetadata');
    expect(updater).toContain('existing.metadata as Record<string, unknown>');
  });

  it('PDF and resend email resolve the same stored account authority', () => {
    const pdf = source('src/app/api/invoices/[id]/pdf/route.ts');
    const email = source('src/app/api/payments/invoices/send-email/route.ts');
    expect(pdf).toContain('loadInvoicePaymentAccounts');
    expect(email).toContain('loadInvoicePaymentAccounts');
  });
});
