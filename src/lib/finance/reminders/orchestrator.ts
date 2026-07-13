import { createAdminClient } from '@/lib/supabase/admin';
import { assertDbOk } from '@/lib/finance/write-result';

export type ReminderStream = 'invoice' | 'school_billing' | 'individual_billing' | 'special_program' | 'summer_school';
export type ReminderChannel = 'email' | 'whatsapp' | 'in_app' | 'sms';

const MAX_ATTEMPTS = 3;

export type DeliverReminderInput = {
  stream: ReminderStream;
  action: string;
  entityType: string;
  entityId: string;
  stage?: string | null;
  channel: ReminderChannel;
  /** When true, skip if a success already exists for this stream/entity/stage/channel */
  dedupe?: boolean;
  metadata?: Record<string, unknown>;
  deliver: () => Promise<void>;
};

/**
 * Shared delivery + audit for finance reminders across streams.
 * Streams keep eligibility logic; this owns dedup, retries, and logging.
 */
export async function deliverReminder(input: DeliverReminderInput): Promise<{
  status: 'success' | 'failed' | 'skipped';
  attempt: number;
  error?: string;
}> {
  const db = createAdminClient();
  const stage = input.stage ?? null;
  const dedupe = input.dedupe !== false;

  if (dedupe) {
    const { data: existing, error: exErr } = await (db as any)
      .from('finance_automation_log')
      .select('id, attempt')
      .eq('stream', input.stream)
      .eq('entity_id', input.entityId)
      .eq('channel', input.channel)
      .eq('status', 'success')
      .eq('stage', stage)
      .maybeSingle();
    // stage null match — also try is null
    if (exErr && !/finance_automation_log|does not exist/i.test(exErr.message)) {
      // try without stage eq for null stages
    }
    if (existing) {
      return { status: 'skipped', attempt: Number(existing.attempt || 1) };
    }

    // Count prior failures for retry budget
    const { data: fails } = await (db as any)
      .from('finance_automation_log')
      .select('id')
      .eq('stream', input.stream)
      .eq('entity_id', input.entityId)
      .eq('channel', input.channel)
      .eq('status', 'failed');
    const failCount = fails?.length ?? 0;
    if (failCount >= MAX_ATTEMPTS) {
      await logAutomation({
        stream: input.stream,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        stage,
        channel: input.channel,
        status: 'skipped',
        attempt: failCount + 1,
        error: `Retry limit (${MAX_ATTEMPTS}) reached`,
        metadata: input.metadata,
      });
      return { status: 'skipped', attempt: failCount + 1, error: 'retry_limit' };
    }
  }

  const attempt = 1;
  try {
    await input.deliver();
    await logAutomation({
      stream: input.stream,
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await logAutomation({
      stream: input.stream,
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
  if (error && !/finance_automation_log|does not exist|duplicate|unique/i.test(error.message)) {
    assertDbOk(error, 'finance_automation_log insert');
  }
}

/**
 * When a billing cycle has a linked invoice, cycle reminders win —
 * invoice-reminders should skip that invoice for the same due window.
 */
export async function shouldSuppressInvoiceReminder(invoiceId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('billing_cycles')
    .select('id')
    .eq('invoice_id', invoiceId)
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

export async function listFailedAutomation(limit = 50): Promise<unknown[]> {
  const db = createAdminClient();
  const { data, error } = await (db as any)
    .from('finance_automation_log')
    .select('*')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data ?? [];
}

export { MAX_ATTEMPTS as REMINDER_MAX_ATTEMPTS };
