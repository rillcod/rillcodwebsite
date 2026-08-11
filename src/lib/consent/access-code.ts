const CONSENT_CODE_BODY_LENGTH = 8;

export function normalizeConsentAccessCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const body = value.trim().toUpperCase().replace(/^CF[-\s]?/, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^A-F0-9]/g, '');
  if (body.length !== CONSENT_CODE_BODY_LENGTH) return null;
  return `CF-${body.slice(0, 4)}-${body.slice(4)}`;
}

export function formatConsentAccessCodeInput(value: string): string {
  const body = value.toUpperCase().replace(/^CF[-\s]?/, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^A-F0-9]/g, '').slice(0, CONSENT_CODE_BODY_LENGTH);
  return body.length > 4 ? `${body.slice(0, 4)}-${body.slice(4)}` : body;
}

export function consentAccessUrl(origin: string, accessCode: string): string {
  const base = origin.replace(/\/$/, '');
  return `${base}/consent/${encodeURIComponent(accessCode)}?via=qr`;
}
