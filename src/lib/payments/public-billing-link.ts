import crypto from 'crypto';

type BillingTokenPayload = {
  cycleId: string;
  exp: number;
};

/**
 * Signing keys for the public "pay your invoice" links emailed to parents.
 *
 * These links were signed with CRON_SECRET whenever BILLING_LINK_SECRET was
 * unset — which it was. That made one leaked parent payment link and one leaked
 * cron password the same leak: the key that stamps a ~£-value payment link was
 * also the key that runs every scheduled job on the platform. Two unrelated
 * jobs, one secret.
 *
 * Splitting them cannot be a single flip, because links already sitting in
 * parents' inboxes were stamped with the old secret and stay valid for
 * DEFAULT_TTL_HOURS (14 days). Deleting the fallback the same day the new
 * secret lands would kill every link sent in the previous fortnight — and those
 * are precisely the families being chased for payment. So:
 *
 *   1. Set BILLING_LINK_SECRET. From that moment every NEW link is signed with
 *      it alone (see signingSecret). Old links still verify.
 *   2. Fourteen days later, set BILLING_LINK_LEGACY_UNTIL to any past timestamp
 *      (or simply to the cutover date + 14 days when you do step 1, and it
 *      closes itself). Legacy verification stops; by then every legacy link has
 *      expired on its own and no parent notices.
 *
 * Signing never accepts a legacy secret once the dedicated one exists. Only
 * verification does, and only while the window is open.
 */
const LEGACY_SECRET_VARS = ['BILLING_CRON_SECRET', 'CRON_SECRET'] as const;

export const DEFAULT_TTL_HOURS = 24 * 14;

function dedicatedSecret(): string {
  return process.env.BILLING_LINK_SECRET || '';
}

function legacySecrets(): string[] {
  const seen: string[] = [];
  for (const name of LEGACY_SECRET_VARS) {
    const value = process.env[name];
    if (value && !seen.includes(value)) seen.push(value);
  }
  return seen;
}

/**
 * Is the old secret still accepted for verification?
 *
 * Unset means "not closed yet" and returns true. That is deliberate: the cost of
 * failing open here is that an old link keeps working slightly longer, while the
 * cost of failing closed is a parent clicking Pay and hitting a dead page. An
 * unparseable value is treated the same way rather than silently stranding
 * every outstanding link on a typo.
 */
export function legacyVerificationOpen(now: number = Date.now()): boolean {
  const until = process.env.BILLING_LINK_LEGACY_UNTIL;
  if (!until) return true;
  const closesAt = Date.parse(until);
  if (Number.isNaN(closesAt)) {
    console.warn('[billing-link] BILLING_LINK_LEGACY_UNTIL is not a valid date; leaving legacy verification open');
    return true;
  }
  return now < closesAt;
}

/** The one secret new links are stamped with. Never the cron password. */
function signingSecret(): string {
  return dedicatedSecret();
}

/** Signing key first, then legacy keys while the grace window is open. */
function verificationSecrets(): string[] {
  const candidates: string[] = [];
  const signing = signingSecret();
  if (signing) candidates.push(signing);
  if (legacyVerificationOpen()) {
    for (const secret of legacySecrets()) {
      if (!candidates.includes(secret)) candidates.push(secret);
    }
  }
  return candidates;
}

function toBase64Url(input: string) {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function fromBase64Url(input: string) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signatureMatches(body: string, sig: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig || '', 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export function createPublicBillingToken(cycleId: string, ttlHours = DEFAULT_TTL_HOURS) {
  const secret = signingSecret();
  if (!secret) throw new Error('Missing billing token secret');
  const payload: BillingTokenPayload = {
    cycleId,
    exp: Date.now() + ttlHours * 60 * 60 * 1000,
  };
  const body = toBase64Url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyPublicBillingToken(token: string): BillingTokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');

  const candidates = verificationSecrets();
  if (!candidates.length) return null;

  // Every candidate is compared even after a match so the work does not depend
  // on which key was used. The loop is two entries long; the constant cost is
  // worth not signalling "that was the legacy key" through timing.
  let matched = false;
  for (const secret of candidates) {
    if (signatureMatches(body, sig, secret)) matched = true;
  }
  if (!matched) return null;

  try {
    const payload = JSON.parse(fromBase64Url(body)) as BillingTokenPayload;
    if (!payload?.cycleId || !payload?.exp) return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
