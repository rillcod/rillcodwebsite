import { afterEach, describe, expect, it } from 'vitest';
import { isWhatsAppCloudApiApproved, manualWhatsAppUrl } from './approval';

describe('WhatsApp production approval gate', () => {
  afterEach(() => { delete process.env.WHATSAPP_CLOUD_API_APPROVED; });

  it('fails closed when approval is missing', () => {
    expect(isWhatsAppCloudApiApproved()).toBe(false);
  });

  it('opens only after explicit approval', () => {
    process.env.WHATSAPP_CLOUD_API_APPROVED = 'true';
    expect(isWhatsAppCloudApiApproved()).toBe(true);
  });

  it('creates the manual Nigerian WhatsApp contact link', () => {
    expect(manualWhatsAppUrl('08116600091', 'Hello team')).toBe(
      'https://wa.me/2348116600091?text=Hello%20team',
    );
  });
});
