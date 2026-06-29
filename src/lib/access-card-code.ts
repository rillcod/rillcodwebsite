export function normalizeAccessCardCode(raw: string | null | undefined) {
  let decoded = String(raw || '');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep the original text if a pasted value contains a malformed percent sequence.
  }

  const body = decoded
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^RC/, '');

  return body.length === 8 ? `RC-${body}` : '';
}

function hashUuidToEightChars(studentId: string) {
  const source = String(studentId || '').trim().toLowerCase();
  let hash = BigInt('0xcbf29ce484222325');

  for (let i = 0; i < source.length; i += 1) {
    hash ^= BigInt(source.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * BigInt('0x100000001b3'));
  }

  const compact = hash % (BigInt(36) ** BigInt(8));

  return compact
    .toString(36)
    .toUpperCase()
    .padStart(8, '0')
    .slice(-8);
}

export function accessCardCodeForStudent(studentId: string) {
  const id = String(studentId || '').trim();
  return id.length >= 8 ? `RC-${hashUuidToEightChars(id)}` : '';
}

export function accessCardCodeBody(code: string | null | undefined) {
  return normalizeAccessCardCode(code).replace(/^RC-/, '').toLowerCase();
}

export function accessCardCodeMatchesStudent(code: string | null | undefined, studentId: string) {
  const normalized = normalizeAccessCardCode(code);
  return !!normalized && normalized === accessCardCodeForStudent(studentId);
}
