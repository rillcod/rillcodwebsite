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
  const { count } = await q;
  return count ?? 0;
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
    const [awaitingVerification, unonboardedPaid, failedEmails, studentsNoClass] = await Promise.all([
      // 'pending_verification' is never written — the intake writes 'unpaid' for the same
      // state — so filtering on it alone made this tile read 0 forever. integrity-sweep and
      // the summer-school route already treat the two as one bucket; match them.
      countOf(admin.from('prospective_students').select('id', { count: 'exact', head: true }).in('status', ['unpaid', 'pending_verification']).eq('is_deleted', false)),
      countOf(admin.from('prospective_students').select('id', { count: 'exact', head: true }).in('status', ['paid', 'partially_paid']).eq('is_active', false)),
      countOf(admin.from('registration_results').select('id', { count: 'exact', head: true }).eq('status', 'failed')),
      countOf(admin.from('portal_users').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('enrollment_type', 'special').eq('is_active', true).eq('is_deleted', false).is('class_id', null)),
    ]);

    // ── parentsZeroChildren — parents with neither a link nor an email-matched student (bounded) ──
    let parentsZeroChildren = 0;
    {
      const { data: parents } = await admin.from('portal_users').select('id, email').eq('role', 'parent').limit(1000);
      const { data: links } = await admin.from('parent_student_links').select('parent_id').limit(5000);
      const { data: studs } = await admin.from('students').select('parent_email').not('parent_email', 'is', null).limit(5000);
      const linkedSet = new Set((links ?? []).map((l: any) => l.parent_id));
      const emailSet = new Set((studs ?? []).map((s: any) => (s.parent_email || '').trim().toLowerCase()));
      parentsZeroChildren = (parents ?? []).filter((p: any) => !linkedSet.has(p.id) && !emailSet.has((p.email || '').trim().toLowerCase())).length;
    }

    // ── legacyCollisions — student account whose login == parent email (bounded) ──
    let legacyCollisions = 0;
    {
      const { data: rows } = await admin
        .from('students')
        .select('user_id, parent_email')
        .not('user_id', 'is', null)
        .not('parent_email', 'is', null)
        .limit(1000);
      const userIds = (rows ?? []).map((r: any) => r.user_id);
      if (userIds.length) {
        const { data: accts } = await admin.from('portal_users').select('id, email').in('id', userIds);
        const emailById = new Map((accts ?? []).map((a: any) => [a.id, (a.email || '').trim().toLowerCase()]));
        legacyCollisions = (rows ?? []).filter((r: any) => emailById.get(r.user_id) === (r.parent_email || '').trim().toLowerCase()).length;
      }
    }

    // ── paymentsNoReceipt — completed payments with no receipts row (bounded) ──
    let paymentsNoReceipt = 0;
    {
      const { data: txs } = await admin
        .from('payment_transactions')
        .select('id')
        .in('payment_status', ['completed', 'success'])
        .order('created_at', { ascending: false })
        .limit(500);
      const txIds = (txs ?? []).map((t: any) => t.id);
      if (txIds.length) {
        const { data: receipts } = await admin.from('receipts').select('transaction_id').in('transaction_id', txIds);
        const hasReceipt = new Set((receipts ?? []).map((r: any) => r.transaction_id));
        paymentsNoReceipt = txIds.filter((id: string) => !hasReceipt.has(id)).length;
      }
    }

    const health = {
      awaitingVerification,
      unonboardedPaid,
      failedEmails,
      studentsNoClass,
      parentsZeroChildren,
      legacyCollisions,
      paymentsNoReceipt,
    };
    const totalIssues = Object.values(health).reduce((a, b) => a + b, 0);

    return NextResponse.json({ success: true, health, totalIssues, generatedAt: new Date().toISOString() });
  } catch (err: any) {
    console.error('[onboarding-health]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
