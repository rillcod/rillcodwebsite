import { NextRequest, NextResponse } from 'next/server';
import { billingDocsDb, requireBillingDocsCaller } from '@/lib/billing/docs-auth';

/**
 * GET /api/billing/docs/archive
 * Admin: all recent docs (optional ?schoolId=).
 * School: only their school's docs.
 * Optional ?ref=DOC-REF returns a single doc (with html_body).
 *
 * POST /api/billing/docs/archive — admin only, upsert by doc_ref (stores html_body).
 * DELETE /api/billing/docs/archive?ref=… or ?id=… — admin only, permanent delete.
 */
export async function GET(req: NextRequest) {
  const caller = await requireBillingDocsCaller();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const schoolIdParam = searchParams.get('schoolId');
  const docRef = searchParams.get('ref');
  const includeHtml = searchParams.get('includeHtml') === '1' || Boolean(docRef);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10) || 20, 100);
  const db = billingDocsDb();

  const selectCols = includeHtml
    ? '*'
    : 'id, doc_ref, doc_type, school_id, school_name, term_label, amount, currency, invoice_number, student_count, period_label, due_date, created_by, created_at, metadata';

  if (docRef) {
    let one = db.from('billing_document_archive').select('*').eq('doc_ref', docRef).maybeSingle();
    if (caller.role === 'school') {
      if (!caller.school_id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      one = db
        .from('billing_document_archive')
        .select('*')
        .eq('doc_ref', docRef)
        .eq('school_id', caller.school_id)
        .maybeSingle();
    }
    const { data, error } = await one;
    if (error) {
      if (error.code === '42P01' || /does not exist/i.test(error.message)) {
        return NextResponse.json({ error: 'Archive table not migrated yet' }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data });
  }

  let q = db
    .from('billing_document_archive')
    .select(selectCols)
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

  const htmlRaw = typeof body.html === 'string' ? body.html : (typeof body.html_body === 'string' ? body.html_body : null);
  // Strip auto-print scripts so reopening does not immediately print.
  const htmlBody = htmlRaw
    ? htmlRaw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    : null;

  const baseMeta = body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : {};
  const row: Record<string, unknown> = {
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
    metadata: {
      ...baseMeta,
      has_html: Boolean(htmlBody),
    },
    created_by: caller.id,
  };
  if (htmlBody != null) row.html_body = htmlBody;

  const db = billingDocsDb();
  let { data, error } = await db
    .from('billing_document_archive')
    .upsert(row, { onConflict: 'doc_ref' })
    .select('id, doc_ref, doc_type, school_name, term_label, amount, currency, invoice_number, student_count, period_label, due_date, created_at')
    .maybeSingle();

  // Fallback if html_body column not migrated yet — store HTML in metadata.
  if (error && htmlBody && /html_body|column/i.test(error.message)) {
    const fallback = {
      ...row,
      metadata: {
        ...(typeof row.metadata === 'object' && row.metadata ? row.metadata as object : {}),
        html: htmlBody,
      },
    };
    delete (fallback as { html_body?: string }).html_body;
    const retry = await db
      .from('billing_document_archive')
      .upsert(fallback, { onConflict: 'doc_ref' })
      .select('id, doc_ref, doc_type, school_name, term_label, amount, currency, invoice_number, student_count, period_label, due_date, created_at')
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message)) {
      return NextResponse.json({ error: 'Archive table not migrated yet', code: 'NOT_MIGRATED' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest) {
  const caller = await requireBillingDocsCaller({ adminOnly: true });
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const docRef = searchParams.get('ref');
  const id = searchParams.get('id');
  if (!docRef && !id) {
    return NextResponse.json({ error: 'ref or id is required' }, { status: 400 });
  }

  const db = billingDocsDb();
  let q = db.from('billing_document_archive').delete();
  q = id ? q.eq('id', id) : q.eq('doc_ref', docRef!);

  const { error } = await q;
  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message)) {
      return NextResponse.json({ error: 'Archive table not migrated yet', code: 'NOT_MIGRATED' }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
