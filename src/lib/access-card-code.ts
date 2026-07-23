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

export function isStudentPortalUuid(raw: string | null | undefined): string | null {
  let decoded = String(raw ?? '').trim();
  try {
    decoded = decodeURIComponent(decoded).trim();
  } catch {
    /* keep raw */
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded)
    ? decoded.toLowerCase()
    : null;
}

/**
 * Normalize typed/scanned input to RC-XXXXXXXX.
 * Accepts: 12345678, 1234-5678, RC12345678, legacy RC-AB12CD34, report codes unchanged.
 * UUID portal IDs are handled separately via isStudentPortalUuid().
 */
export function normalizeAccessCardCode(raw: string | null | undefined) {
  if (isStudentPortalUuid(raw)) return '';

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

/** Format digits or legacy alphanumeric as the user types (RC- prefix optional — stripped automatically). */
export function formatAccessCardCodeInput(raw: string): string {
  let cleaned = String(raw || '').trim();
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    /* keep raw */
  }
  cleaned = cleaned.toUpperCase().replace(/\s+/g, '');
  // Accept pasted/typed RC-1234-5678, RC12345678, or body-only 1234-5678.
  cleaned = cleaned.replace(/^RC-?/, '').replace(/-/g, '');

  if (/[A-Z]/.test(cleaned)) {
    const alnum = cleaned.replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!alnum) return '';
    if (alnum.length <= 4) return alnum;
    return `${alnum.slice(0, 4)}-${alnum.slice(4)}`;
  }

  const digits = cleaned.replace(/\D/g, '').slice(0, 8);
  if (!digits) return '';
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

/**
 * Resolve result-check entry to a route/API target.
 * Accepts 1234-5678, RC-1234-5678, RC12345678, legacy RC-AB12-CD34, UUID QR, report codes.
 */
export function resolveResultCheckTarget(raw: string | null | undefined): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';

  const uuid = isStudentPortalUuid(trimmed);
  if (uuid) return uuid;

  const body = trimmed.replace(/^RC-/i, '');
  const attempts = [
    trimmed,
    body,
    `RC-${body.replace(/-/g, '')}`,
    `RC-${trimmed.replace(/^RC-/i, '').replace(/-/g, '')}`,
  ];
  for (const attempt of attempts) {
    const normalized = normalizeAccessCardCode(attempt);
    if (normalized) return normalized;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 8) return `RC-${digits}`;

  const fallback = trimmed.toUpperCase().replace(/\s+/g, '');
  return fallback.length >= 6 ? fallback : '';
}

/** Display on cards, rosters, and result-check — always includes RC- prefix. */
export function formatAccessCardCodeDisplay(code: string | null | undefined) {
  const normalized = normalizeAccessCardCode(code);
  const body = normalized.replace(/^RC-/, '');
  if (/^\d{8}$/.test(body)) {
    return `RC-${body.slice(0, 4)}-${body.slice(4)}`;
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
