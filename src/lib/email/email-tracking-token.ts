import 'server-only';
import { createHmac } from 'node:crypto';

export function buildEmailTrackingPixelUrl(opts: {
  appUrl: string;
  reportId: string;
  email: string;
  type?: string;
}): string {
  const secret = process.env.TRACK_TOKEN_SECRET;
  if (!secret) {
    console.error('[email-tracking] TRACK_TOKEN_SECRET not configured; tracking disabled');
    return '';
  }
  const payload = Buffer.from(JSON.stringify({
    reportId: opts.reportId,
    email: opts.email,
    type: opts.type ?? 'report',
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${opts.appUrl.replace(/\/$/, '')}/api/inbox/track/${payload}.${signature}`;
}