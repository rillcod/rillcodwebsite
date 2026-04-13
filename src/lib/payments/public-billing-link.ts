import crypto from 'crypto';

type BillingTokenPayload = {
  cycleId: string;
  exp: number;
};

function getSecret() {
  return process.env.BILLING_CRON_SECRET || process.env.CRON_SECRET || '';
}

function toBase64Url(input: string) {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function fromBase64Url(input: string) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function createPublicBillingToken(cycleId: string, ttlHours = 24 * 14) {
  const secret = getSecret();
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
  const secret = getSecret();
  if (!secret || !token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(fromBase64Url(body)) as BillingTokenPayload;
    if (!payload?.cycleId || !payload?.exp) return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

