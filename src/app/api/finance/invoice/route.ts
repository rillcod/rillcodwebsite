import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  return data ?? null;
}

function nextInvoiceNumber(existing: string[]): string {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const nums = existing
    .filter(n => n?.startsWith(prefix))
    .map(n => parseInt(n.replace(prefix, ''), 10))
    .filter(n => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

/**
 * POST /api/finance/invoice
 * Creates an invoice and optionally links it to a subscription + billing_cycle.
 * Body: { school_id?, portal_user_id?, subscription_id?, billing_cycle_id?, amount, currency?,
 *          due_date, items?, notes?, description? }
 */
export async function POST(request: Request) {
  const caller = await getCaller();
  if (!caller || !['admin', 'school', 'teacher'].includes(caller.role)) {
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

  if (!amount || !due_date) {
    return NextResponse.json({ error: 'amount and due_date are required' }, { status: 400 });
  }
  if (!school_id && !portal_user_id) {
    return NextResponse.json({ error: 'school_id or portal_user_id required' }, { status: 400 });
  }

  const db = createAdminClient();

  // Build a unique invoice number
  const { data: existing } = await db.from('invoices').select('invoice_number').order('created_at', { ascending: false }).limit(50);
  const invoice_number = nextInvoiceNumber((existing ?? []).map((r: any) => r.invoice_number));

  const invoiceItems = items.length > 0 ? items : [
    { description: description ?? (subscription_id ? 'Subscription Fee' : 'Invoice'), quantity: 1, unit_price: Number(amount), total: Number(amount) },
  ];

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
  } as any).select().single();

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

  // Link invoice back to billing_cycle if provided
  if (billing_cycle_id && invoice) {
    await db.from('billing_cycles').update({ invoice_id: (invoice as any).id }).eq('id', billing_cycle_id);
  }

  return NextResponse.json({ data: invoice }, { status: 201 });
}

/**
 * GET /api/finance/invoice?school_id=&subscription_id=&status=
 */
export async function GET(request: Request) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const school_id = caller.role === 'admin' ? searchParams.get('school_id') : caller.school_id;
  const subscription_id = searchParams.get('subscription_id');
  const status = searchParams.get('status');

  const db = createAdminClient();
  let q = db.from('invoices')
    .select('*, portal_users(full_name, email), schools(name)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (school_id) q = q.eq('school_id', school_id) as any;
  if (status) q = q.eq('status', status) as any;

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
