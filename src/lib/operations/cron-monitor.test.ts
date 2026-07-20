import { describe, expect, it } from 'vitest';
import { cronResultSucceeded } from './cron-monitor';

describe('cron result classification', () => {
  it('accepts a successful HTTP result', () => {
    expect(cronResultSucceeded(200, { success: true, processed: 4 })).toBe(true);
  });

  it('rejects HTTP failures and explicit payload failures', () => {
    expect(cronResultSucceeded(500, { success: true })).toBe(false);
    expect(cronResultSucceeded(200, { success: false })).toBe(false);
    expect(cronResultSucceeded(200, { ok: false })).toBe(false);
  });

  it('treats partial processing failures as unhealthy', () => {
    expect(cronResultSucceeded(200, { failed: 1 })).toBe(false);
    expect(cronResultSucceeded(200, { errors: 2 })).toBe(false);
    expect(cronResultSucceeded(200, { errors: ['provider unavailable'] })).toBe(false);
  });
});
