import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';
import { assertCrmContactAccess, getCallerSchoolIds } from '@/lib/crm/scope';

function adminClient() {
  return createSupabase<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCaller() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data } = await adminClient()
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!data || !['admin', 'teacher', 'school'].includes(data.role)) return null;
  return data;
}

async function schoolNameAllowed(
  admin: ReturnType<typeof adminClient>,
  caller: { id: string; role: string; school_id: string | null },
  schoolName: string | null,
): Promise<boolean> {
  if (caller.role === 'admin') return true;
  const schoolIds = await getCallerSchoolIds(admin as any, caller);
  if (schoolIds === 'all') return true;
  if (!schoolIds.length) return false;
  const { data: schools } = await admin.from('schools').select('name').in('id', schoolIds);
  const needles = (schools ?? []).map((s: any) => String(s.name || '').toLowerCase()).filter(Boolean);
  const sn = String(schoolName || '').toLowerCase();
  if (!sn) return false;
  return needles.some((n) => sn.includes(n) || n.includes(sn));
}

// PATCH /api/customer-book/[id] — update any contact fields
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const admin = adminClient();
  const access = await assertCrmContactAccess(admin as any, caller, id);
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
    const ok = await schoolNameAllowed(admin, caller, updates.school_name);
    if (!ok) return NextResponse.json({ error: 'School is outside your assignment' }, { status: 403 });
  }

  const { data, error } = await (admin as any)
    .from('customer_contact_book')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/customer-book/[id] — hard delete (admin only)
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (caller.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can delete contacts' }, { status: 403 });
  }

  const { id } = await context.params;
  const { error } = await adminClient().from('customer_contact_book').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
