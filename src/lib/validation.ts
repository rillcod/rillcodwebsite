/**
 * Shared validation utilities used by both client-side forms and server-side
 * API routes to enforce consistent rules across the application.
 */

// ── Email ─────────────────────────────────────────────────────────────────────
// RFC 5322 simplified: at least one non-whitespace/@ char on each side of @,
// followed by a dot and at least one more non-whitespace/@ char.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns true when `value` is a syntactically valid email address.
 * Trims leading/trailing whitespace before testing.
 */
export function validateEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

// ── Nigerian phone ────────────────────────────────────────────────────────────
// Accepts:
//   • 11 digits starting with 0  (e.g. 08012345678)
//   • +234 followed by 10 digits (e.g. +2348012345678)
export const NG_PHONE_REGEX = /^(0\d{10}|\+234\d{10})$/;

/**
 * Returns true when `value` is a valid Nigerian mobile number.
 * Trims leading/trailing whitespace before testing.
 */
export function validateNigerianPhone(value: string): boolean {
  return NG_PHONE_REGEX.test(value.trim());
}
