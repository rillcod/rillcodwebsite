import { redactInvoiceListForRole } from '@/lib/finance/redact-invoice';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getParentLinkScope } from '@/lib/parents/links';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { roleHasCapability } from '@/lib/auth/capabilities';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireCaller() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id, email')
    .eq('id', user.id)
    .single();
  if (!profile) return null;
  return profile as { id: string; role: string; school_id: string | null; email: string | null };
}

async function requireWriter() {
  const caller = await requireCaller();
  if (!caller) return null;
  if (!roleHasCapability(caller.role, 'manage_finance')) return null;
  return caller;
}

// GET /api/invoices — role-aware invoice listing.
//   admin  → all invoices (optional ?school_id= filter)
//   school → invoices scoped to their school_id
//   teacher→ invoices scoped to their school_id
//   student→ invoices where portal_user_id = self
//   parent → invoices for any of their children (students.parent_id = self)
//
// Accepts ?status=, ?limit= (default 100), ?offset= (default 0).
export async function GET(request: NextRequest) {
  const caller = await requireCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = adminClient();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const stream = searchParams.get('stream'); // 'school' | 'individual'
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

  let query = admin
    .from('invoices')
    .select('*, portal_users!invoices_portal_user_id_fkey(full_name, email), schools(name), finance_academic_links!finance_academic_links_invoice_id_fkey(academic_offering_id,offering_period_id,link_source,academic_offerings(title,pathway,enrollment_type),academic_offering_periods(label))', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (stream === 'school' || stream === 'individual') {
    query = query.eq('stream', stream);
  }

  if (caller.role === 'admin') {
    const schoolIdParam = searchParams.get('school_id');
    if (schoolIdParam) query = query.eq('school_id', schoolIdParam);
  } else if (caller.role === 'school' || caller.role === 'teacher') {
    const schoolIds = await getTeacherSchoolIds(caller.id, caller.school_id);
    if (schoolIds.length === 0) {
      return NextResponse.json({ data: [], pagination: { offset, limit, returned: 0, total: 0, has_more: false } });
    }
    query = query.in('school_id', schoolIds);
  } else if (caller.role === 'student') {
    query = query.eq('portal_user_id', caller.id);
  } else if (caller.role === 'parent') {
    if (!caller.email) {
      return NextResponse.json({ data: [], pagination: { offset, limit, returned: 0, total: 0, has_more: false } });
    }
    const { studentUserIds: childUserIds } = await getParentLinkScope(
      admin as any,
      { id: caller.id, email: caller.email },
    );
    if (childUserIds.length === 0) {
      return NextResponse.json({ data: [], pagination: { offset, limit, returned: 0, total: 0, has_more: false } });
    }
    query = query.in('portal_user_id', childUserIds);
  } else {
    return NextResponse.json({ data: [], pagination: { offset, limit, returned: 0, total: 0, has_more: false } });
  }

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) {
    console.error('[invoices] list failed', error);
    return NextResponse.json({ error: 'Invoices are temporarily unavailable' }, { status: 500 });
  }
  // Same rule as the single-invoice route: a school sees its own bill in full and
  // only a paid/unpaid indicator on a family's — never the figures.
  const rows = redactInvoiceListForRole(data ?? [], caller.role);
  const total = count ?? rows.length;
  return NextResponse.json({
    data: rows,
    pagination: {
      offset,
      limit,
      returned: rows.length,
      total,
      has_more: offset + rows.length < total,
    },
  });
}

// POST /api/invoices — create invoice via shared createInvoice service.
export async function POST(request: NextRequest) {
  const caller = await requireWriter();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const {
    school_id, portal_user_id, amount, currency, notes, due_date, items, status,
    stream: streamFromBody, billing_cycle_id, metadata,
    academic_offering_id, offering_period_id,
  } = body;

  const effectiveSchoolId = caller.role === 'admin' ? (school_id || null) : caller.school_id;
  if (caller.role !== 'admin' && !effectiveSchoolId) {
    return NextResponse.json({ error: 'Your account is not linked to a school.' }, { status: 403 });
  }
  if (caller.role !== 'admin' && school_id && school_id !== effectiveSchoolId) {
    return NextResponse.json({ error: 'Forbidden: cannot create invoices for another school' }, { status: 403 });
  }
  if (portal_user_id && effectiveSchoolId) {
    const admin = adminClient();
    const { data: payer, error: payerErr } = await admin
      .from('portal_users')
      .select('school_id')
      .eq('id', portal_user_id)
      .maybeSingle();
    if (payerErr) return NextResponse.json({ error: payerErr.message }, { status: 500 });
    if (!payer) return NextResponse.json({ error: 'Payer not found' }, { status: 404 });
    if (caller.role !== 'admin' && payer.school_id !== effectiveSchoolId) {
      return NextResponse.json({ error: 'Forbidden: payer belongs to another school' }, { status: 403 });
    }
  }

  const { createInvoice } = await import('@/lib/finance/create-invoice');
  const { financeResultToResponse } = await import('@/lib/finance/write-result');
  const result = await createInvoice({
    school_id: effectiveSchoolId,
    actor_id: caller.id,
    portal_user_id: portal_user_id || null,
    amount,
    currency,
    notes: notes || null,
    due_date,
    items,
    status,
    stream: streamFromBody === 'school' || streamFromBody === 'individual' ? streamFromBody : undefined,
    billing_cycle_id: billing_cycle_id || null,
    academic_offering_id: academic_offering_id || null,
    offering_period_id: offering_period_id || null,
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
  });

  const { body: payload, status: httpStatus } = financeResultToResponse(result);
  if (result.ok) return NextResponse.json({ success: true, data: result.data, effects: result.effects }, { status: 201 });
  return NextResponse.json(payload, { status: httpStatus });
}
