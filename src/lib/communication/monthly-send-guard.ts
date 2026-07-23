import { redisCache } from '@/lib/redis';

/** ~28 days — safe monthly cadence even when cron fanout runs daily. */
export const MONTHLY_SEND_TTL_SEC = 28 * 24 * 60 * 60;

export function monthlyPeriodKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthlySendGuardKey(event: string, recipient: string, periodKey: string): string {
  return `monthly_send:${event}:${recipient.trim().toLowerCase()}:${periodKey}`;
}

export async function wasSentThisMonth(
  event: string,
  recipient: string,
  periodKey = monthlyPeriodKey(),
): Promise<boolean> {
  const key = monthlySendGuardKey(event, recipient, periodKey);
  return !!(await redisCache.get(key));
}

export async function markSentThisMonth(
  event: string,
  recipient: string,
  periodKey = monthlyPeriodKey(),
): Promise<void> {
  const key = monthlySendGuardKey(event, recipient, periodKey);
  await redisCache.set(key, '1', MONTHLY_SEND_TTL_SEC);
}
