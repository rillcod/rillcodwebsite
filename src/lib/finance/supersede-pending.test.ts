import { describe, expect, it, vi } from 'vitest';
import {
  SUPERSEDED_AT,
  VOIDED_MARKER,
  classifyRetiredAttempt,
  supersedePendingAttempts,
} from './supersede-pending';

describe('a retired attempt says why it was retired', () => {
  it('reads an admin void as voided', () => {
    expect(classifyRetiredAttempt({ [VOIDED_MARKER]: true })).toBe('voided');
  });

  it('reads a replaced attempt as superseded', () => {
    expect(classifyRetiredAttempt({ [SUPERSEDED_AT]: '2026-08-06T10:00:00Z' })).toBe('superseded');
  });

  it('lets a void win over a supersede stamp', () => {
    // An attempt can be superseded and later voided. The deliberate act is the
    // one worth reporting.
    expect(classifyRetiredAttempt({
      [SUPERSEDED_AT]: '2026-08-06T10:00:00Z',
      [VOIDED_MARKER]: true,
    })).toBe('voided');
  });

  it('calls an unmarked attempt abandoned, not failed', () => {
    // This is the distinction the old single status destroyed: a parent who
    // never finished checkout is a funnel outcome, not a gateway rejection.
    expect(classifyRetiredAttempt({})).toBe('abandoned');
    expect(classifyRetiredAttempt(null)).toBe('abandoned');
    expect(classifyRetiredAttempt(undefined)).toBe('abandoned');
  });
});

describe('superseding pending attempts', () => {
  it('refuses to run without a filter', async () => {
    // An empty filter would retire every pending attempt on the platform.
    const rpc = vi.fn();
    const out = await supersedePendingAttempts({ rpc } as never, { match: {} });
    expect(out.superseded).toBe(0);
    expect(out.error).toMatch(/match filter/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes the filter, replacement reference and reason through', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 3, error: null });
    const out = await supersedePendingAttempts({ rpc } as never, {
      match: { prospect_id: 'p1', balance_payment: true },
      replacedByReference: 'SUM-BAL-123',
    });
    expect(out).toEqual({ superseded: 3, error: null });
    expect(rpc).toHaveBeenCalledWith('supersede_pending_payment_attempts', {
      p_match: { prospect_id: 'p1', balance_payment: true },
      p_replaced_by: 'SUM-BAL-123',
      p_reason: 'replaced_by_newer_attempt',
    });
  });

  it('defaults the replacement reference to null rather than undefined', async () => {
    // undefined is dropped from the JSON body, and the function would then take
    // its own default instead of recording "nothing replaced this".
    const rpc = vi.fn().mockResolvedValue({ data: 0, error: null });
    await supersedePendingAttempts({ rpc } as never, { match: { student_id: 's1' } });
    expect(rpc.mock.calls[0][1].p_replaced_by).toBeNull();
  });

  it('reports a failure instead of throwing, so a payment still proceeds', async () => {
    // Retiring old attempts is housekeeping. It must never block the parent who
    // is trying to pay right now.
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    const out = await supersedePendingAttempts({ rpc } as never, { match: { student_id: 's1' } });
    expect(out).toEqual({ superseded: 0, error: 'boom' });
  });
});
