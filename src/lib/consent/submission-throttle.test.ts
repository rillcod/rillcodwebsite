import { afterEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { hashConsentSubmissionIp } from './submission-throttle';

const previousSecret = process.env.CONSENT_THROTTLE_SECRET;

afterEach(() => {
  if (previousSecret === undefined) delete process.env.CONSENT_THROTTLE_SECRET;
  else process.env.CONSENT_THROTTLE_SECRET = previousSecret;
});

describe('consent submission IP hashing', () => {
  it('produces a deterministic HMAC without retaining the raw address', () => {
    process.env.CONSENT_THROTTLE_SECRET = 'test-secret';
    const raw = '203.0.113.42';
    const expected = createHmac('sha256', 'test-secret').update(raw).digest('hex');

    expect(hashConsentSubmissionIp(raw)).toBe(expected);
    expect(hashConsentSubmissionIp(`  ${raw.toUpperCase()} `)).toBe(expected);
    expect(expected).not.toContain(raw);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not persist an unusable unknown address', () => {
    process.env.CONSENT_THROTTLE_SECRET = 'test-secret';
    expect(hashConsentSubmissionIp('unknown')).toBeNull();
    expect(hashConsentSubmissionIp('')).toBeNull();
  });
});
