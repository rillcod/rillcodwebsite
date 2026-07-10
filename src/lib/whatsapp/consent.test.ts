import { describe, expect, it } from 'vitest';
import { hasWhatsAppConsent } from './consent';

describe('WhatsApp consent', () => {
  it('accepts explicit current and legacy affirmative values', () => {
    expect(hasWhatsAppConsent({ whatsapp_consent: true })).toBe(true);
    expect(hasWhatsAppConsent({ whatsapp_opt_in: 'Yes' })).toBe(true);
    expect(hasWhatsAppConsent({ parent_whatsapp_opt_in: true })).toBe(true);
  });

  it('defaults to no consent when missing or negative', () => {
    expect(hasWhatsAppConsent({ parent_whatsapp: '08012345678' })).toBe(false);
    expect(hasWhatsAppConsent({ whatsapp_consent: 'No' })).toBe(false);
    expect(hasWhatsAppConsent(null)).toBe(false);
  });
});