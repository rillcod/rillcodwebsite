import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationsService } from '@/services/notifications.service';
import { env } from '@/config/env';
import { createPublicBillingToken } from '@/lib/payments/public-billing-link';
import { aggregateOpenSchoolInvoices, computeSettlementSplit } from '@/lib/billing/school-invoice-rollup';
import type { Json } from '@/types/supabase';

type BillingCycle = {
  id: string;
  subscription_id: string | null;
  owner_type: 'school' | 'individual';
  owner_school_id: string | null;
  owner_user_id: string | null;
  school_id: string | null;
  term_label: string;
  term_start_date: string;
  due_date: string;
  amount_due: number;
  status: 'due' | 'past_due' | 'paid' | 'cancelled' | 'rolled_over';
  reminder_week6_sent_at: string | null;
  reminder_week7_sent_at: string | null;
  reminder_week8_sent_at: string | null;
};

function getWeekFromTermStart(termStartDate: string) {
  const start = new Date(termStartDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function addWeeks(dateInput: string | Date, weeks: number) {
  const d = new Date(dateInput);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function buildBillingReminderEmailHtml(args: {
  termLabel: string;
  amountDue: number;
  dueDate: string;
  webUrl: string;
  mobileUrl: string;
  payUrl: string;
  schoolName?: string | null;
}) {
  const dueDateLabel = args.dueDate
    ? new Date(args.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'Immediate';
  const amountLabel = `NGN ${Number(args.amountDue || 0).toLocaleString()}`;
  const appUrl = args.webUrl || 'https://rillcod.com';
  const logoUrl = `${appUrl.replace(/\/$/, '')}/images/logo.png`;
  const title = 'Billing Notice';
  const ownerLabel = args.schoolName ? `${args.schoolName}` : 'Your account';

  return `
  <div style="margin:0;padding:0;background:#0b0b0c;font-family:Arial,Helvetica,sans-serif;color:#f5f5f5;">
    <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
      <div style="background:#141416;border:1px solid #2b2b2f;padding:20px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <img src="${logoUrl}" alt="Rillcod" style="width:42px;height:42px;object-fit:contain;background:#fff;padding:4px;" />
          <div>
            <p style="margin:0;font-size:11px;letter-spacing:1.4px;color:#f59e0b;font-weight:800;text-transform:uppercase;">Rillcod Academy</p>
            <h2 style="margin:4px 0 0;font-size:18px;line-height:1.3;color:#fff;">${title}</h2>
          </div>
        </div>

        <p style="margin:0 0 12px;font-size:14px;color:#d4d4d8;">
          Hello, this is a professional billing reminder for <strong style="color:#fff;">${ownerLabel}</strong> regarding <strong style="color:#fff;">${args.termLabel}</strong>.
        </p>

        <div style="background:#1a1a1d;border:1px solid #33363a;padding:14px 16px;margin:0 0 14px;">
          <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Payment Summary</p>
          <p style="margin:0 0 6px;font-size:15px;color:#fff;"><strong>Amount Due:</strong> ${amountLabel}</p>
          <p style="margin:0 0 6px;font-size:15px;color:#fff;"><strong>Due Date:</strong> ${dueDateLabel}</p>
          <p style="margin:0;font-size:15px;color:#fff;"><strong>Billing Cycle:</strong> ${args.termLabel}</p>
        </div>

        <p style="margin:0 0 14px;font-size:13px;color:#d4d4d8;">
          To avoid service interruptions, please complete payment as soon as possible.
        </p>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px;">
          <a href="${args.payUrl}" style="background:#f59e0b;color:#111827;text-decoration:none;padding:10px 14px;font-size:12px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;">
            View & Pay Now
          </a>
          <span style="border:1px solid #3f3f46;color:#d4d4d8;padding:10px 14px;font-size:11px;font-weight:700;">
            Mobile: ${args.mobileUrl}
          </span>
        </div>

        <div style="border-top:1px solid #2f2f35;padding-top:14px;">
          <p style="margin:0 0 6px;font-size:12px;color:#a1a1aa;"><strong>Contact:</strong> support@rillcod.com</p>
          <p style="margin:0;font-size:11px;color:#71717a;">
            This is an automated billing communication from Rillcod Academy. Please keep this email for your records.
          </p>
        </div>
      </div>
    </div>
  </div>`;
}

async function ensureStickyNotice(db: ReturnType<typeof createAdminClient>, cycle: BillingCycle, mobileUrl: string) {
  const title = `Billing due for ${cycle.term_label}`;
  const message = `Payment is due for ${cycle.term_label}. Open ${mobileUrl} to complete payment and clear this notice.`;
  let existingQuery = db
    .from('billing_notices')
    .select('id')
    .eq('is_resolved', false)
    .eq('owner_type', cycle.owner_type);

  existingQuery =
    cycle.owner_school_id === null
      ? existingQuery.is('owner_school_id', null)
      : existingQuery.eq('owner_school_id', cycle.owner_school_id);

  existingQuery =
    cycle.owner_user_id === null
      ? existingQuery.is('owner_user_id', null)
      : existingQuery.eq('owner_user_id', cycle.owner_user_id);

  const { data: existing } = await existingQuery.limit(1).maybeSingle();

  if (existing?.id) return existing.id;

  const { data } = await db
    .from('billing_notices')
    .insert({
      owner_type: cycle.owner_type,
      owner_school_id: cycle.owner_school_id,
      owner_user_id: cycle.owner_user_id,
      title,
      message,
      due_date: cycle.due_date,
      is_sticky: true,
      metadata: {
        billing_cycle_id: cycle.id,
        subscription_id: cycle.subscription_id,
      },
    })
    .select('id')
    .single();
  return data?.id ?? null;
}

async function maybeRollOverPaidCycles(db: ReturnType<typeof createAdminClient>) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: paidCycles } = await db
    .from('billing_cycles')
    .select('id, subscription_id, owner_type, owner_school_id, owner_user_id, school_id, due_date, term_label, amount_due, currency, status')
    .eq('status', 'paid')
    .lt('due_date', todayIso)
    .limit(100);

  for (const cycle of paidCycles ?? []) {
    if (!cycle.subscription_id) continue;
    const { data: sub } = await db
      .from('subscriptions')
      .select('id, pricing_model, fixed_amount, price_per_student, school_id, auto_rollover')
      .eq('id', cycle.subscription_id)
      .maybeSingle();
    if (!sub || sub.auto_rollover === false) continue;

    let nextAmount = Number(cycle.amount_due ?? 0);
    if (sub.pricing_model === 'fixed_school') {
      nextAmount = Number(sub.fixed_amount ?? nextAmount);
    } else if (sub.pricing_model === 'per_student' && sub.school_id) {
      const { count } = await db
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', sub.school_id);
      nextAmount = Number(sub.price_per_student ?? 0) * Number(count ?? 0);
    }

    const dueDate = addWeeks(cycle.due_date, 12);
    const termStart = addWeeks(cycle.due_date, 8);
    const nextLabel = `${cycle.term_label} (Rollover)`;

    const { data: exists } = await db
      .from('billing_cycles')
      .select('id')
      .eq('subscription_id', cycle.subscription_id)
      .eq('term_label', nextLabel)
      .maybeSingle();
    if (exists?.id) continue;

    const schoolIdForRollup =
      sub.school_id || cycle.owner_school_id || cycle.school_id || null;

    let itemsPayload: Json = [];
    let rollupTotal = 0;
    let cycleCurrency = String(cycle.currency || 'NGN').toUpperCase();
    let rillcodRetain: number | null = null;
    let schoolSettlement: number | null = null;

    if (schoolIdForRollup && cycle.owner_type === 'school') {
      const agg = await aggregateOpenSchoolInvoices(db, schoolIdForRollup);
      itemsPayload = agg.items as Json;
      rollupTotal = agg.totalAmount;
      if (agg.items.length) cycleCurrency = agg.primaryCurrency;
      const { data: schRow } = await db
        .from('schools')
        .select('commission_rate')
        .eq('id', schoolIdForRollup)
        .maybeSingle();
      const commissionRate = Number(
        (schRow as { commission_rate?: number | null } | null)?.commission_rate ?? 15,
      );
      const gross = Math.round((nextAmount + rollupTotal) * 100) / 100;
      const split = computeSettlementSplit(gross, commissionRate);
      rillcodRetain = split.rillcodRetain;
      schoolSettlement = split.schoolSettlement;
      nextAmount = gross;
    }

    await db.from('billing_cycles').insert({
      subscription_id: cycle.subscription_id,
      owner_type: cycle.owner_type,
      owner_school_id: cycle.owner_school_id,
      owner_user_id: cycle.owner_user_id,
      school_id: cycle.school_id,
      term_label: nextLabel,
      term_start_date: termStart,
      due_date: dueDate,
      amount_due: nextAmount,
      currency: cycleCurrency,
      status: 'due',
      items: itemsPayload,
      rillcod_retain_amount: rillcodRetain,
      school_settlement_amount: schoolSettlement,
    });

    await db.from('billing_cycles').update({ status: 'rolled_over', updated_at: new Date().toISOString() }).eq('id', cycle.id);
  }
}

export async function POST(request: Request) {
  const secret = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!env.BILLING_CRON_SECRET || secret !== env.BILLING_CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createAdminClient();
  const mobileUrl = env.MOBILE_APP_URL || 'C:\\rillcod';
  const webUrl = process.env.NEXT_PUBLIC_APP_URL || '';

  await maybeRollOverPaidCycles(db);

  const { data: cycles, error } = await db
    .from('billing_cycles')
    .select('*')
    .in('status', ['due', 'past_due'])
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let processed = 0;
  for (const raw of (cycles ?? [])) {
    const cycle = raw as BillingCycle;
    const week = getWeekFromTermStart(cycle.term_start_date);
    if (![6, 7, 8].includes(week)) continue;

    const alreadySent = week === 6
      ? cycle.reminder_week6_sent_at
      : week === 7
        ? cycle.reminder_week7_sent_at
        : cycle.reminder_week8_sent_at;
    if (alreadySent) continue;

    const noticeId = await ensureStickyNotice(db, cycle, mobileUrl);

    let emailTarget: string | null = null;
    let whatsappTarget: string | null = null;
    let inAppUsers: string[] = [];
    let schoolName: string | null = null;

    if (cycle.owner_type === 'school' && cycle.owner_school_id) {
      const { data: contact } = await db
        .from('billing_contacts')
        .select('representative_email, representative_whatsapp')
        .eq('school_id', cycle.owner_school_id)
        .maybeSingle();
      const { data: school } = await db
        .from('schools')
        .select('name, email, phone')
        .eq('id', cycle.owner_school_id)
        .maybeSingle();
      const { data: users } = await db
        .from('portal_users')
        .select('id')
        .eq('school_id', cycle.owner_school_id)
        .in('role', ['school', 'teacher', 'admin']);

      emailTarget = contact?.representative_email || school?.email || null;
      whatsappTarget = contact?.representative_whatsapp || school?.phone || null;
      schoolName = school?.name || null;
      inAppUsers = (users ?? []).map((u: any) => u.id);
    } else if (cycle.owner_user_id) {
      const { data: owner } = await db
        .from('portal_users')
        .select('id, email, phone')
        .eq('id', cycle.owner_user_id)
        .maybeSingle();
      emailTarget = owner?.email || null;
      whatsappTarget = owner?.phone || null;
      inAppUsers = owner?.id ? [owner.id] : [];
    }

    const text = `Billing notice: ${cycle.term_label} payment is due. Amount: NGN ${Number(cycle.amount_due || 0).toLocaleString()}. Mobile: ${mobileUrl} ${webUrl ? `Web: ${webUrl}` : ''}`;

    for (const userId of inAppUsers) {
      try {
        await notificationsService.logNotification(
          userId,
          'Billing Notice - Action Required',
          text,
          'billing_reminder',
        );
        await db.from('billing_reminder_logs').insert({
          billing_cycle_id: cycle.id,
          week_number: week,
          channel: 'in_app',
          target: userId,
          status: 'sent',
        });
      } catch (err: any) {
        await db.from('billing_reminder_logs').insert({
          billing_cycle_id: cycle.id,
          week_number: week,
          channel: 'in_app',
          target: userId,
          status: 'failed',
          error_message: err?.message ?? 'in-app failed',
        });
      }
    }

    if (emailTarget) {
      try {
        const billingToken = createPublicBillingToken(cycle.id);
        const payUrl = `${webUrl || 'https://rillcod.com'}/api/payments/public-billing?token=${encodeURIComponent(billingToken)}`;
        const richHtml = buildBillingReminderEmailHtml({
          termLabel: cycle.term_label,
          amountDue: Number(cycle.amount_due || 0),
          dueDate: cycle.due_date,
          webUrl,
          mobileUrl,
          payUrl,
          schoolName,
        });
        await notificationsService.sendExternalEmail({
          to: emailTarget,
          subject: 'Rillcod Billing Notice - Action Required',
          html: richHtml,
          fromName: 'Rillcod Support',
          fromEmail: 'support@rillcod.com',
        });
        await db.from('billing_reminder_logs').insert({
          billing_cycle_id: cycle.id,
          week_number: week,
          channel: 'email',
          target: emailTarget,
          status: 'sent',
        });
      } catch (err: any) {
        await db.from('billing_reminder_logs').insert({
          billing_cycle_id: cycle.id,
          week_number: week,
          channel: 'email',
          target: emailTarget,
          status: 'failed',
          error_message: err?.message ?? 'email failed',
        });
      }
    }

    if (whatsappTarget) {
      try {
        await notificationsService.sendExternalWhatsApp({
          to: whatsappTarget,
          body: text,
        });
        await db.from('billing_reminder_logs').insert({
          billing_cycle_id: cycle.id,
          week_number: week,
          channel: 'whatsapp',
          target: whatsappTarget,
          status: 'sent',
        });
      } catch (err: any) {
        await db.from('billing_reminder_logs').insert({
          billing_cycle_id: cycle.id,
          week_number: week,
          channel: 'whatsapp',
          target: whatsappTarget,
          status: 'failed',
          error_message: err?.message ?? 'whatsapp failed',
        });
      }
    }

    const reminderField =
      week === 6
        ? { reminder_week6_sent_at: new Date().toISOString() }
        : week === 7
          ? { reminder_week7_sent_at: new Date().toISOString() }
          : { reminder_week8_sent_at: new Date().toISOString() };

    await db.from('billing_cycles').update({
      ...reminderField,
      sticky_notice_id: noticeId,
      updated_at: new Date().toISOString(),
    }).eq('id', cycle.id);

    processed += 1;
  }

  return NextResponse.json({ success: true, processed });
}

