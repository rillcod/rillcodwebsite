/**
 * Canonical temp-password generator for EVERY account in the system (students,
 * parents, staff, school accounts). Simple, memorable, easy to type on phones:
 *   rillcod@<4 digits>   (e.g. rillcod@1132)
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
  return `rillcod@${num}`;
}

/** Alias — some call sites import this name. */
export const generatePassword = generateTempPassword;
