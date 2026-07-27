import { redisCache } from '@/lib/redis';
import { createClient } from '@supabase/supabase-js';

/** ~28 days — safe monthly cadence even when a scheduler misfires. */
export const MONTHLY_SEND_TTL_SEC = 28 * 24 * 60 * 60;

export function monthlyPeriodKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthlySendGuardKey(event: string, recipient: string, periodKey: string): string {
  return `monthly_send:${event}:${recipient.trim().toLowerCase()}:${periodKey}`;
}

export function monthlyCampaignKey(event: string, periodKey: string): string {
  return `${event}:${periodKey}`;
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Durable monthly idempotency:
 * 1. Redis (fast) — may be ephemeral on serverless without Upstash
 * 2. communication_delivery_log.campaign_key = `{event}:{YYYY-MM}` (source of truth)
 */
export async function wasSentThisMonth(
  event: string,
  recipient: string,
  periodKey = monthlyPeriodKey(),
): Promise<boolean> {
  const cleanEmail = recipient.trim().toLowerCase();
  const redisKey = monthlySendGuardKey(event, cleanEmail, periodKey);

  const cached = await redisCache.get(redisKey);
  if (cached) return true;

  const db = adminClient();
  if (db) {
    const campaignKey = monthlyCampaignKey(event, periodKey);
    const { data: dbLog } = await db
      .from('communication_delivery_log')
      .select('id')
      .eq('recipient', cleanEmail)
      .eq('campaign_key', campaignKey)
      .in('status', ['sent', 'delivered', 'queued'])
      .limit(1);

    if (dbLog && dbLog.length > 0) {
      await redisCache.set(redisKey, '1', MONTHLY_SEND_TTL_SEC);
      return true;
    }
  }

  return false;
}

export async function markSentThisMonth(
  event: string,
  recipient: string,
  periodKey = monthlyPeriodKey(),
): Promise<void> {
  const cleanEmail = recipient.trim().toLowerCase();
  const redisKey = monthlySendGuardKey(event, cleanEmail, periodKey);
  await redisCache.set(redisKey, '1', MONTHLY_SEND_TTL_SEC);

  const db = adminClient();
  if (!db) return;
  const campaignKey = monthlyCampaignKey(event, periodKey);
  try {
    const { data: existing } = await db
      .from('communication_delivery_log')
      .select('id')
      .eq('recipient', cleanEmail)
      .eq('campaign_key', campaignKey)
      .limit(1);
    if (existing && existing.length > 0) return;

    await db.from('communication_delivery_log').insert({
      channel: 'email',
      recipient: cleanEmail,
      status: 'sent',
      automated: true,
      campaign_key: campaignKey,
      template_key: event,
      metadata: { event_type: event, period_key: periodKey, source: 'monthly_send_guard' },
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[monthly-send-guard] durable mark failed:', err);
  }
}
