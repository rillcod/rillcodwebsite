/**
 * GET|POST /api/cron/payment-reminders
 *
 * Automated installment-balance chasers. Runs on a schedule and, for each
 * summer-school applicant on an installment plan with an outstanding balance,
 * sends a friendly branded reminder (email + WhatsApp if opted in) with a
 * pay-online link. The same cron also chases term-registration students with
 * verified deposits and an outstanding instalment balance.
 *
 * Auth: cron secret (same scheme as the other cron routes).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { getSummerBalanceDue, getSummerTotalTuition } from '@/lib/summer-school/pricing';
import { SMTP_FROM_EMAIL } from '@/config/brand';
import { SPECIAL_BALANCE_PATH } from '@/lib/registration/enrollment-types';
import { resolveApprovedTemplate } from '@/lib/communication/template-registry';
import { DEFAULT_CONFIG, parseBillingAutomationConfig } from '@/app/api/billing/automation/config';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { registeredProgrammeName } from '@/lib/registration/programme-label';
import { cronInterval } from '@/lib/operations/cron-registry';

export const dynamic = 'force-dynamic';

// Legacy provisioning defaults (scheduler overrides are disabled by the authoritative dashboard code below):
//   • ?everyDays=N on the cron URL (highest priority), else
//   • BALANCE_REMINDER_EVERY_DAYS env var, else 5.
const DEFAULT_REMIND_EVERY_DAYS = Number(process.env.BALANCE_REMINDER_EVERY_DAYS) || 5;

// Stop chasing the same parent forever — cap the total reminders sent (configurable via
// BALANCE_REMINDER_MAX). After the cap they're left alone until staff follow up manually.
const MAX_REMINDERS = Number(process.env.BALANCE_REMINDER_MAX) || 4;

function remindCount(notes: string | null): number {
  const m = (notes || '').match(/\[BalanceRemindCount:\s*(\d+)\]/i);
  return m ? parseInt(m[1], 10) || 0 : 0;
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function lastRemindedAt(notes: string | null): Date | null {
  const m = (notes || '').match(/\[BalanceReminded:\s*([^\]]+)\]/i);
  if (!m) return null;
  const d = new Date(m[1].trim());
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) { return runMonitoredCron('payment-reminders', cronInterval('payment-reminders'), () => handle(req)); }
export async function POST(req: NextRequest) { return runMonitoredCron('payment-reminders', cronInterval('payment-reminders'), () => handle(req)); }

async function handle(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = adminClient();

  // Admin-controllable regulator (dashboard) overrides env defaults. Missing row → defaults.
  const { data: cfg, error: cfgError } = await admin
    .from('balance_reminder_settings')
    .select('enabled, every_days, max_reminders, channel_email, channel_whatsapp, updated_at')
    .eq('id', 1)
    .maybeSingle();
  if (cfgError || !cfg) {
    console.error('[payment-reminders] authoritative Finance settings unavailable:', cfgError?.message || 'missing settings row');
    return NextResponse.json({ success: false, error: 'Finance reminder settings unavailable; no messages were sent.' }, { status: 503 });
  }

  const { data: governanceRow, error: governanceError } = await admin
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', 'billing_automation_config')
    .maybeSingle();
  if (governanceError) {
    console.error('[payment-reminders] Finance master control unavailable:', governanceError.message);
    return NextResponse.json({ success: false, error: 'Finance master control unavailable; no messages were sent.' }, { status: 503 });
  }
  let governance = DEFAULT_CONFIG;
  if (governanceRow?.setting_value) {
    let stored: unknown;
    try { stored = JSON.parse(governanceRow.setting_value); }
    catch { return NextResponse.json({ success: false, error: 'Finance master control is invalid; no messages were sent.' }, { status: 503 }); }
    const parsed = parseBillingAutomationConfig(stored);
    if (!parsed.ok) {
      return NextResponse.json({ success: false, error: `${parsed.error}; no messages were sent.` }, { status: 503 });
    }
    governance = parsed.config;
  }
  if (!governance.finance_messages_enabled) {
    return NextResponse.json({ success: true, disabled: true, reason: 'finance_master_switch', scanned: 0, remindedEmail: 0, remindedWhatsapp: 0, skipped: 0, capped: 0 });
  }

  const settings = {
    enabled: cfg.enabled,
    everyDays: Math.min(60, Math.max(1, Number(cfg.every_days) || DEFAULT_REMIND_EVERY_DAYS)),
    maxReminders: Math.min(20, Math.max(1, Number(cfg.max_reminders) || MAX_REMINDERS)),
    channelEmail: cfg.channel_email,
    channelWhatsapp: cfg.channel_whatsapp,
  };
  if (!settings.enabled) {
    return NextResponse.json({ success: true, disabled: true, scanned: 0, remindedEmail: 0, remindedWhatsapp: 0, skipped: 0, capped: 0 });
  }

  // ?everyDays=N still overrides the cadence per scheduler call (clamped 1–60).
  // SECURITY: Finance settings alone determine cadence; query parameters are ignored.
  const maxReminders = Math.max(1, settings.maxReminders);
  const everyDays = settings.everyDays;
  const report = {
    scanned: 0,
    remindedEmail: 0,
    remindedWhatsapp: 0,
    skipped: 0,
    capped: 0,
    everyDays,
    termScanned: 0,
    termRemindedEmail: 0,
    termRemindedWhatsapp: 0,
    termSkipped: 0,
    termCapped: 0,
  };
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, '');
  const cutoff = Date.now() - everyDays * 86400000;

  // Oldest-touched first: stamping a reminder bumps updated_at, so already-reminded
  // prospects sink to the back and each run advances to fresh ones (resumable batching).
  const { data: prospects, error: prospectsError } = await admin
    .from('prospective_students')
    .select('id, full_name, parent_name, parent_email, email, parent_phone, notes, preferred_schedule, course_interest')
    .eq('status', 'partially_paid')
    .eq('is_active', true)
    .order('updated_at', { ascending: true })
    .limit(100);
  if (prospectsError) {
    return NextResponse.json({ success: false, error: `Could not load balance-reminder recipients: ${prospectsError.message}` }, { status: 500 });
  }

  // Stop ~10s before the 60s serverless cap so a partial run is saved and the next
  // scheduled run resumes — never killed mid-send.
  const DEADLINE = Date.now() + 50_000;

  const { notificationsService } = await import('@/services/notifications.service');
  const { buildRillcodTransactionalEmailHtml, escapeHtml } = await import('@/lib/email/rillcod-transactional-email');

  for (const p of (prospects ?? []) as any[]) {
    if (Date.now() > DEADLINE) break; // resume on next scheduled run
    report.scanned++;

    // Paused by an admin from the control panel → never remind.
    if (/\[BalanceRemindPaused\]/i.test(p.notes || '')) { report.skipped++; continue; }

    // Cap: stop after the configured max so a parent is never chased indefinitely.
    const sentSoFar = remindCount(p.notes);
    if (sentSoFar >= maxReminders) { report.capped++; continue; }

    // De-dupe: skip if reminded within the window.
    const last = lastRemindedAt(p.notes);
    if (last && last.getTime() > cutoff) { report.skipped++; continue; }

    const to = (p.parent_email || p.email || '').trim().toLowerCase();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(to)) { report.skipped++; continue; }

    // Resolve the outstanding balance from completed transactions, not stale
    // balance_due JSON on an old deposit transaction.
    const { data: txs, error: transactionsError } = await admin
      .from('payment_transactions')
      .select('amount')
      .contains('payment_gateway_response', { prospect_id: p.id })
      .in('payment_status', ['completed', 'success', 'paid']);
    if (transactionsError) throw new Error(`Could not calculate balance for ${p.id}: ${transactionsError.message}`);
    const amountPaid = (txs ?? []).reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0);
    const preferredMode = p.preferred_schedule || 'Online';
    const totalTuition = getSummerTotalTuition(preferredMode);
    const balanceDue = getSummerBalanceDue(preferredMode, amountPaid);
    if (balanceDue <= 0) {
      const { data: paidProspect, error: paidStatusError } = await admin.from('prospective_students')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', p.id)
        .select('id')
        .maybeSingle();
      if (paidStatusError || !paidProspect) {
        throw new Error(`Balance is clear but paid status could not be saved for ${p.id}: ${paidStatusError?.message || 'row not updated'}`);
      }
      report.skipped++;
      continue;
    }

    const parentName = p.parent_name || 'Parent/Guardian';
    const payLink = `${baseUrl}${SPECIAL_BALANCE_PATH}?email=${encodeURIComponent(to)}`;
    const amountStr = `₦${balanceDue.toLocaleString()}`;

    let delivered = false;
    const { deliverReminder } = await import('@/lib/finance/reminders/orchestrator');

    if (settings.channelEmail && governance.notify_email) try {
      const governedEmail = await resolveApprovedTemplate(admin, 'finance_balance_reminder', {
        customer_name: parentName,
        student_name: p.full_name,
        balance: amountStr,
        payment_link: payLink,
      });
      const emailResult = await deliverReminder({
        stream: 'special_program',
        action: 'special_balance_reminder',
        entityType: 'prospective_student',
        entityId: p.id,
        stage: `count_${sentSoFar + 1}`,
        channel: 'email',
        dedupe: true,
        metadata: { balance_due: balanceDue, settings_updated_at: cfg.updated_at, cadence_days: everyDays, max_reminders: maxReminders },
        deliver: async () => {
          // Whichever programme this parent actually registered for — the
          // reminder used to thank every one of them for a summer cohort.
          const programmeLabel = registeredProgrammeName({
            notes: p.notes,
            courseInterest: (p as { course_interest?: string | null }).course_interest,
            fallback: 'your Rillcod programme',
          });
          const html = buildRillcodTransactionalEmailHtml({
            eyebrow: programmeLabel,
            title: 'A quick reminder about your balance',
            bodyHtml: governedEmail
              ? `<p style="margin:0 0 16px;">${escapeHtml(governedEmail.body)}</p>`
              : `<p style="margin:0 0 10px;">Dear ${escapeHtml(parentName)}, thank you for enrolling <strong>${escapeHtml(p.full_name)}</strong> in ${escapeHtml(programmeLabel)}.</p>
          <p style="margin:0 0 16px;">This is a friendly reminder that <strong>${amountStr}</strong> remains on your installment plan. Clearing it keeps your child's seat and access uninterrupted.</p>
          <div style="text-align:center;margin:0 0 8px;"><a href="${payLink}" style="display:inline-block;padding:13px 28px;background:#7c3aed;color:#fff;font-size:14px;font-weight:800;text-decoration:none;border-radius:8px;">Pay Balance Online →</a></div>`,
            summaryRows: [
              { label: 'Student', value: p.full_name },
              { label: 'Outstanding', value: amountStr },
              { label: 'Total tuition', value: `₦${totalTuition.toLocaleString()}` },
              { label: 'Programme', value: programmeLabel },
            ],
            footerNote: 'rillcod technologies limited • admissions',
          });
          await notificationsService.sendExternalEmail({
            to,
            subject: governedEmail?.subject || `Reminder: ${programmeLabel} balance for ${p.full_name}`,
            html,
            fromName: 'Rillcod Technologies',
            fromEmail: SMTP_FROM_EMAIL,
          });
        },
      });
      if (emailResult.status === 'success') {
        report.remindedEmail++;
        delivered = true;
      }
    } catch (emailErr) {
      console.error('[payment-reminders] email failed:', emailErr);
    }

    // WhatsApp (best-effort).
    if (settings.channelWhatsapp && governance.notify_whatsapp && p.parent_phone) {
      try {
        const waResult = await deliverReminder({
          stream: 'special_program',
          action: 'special_balance_reminder',
          entityType: 'prospective_student',
          entityId: p.id,
          stage: `count_${sentSoFar + 1}`,
          channel: 'whatsapp',
          metadata: { balance_due: balanceDue, settings_updated_at: cfg.updated_at, cadence_days: everyDays, max_reminders: maxReminders },
          deliver: async () => {
            const { sendWhatsApp } = await import('@/lib/whatsapp/send');
            const ok = await sendWhatsApp(p.parent_phone, [
              `Hello ${parentName}! 👋`,
              `Friendly reminder: ${amountStr} is still due on ${p.full_name}'s Rillcod Summer School installment plan.`,
              `Pay online: ${payLink}`,
              'Thank you!',
            ].join('\n'));
            if (!ok) throw new Error('WhatsApp send failed');
          },
        });
        if (waResult.status === 'success') {
          report.remindedWhatsapp++;
          delivered = true;
        }
      } catch { /* non-fatal */ }
    }

    // Nothing went out — leave the markers untouched so the next run retries
    // instead of counting a phantom reminder toward the cap.
    if (!delivered) { report.skipped++; continue; }

    // Stamp the de-dupe marker + running count (strip any previous markers first).
    const cleanedNotes = (p.notes || '')
      .replace(/\s*\[BalanceReminded:[^\]]*\]/gi, '')
      .replace(/\s*\[BalanceRemindCount:[^\]]*\]/gi, '')
      .trim();
    const { data: stamped, error: stampError } = await admin.from('prospective_students')
      .update({
        notes: `${cleanedNotes} [BalanceReminded: ${new Date().toISOString()}] [BalanceRemindCount: ${sentSoFar + 1}]`.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', p.id)
      .select('id')
      .maybeSingle();
    if (stampError || !stamped) {
      throw new Error(`Reminder delivered but recipient marker failed for ${p.id}: ${stampError?.message || 'row not updated'}`);
    }
  }

  const { runTermBalanceReminders } = await import('@/lib/finance/reminders/term-balance-reminders');
  const termReport = await runTermBalanceReminders({
    admin,
    baseUrl,
    everyDays,
    maxReminders,
    channelEmail: settings.channelEmail,
    channelWhatsapp: settings.channelWhatsapp,
    notifyEmail: governance.notify_email,
    notifyWhatsapp: governance.notify_whatsapp,
    deadline: DEADLINE,
    settingsUpdatedAt: cfg.updated_at,
  });
  Object.assign(report, termReport);

  return NextResponse.json({ success: true, ...report });
}
