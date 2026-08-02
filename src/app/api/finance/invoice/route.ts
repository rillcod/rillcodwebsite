import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createInvoice } from '@/lib/finance/create-invoice';
import { financeResultToResponse } from '@/lib/finance/write-result';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { redactInvoiceListForRole } from '@/lib/finance/redact-invoice';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  return data ?? null;
}

/**
 * POST /api/finance/invoice — thin wrapper around createInvoice service.
 */
export async function POST(request: Request) {
  const caller = await getCaller();
  if (!caller || !roleHasCapability(caller.role, 'manage_finance')) {
    return NextResponse.json({ success: false, error: 'Forbidden', code: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const school_id = caller.role === 'admin' ? (body.school_id ?? null) : caller.school_id;

  if (body.portal_user_id) {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const db = createAdminClient();
    const { data: payer, error } = await db.from('portal_users').select('id, school_id').eq('id', body.portal_user_id).maybeSingle();
    if (error) return NextResponse.json({ success: false, error: error.message, code: 'db_error' }, { status: 500 });
    if (!payer) return NextResponse.json({ success: false, error: 'Payer not found', code: 'not_found' }, { status: 404 });
    if (caller.role !== 'admin' && payer.school_id !== school_id) {
      return NextResponse.json({ success: false, error: 'Forbidden: payer belongs to another school', code: 'forbidden' }, { status: 403 });
    }
  }

  const result = await createInvoice({
    school_id,
    actor_id: caller.id,
    portal_user_id: body.portal_user_id ?? null,
    subscription_id: body.subscription_id ?? null,
    billing_cycle_id: body.billing_cycle_id ?? null,
    academic_offering_id: body.academic_offering_id ?? null,
    offering_period_id: body.offering_period_id ?? null,
    amount: body.amount,
    currency: body.currency,
    due_date: body.due_date,
    items: body.items,
    notes: body.notes,
    description: body.description,
    status: body.status ?? 'draft',
    stream: body.stream === 'school' || body.stream === 'individual' ? body.stream : undefined,
    metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {},
  });

  const { body: payload, status } = financeResultToResponse(result);
  if (result.ok) {
    return NextResponse.json({ ...payload, data: result.data }, { status: 201 });
  }
  return NextResponse.json(payload, { status });
}

export async function GET(request: Request) {
  const caller = await getCaller();
  if (!caller || !['admin', 'school', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const db = createAdminClient();
  let q = db.from('invoices')
    .select('*, finance_academic_links!finance_academic_links_invoice_id_fkey(academic_offering_id,offering_period_id,link_source,academic_offerings(title,pathway,enrollment_type),academic_offering_periods(label))')
    .order('created_at', { ascending: false }).limit(100);
  if (caller.role === 'school') {
    if (!caller.school_id) return NextResponse.json({ success: false, error: 'No school scope', code: 'forbidden' }, { status: 403 });
    q = q.eq('school_id', caller.school_id) as typeof q;
  } else if (caller.role === 'teacher') {
    const schoolIds = await getTeacherSchoolIds(caller.id, caller.school_id);
    if (schoolIds.length === 0) return NextResponse.json({ success: true, data: [] });
    q = q.in('school_id', schoolIds) as typeof q;
  }
  const status = searchParams.get('status');
  if (status) q = q.eq('status', status) as typeof q;
  const { data, error } = await q;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: redactInvoiceListForRole(data ?? [], caller.role) });
}
