import { createHmac, timingSafeEqual } from 'crypto';

export const RESULT_VIEW_COOKIE = 'rc_result_view';
const TTL_MS = 4 * 60 * 60 * 1000;

function signingSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || 'rc-view-grant';
}

/** Short-lived signed cookie value — unlocks report view after child-name check. */
export function createViewGrantToken(studentUserId: string): string {
  const exp = Date.now() + TTL_MS;
  const payload = `${studentUserId}.${exp}`;
  const sig = createHmac('sha256', signingSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyViewGrantToken(token: string | undefined | null, studentUserId: string): boolean {
  if (!token || !studentUserId) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [sid, expStr, sig] = parts;
  if (sid !== studentUserId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const payload = `${sid}.${expStr}`;
  const expected = createHmac('sha256', signingSecret()).update(payload).digest('base64url');
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function viewGrantCookieOptions(token: string) {
  return {
    name: RESULT_VIEW_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.floor(TTL_MS / 1000),
  };
}
