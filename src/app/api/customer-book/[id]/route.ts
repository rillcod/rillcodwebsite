import { NextRequest, NextResponse } from 'next/server';
import { crmAuthErrorResponse, requireCustomerBookCaller } from '@/lib/crm/auth';
import { assertCrmContactAccess, schoolNameNeedlesForCaller, rowMatchesSchoolNames } from '@/lib/crm/scope';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { caller, db: admin } = await requireCustomerBookCaller();
    const { id } = await context.params;
    const access = await assertCrmContactAccess(admin, caller, id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    if (access.kind !== 'book') {
      return NextResponse.json({ error: 'Not a customer-book contact' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const { full_name, email, phone, role, school_name, class_name } = body as Record<string, string>;

    const updates: Record<string, string | null> = { updated_at: new Date().toISOString() };
    if (full_name !== undefined) updates.full_name = full_name.trim();
    if (email !== undefined) updates.email = email?.trim().toLowerCase() || null;
    if (phone !== undefined) updates.phone = phone?.trim() || null;
    if (role !== undefined) updates.role = role;
    if (school_name !== undefined) updates.school_name = school_name?.trim() || null;
    if (class_name !== undefined) updates.class_name = class_name?.trim() || null;

    if (caller.role !== 'admin' && school_name !== undefined) {
      const scope = await schoolNameNeedlesForCaller(admin, caller);
      if (scope === 'none' || scope === 'all') {
        return NextResponse.json({ error: 'No school assignment' }, { status: 403 });
      }
      if (!rowMatchesSchoolNames({ school_name: updates.school_name }, scope)) {
        return NextResponse.json({ error: 'School is outside your assignment' }, { status: 403 });
      }
    }

    const { data, error } = await (admin as any)
      .from('customer_contact_book')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (e) {
    return crmAuthErrorResponse(e);
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { caller, db: admin } = await requireCustomerBookCaller();
    if (caller.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can delete contacts' }, { status: 403 });
    }

    const { id } = await context.params;
    const { error } = await admin.from('customer_contact_book').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return crmAuthErrorResponse(e);
  }
}
