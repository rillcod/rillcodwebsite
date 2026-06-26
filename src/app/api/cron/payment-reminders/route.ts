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

export const dynamic = 'force-dynamic';

// How often the SAME parent may be reminded. Configurable without a redeploy:
//   • ?everyDays=N on the cron URL (highest priority), else
//   • BALANCE_REMINDER_EVERY_DAYS env var, else 5.
const DEFAULT_REMIND_EVERY_DAYS = Number(process.env.BALANCE_REMINDER_EVERY_DAYS) || 5;

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
  // Allow ?everyDays=N to override the cadence per scheduler call (clamped 1–60).
  const everyDaysParam = Number(new URL(req.url).searchParams.get('everyDays'));
  const everyDays = Math.min(60, Math.max(1, everyDaysParam || DEFAULT_REMIND_EVERY_DAYS));
  const report = { scanned: 0, remindedEmail: 0, remindedWhatsapp: 0, skipped: 0, everyDays };
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

    try {
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
        fromEmail: 'support@rillcod.com',
      });
      report.remindedEmail++;
    } catch (emailErr) {
      console.error('[payment-reminders] email failed:', emailErr);
    }

    // WhatsApp (best-effort).
    if (p.parent_phone) {
      try {
        const { sendWhatsApp } = await import('@/lib/whatsapp/send');
        const ok = await sendWhatsApp(p.parent_phone, [
          `Hello ${parentName}! 👋`,
          `Friendly reminder: ${amountStr} is still due on ${p.full_name}'s Rillcod Summer School installment plan.`,
          `Pay online: ${payLink}`,
          'Thank you!',
        ].join('\n'));
        if (ok) report.remindedWhatsapp++;
      } catch { /* non-fatal */ }
    }

    // Stamp the de-dupe marker (strip any previous one first).
    const cleanedNotes = (p.notes || '').replace(/\s*\[BalanceReminded:[^\]]*\]/gi, '').trim();
    await admin.from('prospective_students')
      .update({ notes: `${cleanedNotes} [BalanceReminded: ${new Date().toISOString()}]`.trim(), updated_at: new Date().toISOString() })
      .eq('id', p.id);
  }

  return NextResponse.json({ success: true, ...report });
}
