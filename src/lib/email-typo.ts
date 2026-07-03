// Lightweight, dependency-free email typo helper.
//
// Catches the most common staff mistakes when typing a parent/student email
// (wrong TLD like ".con", or a misspelt popular domain like "gmial.com") and
// suggests the likely fix. It never changes anything on its own — the UI shows a
// "Did you mean …?" hint the staff can click to accept. Zero friction for the
// parent/student; it only guards the person doing the typing.

// Frequently mistyped domains → their correct form.
const DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmaill.com': 'gmail.com',
  'gnail.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com',
  'gmail.om': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmails.com': 'gmail.com',
  'googlemail.con': 'googlemail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yhoo.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com', 'yahho.com': 'yahoo.com', 'yaoo.com': 'yahoo.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmai.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com', 'hotnail.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outook.com': 'outlook.com', 'outlook.co': 'outlook.com',
  'iclod.com': 'icloud.com', 'icloud.co': 'icloud.com', 'iclould.com': 'icloud.com',
};

// Bad top-level endings that almost always mean ".com".
const TLD_TYPO = /\.(con|cpm|comm|cim|cm|om|vom|xom|ocm|c0m|cin|coma|cmo)$/;

/**
 * Returns a suggested correction for an email, or null if it already looks fine.
 * Purely heuristic — safe to show as an optional "Did you mean …?" prompt.
 */
export function suggestEmailFix(raw: string): string | null {
  const e = (raw || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  // Need a local part and a domain part with at least one dot.
  if (at < 1 || at === e.length - 1) return null;

  const local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (!domain.includes('.')) return null;

  // Students use internal Rillcod addresses (rillcod.com / .tech / rillcodacademy.com).
  // Those are always valid — never suggest "correcting" them. The guard exists for the
  // parent's real, personal inbox, which is the address that must receive the login.
  if (domain.includes('rillcod')) return null;

  if (DOMAIN_TYPOS[domain]) {
    domain = DOMAIN_TYPOS[domain];
  } else if (TLD_TYPO.test(domain)) {
    domain = domain.replace(TLD_TYPO, '.com');
  }

  const suggestion = `${local}@${domain}`;
  return suggestion !== e ? suggestion : null;
}
