import { afterEach, describe, expect, it } from 'vitest';
import { canSendWhatsAppApiTo, getWhatsAppCloudApiMode, isWhatsAppCloudApiApproved, manualWhatsAppUrl } from './approval';

describe('WhatsApp production approval gate', () => {
  afterEach(() => {
    delete process.env.WHATSAPP_CLOUD_API_APPROVED;
    delete process.env.WHATSAPP_CLOUD_API_MODE;
    delete process.env.WHATSAPP_REVIEW_TEST_NUMBERS;
  });

  it('defaults to company-number-only review mode', () => {
    expect(isWhatsAppCloudApiApproved()).toBe(false);
    expect(getWhatsAppCloudApiMode()).toBe('review');
    expect(canSendWhatsAppApiTo('+2348116600091')).toBe(true);
    expect(canSendWhatsAppApiTo('08031111111')).toBe(false);
  });

  it('opens only after explicit approval', () => {
    process.env.WHATSAPP_CLOUD_API_APPROVED = 'true';
    expect(isWhatsAppCloudApiApproved()).toBe(true);
  });
  it('allows only listed test numbers during Meta review', () => {
    process.env.WHATSAPP_CLOUD_API_MODE = 'review';
    process.env.WHATSAPP_REVIEW_TEST_NUMBERS = '08116600091, 2348000000000';
    expect(getWhatsAppCloudApiMode()).toBe('review');
    expect(isWhatsAppCloudApiApproved()).toBe(false);
    expect(canSendWhatsAppApiTo('2348116600091')).toBe(true);
    expect(canSendWhatsAppApiTo('08031111111')).toBe(false);
  });

  it('blocks every API recipient when explicitly off', () => {
    process.env.WHATSAPP_CLOUD_API_MODE = 'off';
    expect(getWhatsAppCloudApiMode()).toBe('off');
    expect(canSendWhatsAppApiTo('+2348116600091')).toBe(false);
  });

  it('allows every recipient only in approved mode', () => {
    process.env.WHATSAPP_CLOUD_API_MODE = 'approved';
    expect(isWhatsAppCloudApiApproved()).toBe(true);
    expect(canSendWhatsAppApiTo('08031111111')).toBe(true);
  });


  it('creates the manual Nigerian WhatsApp contact link', () => {
    expect(manualWhatsAppUrl('08116600091', 'Hello team')).toBe(
      'https://wa.me/2348116600091?text=Hello%20team',
    );
  });
});
