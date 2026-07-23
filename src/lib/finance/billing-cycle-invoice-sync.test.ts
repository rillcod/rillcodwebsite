import { describe, expect, it, vi } from 'vitest';
import {
  resolveBillingCycleIdForInvoice,
  syncInvoiceFieldsThroughBillingCycle,
} from './billing-cycle-invoice-sync';

const sampleCycle = {
  id: 'cycle-1',
  term_label: 'First Term 2026/2027',
  term_start_date: '2026-09-01',
  due_date: '2026-10-15',
  amount_due: 250000,
  currency: 'NGN',
  status: 'due',
};

function mockAdmin(options: {
  cycle?: typeof sampleCycle | null;
  cycleError?: string;
  billingCycleId?: string | null;
  reverseCycleId?: string | null;
  rpcError?: string;
}) {
  const rpc = vi.fn(async () =>
    options.rpcError ? { error: { message: options.rpcError } } : { error: null },
  );

  return {
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => {
            if (table === 'billing_cycles') {
              if (options.cycleError) return { data: null, error: { message: options.cycleError } };
              if (options.reverseCycleId && val === 'inv-1') {
                return { data: { id: options.reverseCycleId }, error: null };
              }
              if (options.cycle && val === options.cycle.id) {
                return { data: options.cycle, error: null };
              }
              return { data: null, error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
    }),
    rpc,
  } as any;
}

describe('resolveBillingCycleIdForInvoice', () => {
  it('returns billing_cycle_id when present on the invoice', async () => {
    const admin = mockAdmin({});
    const id = await resolveBillingCycleIdForInvoice(admin, { id: 'inv-1', billing_cycle_id: 'cycle-direct' });
    expect(id).toBe('cycle-direct');
  });

  it('reverse-looks up cycle by invoice_id when billing_cycle_id is missing', async () => {
    const admin = mockAdmin({ reverseCycleId: 'cycle-reverse' });
    const id = await resolveBillingCycleIdForInvoice(admin, { id: 'inv-1', billing_cycle_id: null });
    expect(id).toBe('cycle-reverse');
  });
});

describe('syncInvoiceFieldsThroughBillingCycle', () => {
  it('rejects paid cycles', async () => {
    const admin = mockAdmin({ cycle: { ...sampleCycle, status: 'paid' } });
    const result = await syncInvoiceFieldsThroughBillingCycle(admin, 'cycle-1', {});
    expect(result).toEqual({ ok: false, error: 'Cannot edit a paid invoice', status: 400 });
  });

  it('rejects item totals that do not match amount', async () => {
    const admin = mockAdmin({ cycle: sampleCycle });
    const result = await syncInvoiceFieldsThroughBillingCycle(admin, 'cycle-1', {
      amount: 999,
      items: [{ description: 'STEM', quantity: 10, unit_price: 25000, total: 250000 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('does not match');
    }
  });

  it('calls the extended RPC with line items and metadata', async () => {
    const admin = mockAdmin({ cycle: sampleCycle });
    const items = [
      { description: 'STEM', quantity: 10, unit_price: 25000, total: 250000 },
      { description: 'School Commission / Share (30%)', quantity: 1, unit_price: -75000, total: -75000 },
    ];
    const metadata = { term_label: 'First Term 2026/2027', term_number: 1, academic_year: '2026/2027' };
    const result = await syncInvoiceFieldsThroughBillingCycle(admin, 'cycle-1', {
      items,
      metadata,
      notes: 'Updated figures',
    });
    expect(result).toEqual({ ok: true });
    expect(admin.rpc).toHaveBeenCalledWith(
      'update_billing_cycle_with_invoice',
      expect.objectContaining({
        p_cycle_id: 'cycle-1',
        p_items: items,
        p_metadata: metadata,
        p_notes: 'Updated figures',
        p_amount_due: 175000,
      }),
    );
  });
});
