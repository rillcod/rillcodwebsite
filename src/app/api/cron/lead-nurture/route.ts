/**
 * GET|POST /api/cron/lead-nurture
 *
 * Runs the professional lead-nurture email conversation for consent-form leads
 * that haven't converted yet. Each run advances eligible leads by at most one
 * step (see lib/crm/lead-nurture). Idempotent + self-pacing — safe to run daily.
 *
 * Auth: cron secret (same scheme as the other cron routes).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { processLeadNurture } from '@/lib/crm/lead-nurture';

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
  const report = { scanned: 0, sent: 0, byStep: {} as Record<string, number> };

  // Active, unconverted leads from the last 14 days (the conversation window).
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: leads } = await admin
    .from('form_leads')
    .select('id, email, response_data, submitted_at, matched_parent_id, status')
    .is('matched_parent_id', null)
    .gte('submitted_at', since)
    .order('submitted_at', { ascending: true })
    .limit(200);

  for (const lead of (leads ?? []) as any[]) {
    report.scanned++;
    try {
      const step = await processLeadNurture(admin as any, lead);
      if (step > 0) {
        report.sent++;
        report.byStep[String(step)] = (report.byStep[String(step)] ?? 0) + 1;
      }
    } catch (err) {
      console.error('[cron/lead-nurture] failed for', lead.id, err);
    }
  }

  return NextResponse.json({ success: true, ...report });
}
