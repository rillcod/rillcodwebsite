const BLOCKED_TEST_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'test.local',
  'localhost',
  'invalid',
  'rillcod.local',
  'students.rillcod.com',
  'student.rillcod.com',
  'mailinator.com',
  'yopmail.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
]);

const DOMAIN_TYPO_SUGGESTIONS: Record<string, string> = {
  'gamil.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'yaho.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  'hotmial.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'iclod.com': 'icloud.com',
};

export type AuthEmailCheckResult =
  | { ok: true; normalized: string }
  | { ok: false; reason: 'invalid_format' | 'virtual_student' | 'test_domain' | 'typo_domain'; message: string };

/**
 * Prevents hard bounces on Supabase Auth transactional emails by blocking:
 * - Virtual/synthetic Rillcod student portal logins (e.g. samuel123@rillcod.com, *@students.rillcod.com)
 * - Placeholder/test/disposable domains (example.com, test.com, mailinator.com, etc.)
 * - Common domain typos (gamil.com, gmail.con, yaho.com, etc.)
 */
export function validateDeliverableAuthEmail(
  rawEmail: string,
  context: 'reset' | 'signup' = 'reset',
): AuthEmailCheckResult {
  const normalized = String(rawEmail || '').trim().toLowerCase();
  const match = normalized.match(/^([^@\s]+)@([^@\s]+\.[^@\s]+)$/);
  if (!match) {
    return {
      ok: false,
      reason: 'invalid_format',
      message: 'Please enter a valid email address.',
    };
  }

  const localPart = match[1];
  const domain = match[2];

  // 1. Virtual/synthetic student portal handles (no real mailbox -> guaranteed hard bounce)
  const isSyntheticStudentHandle =
    domain === 'students.rillcod.com'
    || domain === 'student.rillcod.com'
    || domain.endsWith('.rillcod.local')
    || (domain === 'rillcod.com' && (/\d{2,}$/.test(localPart) || /^student[._-]/i.test(localPart) || /^rc[-_]/i.test(localPart)));

  if (isSyntheticStudentHandle) {
    return {
      ok: false,
      reason: 'virtual_student',
      message:
        context === 'reset'
          ? 'Student portal logins (like name123@rillcod.com) do not have an email inbox. Please ask your teacher or school admin to reset your password from your class roster.'
          : 'Please use a real personal or parent email address instead of a generated student login.',
    };
  }

  // 2. Common email domain typos
  const suggested = DOMAIN_TYPO_SUGGESTIONS[domain];
  if (suggested) {
    return {
      ok: false,
      reason: 'typo_domain',
      message: `Please check your email spelling — did you mean "${localPart}@${suggested}"?`,
    };
  }

  // 3. Test / placeholder / disposable domains
  if (BLOCKED_TEST_DOMAINS.has(domain) || domain.endsWith('.local') || domain.endsWith('.test') || domain.endsWith('.invalid')) {
    return {
      ok: false,
      reason: 'test_domain',
      message: 'Please use a real, active email address that can receive mail.',
    };
  }

  return { ok: true, normalized };
}
