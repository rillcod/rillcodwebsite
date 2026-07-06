import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getParentLinkScope } from '@/lib/parents/links';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const db = createAdminClient();
  const { data } = await db.from('portal_users').select('id, role, school_id, email').eq('id', user.id).single();
  return data ? { ...user, role: data.role, school_id: data.school_id, email: data.email ?? user.email } : null;
}

/** Caller may act on this invoice: staff within tenant, the student themselves, or a linked parent. */
async function canAccessInvoice(
  db: ReturnType<typeof createAdminClient>,
  caller: { id: string; role: string; school_id: string | null; email?: string | null },
  invoice: { portal_user_id: string | null; school_id?: string | null },
): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (caller.role === 'school' || caller.role === 'teacher') {
    return !!caller.school_id && invoice.school_id === caller.school_id;
  }
  if (caller.role === 'student') return invoice.portal_user_id === caller.id;
  if (caller.role === 'parent') {
    if (!invoice.portal_user_id) return false;
    const { studentUserIds } = await getParentLinkScope(db as any, { id: caller.id, email: caller.email });
    return studentUserIds.includes(invoice.portal_user_id);
  }
  return false;
}

/**
 * POST /api/billing/instalment-plans
 * Creates an instalment plan for an invoice (NF-9.3).
 * Body: { invoiceId, instalments: [{ amount, dueDate }] }
 * Validates: SUM(amounts) === invoice.amount (NF-9.2)
 */
export async function POST(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { invoiceId, instalments } = body as {
    invoiceId?: string;
    instalments?: { amount: number; dueDate: string }[];
  };

  if (!invoiceId || !Array.isArray(instalments) || instalments.length < 2) {
    return NextResponse.json({ error: 'invoiceId and at least 2 instalments required' }, { status: 400 });
  }

  const db = createAdminClient();

  // Fetch invoice
  const { data: invoice, error: invErr } = await db
    .from('invoices')
    .select('id, amount, currency, portal_user_id, school_id, status')
    .eq('id', invoiceId)
    .single();

  if (invErr || !invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (!(await canAccessInvoice(db, caller, invoice))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (invoice.status === 'paid') return NextResponse.json({ error: 'Invoice already paid' }, { status: 409 });

  // One active plan per invoice — prevents stacking duplicate schedules.
  const { data: existingPlan } = await db
    .from('instalment_plans')
    .select('id')
    .eq('invoice_id', invoiceId)
    .eq('status', 'active')
    .maybeSingle();
  if (existingPlan) {
    return NextResponse.json({ error: 'This invoice already has an active instalment plan' }, { status: 409 });
  }

  // NF-9.2 — sum must equal invoice total exactly
  const sum = instalments.reduce((acc, i) => acc + Number(i.amount), 0);
  if (Math.abs(sum - Number(invoice.amount)) > 0.01) {
    return NextResponse.json(
      { error: `Instalment sum (${sum}) must equal invoice total (${invoice.amount})` },
      { status: 422 },
    );
  }

  // Create plan
  const { data: plan, error: planErr } = await db
    .from('instalment_plans')
    .insert({
      invoice_id: invoiceId,
      parent_id: caller.id,
      total_amount: Number(invoice.amount),
      currency: invoice.currency ?? 'NGN',
    })
    .select('id')
    .single();

  if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 });

  // Create items
  const items = instalments.map(i => ({
    plan_id: plan.id,
    amount: Number(i.amount),
    due_date: i.dueDate,
    status: 'pending',
  }));

  const { error: itemsErr } = await db.from('instalment_items').insert(items);
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  const { data: fullPlan } = await db
    .from('instalment_plans')
    .select('*, instalment_items(*)')
    .eq('id', plan.id)
    .single();

  return NextResponse.json({ plan: fullPlan }, { status: 201 });
}

/**
 * GET /api/billing/instalment-plans?invoice_id=
 */
export async function GET(req: NextRequest) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const invoiceId = searchParams.get('invoice_id');

  const db = createAdminClient();

  // Non-admin staff and students must be scoped; parents are filtered below.
  if (invoiceId && caller.role !== 'admin' && caller.role !== 'parent') {
    const { data: invoice } = await db
      .from('invoices')
      .select('id, portal_user_id, school_id')
      .eq('id', invoiceId)
      .maybeSingle();
    if (!invoice || !(await canAccessInvoice(db, caller, invoice))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  let q = db
    .from('instalment_plans')
    .select('*, instalment_items(*)')
    .order('created_at', { ascending: false });

  if (invoiceId) q = q.eq('invoice_id', invoiceId) as any;
  if (caller.role === 'parent') {
    q = q.eq('parent_id', caller.id) as any;
  } else if (caller.role === 'student') {
    // Students only see plans on their own invoices.
    const { data: ownInvoices } = await db.from('invoices').select('id').eq('portal_user_id', caller.id);
    const ids = (ownInvoices ?? []).map((r: any) => r.id);
    if (ids.length === 0) return NextResponse.json({ data: [] });
    q = q.in('invoice_id', ids) as any;
  } else if ((caller.role === 'school' || caller.role === 'teacher') && !invoiceId) {
    if (!caller.school_id) return NextResponse.json({ data: [] });
    const { data: schoolInvoices } = await db.from('invoices').select('id').eq('school_id', caller.school_id);
    const ids = (schoolInvoices ?? []).map((r: any) => r.id);
    if (ids.length === 0) return NextResponse.json({ data: [] });
    q = q.in('invoice_id', ids) as any;
  } else if (caller.role !== 'admin' && !['school', 'teacher', 'parent', 'student'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
