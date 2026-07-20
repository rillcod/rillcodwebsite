/**
 * Fail-closed gate for Meta's WhatsApp Cloud API.
 * Review mode permits only explicitly listed test recipients and never drains
 * the customer outbox.
 */
export type WhatsAppCloudApiMode = 'off' | 'review' | 'approved';

function normaliseApprovalPhone(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.startsWith('0') && digits.length === 11 ? `234${digits.slice(1)}` : digits;
}

export function getWhatsAppCloudApiMode(): WhatsAppCloudApiMode {
  const configured = String(process.env.WHATSAPP_CLOUD_API_MODE || '').trim().toLowerCase();
  if (configured === 'off' || configured === 'review' || configured === 'approved') return configured;
  if (String(process.env.WHATSAPP_CLOUD_API_APPROVED || '').trim().toLowerCase() === 'true') return 'approved';
  return 'review';
}

export function isWhatsAppCloudApiApproved(): boolean {
  return getWhatsAppCloudApiMode() === 'approved';
}

export function canSendWhatsAppApiTo(phone: string): boolean {
  const mode = getWhatsAppCloudApiMode();
  if (mode === 'approved') return true;
  if (mode !== 'review') return false;
  const allowed = String(process.env.WHATSAPP_REVIEW_TEST_NUMBERS || '+2348116600091')
    .split(',').map(normaliseApprovalPhone).filter(Boolean);
  return allowed.includes(normaliseApprovalPhone(phone));
}

export const WHATSAPP_APPROVAL_PENDING_MESSAGE =
  'WhatsApp API delivery is paused. Use manual WhatsApp or email while Meta approval is pending.';

export const WHATSAPP_REVIEW_RECIPIENT_MESSAGE =
  'Meta review mode allows API messages only to the configured reviewer/test phone numbers.';

export function manualWhatsAppUrl(phone: string, message = ''): string {
  const international = normaliseApprovalPhone(phone);
  const suffix = message.trim() ? `?text=${encodeURIComponent(message.trim())}` : '';
  return `https://wa.me/${international}${suffix}`;
}
