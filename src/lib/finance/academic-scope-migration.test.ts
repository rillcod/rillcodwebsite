import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260929000009_harmonise_finance_academic_scope.sql'),
  'utf8',
);
const invoiceService = readFileSync(
  join(process.cwd(), 'src/lib/finance/create-invoice.ts'),
  'utf8',
);const specialRepair = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260929000010_repair_special_programme_finance_scope.sql'),
  'utf8',
);
const legacyRepair = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260929000012_reconcile_legacy_special_finance.sql'),
  'utf8',
);

describe('finance academic scope', () => {
  it('supports one finance record covering multiple academic offerings', () => {
    expect(migration).toContain('create table if not exists public.finance_academic_links');
    expect(migration).toContain('num_nonnulls(invoice_id, payment_transaction_id, billing_cycle_id) = 1');
    expect(migration).toContain('academic_offering_id uuid not null');
    expect(migration).toContain('offering_period_id uuid not null');
  });

  it('keeps future school, individual and special-programme finance synchronized', () => {
    expect(migration).toContain('sync_billing_cycle_academic_links');
    expect(migration).toContain('sync_invoice_academic_links');
    expect(migration).toContain('sync_payment_academic_links');
    expect(migration).toContain('sync_class_finance_academic_links');
    expect(migration).toContain("special_program_page_id");
  });

  it('backfills links without rewriting historical finance rows', () => {
    expect(migration).not.toMatch(/update public\.(invoices|payment_transactions|billing_cycles)\b/i);
    expect(migration).toContain('manual financial records are untouched');
    expect(migration).toContain('on conflict do nothing');
  });

  it('repairs special-programme scope without guessing across multiple programmes', () => {
    expect(specialRepair).toContain('set title = title');
    expect(specialRepair).toContain("enrollment_type = 'special'");
    expect(specialRepair).toContain('propagate_payment_academic_links_to_invoice');
    expect(legacyRepair).toContain('sole_published_special_scope');
    expect(legacyRepair).toContain("'legacy_summer_alias'");
    expect(legacyRepair).not.toMatch(/update public\.(invoices|payment_transactions|billing_cycles)\b/i);
  });
  it('rejects incomplete or crossed offering-period selections before invoice creation', () => {
    expect(invoiceService).toContain('Boolean(academicOfferingId) !== Boolean(offeringPeriodId)');
    expect(invoiceService).toContain('period.offering_id !== offering.id');
    expect(invoiceService).toContain('normalizeEnrollmentType(payer.enrollment_type)');
    expect(invoiceService).toContain('academic_period_label: period.label');
  });
});