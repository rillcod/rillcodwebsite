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
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationsService } from '@/services/notifications.service';
import { DEFAULT_CONFIG, type BillingAutomationConfig } from '@/app/api/billing/automation/route';

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

async function buildReminderEmail(invoice: any, reminderNumber: 1 | 2 | 3): Promise<string> {
  const student = invoice.portal_users as any;
  const currencySymbol = invoice.currency === 'NGN' ? '₦' : (invoice.currency ?? '₦');
  const amount = Number(invoice.amount ?? 0).toLocaleString();
  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';
  const invoiceNumber = invoice.invoice_number ?? `INV-${invoice.id.slice(0, 8).toUpperCase()}`;
  const payUrl = `${APP_URL}/dashboard/my-payments`;
  const color = reminderNumber === 1 ? '#2563eb' : reminderNumber === 2 ? '#d97706' : '#dc2626';
  const badge = reminderNumber === 1 ? 'INVOICE' : reminderNumber === 2 ? 'REMINDER' : 'FINAL REMINDER';
  const intro: Record<number, string> = {
    1: `Your invoice from <strong>Rillcod Academy</strong> is ready. Payment is due by <strong>${dueDate}</strong>.`,
    2: `Friendly reminder: your invoice is due in a few days (<strong>${dueDate}</strong>). Please settle before the due date.`,
    3: `<strong style="color:#dc2626;">Your invoice is now overdue</strong> (was due <strong>${dueDate}</strong>). Please settle immediately to avoid service interruption.`,
  };

  const itemsHtml = (invoice.items as any[] ?? []).map((item: any) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">${item.description ?? ''}</td>
      <td style="padding:10px 12px;text-align:right;border-bottom:1px solid #f3f4f6;font-family:monospace;">${currencySymbol}${Number(item.unit_price ?? 0).toLocaleString()}</td>
    </tr>`).join('');

  return `
    <div style="font-family:'Segoe UI',system-ui,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="background:${color};padding:24px 28px;">
        <div style="color:rgba(255,255,255,0.8);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;">Rillcod Academy</div>
        <div style="color:#fff;font-size:22px;font-weight:900;margin-top:4px;">${invoiceNumber}</div>
        <div style="background:rgba(255,255,255,0.15);color:#fff;display:inline-block;padding:4px 12px;font-size:11px;font-weight:900;text-transform:uppercase;border-radius:4px;margin-top:8px;">${badge}</div>
      </div>
      <div style="padding:28px;">
        <p style="color:#374151;font-size:15px;margin:0 0 8px;">Hello <strong>${student?.full_name ?? 'Student'}</strong>,</p>
        <p style="color:#6b7280;font-size:14px;margin:0 0 20px;line-height:1.6;">${intro[reminderNumber]}</p>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:20px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;">Total Due</div>
            <div style="font-size:28px;font-weight:900;color:#111827;font-family:monospace;">${currencySymbol}${amount}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;">Due Date</div>
            <div style="font-size:16px;font-weight:700;color:${reminderNumber===3?'#dc2626':'#374151'};">${dueDate}</div>
          </div>
        </div>
        ${itemsHtml ? `<table style="width:100%;border-collapse:collapse;margin-bottom:20px;"><thead><tr style="background:#f9fafb;"><th style="padding:10px 12px;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Description</th><th style="padding:10px 12px;text-align:right;font-size:11px;color:#9ca3af;text-transform:uppercase;border-bottom:1px solid #e5e7eb;">Amount</th></tr></thead><tbody>${itemsHtml}</tbody></table>` : ''}
        <div style="text-align:center;margin:24px 0;">
          <a href="${payUrl}" style="display:inline-block;background:${color};color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:900;font-size:14px;text-transform:uppercase;">View &amp; Pay Invoice</a>
        </div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#166534;">
          <strong>Paid by bank transfer?</strong> Upload your receipt directly from your payment dashboard.
        </div>
        <p style="font-size:12px;color:#9ca3af;">Questions? <a href="mailto:support@rillcod.com" style="color:${color};">support@rillcod.com</a> — include invoice number <strong>${invoiceNumber}</strong>.</p>
      </div>
      <div style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
        Rillcod Technologies · rillcod.com · This is an automated billing message.
      </div>
    </div>`;
}

async function run(triggeredBy: 'cron' | 'manual') {
  const db = createAdminClient();
  const config = await loadConfig(db);

  const result = { invoices_scanned: 0, reminders_sent: 0, overdue_marked: 0, errors: 0, skipped: 0, details: [] as any[] };

  if (!config.invoice_reminders_enabled && !config.auto_overdue_enabled) {
    await db.from('invoice_automation_logs' as any).insert({
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
    .not('portal_user_id', 'is', null);

  if (error) {
    console.error('[invoice-reminders cron] failed to load invoices:', error.message);
    return result;
  }

  result.invoices_scanned = (invoices ?? []).length;

  for (const inv of (invoices ?? [])) {
    const student = inv.portal_users as any;
    if (!student?.email) { result.skipped++; continue; }

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
        const html = await buildReminderEmail(inv, reminderToSend);
        const subjects: Record<number, string> = {
          1: `Invoice ${inv.invoice_number ?? ''} from Rillcod Academy`,
          2: `Reminder: Your invoice is due soon`,
          3: `FINAL REMINDER: Invoice overdue — action required`,
        };

        if (config.notify_email) {
          await notificationsService.sendEmail(student.id, {
            to: student.email,
            subject: subjects[reminderToSend],
            html,
            fromName: 'Rillcod Academy',
            fromEmail: 'support@rillcod.com',
          });
        }

        if (config.notify_in_app) {
          await db.from('notifications').insert({
            user_id: student.id,
            title: subjects[reminderToSend],
            message: `Amount due: ${inv.currency === 'NGN' ? '₦' : inv.currency}${Number(inv.amount ?? 0).toLocaleString()}`,
            type: reminderToSend === 3 ? 'warning' : 'info',
            link: '/dashboard/my-payments',
          } as any);
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

        await (db as any).from('invoices').update(updatePayload).eq('id', inv.id);

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
        await (db as any).from('invoices').update({ status: 'overdue', updated_at: new Date().toISOString() }).eq('id', inv.id);
        result.overdue_marked++;
      } else {
        result.skipped++;
      }
    }
  }

  // Log the run
  try {
    await (db as any).from('invoice_automation_logs').insert({
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

// Vercel Cron calls GET
export async function GET(req: NextRequest) {
  // Vercel injects Authorization: Bearer CRON_SECRET automatically
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.BILLING_CRON_SECRET || process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await run('cron');
  return NextResponse.json({ success: true, ...result });
}

// Manual trigger from admin dashboard
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const cronSecret = process.env.BILLING_CRON_SECRET || process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret) {
    // Also allow admin session auth for the "Run Now" button
    const { createClient: createServerClient } = await import('@/lib/supabase/server');
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = createAdminClient();
    const { data: profile } = await db.from('portal_users').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const result = await run('manual');
  return NextResponse.json({ success: true, ...result });
}
