import { NextRequest, NextResponse } from 'next/server';
import { billingDocsDb, requireBillingDocsCaller } from '@/lib/billing/docs-auth';

/**
 * GET /api/billing/docs/archive
 * Admin: all recent docs (optional ?schoolId=).
 * School: only their school's docs.
 *
 * POST /api/billing/docs/archive — admin only, upsert by doc_ref.
 */
export async function GET(req: NextRequest) {
  const caller = await requireBillingDocsCaller();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const schoolIdParam = searchParams.get('schoolId');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 100);
  const db = billingDocsDb();

  let q = db
    .from('billing_document_archive')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (caller.role === 'school') {
    if (!caller.school_id) return NextResponse.json({ data: [] });
    q = q.eq('school_id', caller.school_id);
  } else if (schoolIdParam) {
    q = q.eq('school_id', schoolIdParam);
  }

  const { data, error } = await q;
  if (error) {
    // Table may not be migrated yet — fail soft for UI.
    if (error.code === '42P01' || /does not exist/i.test(error.message)) {
      return NextResponse.json({ data: [], warning: 'Archive table not migrated yet' });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const caller = await requireBillingDocsCaller({ adminOnly: true });
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const docRef = String(body.doc_ref || body.ref || '').trim();
  const docType = String(body.doc_type || body.type || '').trim();
  if (!docRef || !docType) {
    return NextResponse.json({ error: 'doc_ref and doc_type are required' }, { status: 400 });
  }
  if (!['payment_register', 'attendance_roster', 'billing_statement'].includes(docType)) {
    return NextResponse.json({ error: 'Invalid doc_type' }, { status: 400 });
  }

  const row = {
    doc_ref: docRef,
    doc_type: docType,
    school_id: body.school_id || null,
    school_name: body.school_name || body.school || null,
    term_label: body.term_label || body.term || null,
    amount: body.amount != null ? Number(body.amount) : null,
    currency: body.currency || 'NGN',
    invoice_number: body.invoice_number || body.invoiceNumber || null,
    student_count: body.student_count != null ? Number(body.student_count) : null,
    period_label: body.period_label || body.period || null,
    due_date: body.due_date || body.dueDate || null,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    created_by: caller.id,
  };

  const db = billingDocsDb();
  const { data, error } = await db
    .from('billing_document_archive')
    .upsert(row, { onConflict: 'doc_ref' })
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message)) {
      return NextResponse.json({ error: 'Archive table not migrated yet', code: 'NOT_MIGRATED' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}
