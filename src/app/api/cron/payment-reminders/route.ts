/**
 * GET|POST /api/cron/payment-reminders
 *
 * Automated installment-balance chasers. Runs on a schedule and, for each
 * summer-school applicant on an installment plan with an outstanding balance,
 * sends a friendly branded reminder (email + WhatsApp if opted in) with a
 * pay-online link. De-duped: a parent is reminded at most once every 5 days
 * (tracked via a [BalanceReminded: <iso>] marker in the prospect notes).
 *
 * Auth: cron secret (same scheme as the other cron routes).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { getSummerBalanceDue, getSummerTotalTuition } from '@/lib/summer-school/pricing';
import { SMTP_FROM_EMAIL } from '@/config/brand';

export const dynamic = 'force-dynamic';

// How often the SAME parent may be reminded. Configurable without a redeploy:
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

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = adminClient();

  // Admin-controllable regulator (dashboard) overrides env defaults. Missing row → defaults.
  const { data: cfg } = await admin
    .from('balance_reminder_settings')
    .select('enabled, every_days, max_reminders, channel_email, channel_whatsapp')
    .eq('id', 1)
    .maybeSingle();
  const settings = {
    enabled: (cfg as any)?.enabled ?? true,
    everyDays: (cfg as any)?.every_days ?? DEFAULT_REMIND_EVERY_DAYS,
    maxReminders: (cfg as any)?.max_reminders ?? MAX_REMINDERS,
    channelEmail: (cfg as any)?.channel_email ?? true,
    channelWhatsapp: (cfg as any)?.channel_whatsapp ?? true,
  };
  if (!settings.enabled) {
    return NextResponse.json({ success: true, disabled: true, scanned: 0, remindedEmail: 0, remindedWhatsapp: 0, skipped: 0, capped: 0 });
  }

  // ?everyDays=N still overrides the cadence per scheduler call (clamped 1–60).
  const everyDaysParam = Number(new URL(req.url).searchParams.get('everyDays'));
  const everyDays = Math.min(60, Math.max(1, everyDaysParam || settings.everyDays));
  const maxReminders = Math.max(1, settings.maxReminders);
  const report = { scanned: 0, remindedEmail: 0, remindedWhatsapp: 0, skipped: 0, capped: 0, everyDays };
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, '');
  const cutoff = Date.now() - everyDays * 86400000;

  // Oldest-touched first: stamping a reminder bumps updated_at, so already-reminded
  // prospects sink to the back and each run advances to fresh ones (resumable batching).
  const { data: prospects } = await admin
    .from('prospective_students')
    .select('id, full_name, parent_name, parent_email, email, parent_phone, notes, preferred_schedule')
    .eq('status', 'partially_paid')
    .eq('is_active', true)
    .order('updated_at', { ascending: true })
    .limit(100);

  // Stop ~10s before the 60s serverless cap so a partial run is saved and the next
  // scheduled run resumes — never killed mid-send.
  const DEADLINE = Date.now() + 50_000;

  const { notificationsService } = await import('@/services/notifications.service');
  const { buildRillcodTransactionalEmailHtml } = await import('@/lib/email/rillcod-transactional-email');

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
    const { data: txs } = await admin
      .from('payment_transactions')
      .select('amount')
      .contains('payment_gateway_response', { prospect_id: p.id })
      .in('payment_status', ['completed', 'success', 'paid']);
    const amountPaid = (txs ?? []).reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0);
    const email = String(p.parent_email || p.email || '').trim().toLowerCase();
    const [{ count: studentCount }, { count: prospectiveCount }] = await Promise.all([
      admin.from('students').select('id', { count: 'exact', head: true }).eq('parent_email', email),
      admin.from('prospective_students').select('id', { count: 'exact', head: true }).eq('parent_email', email),
    ]);
    const hasSibling = (studentCount || 0) + (prospectiveCount || 0) > 1;
    const preferredMode = p.preferred_schedule || 'Online';
    const totalTuition = getSummerTotalTuition(preferredMode, hasSibling);
    const balanceDue = getSummerBalanceDue(preferredMode, amountPaid, hasSibling);
    if (balanceDue <= 0) {
      await admin.from('prospective_students')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', p.id);
      report.skipped++;
      continue;
    }

    const parentName = p.parent_name || 'Parent/Guardian';
    const payLink = `${baseUrl}/summer-school/pay-balance?email=${encodeURIComponent(to)}`;
    const amountStr = `₦${balanceDue.toLocaleString()}`;

    let delivered = false;
    const { deliverReminder } = await import('@/lib/finance/reminders/orchestrator');

    if (settings.channelEmail) try {
      const emailResult = await deliverReminder({
        stream: 'summer_school',
        action: 'summer_balance_reminder',
        entityType: 'prospective_student',
        entityId: p.id,
        stage: `count_${sentSoFar + 1}`,
        channel: 'email',
        dedupe: true,
        metadata: { balance_due: balanceDue },
        deliver: async () => {
          const html = buildRillcodTransactionalEmailHtml({
            eyebrow: 'Summer School',
            title: 'A quick reminder about your balance',
            bodyHtml: `<p style="margin:0 0 10px;">Dear ${parentName}, thank you for enrolling <strong>${p.full_name}</strong> in the Rillcod AI Summer School 2026.</p>
          <p style="margin:0 0 16px;">This is a friendly reminder that <strong>${amountStr}</strong> remains on your installment plan. Clearing it keeps your child's seat and access uninterrupted.</p>
          <div style="text-align:center;margin:0 0 8px;"><a href="${payLink}" style="display:inline-block;padding:13px 28px;background:#7c3aed;color:#fff;font-size:14px;font-weight:800;text-decoration:none;border-radius:8px;">Pay Balance Online →</a></div>`,
            summaryRows: [
              { label: 'Student', value: p.full_name },
              { label: 'Outstanding', value: amountStr },
              { label: 'Total tuition', value: `₦${totalTuition.toLocaleString()}` },
              { label: 'Programme', value: 'AI Summer School 2026' },
            ],
            footerNote: 'rillcod technologies limited • summer school admissions',
          });
          await notificationsService.sendExternalEmail({
            to,
            subject: `Reminder: Summer School balance for ${p.full_name}`,
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
    if (settings.channelWhatsapp && p.parent_phone) {
      try {
        const waResult = await deliverReminder({
          stream: 'summer_school',
          action: 'summer_balance_reminder',
          entityType: 'prospective_student',
          entityId: p.id,
          stage: `count_${sentSoFar + 1}`,
          channel: 'whatsapp',
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
    await admin.from('prospective_students')
      .update({
        notes: `${cleanedNotes} [BalanceReminded: ${new Date().toISOString()}] [BalanceRemindCount: ${sentSoFar + 1}]`.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', p.id);
  }

  return NextResponse.json({ success: true, ...report });
}
