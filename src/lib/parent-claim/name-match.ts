// Lenient child-name sanity check for the self-service parent link. Kids' names are
// often mis-spelled, so this is deliberately forgiving: it passes if ANY word of the
// typed name loosely matches ANY word of the real name (first OR last), allowing small
// typos. It only blocks a clearly different name, never a minor misspelling.

export function normTokens(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function tokenMatches(t1: string, t2: string): boolean {
  if (t1 === t2) return true;
  if (t1.length >= 4 && t2.length >= 4 && (t1.includes(t2) || t2.includes(t1))) return true;
  const maxLen = Math.max(t1.length, t2.length);
  // Allow 1 typo for short names, 2 for longer ones.
  return levenshtein(t1, t2) <= (maxLen >= 6 ? 2 : 1);
}

/**
 * True if the typed child name plausibly matches the real name. Passes on any single
 * matching (or near-matching) word, so first-name-only, last-name-only, swapped order,
 * and small misspellings all pass. Returns true when either name is empty (can't check
 * → don't block).
 */
export function looseNameMatch(typed: string, actual: string): boolean {
  const a = normTokens(typed);
  const b = normTokens(actual);
  if (a.length === 0 || b.length === 0) return true;
  return a.some(t1 => b.some(t2 => tokenMatches(t1, t2)));
}
