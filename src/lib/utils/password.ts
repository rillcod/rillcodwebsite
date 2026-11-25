/**
 * Canonical temp-password generator for EVERY account in the system (students,
 * parents, staff, school accounts). Simple, memorable, easy to type on phones:
 *   Rillcod@<4 digits>   (e.g. Rillcod@1132)
 */
export function generateTempPassword(): string {
  let num: number;
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    num = 1000 + (values[0] % 9000);
  } else {
    num = 1000 + Math.floor(Math.random() * 9000);
  }
  return `Rillcod@${num}`;
}

/** Upgrades legacy lowercase `rillcod@XXXX` passwords to canonical `Rillcod@XXXX`. */
export function normalizeRillcodTempPassword(password?: string | null): string {
  const clean = String(password ?? '').trim();
  return /^rillcod@\d{4}$/.test(clean) ? `R${clean.slice(1)}` : clean;
}

/** Alias — some call sites import this name. */
export const generatePassword = generateTempPassword;
