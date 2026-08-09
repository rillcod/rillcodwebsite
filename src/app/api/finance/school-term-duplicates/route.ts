import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/log';
import { extractSchoolTermFromMetadata, schoolTermLabel } from '@/lib/finance/school-term';
import {
  resolveBillingCycleIdForInvoice,
  syncInvoiceFieldsThroughBillingCycle,
} from '@/lib/finance/billing-cycle-invoice-sync';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;
  const { data, error } = await supabase.from('portal_users').select('id, role, full_name').eq('id', user.id).maybeSingle();
  if (error) return null;
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
  const data: any[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await db
      .from('invoices')
      .select('id, invoice_number, amount, currency, status, school_id, created_at, metadata, schools(name)')
      .eq('stream', 'school')
      .not('status', 'in', '(cancelled,void)')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    data.push(...(page ?? []));
    if ((page?.length ?? 0) < pageSize) break;
  }

  const groups = new Map<string, any[]>();
  for (const inv of data) {
    const term = extractSchoolTermFromMetadata(inv.metadata);
    if (!inv.school_id || !term) continue;
    // Normalized key so "2025" and "2025/2026" collapse to one session.
    const key = `${inv.school_id}|${term.periodLabel}|${term.termNumber}`;
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
  const cancelInvoiceIds: string[] = Array.isArray(body.cancelInvoiceIds)
    ? Array.from(new Set<string>(body.cancelInvoiceIds.map((id: unknown) => String(id)).filter(Boolean)))
    : [];
  const reason = String(body.reason || 'Duplicate school term invoice cleanup').trim();

  if (!keepInvoiceId || cancelInvoiceIds.length === 0) {
    return NextResponse.json({ error: 'keepInvoiceId and cancelInvoiceIds are required' }, { status: 400 });
  }
  if (cancelInvoiceIds.includes(keepInvoiceId)) {
    return NextResponse.json({ error: 'Cannot cancel the invoice marked to keep' }, { status: 400 });
  }
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (![keepInvoiceId, ...cancelInvoiceIds].every((id) => uuidPattern.test(id))) {
    return NextResponse.json({ error: 'Every invoice id must be valid' }, { status: 400 });
  }
  if (!reason || reason.length > 300) {
    return NextResponse.json({ error: 'Reason is required and must be 300 characters or fewer' }, { status: 400 });
  }

  const db = adminClient();
  const { data: keepInvoice, error: keepError } = await db
    .from('invoices')
    .select('id, invoice_number, status, school_id, stream, metadata')
    .eq('id', keepInvoiceId)
    .maybeSingle();
  if (keepError) return NextResponse.json({ error: keepError.message }, { status: 500 });
  const keepTerm = keepInvoice ? extractSchoolTermFromMetadata(keepInvoice.metadata) : null;
  if (!keepInvoice || keepInvoice.stream !== 'school' || !keepInvoice.school_id || !keepTerm) {
    return NextResponse.json({ error: 'The invoice to keep is not a valid school-term invoice' }, { status: 400 });
  }

  const { data: targetInvoices, error: targetsError } = await db
    .from('invoices')
    .select('id, invoice_number, status, billing_cycle_id, stream, school_id, metadata')
    .in('id', cancelInvoiceIds);
  if (targetsError) return NextResponse.json({ error: targetsError.message }, { status: 500 });
  const targetById = new Map((targetInvoices ?? []).map((invoice) => [invoice.id, invoice]));
  const cancelled: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const id of cancelInvoiceIds) {
    const inv = targetById.get(id);
    if (!inv) {
      skipped.push({ id, reason: 'not found' });
      continue;
    }
    const targetTerm = extractSchoolTermFromMetadata(inv.metadata);
    if (
      inv.stream !== 'school'
      || inv.school_id !== keepInvoice.school_id
      || !targetTerm
      || targetTerm.periodLabel !== keepTerm.periodLabel
      || Number(targetTerm.termNumber) !== Number(keepTerm.termNumber)
    ) {
      skipped.push({ id, reason: 'not a duplicate of the selected school term invoice' });
      continue;
    }
    if (inv.status === 'paid') {
      skipped.push({ id, reason: 'paid — withdraw receipt / reconcile instead of cancel' });
      continue;
    }

    let cycleId: string | null;
    try {
      cycleId = await resolveBillingCycleIdForInvoice(db, inv);
    } catch (error) {
      skipped.push({
        id,
        reason: error instanceof Error ? error.message : 'linked billing-cycle lookup failed',
      });
      continue;
    }
    if (cycleId) {
      const sync = await syncInvoiceFieldsThroughBillingCycle(db, cycleId, {
        invoice_status: 'cancelled',
      });
      if (!sync.ok) {
        skipped.push({ id, reason: sync.error });
        continue;
      }
    } else {
      const noteSuffix = ` [cancelled duplicate: ${reason}]`;
      const { data: updated, error } = await db
        .from('invoices')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
          notes: noteSuffix,
        })
        .eq('id', id)
        .not('status', 'in', '(cancelled,void,paid)')
        .select('id')
        .maybeSingle();
      if (error || !updated) {
        skipped.push({ id, reason: error?.message || 'invoice changed before cancellation' });
        continue;
      }
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
    success: skipped.length === 0,
    complete: skipped.length === 0,
    kept: keepInvoiceId,
    cancelled,
    skipped,
    effects: ['duplicate_school_invoices_cancelled'],
  });
}
