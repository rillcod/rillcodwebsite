import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

function throttleSecret(): string {
  const secret = process.env.CONSENT_THROTTLE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Consent throttle secret is not configured');
  return secret;
}

export function hashConsentSubmissionIp(ip: string): string | null {
  const normalized = ip.trim().toLowerCase();
  if (!normalized || normalized === 'unknown') return null;
  return createHmac('sha256', throttleSecret()).update(normalized).digest('hex');
}

export async function isConsentSubmissionThrottled(
  admin: AnySupabase,
  input: { formId: string; ipHash: string | null; max?: number; windowMinutes?: number },
): Promise<boolean> {
  if (!input.ipHash) return false;
  const since = new Date(Date.now() - (input.windowMinutes ?? 10) * 60_000).toISOString();
  const { count, error } = await admin
    .from('consent_submission_throttle')
    .select('id', { count: 'exact', head: true })
    .eq('form_id', input.formId)
    .eq('ip_hmac', input.ipHash)
    .gte('submitted_at', since);
  if (error) throw error;
  return (count ?? 0) >= (input.max ?? 5);
}

export async function recordConsentSubmissionAttempt(
  admin: AnySupabase,
  input: { formId: string; ipHash: string | null; ttlMinutes?: number },
): Promise<void> {
  if (!input.ipHash) return;
  const now = new Date();
  const { error } = await admin.from('consent_submission_throttle').insert({
    form_id: input.formId,
    ip_hmac: input.ipHash,
    submitted_at: now.toISOString(),
    expires_at: new Date(now.getTime() + (input.ttlMinutes ?? 15) * 60_000).toISOString(),
  });
  if (error) throw error;
}
