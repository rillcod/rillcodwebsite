import { describe, expect, it } from 'vitest';
import { isWipeCancelled, wipeFailureMessage } from './permanent-wipe-client';

describe('permanent-wipe-client helpers', () => {
  it('detects user-cancelled wipes without treating them as errors', () => {
    expect(isWipeCancelled({ ok: false, cancelled: true })).toBe(true);
    expect(wipeFailureMessage({ ok: false, cancelled: true })).toBeNull();
  });

  it('returns an error message for failed wipes', () => {
    expect(wipeFailureMessage({ ok: false, error: 'Denied' })).toBe('Denied');
    expect(wipeFailureMessage({ ok: true })).toBeNull();
  });
});
