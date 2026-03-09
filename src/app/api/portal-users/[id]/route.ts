import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await supabase
    .from('portal_users')
    .select('role, id')
    .eq('id', user.id)
    .single();
  if (!caller || caller.role !== 'admin') return null;
  return caller;
}

// PATCH /api/portal-users/[id] — update full_name, role, phone, is_active
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const { full_name, role, phone, is_active } = body;

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (full_name !== undefined) update.full_name = full_name;
  if (role !== undefined) update.role = role;
  if (phone !== undefined) update.phone = phone;
  if (is_active !== undefined) update.is_active = is_active;

  const admin = adminClient();

  const { data, error } = await admin
    .from('portal_users')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep auth.users metadata in sync so role/name are consistent everywhere
  const metaUpdate: Record<string, any> = {};
  if (full_name !== undefined) metaUpdate.full_name = full_name;
  if (role !== undefined) metaUpdate.role = role;
  if (Object.keys(metaUpdate).length > 0) {
    await admin.auth.admin.updateUserById(id, { user_metadata: metaUpdate });
  }

  return NextResponse.json({ data });
}

// DELETE /api/portal-users/[id] — removes portal_users row + Supabase Auth account
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;

  // Prevent self-deletion
  if (id === caller.id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }

  const admin = adminClient();

  // Delete portal_users row first (cascade handles related data)
  const { error: dbErr } = await admin.from('portal_users').delete().eq('id', id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  // Delete Supabase Auth account
  const { error: authErr } = await admin.auth.admin.deleteUser(id);
  if (authErr) {
    // Auth deletion failed but DB row is gone — log but don't block
    console.error('Auth user deletion failed (DB row already deleted):', authErr.message);
  }

  return NextResponse.json({ success: true });
}
