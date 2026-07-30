import { describe, expect, it } from 'vitest';
import { fanoutAllSucceeded, fanoutFailures } from './cron-fanout';

describe('cron fanout helpers', () => {
  it('detects all-ok fanout', () => {
    expect(fanoutAllSucceeded({ 'academic-readiness': 'ok', 'auto-generate-content': 'ok' })).toBe(true);
    expect(fanoutAllSucceeded({ a: 'ok', b: 'http_500' })).toBe(false);
  });

  it('lists failed children', () => {
    expect(fanoutFailures({ a: 'ok', b: 'error', c: 'http_502' })).toEqual([
      ['b', 'error'],
      ['c', 'http_502'],
    ]);
  });
});
