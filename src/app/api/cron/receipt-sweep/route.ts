/**
 * GET|POST /api/cron/receipt-sweep
 *
 * Dead-letter recovery for receipts. If processSuccessfulPayment failed AFTER
 * marking a transaction completed but BEFORE generating the receipt (the
 * idempotency guard then blocks re-processing), the receipt/email would be lost.
 *
 * This sweep finds completed payments with no receipt_url and re-runs the
 * canonical receipt generator (idempotent — reuses the receipts row if present).
 * Safe to run frequently.
 *
 * Auth: cron secret (same scheme as the other cron routes).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { cronInterval } from '@/lib/operations/cron-registry';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// Really runs every 30 minutes (verified against cron_run_history: 341 runs in 7 days, max gap
// 30 minutes), not the daily schedule the old host config declared.
export async function GET(req: NextRequest) { return runMonitoredCron('receipt-sweep', cronInterval('receipt-sweep'), () => handle(req)); }
export async function POST(req: NextRequest) { return runMonitoredCron('receipt-sweep', cronInterval('receipt-sweep'), () => handle(req)); }

async function handle(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = adminClient();
  const report = { scanned: 0, regenerated: 0, failed: 0, results: [] as Array<{ transaction_id: string; ok: boolean; receipt_url?: string; error?: string }> };

  // Completed payments missing a receipt URL (last 30 days, bounded).
  // NOTE: the receipt generator only issues for status === 'completed', so we
  // target exactly that (querying 'success' here would fail every run).
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: txns, error } = await admin
    .from('payment_transactions')
    .select('id')
    .in('payment_status', ['completed', 'success', 'paid'])
    .is('receipt_url', null)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { issueReceiptForTransaction } = await import('@/lib/finance/issue');

  for (const t of (txns ?? []) as Array<{ id: string }>) {
    report.scanned++;
    try {
      // Idempotent — reuses an existing receipts row, sets receipt_url.
      const receipt = await issueReceiptForTransaction(t.id);
      report.regenerated++;
      report.results.push({ transaction_id: t.id, ok: true, receipt_url: receipt.url });
    } catch (err: any) {
      report.failed++;
      report.results.push({ transaction_id: t.id, ok: false, error: err?.message ?? 'unknown' });
      console.error('[receipt-sweep] regen failed for', t.id, err);
    }
  }

  return NextResponse.json({ success: report.failed === 0, ...report, effects: ['missing_receipts_scanned', 'canonical_receipts_recovered'] });
}
