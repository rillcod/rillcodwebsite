/**
 * Canonical temp-password generator for EVERY account in the system (students,
 * parents, staff, school accounts). One recognisable, staff-friendly pattern:
 *   Rillcod@<4 digits>   e.g. Rillcod@4821
 * This mirrors the bulk student-registration format so credentials are consistent
 * everywhere staff read them out. Client-safe (pure) — importable from UI too.
 */
export function generateTempPassword(): string {
    const digits = Math.floor(1000 + Math.random() * 9000);
    return `Rillcod@${digits}`;
}

/** Alias — some call sites import this name. */
export const generatePassword = generateTempPassword;
