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
import { cronInterval } from '@/lib/operations/cron-registry';
import { onboardSummerStudent, sendSpecialProgramActivation } from '@/lib/summer-school/onboard';
import { fanoutCrons, fanoutFailures } from '@/lib/server/cron-fanout';
import { claimDailyGuard, claimHourlyGuard, recordFanoutResult } from '@/lib/server/cron-daily-guard';
import { runClassAcademicReadiness } from '@/lib/academic/prepare-class-readiness';
import {
  retryPaidCredentialDelivery,
  retryUnonboardedPaidStudent,
  type PaidStudentRow,
} from '@/lib/registration/retry-paid-credentials';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Code-base cron jobs that aren't on the external scheduler — triggered once per day from this
// sweep (daily guard below) so they run without a separate cron-job.org entry.
// integrity-sweep already has its own Vercel schedule; auto-generate-content chains from
// academic-readiness so plans are prepared before content generation.
const DAILY_FANOUT = ['assignment-reminders', 'form-followup', 'lead-nurture', 'academic-readiness'];
const DAILY_FANOUT_GUARD_KEY = 'cron_onboarding_sweep_daily_fanout_date';
const FANOUT_RESULT_KEY = 'cron_onboarding_sweep_last_fanout';
// Weekly teaching content needs more than one pass a day — see the hourly fan-out below.
const HOURLY_FANOUT = ['auto-generate-content'];
const HOURLY_FANOUT_GUARD_KEY = 'cron_onboarding_sweep_hourly_fanout_hour';
const HOURLY_FANOUT_RESULT_KEY = 'cron_onboarding_sweep_last_hourly_fanout';
// NOTE: Do NOT fan out `weekly-summary` here. That job sends the monthly parent update
// and must run at most once per month (see vercel.json). Fanning it from this 15-minute
// sweep re-mailed parents every run whenever Redis fell back to in-memory.

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: NextRequest) { return runMonitoredCron('onboarding-sweep', cronInterval('onboarding-sweep'), () => handle(req)); }
export async function POST(req: NextRequest) { return runMonitoredCron('onboarding-sweep', cronInterval('onboarding-sweep'), () => handle(req)); }

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

      // Activation email (both logins + next steps + receipt PDF) and WhatsApp.
      await sendSpecialProgramActivation(onboard, prospect);
      if (onboard.classId) after(() => runClassAcademicReadiness(onboard.classId!));

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
      await sendSpecialProgramActivation(onboard, prospect);
      if (onboard.classId) after(() => runClassAcademicReadiness(onboard.classId!));
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
    .eq('enrollment_type', 'online')
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

  // Fan out the unregistered code-base crons once per day (not every 15-min sweep).
  // after() keeps this invocation alive to dispatch them AFTER the scheduler response.
  after(async () => {
    try {
      const claim = await claimDailyGuard(admin as any, DAILY_FANOUT_GUARD_KEY);
      if (!claim) {
        console.log('[onboarding-sweep] daily fan-out skipped (already ran today)');
        return;
      }
      const fan = await fanoutCrons(req.url, DAILY_FANOUT);
      await recordFanoutResult(admin as any, FANOUT_RESULT_KEY, 'onboarding-sweep', fan);
      console.log('[onboarding-sweep] fan-out:', fan);
      const failed = fanoutFailures(fan);
      if (failed.length) {
        await claim.release(`fan-out failure: ${failed.map(([p, r]) => `${p}=${r}`).join(', ')}`);
      }
    } catch (fanErr) {
      console.error('[onboarding-sweep] daily fan-out failed:', fanErr);
    }
  });

  // Hourly fan-out. Weekly teaching content cannot be produced on a daily job: each run is bounded
  // by a ~50s budget (roughly 4-5 classes), so a once-a-day sweep tops out near 30 classes a week
  // and silently under-serves the rest. Hourly clears 60 classes with room to spare, and reuses
  // this 15-minute host rather than needing another cron-job.org entry.
  after(async () => {
    try {
      const claim = await claimHourlyGuard(admin as any, HOURLY_FANOUT_GUARD_KEY);
      if (!claim) return;
      const fan = await fanoutCrons(req.url, HOURLY_FANOUT);
      await recordFanoutResult(admin as any, HOURLY_FANOUT_RESULT_KEY, 'onboarding-sweep', fan);
      console.log('[onboarding-sweep] hourly fan-out:', fan);
      const failed = fanoutFailures(fan);
      if (failed.length) {
        await claim.release(`hourly fan-out failure: ${failed.map(([p, r]) => `${p}=${r}`).join(', ')}`);
      }
    } catch (fanErr) {
      console.error('[onboarding-sweep] hourly fan-out failed:', fanErr);
    }
  });

  return NextResponse.json({ success: true, ...report });
}
