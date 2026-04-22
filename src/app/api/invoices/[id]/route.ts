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

  // School-scoped users can only see their own invoices
  if (caller.role === 'school' && data.school_id !== caller.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

  const { id } = await context.params;
  const body = await req.json();
  const { due_date, notes, status, items, amount, portal_user_id } = body;

  const admin = adminClient();

  // Verify invoice exists and caller has access
  const { data: existing } = await admin.from('invoices').select('school_id, status').eq('id', id).single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (caller.role === 'school' && existing.school_id !== caller.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (existing.status === 'paid') {
    return NextResponse.json({ error: 'Cannot edit a paid invoice' }, { status: 400 });
  }

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (due_date !== undefined) update.due_date = due_date;
  if (notes !== undefined) update.notes = notes || null;
  if (status !== undefined) update.status = status;
  if (items !== undefined) update.items = items;
  if (amount !== undefined) update.amount = parseFloat(amount);
  if (portal_user_id !== undefined) update.portal_user_id = portal_user_id || null;

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
    .select('id, school_id, status, invoice_number')
    .eq('id', id)
    .single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only admin may delete across all invoices; schools may only delete their own.
  if (caller.role !== 'admin' && caller.role !== 'school') {
    return NextResponse.json({ error: 'Only admin can delete invoices' }, { status: 403 });
  }
  if (caller.role === 'school' && existing.school_id !== caller.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
