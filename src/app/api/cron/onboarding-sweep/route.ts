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
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { onboardSummerStudent, sendSummerCredentials } from '@/lib/summer-school/onboard';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = adminClient();
  const report = { scanned: 0, onboarded: 0, failed: 0, errors: [] as string[] };

  // Paid (or deposit-paid) applicants that were never activated. is_active flips
  // to true once onboarding completes, so `false` here = still needs onboarding.
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

  return NextResponse.json({ success: true, ...report });
}
