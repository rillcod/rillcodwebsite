/**
 * GET /api/admin/onboarding-health   (admin only)
 *
 * Live worklist for onboarding/finance gaps so nothing fails silently. Returns
 * counts (and small samples) for:
 *   • awaitingVerification — bank-transfer applicants pending admin approval
 *   • unonboardedPaid      — paid applicants not yet activated (the sweep targets these)
 *   • failedEmails         — credential emails that failed to send
 *   • studentsNoClass      — special-programme students with no class assigned
 *   • parentsZeroChildren  — parent accounts with no linked child
 *   • legacyCollisions     — old single-account students (login == parent email)
 *   • paymentsNoReceipt    — completed payments with no receipt issued
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function countOf(q: any): Promise<number> {
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function loadAll<T>(makeQuery: () => any, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function loadByIdChunks<T>(ids: string[], makeQuery: (ids: string[]) => any): Promise<T[]> {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += 250) {
    const { data, error } = await makeQuery(ids.slice(index, index + 250));
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('role').eq('id', user.id).single();
    if (caller?.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    // ── Cheap exact counts ──
    const claimFailureCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [
      awaitingVerification,
      unonboardedPaid,
      termPaidNotOnboarded,
      failedEmails,
      studentsNoClass,
      consentPendingReview,
      claimDeliveryFailures24h,
      claimCompletionFailures24h,
    ] = await Promise.all([
      // 'pending_verification' is never written — the intake writes 'unpaid' for the same
      // state — so filtering on it alone made this tile read 0 forever. integrity-sweep and
      // the summer-school route already treat the two as one bucket; match them.
      countOf(admin.from('prospective_students').select('id', { count: 'exact', head: true }).in('status', ['unpaid', 'pending_verification']).eq('is_deleted', false)),
      countOf(admin.from('prospective_students').select('id', { count: 'exact', head: true }).in('status', ['paid', 'partially_paid']).eq('is_active', false)),
      countOf(admin.from('students').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('enrollment_type', 'online').is('user_id', null).is('created_by', null).or('registration_payment_at.not.is.null,registration_paystack_reference.not.is.null')),
      countOf(admin.from('registration_results').select('id', { count: 'exact', head: true }).eq('status', 'failed')),
      countOf(admin.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('enrollment_type', 'special').eq('is_active', true).eq('is_deleted', false).is('class_id', null)),
      countOf(admin.from('form_leads').select('id', { count: 'exact', head: true }).eq('match_status', 'pending_review')),
      countOf((admin as any).from('parent_claim_audit').select('id', { count: 'exact', head: true }).eq('action', 'code_delivery_failed').gte('created_at', claimFailureCutoff)),
      countOf((admin as any).from('parent_claim_audit').select('id', { count: 'exact', head: true }).eq('action', 'completion_failed').gte('created_at', claimFailureCutoff)),
    ]);

    // Parents with neither a link nor an email-matched student. Every page is
    // included so the dashboard never presents a capped sample as the truth.
    let parentsZeroChildren = 0;
    {
      const [parents, links, students] = await Promise.all([
        loadAll<{ id: string; email: string | null }>(() => admin.from('portal_users').select('id, email').eq('role', 'parent')),
        loadAll<{ parent_id: string }>(() => admin.from('parent_student_links').select('parent_id')),
        loadAll<{ parent_email: string | null }>(() => admin.from('students').select('parent_email').not('parent_email', 'is', null)),
      ]);
      const linkedSet = new Set(links.map((link) => link.parent_id));
      const emailSet = new Set(students.map((student) => (student.parent_email || '').trim().toLowerCase()));
      parentsZeroChildren = parents.filter((parent) => !linkedSet.has(parent.id) && !emailSet.has((parent.email || '').trim().toLowerCase())).length;
    }

    // Student account whose login equals the parent email.
    let legacyCollisions = 0;
    {
      const rows = await loadAll<{ user_id: string; parent_email: string }>(() => admin
        .from('students')
        .select('user_id, parent_email')
        .not('user_id', 'is', null)
        .not('parent_email', 'is', null));
      const userIds = rows.map((row) => row.user_id);
      if (userIds.length) {
        const accounts = await loadByIdChunks<{ id: string; email: string | null }>(userIds, (chunk) =>
          admin.from('portal_users').select('id, email').in('id', chunk));
        const emailById = new Map(accounts.map((account) => [account.id, (account.email || '').trim().toLowerCase()]));
        legacyCollisions = rows.filter((row) => emailById.get(row.user_id) === row.parent_email.trim().toLowerCase()).length;
      }
    }

    // Completed payments with no receipt row.
    let paymentsNoReceipt = 0;
    {
      const transactions = await loadAll<{ id: string }>(() => admin
        .from('payment_transactions')
        .select('id')
        .in('payment_status', ['completed', 'success'])
        .order('created_at', { ascending: false }));
      const txIds = transactions.map((transaction) => transaction.id);
      if (txIds.length) {
        const receipts = await loadByIdChunks<{ transaction_id: string | null }>(txIds, (chunk) =>
          admin.from('receipts').select('transaction_id').in('transaction_id', chunk));
        const hasReceipt = new Set(receipts.map((receipt) => receipt.transaction_id).filter(Boolean));
        paymentsNoReceipt = txIds.filter((id: string) => !hasReceipt.has(id)).length;
      }
    }

    let duplicatePaymentInvoices = 0;
    {
      const invoiceLinks = await loadAll<{ payment_transaction_id: string | null }>(() => admin
        .from('invoices')
        .select('payment_transaction_id')
        .not('payment_transaction_id', 'is', null));
      const counts = new Map<string, number>();
      for (const row of invoiceLinks) {
        if (!row.payment_transaction_id) continue;
        counts.set(row.payment_transaction_id, (counts.get(row.payment_transaction_id) ?? 0) + 1);
      }
      duplicatePaymentInvoices = [...counts.values()].filter((count) => count > 1).length;
    }

    const health = {
      awaitingVerification,
      unonboardedPaid,
      termPaidNotOnboarded,
      failedEmails,
      studentsNoClass,
      consentPendingReview,
      claimDeliveryFailures24h,
      claimCompletionFailures24h,
      parentsZeroChildren,
      legacyCollisions,
      paymentsNoReceipt,
      duplicatePaymentInvoices,
    };
    const totalIssues = Object.values(health).reduce((a, b) => a + b, 0);

    return NextResponse.json({ success: true, health, totalIssues, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[onboarding-health]', err);
    return NextResponse.json({ error: 'Could not load onboarding health.' }, { status: 500 });
  }
}
