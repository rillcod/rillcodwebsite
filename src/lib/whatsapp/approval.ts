/**
 * Fail-closed gate for Meta's WhatsApp Cloud API.
 * Credentials alone do not prove production approval.
 */
export function isWhatsAppCloudApiApproved(): boolean {
  return String(process.env.WHATSAPP_CLOUD_API_APPROVED || '').trim().toLowerCase() === 'true';
}

export const WHATSAPP_APPROVAL_PENDING_MESSAGE =
  'WhatsApp API delivery is paused until the Meta app is approved. Use the manual WhatsApp contact link or email.';

export function manualWhatsAppUrl(phone: string, message = ''): string {
  const digits = String(phone || '').replace(/\D/g, '');
  const international = digits.startsWith('0') && digits.length === 11
    ? `234${digits.slice(1)}`
    : digits;
  const suffix = message.trim() ? `?text=${encodeURIComponent(message.trim())}` : '';
  return `https://wa.me/${international}${suffix}`;
}
