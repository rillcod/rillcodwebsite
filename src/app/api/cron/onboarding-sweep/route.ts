/**
 * GET|POST /api/cron/onboarding-sweep
 *
 * Self-healing onboarding safety net. Runs on a schedule (cron) and catches any
 * summer-school applicant that PAID but was never fully onboarded — e.g. a missed
 * Paystack webhook or a parent who closed the tab before the redirect fallback ran.
 *
 * For each paid/partially-paid prospect not yet activated, it runs the shared
 * onboarding (idempotent: parent + student accounts, school, class+tutor, parent
 * link, enrolment, paid invoice), syncs the CRM contact book, and (re)sends the
 * welcome email with credentials + receipt PDF. Nothing slips through.
 *
 * Auth: cron secret (same scheme as the other cron routes).
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { onboardSummerStudent, sendSummerCredentials } from '@/lib/summer-school/onboard';
import { fanoutCrons } from '@/lib/server/cron-fanout';
import {
  retryPaidCredentialDelivery,
  retryUnonboardedPaidStudent,
  type PaidStudentRow,
} from '@/lib/registration/retry-paid-credentials';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Code-base cron jobs that aren't on the external scheduler — triggered from this daily sweep so
// they run without a separate cron-job.org entry. Each runs as its own invocation (own timeout).
const DAILY_FANOUT = ['assignment-reminders', 'integrity-sweep', 'form-followup', 'lead-nurture', 'weekly-summary', 'auto-generate-content'];

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: NextRequest) { return runMonitoredCron('onboarding-sweep', 15, () => handle(req)); }
export async function POST(req: NextRequest) { return runMonitoredCron('onboarding-sweep', 15, () => handle(req)); }

async function handle(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = adminClient();
  const report = { scanned: 0, onboarded: 0, repaired: 0, paidOnboarded: 0, credentialsRetried: 0, failed: 0, errors: [] as string[] };

  // Pass 1 — paid (or deposit-paid) applicants that were never activated. is_active
  // flips to true once onboarding completes, so `false` here = still needs onboarding.
  const { data: pending, error } = await admin
    .from('prospective_students')
    .select('*')
    .in('status', ['paid', 'partially_paid'])
    .eq('is_active', false)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const prospect of (pending ?? []) as any[]) {
    report.scanned++;
    try {
      const onboard = await onboardSummerStudent(admin as any, prospect);

      await admin.from('prospective_students')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', prospect.id);

      // CRM contact book (parity with the live onboarding paths).
      try {
        const { harnessProspectToContactBook } = await import('@/lib/crm/sync-prospect');
        await harnessProspectToContactBook(prospect.id, onboard.student.id);
      } catch (crmErr) {
        console.error('[onboarding-sweep] CRM sync failed:', crmErr);
      }

      // Welcome email (both logins + next steps + receipt PDF) and WhatsApp.
      await sendSummerCredentials(onboard, prospect);

      report.onboarded++;
    } catch (err: any) {
      report.failed++;
      report.errors.push(`${prospect.id}: ${err?.message ?? 'unknown'}`);
      console.error('[onboarding-sweep] onboarding failed for', prospect.id, err);
    }
  }

  // Pass 2 — DRIFT REPAIR: applicants marked active (paid) but missing the student
  // account — the ghosts left by the old webhook bug that set is_active=true even when
  // onboarding threw. Pass 1 never sees them (is_active=true), so heal them here.
  const { data: activeOnes } = await admin
    .from('prospective_students')
    .select('*')
    .in('status', ['paid', 'partially_paid', 'active'])
    .eq('is_active', true)
    .neq('is_deleted', true)
    .order('created_at', { ascending: true })
    .limit(200);

  for (const prospect of (activeOnes ?? []) as any[]) {
    const email = (prospect.parent_email || prospect.email || '').trim().toLowerCase();
    const name = (prospect.full_name || '').trim();
    if (!email || !name) continue;

    // Already has a real student account? (students row carrying a portal user_id.)
    // Match the name whitespace/case-insensitively in JS — a stored trailing space made
    // an .ilike() miss, so this drift-repair kept re-onboarding the SAME child every run
    // (15-min cron → duplicate accounts). Compare normalised instead.
    const { data: acctRows } = await admin
      .from('students')
      .select('full_name, user_id')
      .ilike('parent_email', email)
      .not('user_id', 'is', null);
    const wanted = name.replace(/\s+/g, ' ').toLowerCase();
    if ((acctRows ?? []).some((r: { full_name: string | null }) => (r.full_name || '').trim().replace(/\s+/g, ' ').toLowerCase() === wanted)) continue;

    report.scanned++;
    try {
      const onboard = await onboardSummerStudent(admin as any, prospect); // idempotent — creates the missing student, links existing parent
      try {
        const { harnessProspectToContactBook } = await import('@/lib/crm/sync-prospect');
        await harnessProspectToContactBook(prospect.id, onboard.student.id);
      } catch (crmErr) {
        console.error('[onboarding-sweep] drift CRM sync failed:', crmErr);
      }
      // Only message when we actually created the student account just now.
      if (onboard.student.created) await sendSummerCredentials(onboard, prospect);
      report.repaired++;
    } catch (err: any) {
      report.failed++;
      report.errors.push(`drift ${prospect.id}: ${err?.message ?? 'unknown'}`);
      console.error('[onboarding-sweep] drift repair failed for', prospect.id, err);
    }
  }

  // Pass 3 — paid term registrations: onboard or re-send lost credentials (same sweep, no extra cron).
  const cooldown = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: pendingPaid } = await admin
    .from('students')
    .select('id, full_name, name, student_email, parent_email, parent_name, parent_phone, user_id, status, school_id, school_name, enrollment_type, current_class, section, registration_payment_at, registration_paystack_reference, approved_at, created_by')
    .eq('status', 'pending')
    .is('user_id', null)
    .not('registration_payment_at', 'is', null)
    .is('created_by', null)
    .neq('enrollment_type', 'special')
    .order('registration_payment_at', { ascending: true })
    .limit(30);

  for (const row of (pendingPaid ?? []) as PaidStudentRow[]) {
    report.scanned++;
    const result = await retryUnonboardedPaidStudent(admin as any, row.id);
    if (result === 'onboarded') report.paidOnboarded++;
    else if (result === 'failed') {
      report.failed++;
      report.errors.push(`paid-onboard ${row.id}`);
    }
  }

  const { data: approvedPaid } = await admin
    .from('students')
    .select('id, full_name, name, student_email, parent_email, parent_name, parent_phone, user_id, status, school_id, school_name, enrollment_type, current_class, section, registration_payment_at, registration_paystack_reference, approved_at, created_by')
    .eq('status', 'approved')
    .not('user_id', 'is', null)
    .or('registration_payment_at.not.is.null,registration_paystack_reference.not.is.null')
    .is('created_by', null)
    .neq('enrollment_type', 'special')
    .lt('approved_at', cooldown)
    .order('approved_at', { ascending: true })
    .limit(50);

  for (const row of (approvedPaid ?? []) as PaidStudentRow[]) {
    const loginEmail = (row.student_email || '').trim().toLowerCase();
    let vaultStatus: string | null = null;
    if (loginEmail) {
      const { data: vault } = await admin
        .from('registration_results')
        .select('status')
        .eq('email', loginEmail)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      vaultStatus = vault?.status ?? null;
    }
    if (vaultStatus === 'sent') continue;
    report.scanned++;
    const result = await retryPaidCredentialDelivery(admin as any, row);
    if (result === 'sent') report.credentialsRetried++;
    else if (result === 'failed') {
      report.failed++;
      report.errors.push(`paid-cred ${row.id}`);
    }
  }

  // Fan out the unregistered code-base crons in the background so they run daily too, without a
  // separate scheduler entry. after() keeps this invocation alive to dispatch them AFTER the
  // scheduler already got its fast response — so the host never blocks or times out.
  after(async () => {
    const fan = await fanoutCrons(req.url, DAILY_FANOUT);
    console.log('[onboarding-sweep] fan-out:', fan);
  });

  return NextResponse.json({ success: true, ...report });
}
