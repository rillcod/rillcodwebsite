import { describe, expect, it } from 'vitest';
import {
  consentAccessUrl,
  formatConsentAccessCodeInput,
  normalizeConsentAccessCode,
} from '@/lib/consent/access-code';

describe('consent access codes', () => {
  it('normalizes typed codes with or without the CF prefix', () => {
    expect(normalizeConsentAccessCode('cf-ab12-cd34')).toBe('CF-AB12-CD34');
    expect(normalizeConsentAccessCode('AB12 CD34')).toBe('CF-AB12-CD34');
    expect(normalizeConsentAccessCode('ABO2 CDI4')).toBe('CF-AB02-CD14');
    expect(normalizeConsentAccessCode('short')).toBeNull();
  });

  it('formats input without duplicating the visible prefix', () => {
    expect(formatConsentAccessCodeInput('cf-ab12cd34')).toBe('AB12-CD34');
  });

  it('builds the canonical QR entry URL', () => {
    expect(consentAccessUrl('https://www.rillcod.com/', 'CF-AB12-CD34'))
      .toBe('https://www.rillcod.com/consent/CF-AB12-CD34?via=qr');
  });
});
