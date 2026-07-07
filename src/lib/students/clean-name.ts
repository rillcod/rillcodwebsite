// Canonical student-name hygiene. Bulk imports and one-off scripts have historically
// left three kinds of damage in full_name: a leading spreadsheet index ("34. Melvin"),
// invisible/bidi control characters pasted from Word/WhatsApp ("‎Favour"), and
// stray whitespace / trailing punctuation. This is the single source of truth used by
// the heal endpoint (and any script) so the fix is applied identically everywhere.

// zero-width + bidirectional control marks (LRM/RLM/ZWSP/ZWNJ/ZWJ/BOM/word-joiner …)
const INVISIBLE = /[​-‏‪-‮⁠﻿]/g;
const INDEX_PREFIX = /^\s*\d+\s*[.)\-]\s*/; // "34. ", "7) ", "3 - "

/** Clean a display name without changing legitimate content (initials, hyphens, case). */
export function cleanStudentName(raw: string | null | undefined): string {
  let s = String(raw ?? '');
  s = s.replace(INVISIBLE, '');
  s = s.replace(INDEX_PREFIX, '');
  s = s.replace(/\s+/g, ' ').trim();
  // Trailing standalone disambiguator number appended by bulk register when a name
  // collided ("Uche Sunday 5" → "Uche Sunday", "Tara Momah 5" → "Tara Momah"). Only a
  // bare number after a real word — never a hyphenated/roman part of the actual name.
  s = s.replace(/\s+\d{1,3}$/, '').trim();
  // Trailing period after a real word ("Jenika Jerry." → "Jenika Jerry") but keep a
  // single-letter initial's dot ("Edric Imuetinyan A.").
  s = s.replace(/([A-Za-z]{2,})\.\s*$/, '$1');
  return s;
}

/** True when the stored name has fixable damage. */
export function nameNeedsCleaning(raw: string | null | undefined): boolean {
  const cleaned = cleanStudentName(raw);
  return !!cleaned && cleaned !== String(raw ?? '');
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j - 1] + 1, d[j] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[n];
}

const nameTokens = (raw: string | null | undefined): string[] =>
  cleanStudentName(raw).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .split(/\s+/).filter((t) => t && !/^\d+$/.test(t) && t.length > 1);

const tokenSimilar = (x: string, y: string): boolean =>
  x === y || (Math.max(x.length, y.length) >= 5 && levenshtein(x, y) <= 1) || (Math.max(x.length, y.length) >= 8 && levenshtein(x, y) <= 2);

/**
 * True when two names are near-duplicates: every token of the shorter name fuzzy-matches
 * a token in the longer (spelling variants, reversed order, an added middle name). Requires
 * ≥2 matched tokens so siblings ("Toby Akinmejiwa" vs "Oluwatobi Akinmejiwa Nelson") and
 * twins are NOT collapsed — those still need a human decision.
 */
export function namesAreNearDuplicate(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = nameTokens(a), tb = nameTokens(b);
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (small.length < 2) return false;
  return small.every((t) => large.some((u) => tokenSimilar(t, u)));
}

/**
 * Order-independent key for detecting duplicate names. Drops standalone numeric tokens
 * so bulk-register disambiguators collapse together ("Uche Sunday" ≡ "Uche Sunday 5" ≡
 * "5 Uche Sunday") and ignores word order + casing (reversed names like "Emuah Precious"
 * ≡ "Precious Emuah").
 */
export function duplicateNameKey(raw: string | null | undefined): string {
  return cleanStudentName(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t && !/^\d+$/.test(t))
    .sort()
    .join(' ');
}
