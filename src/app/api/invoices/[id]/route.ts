import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'school', 'teacher'].includes(profile.role)) return null;
  return profile;
}

async function getLinkedCycleSchoolId(admin: ReturnType<typeof adminClient>, invoice: any) {
  const cycleSelect = 'id, owner_school_id, school_id';
  if (invoice.billing_cycle_id) {
    const { data } = await admin
      .from('billing_cycles')
      .select(cycleSelect)
      .eq('id', invoice.billing_cycle_id)
      .maybeSingle();
    if (data?.owner_school_id || data?.school_id) return data.owner_school_id || data.school_id;
  }

  const { data } = await admin
    .from('billing_cycles')
    .select(cycleSelect)
    .eq('invoice_id', invoice.id)
    .maybeSingle();
  return data?.owner_school_id || data?.school_id || null;
}

// GET /api/invoices/[id] — fetch single invoice with related data
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const admin = adminClient();

  const { data, error } = await admin
    .from('invoices')
    .select('*, portal_users(id, full_name, email, school_id), schools(id, name)')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // School/teacher users can only see their own school's invoices or linked school cycles.
  if (caller.role === 'school' || caller.role === 'teacher') {
    const cycleSchoolId = await getLinkedCycleSchoolId(admin, data);
    if (!caller.school_id || (data.school_id !== caller.school_id && cycleSchoolId !== caller.school_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  return NextResponse.json({ data });
}

// PATCH /api/invoices/[id] — update invoice
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // Editing invoices is a finance action — teachers can view but not mutate.
  if (!['admin', 'school'].includes(caller.role)) {
    return NextResponse.json({ error: 'Only finance admins or school accounts can update invoices' }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await req.json();
  const { due_date, notes, status, items, amount, portal_user_id } = body;

  const admin = adminClient();

  // Verify invoice exists and caller has access
  const { data: existing } = await admin.from('invoices').select('id, school_id, billing_cycle_id, status').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (caller.role === 'school') {
    const cycleSchoolId = await getLinkedCycleSchoolId(admin, existing);
    if (!caller.school_id || (existing.school_id !== caller.school_id && cycleSchoolId !== caller.school_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  if (existing.status === 'paid') {
    return NextResponse.json({ error: 'Cannot edit a paid invoice' }, { status: 400 });
  }
  if (status === 'paid') {
    return NextResponse.json(
      { error: 'Use /api/invoices/mark-paid so payment, receipt, audit, and acknowledgement stay in sync.' },
      { status: 400 },
    );
  }

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (due_date !== undefined) update.due_date = due_date;
  if (notes !== undefined) update.notes = notes || null;
  if (status !== undefined) update.status = status;
  if (items !== undefined) update.items = items;
  if (amount !== undefined) update.amount = parseFloat(amount);
  if (portal_user_id !== undefined) update.portal_user_id = portal_user_id || null;

  // Keep the stored amount consistent with line items so the printed document
  // never disagrees with the ledger total.
  if (Array.isArray(update.items) && update.items.length > 0) {
    const itemsSum = update.items.reduce((s: number, it: any) => {
      const line = Number(it?.total ?? (Number(it?.quantity ?? 1) * Number(it?.unit_price ?? 0)));
      return s + (Number.isFinite(line) ? line : 0);
    }, 0);
    if (update.amount === undefined) {
      update.amount = itemsSum;
    } else if (Math.abs(Number(update.amount) - itemsSum) > 0.01) {
      return NextResponse.json(
        { error: `Amount (${update.amount}) does not match the sum of line items (${itemsSum}).` },
        { status: 400 },
      );
    }
  }

  const { data, error } = await admin
    .from('invoices')
    .update(update)
    .eq('id', id)
    .select('*, portal_users(id, full_name, email), schools(id, name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/invoices/[id] — admin-only (or school for its own unpaid invoices)
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const admin = adminClient();

  const { data: existing } = await admin
    .from('invoices')
    .select('id, school_id, billing_cycle_id, status, invoice_number')
    .eq('id', id)
    .single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only admin may delete across all invoices; schools may only delete their own.
  if (caller.role !== 'admin' && caller.role !== 'school') {
    return NextResponse.json({ error: 'Only admin can delete invoices' }, { status: 403 });
  }
  if (caller.role === 'school') {
    const cycleSchoolId = await getLinkedCycleSchoolId(admin, existing);
    if (existing.school_id !== caller.school_id && cycleSchoolId !== caller.school_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  // Refuse to delete paid invoices — finance ledger integrity
  if (existing.status === 'paid') {
    return NextResponse.json(
      {
        error:
          'Paid invoices cannot be deleted. Void or adjust via a reconciliation entry instead.',
      },
      { status: 400 },
    );
  }

  const { error } = await admin.from('invoices').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, invoice_number: existing.invoice_number });
}
