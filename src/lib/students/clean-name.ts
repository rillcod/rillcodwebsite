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
  x === y
  || (Math.max(x.length, y.length) >= 4 && levenshtein(x, y) <= 1)
  || (Math.max(x.length, y.length) >= 6 && levenshtein(x, y) <= 2);

// Also consider concatenations of adjacent tokens so a run-together name matches its split
// form ("Catherinemary" ≡ "Catherine" + "Mary", "Oghenetejiri" ≡ "Oghene" + "Tejiri").
const expandTokens = (t: string[]): string[] => {
  const s = new Set(t);
  for (let i = 0; i < t.length - 1; i++) s.add(t[i] + t[i + 1]);
  return [...s];
};

const bigrams = (s: string): Set<string> => {
  const g = new Set<string>();
  const t = s.toLowerCase().replace(/[^a-z]/g, '');
  for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2));
  return g;
};

/** Dice bigram similarity on the letters of two names (order-independent-ish, 0–1). */
export function nameDiceSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const A = bigrams(cleanStudentName(a)), B = bigrams(cleanStudentName(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/**
 * True when two names are near-duplicates of the SAME person: every token of the shorter
 * name fuzzy-matches a token (or adjacent-token concatenation) of the longer, with ≥2
 * matched tokens and a minimum overall letter similarity. Catches spelling variants,
 * reversed order, added middle names, and run-together names — while requiring ≥2 shared
 * tokens so siblings/twins that share only ONE token (surname) are NOT collapsed.
 */
export function namesAreNearDuplicate(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = nameTokens(a), tb = nameTokens(b);
  const [small, large] = ta.length <= tb.length ? [ta, expandTokens(tb)] : [tb, expandTokens(ta)];
  if (small.length < 2) return false;
  const matched = small.filter((t) => large.some((u) => tokenSimilar(t, u))).length;
  return matched >= 2 && matched === small.length && nameDiceSimilarity(a, b) >= 0.5;
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
