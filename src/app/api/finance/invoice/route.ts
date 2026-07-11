import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { classifyInvoiceStream } from '@/lib/finance/streams';
import { validateInvoiceInput } from '@/lib/finance/invoice-input';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  return data ?? null;
}


/**
 * POST /api/finance/invoice
 * Creates an invoice and optionally links it to a subscription + billing_cycle.
 * Body: { school_id?, portal_user_id?, subscription_id?, billing_cycle_id?, amount, currency?,
 *          due_date, items?, notes?, description? }
 */
export async function POST(request: Request) {
  const caller = await getCaller();
  if (!caller || !['admin', 'school'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const {
    school_id: rawSchoolId,
    portal_user_id,
    subscription_id,
    billing_cycle_id,
    amount,
    currency = 'NGN',
    due_date,
    items = [],
    notes,
    description,
    status: rawStatus,
  } = body;

  const school_id = caller.role === 'admin' ? rawSchoolId : caller.school_id;

  const validated = validateInvoiceInput({ amount, currency, status: rawStatus ?? 'draft', due_date, items });
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
  if (!validated.dueDate) return NextResponse.json({ error: 'due_date is required' }, { status: 400 });
  if (!school_id && !portal_user_id) {
    return NextResponse.json({ error: 'school_id or portal_user_id required' }, { status: 400 });
  }

  const db = createAdminClient();
  if (portal_user_id) {
    const { data: payer } = await db.from('portal_users').select('id, school_id').eq('id', portal_user_id).maybeSingle();
    if (!payer) return NextResponse.json({ error: 'Payer not found' }, { status: 404 });
    if (caller.role !== 'admin' && payer.school_id !== school_id) return NextResponse.json({ error: 'Forbidden: payer belongs to another school' }, { status: 403 });
  }
  if (billing_cycle_id) {
    const { data: cycle } = await db.from('billing_cycles').select('id, school_id, invoice_id').eq('id', billing_cycle_id).maybeSingle();
    if (!cycle) return NextResponse.json({ error: 'Billing cycle not found' }, { status: 404 });
    if (cycle.invoice_id) return NextResponse.json({ error: 'Billing cycle already has an invoice', invoice_id: cycle.invoice_id }, { status: 409 });
    if (caller.role !== 'admin' && cycle.school_id !== school_id) return NextResponse.json({ error: 'Forbidden: billing cycle belongs to another school' }, { status: 403 });
  }

  // Collision-resistant number; max+1 generation races under concurrent requests.
  const invoice_number = 'INV-' + new Date().getFullYear() + '-' + crypto.randomUUID().slice(0, 8).toUpperCase();

  const invoiceItems = items.length > 0 ? items : [
    { description: description ?? (subscription_id ? 'Subscription Fee' : 'Invoice'), quantity: 1, unit_price: validated.amount, total: validated.amount },
  ];
  const stream = classifyInvoiceStream({
    school_id: school_id ?? null,
    portal_user_id: portal_user_id ?? null,
    billing_cycle_id: billing_cycle_id ?? null,
  });

  const { data: invoice, error: invErr } = await db.from('invoices').insert({
    invoice_number,
    school_id: school_id ?? null,
    portal_user_id: portal_user_id ?? null,
    amount: Number(amount),
    currency: String(currency).toUpperCase(),
    status: rawStatus ?? 'draft',
    due_date,
    items: invoiceItems,
    notes: notes ?? null,
    stream,
    billing_cycle_id: billing_cycle_id ?? null,
  } as any).select().single();

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

  // Link invoice back to billing_cycle if provided
  if (billing_cycle_id && invoice) {
    const { error: linkError } = await db.from('billing_cycles')
      .update({ invoice_id: (invoice as any).id, updated_at: new Date().toISOString() })
      .eq('id', billing_cycle_id)
      .is('invoice_id', null);
    if (linkError) {
      await db.from('invoices').delete().eq('id', (invoice as any).id);
      return NextResponse.json({ error: 'Invoice could not be linked to its billing cycle: ' + linkError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ data: invoice }, { status: 201 });
}

/**
 * GET /api/finance/invoice?school_id=&subscription_id=&status=&cursor_created_at=&cursor_id=
 * Cursor-based pagination (Req 10): 20 rows per page, ordered by created_at DESC, id DESC.
 */
export async function GET(request: Request) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Finance listings are staff-only; non-admin staff are always scoped to their own school.
  if (!['admin', 'school', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (caller.role !== 'admin' && !caller.school_id) {
    return NextResponse.json({ error: 'No school scope on this account' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const school_id = caller.role === 'admin' ? searchParams.get('school_id') : caller.school_id;
  const status = searchParams.get('status');
  const cursorCreatedAt = searchParams.get('cursor_created_at');
  const cursorId = searchParams.get('cursor_id');

  const db = createAdminClient();
  let q = db.from('invoices')
    .select('*, portal_users(full_name, email), schools(name)')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(21); // fetch 21 to detect if there's a next page

  if (school_id) q = q.eq('school_id', school_id) as any;
  if (status) q = q.eq('status', status) as any;

  // Apply cursor (Req 10.3)
  if (cursorCreatedAt && cursorId) {
    q = q.or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`) as any;
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const hasMore = rows.length === 21;
  const page = hasMore ? rows.slice(0, 20) : rows;
  const last = page[page.length - 1] as any;
  const nextCursor = hasMore && last
    ? { created_at: last.created_at, id: last.id }
    : null;

  return NextResponse.json({ data: page, nextCursor });
}
