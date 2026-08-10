/**
 * Canonical temp-password generator for EVERY account in the system (students,
 * parents, staff, school accounts). One recognisable, staff-friendly pattern:
 *   Rillcod@<8 unambiguous characters>
 * One shared generator prevents account screens from inventing weaker formats.
 * The alphabet omits visually ambiguous 0/O and 1/I characters.
 */
export function generateTempPassword(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const values = new Uint32Array(8);
    if (globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(values);
    } else {
        for (let index = 0; index < values.length; index += 1) {
            values[index] = Math.floor(Math.random() * 0x100000000);
        }
    }
    return `Rillcod@${[...values].map(value => alphabet[value % alphabet.length]).join('')}`;
}

/** Alias — some call sites import this name. */
export const generatePassword = generateTempPassword;
