import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/log';
import { schoolTermLabel } from '@/lib/finance/school-term';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('id, role, full_name').eq('id', user.id).maybeSingle();
  if (!data || data.role !== 'admin') return null;
  return data as { id: string; role: string; full_name: string | null };
}

/**
 * GET /api/finance/school-term-duplicates
 * Lists active school invoices that share the same school + academic_year + term.
 *
 * POST { keepInvoiceId, cancelInvoiceIds[], reason }
 * Cancels the listed duplicate invoices (unpaid only). Paid duplicates must be
 * handled via receipt withdraw + reconciliation.
 */
export async function GET() {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const db = adminClient();
  const { data, error } = await db
    .from('invoices')
    .select('id, invoice_number, amount, currency, status, school_id, created_at, metadata, schools(name)')
    .eq('stream', 'school')
    .not('status', 'in', '(cancelled,void)')
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const groups = new Map<string, any[]>();
  for (const inv of data ?? []) {
    const meta = (inv.metadata ?? {}) as Record<string, unknown>;
    const ay = meta.academic_year != null ? String(meta.academic_year) : '';
    const tn = meta.term_number != null ? String(meta.term_number) : '';
    if (!inv.school_id || !ay || !tn) continue;
    const key = `${inv.school_id}|${ay}|${tn}`;
    const list = groups.get(key) ?? [];
    list.push(inv);
    groups.set(key, list);
  }

  const duplicates = [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => {
      const [schoolId, academicYear, termNumber] = key.split('|');
      return {
        school_id: schoolId,
        academic_year: academicYear,
        term_number: termNumber,
        term_label: schoolTermLabel(academicYear, termNumber),
        school_name: rows[0]?.schools?.name ?? 'School',
        invoices: rows.map((r) => ({
          id: r.id,
          invoice_number: r.invoice_number,
          amount: r.amount,
          currency: r.currency,
          status: r.status,
          created_at: r.created_at,
        })),
        suggested_keep_id: rows[0].id,
        suggested_cancel_ids: rows.slice(1).map((r) => r.id),
      };
    });

  return NextResponse.json({ data: duplicates });
}

export async function POST(req: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const keepInvoiceId = String(body.keepInvoiceId || '').trim();
  const cancelInvoiceIds = Array.isArray(body.cancelInvoiceIds)
    ? body.cancelInvoiceIds.map((id: unknown) => String(id)).filter(Boolean)
    : [];
  const reason = String(body.reason || 'Duplicate school term invoice cleanup').trim();

  if (!keepInvoiceId || cancelInvoiceIds.length === 0) {
    return NextResponse.json({ error: 'keepInvoiceId and cancelInvoiceIds are required' }, { status: 400 });
  }
  if (cancelInvoiceIds.includes(keepInvoiceId)) {
    return NextResponse.json({ error: 'Cannot cancel the invoice marked to keep' }, { status: 400 });
  }

  const db = adminClient();
  const cancelled: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const id of cancelInvoiceIds) {
    const { data: inv } = await db
      .from('invoices')
      .select('id, invoice_number, status, billing_cycle_id, stream')
      .eq('id', id)
      .maybeSingle();
    if (!inv) {
      skipped.push({ id, reason: 'not found' });
      continue;
    }
    if (inv.status === 'paid') {
      skipped.push({ id, reason: 'paid — withdraw receipt / reconcile instead of cancel' });
      continue;
    }
    if (inv.billing_cycle_id) {
      skipped.push({ id, reason: 'linked to billing cycle — cancel from Billing workspace' });
      continue;
    }
    const noteSuffix = ` [cancelled duplicate: ${reason}]`;
    const { error } = await db
      .from('invoices')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
        notes: noteSuffix,
      })
      .eq('id', id)
      .not('status', 'in', '(cancelled,void,paid)');
    if (error) {
      skipped.push({ id, reason: error.message });
      continue;
    }
    cancelled.push(inv.invoice_number || id);
    await logAudit(db as any, {
      action: 'cancel_duplicate_school_invoice',
      actorId: caller.id,
      resourceType: 'invoice',
      resourceId: id,
      oldValue: inv.invoice_number,
      newValue: reason,
    });
  }

  return NextResponse.json({
    success: true,
    kept: keepInvoiceId,
    cancelled,
    skipped,
    effects: ['duplicate_school_invoices_cancelled'],
  });
}
