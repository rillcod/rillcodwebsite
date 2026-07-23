/** Current: 8 digits (RC-12345678). Legacy cards: 8 base36 chars (RC-AB12CD34). */

const LEGACY_CODE_SOURCE = 'fnv1a_uuid_v1';
export const NUMERIC_CODE_SOURCE = 'fnv1a_uuid_v2_numeric';

function fnv1aHash(studentId: string): bigint {
  const source = String(studentId || '').trim().toLowerCase();
  let hash = BigInt('0xcbf29ce484222325');
  for (let i = 0; i < source.length; i += 1) {
    hash ^= BigInt(source.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * BigInt('0x100000001b3'));
  }
  return hash;
}

/** Legacy alphanumeric body (printed on older cards). */
function hashUuidToLegacyBody(studentId: string): string {
  const compact = fnv1aHash(studentId) % (BigInt(36) ** BigInt(8));
  return compact.toString(36).toUpperCase().padStart(8, '0').slice(-8);
}

/** New numeric body — easy to type on mobile (8 digits). */
function hashUuidToNumericBody(studentId: string): string {
  const compact = fnv1aHash(studentId) % BigInt(100_000_000);
  return compact.toString().padStart(8, '0');
}

export function accessCardCodeBodiesForStudent(studentId: string): { numeric: string; legacy: string } {
  const id = String(studentId || '').trim();
  if (id.length < 8) return { numeric: '', legacy: '' };
  return {
    numeric: hashUuidToNumericBody(id),
    legacy: hashUuidToLegacyBody(id),
  };
}

/** Canonical access code for new prints / QR (numeric). */
export function accessCardCodeForStudent(studentId: string) {
  const { numeric } = accessCardCodeBodiesForStudent(studentId);
  return numeric ? `RC-${numeric}` : '';
}

export function legacyAccessCardCodeForStudent(studentId: string) {
  const { legacy } = accessCardCodeBodiesForStudent(studentId);
  return legacy ? `RC-${legacy}` : '';
}

/**
 * Normalize typed/scanned input to RC-XXXXXXXX.
 * Accepts: 12345678, 1234-5678, RC12345678, legacy RC-AB12CD34, report codes unchanged.
 */
export function normalizeAccessCardCode(raw: string | null | undefined) {
  let decoded = String(raw || '');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* keep raw */
  }

  const trimmed = decoded.trim().toUpperCase().replace(/\s+/g, '');

  // Long report / issued-card codes — pass through (handled elsewhere).
  if (trimmed.length > 12 && /[^0-9]/.test(trimmed.replace(/^RC-?/, ''))) {
    return trimmed.replace(/[^A-Z0-9_-]/g, '').slice(0, 80);
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 8) {
    return `RC-${digitsOnly}`;
  }

  const alnum = trimmed.replace(/[^A-Z0-9]/g, '').replace(/^RC/, '');
  if (alnum.length === 8 && /^[A-Z0-9]{8}$/.test(alnum)) {
    return `RC-${alnum}`;
  }

  return '';
}

/** Format digits as the user types — no RC prefix needed on mobile. */
export function formatAccessCardCodeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (!digits) return '';

  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

/** Display on printed cards: 1234-5678 */
export function formatAccessCardCodeDisplay(code: string | null | undefined) {
  const normalized = normalizeAccessCardCode(code);
  const body = normalized.replace(/^RC-/, '');
  if (/^\d{8}$/.test(body)) {
    return `${body.slice(0, 4)}-${body.slice(4)}`;
  }
  if (body.length === 8) {
    return `RC-${body.slice(0, 4)}-${body.slice(4)}`;
  }
  return normalized || String(code || '');
}

export function accessCardCodeBody(code: string | null | undefined) {
  const normalized = normalizeAccessCardCode(code);
  if (!normalized.startsWith('RC-')) return '';
  return normalized.replace(/^RC-/, '').toLowerCase();
}

export function accessCardCodeMatchesStudent(code: string | null | undefined, studentId: string) {
  const normalized = normalizeAccessCardCode(code);
  if (!normalized || !normalized.startsWith('RC-')) return false;
  const { numeric, legacy } = accessCardCodeBodiesForStudent(studentId);
  const body = normalized.replace(/^RC-/, '').toUpperCase();
  return body === numeric || body === legacy;
}

export function accessCardCodeSourceForStudent(_studentId: string) {
  return NUMERIC_CODE_SOURCE;
}

export { LEGACY_CODE_SOURCE };
