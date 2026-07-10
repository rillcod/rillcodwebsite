const AFFIRMATIVE = new Set(['true', 'yes', '1', 'on', 'opted_in', 'opted-in']);

/** Resolve WhatsApp consent across current and legacy form field names. */
export function hasWhatsAppConsent(record: Record<string, unknown> | null | undefined): boolean {
  if (!record) return false;
  for (const key of ['whatsapp_consent', 'whatsapp_opt_in', 'parent_whatsapp_opt_in', 'whatsapp_optin', 'consent_whatsapp']) {
    const value = record[key];
    if (value === true) return true;
    if (typeof value === 'string' && AFFIRMATIVE.has(value.trim().toLowerCase())) return true;
    if (value === 1) return true;
  }
  return false;
}