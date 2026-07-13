/**
 * Automated Invoice Reminder Cron
 * Vercel Cron calls GET daily at 8:00 AM.
 * Manual trigger: POST with x-cron-secret header.
 *
 * Logic (per unpaid invoice):
 *  - Reminder 1 → N days after invoice created,  reminder_1_sent_at IS NULL
 *  - Reminder 2 → N days before due_date,         reminder_2_sent_at IS NULL
 *  - Reminder 3 → N days after  due_date (overdue), reminder_3_sent_at IS NULL
 *
 * Config stored in system_settings key: billing_automation_config
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationsService } from '@/services/notifications.service';
import { buildInvoiceReminderEmail } from '@/lib/finance/invoice-email';
import { DEFAULT_CONFIG, type BillingAutomationConfig } from '@/app/api/billing/automation/config';
import { SMTP_FROM_EMAIL } from '@/config/brand';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rillcod.com';

function daysAgo(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}
function daysUntil(date: string): number {
  return Math.floor((new Date(date).getTime() - Date.now()) / 86_400_000);
}

async function loadConfig(db: ReturnType<typeof createAdminClient>): Promise<BillingAutomationConfig> {
  const { data } = await db
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', 'billing_automation_config')
    .maybeSingle();
  if (!data?.setting_value) return DEFAULT_CONFIG;
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(data.setting_value) }; }
  catch { return DEFAULT_CONFIG; }
}

async function run(triggeredBy: 'cron' | 'manual') {
  const db = createAdminClient();
  const config = await loadConfig(db);

  const result = { invoices_scanned: 0, reminders_sent: 0, overdue_marked: 0, errors: 0, skipped: 0, details: [] as any[] };

  if (!config.invoice_reminders_enabled && !config.auto_overdue_enabled) {
    await db.from('invoice_automation_logs').insert({
      triggered_by: triggeredBy,
      invoices_scanned: 0,
      reminders_sent: 0,
      overdue_marked: 0,
      errors: 0,
      details: [{ info: 'Automation disabled — skipped' }],
    });
    return result;
  }

  // Load all unpaid invoices that have a recipient
  const { data: invoices, error } = await (db as any)
    .from('invoices')
    .select('id, invoice_number, amount, currency, status, due_date, items, created_at, portal_user_id, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at, portal_users(id, full_name, email)')
    .in('status', ['sent', 'draft', 'overdue'])
    .not('portal_user_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    console.error('[invoice-reminders cron] failed to load invoices:', error.message);
    return result;
  }

  result.invoices_scanned = (invoices ?? []).length;

  // Shared overdue marking (also used by billing-reminders)
  if (config.auto_overdue_enabled) {
    try {
      const { markOverdueInvoices } = await import('@/lib/finance/overdue');
      const overdue = await markOverdueInvoices();
      result.overdue_marked = overdue.updated;
    } catch (e: any) {
      console.error('[invoice-reminders] overdue mark failed:', e?.message);
      result.errors++;
    }
  }

  // Stop ~10s before the 60s serverless cap. The reminder_N_sent_at markers make
  // this resumable — the next scheduled run continues with invoices not yet reached.
  const DEADLINE = Date.now() + 50_000;

  const { shouldSuppressInvoiceReminder } = await import('@/lib/finance/reminders/orchestrator');

  for (const inv of (invoices ?? [])) {
    if (Date.now() > DEADLINE) break;
    const student = inv.portal_users as any;
    if (!student?.email) { result.skipped++; continue; }

    // Cycle-linked invoices are reminded by billing-reminders (cycle wins).
    if (await shouldSuppressInvoiceReminder(inv.id)) {
      result.skipped++;
      continue;
    }

    const createdDaysAgo = daysAgo(inv.created_at);
    const dueDaysUntil = inv.due_date ? daysUntil(inv.due_date) : null;
    const dueDaysAgo = inv.due_date ? -daysUntil(inv.due_date) : null;

    let reminderToSend: 1 | 2 | 3 | null = null;

    if (config.invoice_reminders_enabled) {
      // Reminder 3: overdue threshold
      if (
        !inv.reminder_3_sent_at &&
        dueDaysAgo !== null &&
        dueDaysAgo >= config.reminder_3_days_after_due
      ) {
        reminderToSend = 3;
      }
      // Reminder 2: approaching due
      else if (
        !inv.reminder_2_sent_at &&
        dueDaysUntil !== null &&
        dueDaysUntil >= 0 &&
        dueDaysUntil <= config.reminder_2_days_before_due
      ) {
        reminderToSend = 2;
      }
      // Reminder 1: initial after issue
      else if (
        !inv.reminder_1_sent_at &&
        createdDaysAgo >= config.reminder_1_days_after_issue
      ) {
        reminderToSend = 1;
      }
    }

    if (reminderToSend) {
      try {
        const { html, subject } = buildInvoiceReminderEmail(inv, reminderToSend, { appUrl: APP_URL });
        const { deliverReminder } = await import('@/lib/finance/reminders/orchestrator');

        let delivered = false;

        if (config.notify_email) {
          const emailResult = await deliverReminder({
            stream: 'invoice',
            action: `invoice_reminder_${reminderToSend}`,
            entityType: 'invoice',
            entityId: inv.id,
            stage: `reminder_${reminderToSend}`,
            channel: 'email',
            metadata: { invoice_number: inv.invoice_number },
            deliver: async () => {
              const sent = await notificationsService.sendEmail(student.id, {
                to: student.email,
                subject,
                html,
                fromName: 'Rillcod Technologies Finance',
                fromEmail: SMTP_FROM_EMAIL,
              });
              if (sent === false) throw new Error('email opted out or failed');
            },
          });
          if (emailResult.status === 'success') delivered = true;
        }

        if (config.notify_in_app) {
          const inAppResult = await deliverReminder({
            stream: 'invoice',
            action: `invoice_reminder_${reminderToSend}`,
            entityType: 'invoice',
            entityId: inv.id,
            stage: `reminder_${reminderToSend}`,
            channel: 'in_app',
            metadata: { invoice_number: inv.invoice_number },
            deliver: async () => {
              const { error: notifErr } = await db.from('notifications').insert({
                user_id: student.id,
                title: subject,
                message: `Amount due: ${inv.currency === 'NGN' ? '₦' : inv.currency}${Number(inv.amount ?? 0).toLocaleString()}`,
                type: reminderToSend === 3 ? 'warning' : 'info',
                link: '/dashboard/my-payments',
              } as any);
              if (notifErr) throw new Error(notifErr.message);
            },
          });
          if (inAppResult.status === 'success') delivered = true;
        }

        // Only stamp the reminder marker when at least one channel actually
        // delivered — otherwise the invoice would never be retried.
        if (!delivered) {
          result.skipped++;
          result.details.push({ invoice_id: inv.id, reminder: reminderToSend, status: 'skipped', reason: 'no channel delivered' });
          continue;
        }

        // Track the reminder sent
        const reminderField = `reminder_${reminderToSend}_sent_at`;
        const updatePayload: Record<string, any> = {
          [reminderField]: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (reminderToSend === 3 && config.auto_overdue_enabled && inv.status !== 'paid') {
          updatePayload.status = 'overdue';
          result.overdue_marked++;
        }
        if (inv.status === 'draft' && reminderToSend >= 1) {
          updatePayload.status = 'sent';
        }

        const { error: markerError } = await (db as any).from('invoices').update(updatePayload).eq('id', inv.id);
        if (markerError) throw new Error('Reminder delivered but invoice marker failed: ' + markerError.message);

        result.reminders_sent++;
        result.details.push({ invoice_id: inv.id, reminder: reminderToSend, email: student.email, status: 'sent' });
      } catch (err: any) {
        result.errors++;
        result.details.push({ invoice_id: inv.id, reminder: reminderToSend, status: 'failed', error: err?.message });
        console.error('[invoice-reminders cron] error for invoice', inv.id, err?.message);
      }
    } else {
      // Auto overdue marking even when reminders aren't applicable
      if (
        config.auto_overdue_enabled &&
        inv.status !== 'paid' &&
        inv.status !== 'overdue' &&
        dueDaysAgo !== null &&
        dueDaysAgo >= config.reminder_3_days_after_due
      ) {
        const { error: overdueError } = await (db as any).from('invoices').update({ status: 'overdue', updated_at: new Date().toISOString() }).eq('id', inv.id);
        if (overdueError) {
          result.errors++;
          result.details.push({ invoice_id: inv.id, status: 'failed', error: overdueError.message });
        } else {
          result.overdue_marked++;
        }
      } else {
        result.skipped++;
      }
    }
  }

  // Log the run
  try {
    await db.from('invoice_automation_logs').insert({
      triggered_by: triggeredBy,
      invoices_scanned: result.invoices_scanned,
      reminders_sent: result.reminders_sent,
      overdue_marked: result.overdue_marked,
      errors: result.errors,
      details: result.details,
    });
  } catch { /* non-critical */ }

  return result;
}

// Manual trigger or cron
export async function GET(req: NextRequest) {
  return handleRequest(req, 'cron');
}

export async function POST(req: NextRequest) {
  return handleRequest(req, 'manual');
}

async function handleRequest(req: NextRequest, type: 'cron' | 'manual') {
  if (!isValidCronSecret(extractCronSecret(req))) {
    if (type === 'manual') {
      const { createClient: createServerClient } = await import('@/lib/supabase/server');
      const supabase = await createServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      const db = createAdminClient();
      const { data: profile } = await db.from('portal_users').select('role').eq('id', user.id).single();
      if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  const result = await run(type);
  return NextResponse.json({ success: true, ...result });
}
