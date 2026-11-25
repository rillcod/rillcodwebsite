import { redactInvoiceListForRole, isSchoolStreamInvoice } from '@/lib/finance/redact-invoice';
import { isDeliverableExternalEmail } from '@/lib/finance/smart-communication';
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

async function enrichInvoicesForStaff(
  admin: ReturnType<typeof adminClient>,
  rows: Record<string, any>[],
): Promise<Record<string, any>[]> {
  if (rows.length === 0) return rows;
  try {
    const schoolIds = Array.from(
      new Set(rows.map((r) => r.school_id).filter((id): id is string => typeof id === 'string' && id.length > 0)),
    );
    const userIds = Array.from(
      new Set(rows.map((r) => r.portal_user_id).filter((id): id is string => typeof id === 'string' && id.length > 0)),
    );
    const openInvoiceIds = rows
      .filter((r) => ['sent', 'overdue', 'pending', 'partially_paid'].includes(String(r.status || '').toLowerCase()))
      .map((r) => r.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const [
      schoolContactsRes,
      userContactsRes,
      schoolUsersRes,
      studentsRes,
      proofsRes,
    ] = await Promise.all([
      schoolIds.length > 0
        ? admin
            .from('billing_contacts')
            .select('school_id, representative_name, representative_email, representative_whatsapp')
            .in('school_id', schoolIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length > 0
        ? admin
            .from('billing_contacts')
            .select('owner_user_id, representative_name, representative_email, representative_whatsapp')
            .in('owner_user_id', userIds)
        : Promise.resolve({ data: [] as any[] }),
      schoolIds.length > 0
        ? admin
            .from('portal_users')
            .select('school_id, full_name, email, phone')
            .in('school_id', schoolIds)
            .eq('role', 'school')
        : Promise.resolve({ data: [] as any[] }),
      userIds.length > 0
        ? admin
            .from('students')
            .select('user_id, full_name, parent_name, parent_email, parent_phone, phone')
            .in('user_id', userIds)
        : Promise.resolve({ data: [] as any[] }),
      openInvoiceIds.length > 0
        ? admin
            .from('invoice_payment_proofs')
            .select('invoice_id, status, created_at')
            .in('invoice_id', openInvoiceIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const schoolContactMap = new Map<string, any>();
    for (const c of schoolContactsRes.data ?? []) {
      if (c?.school_id && !schoolContactMap.has(c.school_id)) schoolContactMap.set(c.school_id, c);
    }

    const userContactMap = new Map<string, any>();
    for (const c of userContactsRes.data ?? []) {
      if (c?.owner_user_id && !userContactMap.has(c.owner_user_id)) userContactMap.set(c.owner_user_id, c);
    }

    const schoolPortalMap = new Map<string, any>();
    for (const u of schoolUsersRes.data ?? []) {
      if (u?.school_id && !schoolPortalMap.has(u.school_id)) schoolPortalMap.set(u.school_id, u);
    }

    const studentMap = new Map<string, any>();
    for (const s of studentsRes.data ?? []) {
      if (s?.user_id && !studentMap.has(s.user_id)) studentMap.set(s.user_id, s);
    }

    const proofSummaryMap = new Map<string, { count: number; latestAt: string | null; latestStatus: string | null }>();
    for (const p of proofsRes.data ?? []) {
      if (!p?.invoice_id) continue;
      const existing = proofSummaryMap.get(p.invoice_id);
      if (!existing) {
        proofSummaryMap.set(p.invoice_id, {
          count: 1,
          latestAt: p.created_at ?? null,
          latestStatus: p.status ?? null,
        });
      } else {
        existing.count += 1;
      }
    }

    return rows.map((inv) => {
      const isSchool = isSchoolStreamInvoice(inv);
      const billingContact = isSchool
        ? (inv.school_id ? schoolContactMap.get(inv.school_id) ?? null : null)
        : (inv.portal_user_id ? userContactMap.get(inv.portal_user_id) ?? null : null);

      let resolvedEmail: string | null = null;
      let resolvedPhone: string | null = null;
      let resolvedName: string | null = null;
      let source: string = 'none';

      if (isSchool) {
        const schoolUser = inv.school_id ? schoolPortalMap.get(inv.school_id) : null;
        if (isDeliverableExternalEmail(billingContact?.representative_email)) {
          resolvedEmail = billingContact.representative_email.trim();
          source = 'billing_contact';
        } else if (isDeliverableExternalEmail(schoolUser?.email)) {
          resolvedEmail = schoolUser.email.trim();
          source = 'school_portal';
        }
        resolvedPhone = billingContact?.representative_whatsapp || schoolUser?.phone || null;
        resolvedName =
          billingContact?.representative_name
          || inv.schools?.name
          || schoolUser?.full_name
          || 'Partner School';
      } else {
        const stu = inv.portal_user_id ? studentMap.get(inv.portal_user_id) : null;
        const portalEmail = inv.portal_users?.email;
        if (isDeliverableExternalEmail(billingContact?.representative_email)) {
          resolvedEmail = billingContact.representative_email.trim();
          source = 'billing_contact';
        } else if (isDeliverableExternalEmail(stu?.parent_email)) {
          resolvedEmail = stu.parent_email.trim();
          source = 'parent';
        } else if (isDeliverableExternalEmail(portalEmail)) {
          resolvedEmail = portalEmail.trim();
          source = 'payer';
        }
        resolvedPhone =
          billingContact?.representative_whatsapp
          || stu?.parent_phone
          || stu?.phone
          || null;
        resolvedName =
          stu?.parent_name
          || billingContact?.representative_name
          || inv.portal_users?.full_name
          || stu?.full_name
          || 'Client';
      }

      const proofInfo = proofSummaryMap.get(inv.id);

      return {
        ...inv,
        billing_contacts: billingContact,
        resolved_recipient: {
          name: resolvedName,
          email: resolvedEmail,
          phone: resolvedPhone,
          source,
        },
        proof_count: proofInfo?.count ?? inv.proof_count ?? 0,
        latest_proof_at: proofInfo?.latestAt ?? inv.latest_proof_at ?? null,
        latest_proof_status: proofInfo?.latestStatus ?? inv.latest_proof_status ?? null,
      };
    });
  } catch (err) {
    console.warn('[invoices] enrichment skipped:', err);
    return rows;
  }
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
  const rawRows = data ?? [];
  const enrichedRows =
    caller.role === 'admin' || caller.role === 'school' || caller.role === 'teacher'
      ? await enrichInvoicesForStaff(admin, rawRows)
      : rawRows;
  // Same rule as the single-invoice route: a school sees its own bill in full and
  // only a paid/unpaid indicator on a family's — never the figures or family contacts.
  const rows = redactInvoiceListForRole(enrichedRows, caller.role);
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
