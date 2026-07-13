import { NextResponse } from 'next/server';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationsService } from '@/services/notifications.service';
import { buildSubscriptionEmail } from '@/lib/email/rillcod-transactional-email';
import { env } from '@/config/env';
import { createPublicBillingToken } from '@/lib/payments/public-billing-link';
import { aggregateOpenSchoolInvoices, computeSettlementSplit } from '@/lib/billing/school-invoice-rollup';
import type { Json } from '@/types/supabase';
import { SMTP_FROM_EMAIL } from '@/config/brand';

export const dynamic = 'force-dynamic';

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

  const { data: existing, error: existingError } = await existingQuery.limit(1).maybeSingle();
  if (existingError) throw new Error('Could not inspect billing notice: ' + existingError.message);

  if (existing?.id) return existing.id;

  const { data, error: noticeError } = await db
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
  if (noticeError || !data?.id) throw new Error('Could not create billing notice: ' + (noticeError?.message || 'no row returned'));
  return data.id;
}

async function maybeRollOverPaidCycles(db: ReturnType<typeof createAdminClient>) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: paidCycles, error: paidCyclesError } = await db
    .from('billing_cycles')
    .select('id, subscription_id, owner_type, owner_school_id, owner_user_id, school_id, due_date, term_label, amount_due, currency, status')
    .eq('status', 'paid')
    .lt('due_date', todayIso)
    .limit(100);
  if (paidCyclesError) throw new Error('Could not load paid billing cycles: ' + paidCyclesError.message);

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

    const { createBillingCycleWithInvoice } = await import('@/lib/finance/create-invoice');
    const created = await createBillingCycleWithInvoice({
      subscription_id: cycle.subscription_id,
      owner_type: cycle.owner_type as 'school' | 'individual',
      owner_school_id: cycle.owner_school_id,
      owner_user_id: cycle.owner_user_id,
      term_label: nextLabel,
      term_start_date: termStart,
      due_date: dueDate,
      amount_due: nextAmount,
      currency: cycleCurrency,
      status: 'due',
      items: itemsPayload,
    });
    if (!created.ok) {
      console.error('[billing-reminders] rollover failed', cycle.id, created.error.message);
      continue;
    }

    const newCycleId = String(created.data.cycle.id);
    const { error: newCycleUpdateError } = await db.from('billing_cycles').update({
      items: itemsPayload,
      rillcod_retain_amount: rillcodRetain,
      school_settlement_amount: schoolSettlement,
      amount_due: nextAmount,
      currency: cycleCurrency,
      updated_at: new Date().toISOString(),
    }).eq('id', newCycleId);
    if (newCycleUpdateError) throw new Error(`Could not finalize rollover cycle: ${newCycleUpdateError.message}`);

    const { error: oldCycleUpdateError } = await db.from('billing_cycles')
      .update({ status: 'rolled_over', updated_at: new Date().toISOString() })
      .eq('id', cycle.id)
      .eq('status', 'paid');
    if (oldCycleUpdateError) throw new Error(`Could not close rolled-over cycle: ${oldCycleUpdateError.message}`);
  }
}

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}

async function handleRequest(request: Request) {
  if (!isValidCronSecret(extractCronSecret(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createAdminClient();
  const mobileUrl = env.MOBILE_APP_URL || 'rillcod://';
  const webUrl = env.NEXT_PUBLIC_APP_URL;

  await maybeRollOverPaidCycles(db);

  try {
    const { markOverdueInvoices } = await import('@/lib/finance/overdue');
    await markOverdueInvoices();
  } catch (e: any) {
    console.error('[billing-reminders] overdue mark failed:', e?.message);
  }

  // Promote overdue cycles: 'due' → 'past_due' once the due date has passed.
  // Nothing else flips this status automatically, so dashboards showed
  // long-overdue cycles as merely "due".
  const { error: pastDueError } = await db
    .from('billing_cycles')
    .update({ status: 'past_due', updated_at: new Date().toISOString() })
    .eq('status', 'due')
    .lt('due_date', new Date().toISOString().slice(0, 10));
  if (pastDueError) return NextResponse.json({ error: `Could not promote overdue billing cycles: ${pastDueError.message}` }, { status: 500 });

  const { data: cycles, error } = await db
    .from('billing_cycles')
    .select('*')
    .in('status', ['due', 'past_due'])
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Stop ~10s before the 60s serverless cap. Per-week sent markers
  // (reminder_weekN_sent_at) already make this resumable, so the next scheduled
  // run continues with the cycles this run didn't reach — never killed mid-batch.
  const DEADLINE = Date.now() + 50_000;

  let processed = 0;
  for (const raw of (cycles ?? [])) {
    if (Date.now() > DEADLINE) break;
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
    let anyDelivered = false;

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

    const cycleCurrency = String((raw as any).currency || 'NGN').toUpperCase();
    const text = `Billing notice: ${cycle.term_label} payment is due. Amount: ${cycleCurrency} ${Number(cycle.amount_due || 0).toLocaleString()}. Mobile: ${mobileUrl} ${webUrl ? `Web: ${webUrl}` : ''}`;
    const stream = cycle.owner_type === 'school' ? 'school_billing' : 'individual_billing';
    const { deliverReminder } = await import('@/lib/finance/reminders/orchestrator');
    const stage = `week_${week}`;

    for (const userId of inAppUsers) {
      try {
        const result = await deliverReminder({
          stream,
          action: 'billing_cycle_reminder',
          entityType: 'billing_cycle',
          entityId: cycle.id,
          stage: `${stage}_in_app_${userId}`,
          channel: 'in_app',
          deliver: async () => {
            await notificationsService.logNotification(
              userId,
              'Billing Notice - Action Required',
              text,
              'billing_reminder',
            );
          },
        });
        await db.from('billing_reminder_logs').insert({
          billing_cycle_id: cycle.id,
          week_number: week,
          channel: 'in_app',
          target: userId,
          status: result.status === 'success' ? 'sent' : 'failed',
          error_message: result.error ?? null,
        });
        if (result.status === 'success') anyDelivered = true;
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
        const result = await deliverReminder({
          stream,
          action: 'billing_cycle_reminder',
          entityType: 'billing_cycle',
          entityId: cycle.id,
          stage,
          channel: 'email',
          deliver: async () => {
            const billingToken = createPublicBillingToken(cycle.id);
            const payUrl = `${webUrl || 'https://rillcod.com'}/api/payments/public-billing?token=${encodeURIComponent(billingToken)}`;
            const isOverdue = cycle.due_date ? new Date(cycle.due_date) < new Date() : false;
            const richHtml = buildSubscriptionEmail({
              recipientName: schoolName || 'Client',
              plan: cycle.term_label,
              status: isOverdue ? 'suspended' : 'expiring',
              expiryDate: cycle.due_date || undefined,
              amount: Number(cycle.amount_due || 0),
              currency: cycleCurrency,
              schoolName: schoolName || undefined,
              portalUrl: payUrl,
            });
            await notificationsService.sendExternalEmail({
              to: emailTarget!,
              subject: isOverdue
                ? `Urgent: Billing Overdue — Action Required (Rillcod Technologies)`
                : `Billing Reminder — Payment Due Soon (Rillcod Technologies)`,
              html: richHtml,
              fromName: 'Rillcod Technologies Finance',
              fromEmail: SMTP_FROM_EMAIL,
            });
          },
        });
        await db.from('billing_reminder_logs').insert({
          billing_cycle_id: cycle.id,
          week_number: week,
          channel: 'email',
          target: emailTarget,
          status: result.status === 'success' ? 'sent' : 'failed',
          error_message: result.error ?? null,
        });
        if (result.status === 'success') anyDelivered = true;
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
        const result = await deliverReminder({
          stream,
          action: 'billing_cycle_reminder',
          entityType: 'billing_cycle',
          entityId: cycle.id,
          stage,
          channel: 'whatsapp',
          deliver: async () => {
            await notificationsService.sendExternalWhatsApp({
              to: whatsappTarget!,
              body: text,
            });
          },
        });
        await db.from('billing_reminder_logs').insert({
          billing_cycle_id: cycle.id,
          week_number: week,
          channel: 'whatsapp',
          target: whatsappTarget,
          status: result.status === 'success' ? 'sent' : 'failed',
          error_message: result.error ?? null,
        });
        if (result.status === 'success') anyDelivered = true;
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

    // Only stamp the week marker when at least one channel delivered —
    // otherwise the next run retries instead of silently giving up forever.
    const reminderField = !anyDelivered
      ? {}
      : week === 6
        ? { reminder_week6_sent_at: new Date().toISOString() }
        : week === 7
          ? { reminder_week7_sent_at: new Date().toISOString() }
          : { reminder_week8_sent_at: new Date().toISOString() };

    const { error: markerError } = await db.from('billing_cycles').update({
      ...reminderField,
      sticky_notice_id: noticeId,
      updated_at: new Date().toISOString(),
    }).eq('id', cycle.id);
    if (markerError) return NextResponse.json({ error: 'Reminder delivered but cycle marker failed: ' + markerError.message, cycle_id: cycle.id }, { status: 500 });

    if (anyDelivered) processed += 1;
  }

  return NextResponse.json({ success: true, processed });
}

