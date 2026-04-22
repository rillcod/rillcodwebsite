/**
 * Extract secret from Vercel Cron / manual triggers.
 * Supports `x-cron-secret` (preferred) or `Authorization: Bearer <secret>`.
 */
export function extractCronSecret(req: { headers: Headers }): string {
  const fromHeader = req.headers.get('x-cron-secret');
  if (fromHeader?.trim()) return fromHeader.trim();
  const auth = req.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return '';
}

/**
 * True when the provided secret matches `CRON_SECRET` or `BILLING_CRON_SECRET`.
 */
export function isValidCronSecret(secret: string): boolean {
  if (!secret) return false;
  const a = process.env.CRON_SECRET;
  const b = process.env.BILLING_CRON_SECRET;
  if (a && secret === a) return true;
  if (b && secret === b) return true;
  return false;
}
