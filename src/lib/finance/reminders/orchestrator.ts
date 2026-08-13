import { createAdminClient } from '@/lib/supabase/admin';
import { assertDbOk } from '@/lib/finance/write-result';
import {
  FINANCE_REMINDER_MAX_ATTEMPTS,
  financeReminderRetryState,
} from '@/lib/finance/reminders/retry-policy';

export type ReminderStream = 'invoice' | 'school_billing' | 'individual_billing' | 'special_program';
export type ReminderChannel = 'email' | 'whatsapp' | 'in_app' | 'sms';

const MAX_ATTEMPTS = FINANCE_REMINDER_MAX_ATTEMPTS;

export type DeliverReminderInput = {
  stream: ReminderStream | 'summer_school';
  action: string;
  entityType: string;
  entityId: string;
  stage?: string | null;
  channel: ReminderChannel;
  /** When true, skip if a success already exists for this stream/entity/stage/channel. */
  dedupe?: boolean;
  metadata?: Record<string, unknown>;
  deliver: () => Promise<void>;
};

/**
 * Shared delivery + audit for finance reminders across streams.
 * Streams keep eligibility logic; this owns deduplication, retries, and logging.
 */
export async function deliverReminder(input: DeliverReminderInput): Promise<{
  status: 'success' | 'failed' | 'skipped';
  attempt: number;
  error?: string;
}> {
  const { normalizeReminderStream } = await import('@/lib/registration/enrollment-types');
  const stream = normalizeReminderStream(input.stream) as ReminderStream;
  const db = createAdminClient();
  const stage = input.stage ?? null;
  const dedupe = input.dedupe !== false;
  let failCount = 0;
  let attempt = 1;

  if (dedupe) {
    let successQuery = (db as any)
      .from('finance_automation_log')
      .select('id, attempt')
      .eq('stream', stream)
      .eq('entity_id', input.entityId)
      .eq('channel', input.channel)
      .eq('status', 'success');
    successQuery = stage === null ? successQuery.is('stage', null) : successQuery.eq('stage', stage);
    const { data: existing, error: existingError } = await successQuery.maybeSingle();
    assertDbOk(existingError, 'finance reminder success history');
    if (existing) {
      return { status: 'skipped', attempt: Number(existing.attempt || 1) };
    }

    let failureQuery = (db as any)
      .from('finance_automation_log')
      .select('id,attempt,created_at')
      .eq('stream', stream)
      .eq('entity_id', input.entityId)
      .eq('channel', input.channel)
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(MAX_ATTEMPTS);
    failureQuery = stage === null ? failureQuery.is('stage', null) : failureQuery.eq('stage', stage);
    const { data: failures, error: failuresError } = await failureQuery;
    assertDbOk(failuresError, 'finance reminder failure history');
    failCount = failures?.length ?? 0;
    const retryState = financeReminderRetryState(failures ?? []);
    attempt = retryState.attempt;

    if (failCount >= MAX_ATTEMPTS) {
      if (retryState.cooldownActive) {
        // Pause a noisy provider for a few hours, then automatically try again.
        // The old lifetime cap locked the work forever after three failures.
        await logAutomation({
          stream,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          stage,
          channel: input.channel,
          status: 'skipped',
          attempt,
          error: `Retry limit (${MAX_ATTEMPTS}) reached; automatic retry resumes after the cooldown`,
          metadata: input.metadata,
        });
        return { status: 'skipped', attempt, error: 'retry_limit_cooldown' };
      }
    }
  }

  if (!dedupe) attempt = 1;
  try {
    await input.deliver();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await logAutomation({
      stream,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      stage,
      channel: input.channel,
      status: 'failed',
      attempt,
      error: message,
      metadata: input.metadata,
    });
    return { status: 'failed', attempt, error: message };
  }

  // Keep logging outside the delivery catch: a logging outage must never be
  // recorded as if the email/notification itself failed.
  await logAutomation({
    stream,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    stage,
    channel: input.channel,
    status: 'success',
    attempt,
    metadata: input.metadata,
  });
  return { status: 'success', attempt };
}

export async function logAutomation(row: {
  stream: string;
  action: string;
  entityType: string;
  entityId: string;
  stage?: string | null;
  channel: string;
  status: 'pending' | 'success' | 'failed' | 'skipped';
  attempt?: number;
  error?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = createAdminClient();
  const { error } = await (db as any).from('finance_automation_log').insert({
    stream: row.stream,
    action: row.action,
    entity_type: row.entityType,
    entity_id: row.entityId,
    stage: row.stage ?? null,
    channel: row.channel,
    status: row.status,
    attempt: row.attempt ?? 1,
    error: row.error ?? null,
    metadata: row.metadata ?? {},
  });
  // A concurrent worker may win the unique successful-delivery race. That is
  // already the desired durable state; every other logging failure is material.
  if (error && /duplicate|unique/i.test(error.message) && row.status === 'success') return;
  assertDbOk(error, 'finance_automation_log insert');
}

/**
 * When a billing cycle has a linked invoice, cycle reminders win. A failed
 * lookup must stop sending instead of risking duplicate finance messages.
 */
export async function shouldSuppressInvoiceReminder(invoiceId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('billing_cycles')
    .select('id')
    .eq('invoice_id', invoiceId)
    .limit(1)
    .maybeSingle();
  assertDbOk(error, 'billing-cycle reminder suppression lookup');
  return !!data;
}

export async function listFailedAutomation(limit = 50): Promise<unknown[]> {
  const db = createAdminClient();
  const { data, error } = await (db as any)
    .from('finance_automation_log')
    .select('*')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(Math.min(200, Math.max(1, Math.trunc(limit))));
  assertDbOk(error, 'failed finance automation history');
  return data ?? [];
}

export { MAX_ATTEMPTS as REMINDER_MAX_ATTEMPTS };
