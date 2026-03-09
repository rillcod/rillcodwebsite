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

// DELETE /api/portal-users/[id] — force-deletes portal row + auth account,
// bypassing FK constraints by manually cleaning up all dependent records first.
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

  // Fetch user info so we know what cascade cleanup is needed
  const { data: pu } = await admin
    .from('portal_users')
    .select('role, school_id')
    .eq('id', id)
    .single();

  // ── Step 1: Remove all child records that FK-reference this portal user ──

  // Teacher-school assignments (teacher side)
  await admin.from('teacher_schools').delete().eq('teacher_id', id);

  // Nullify teacher references in progress reports (keep the reports themselves)
  await admin.from('student_progress_reports').update({ teacher_id: null }).eq('teacher_id', id);

  // Unlink students whose user_id points here (preserve the student records)
  await admin.from('students').update({ user_id: null }).eq('user_id', id);

  // Delete enrollments belonging to this user
  await admin.from('enrollments').delete().eq('user_id', id);

  // Delete assignment submissions by this user
  await admin.from('assignment_submissions').delete().eq('portal_user_id', id);

  // Nullify graded_by references in submissions
  await admin.from('assignment_submissions').update({ graded_by: null }).eq('graded_by', id);

  // ── Step 2: If this is a school account, also delete the linked schools row ──
  if (pu?.role === 'school' && pu?.school_id) {
    // Unlink any students tied to this school first
    await admin.from('students').update({ school_id: null, school_name: null }).eq('school_id', pu.school_id);
    // Remove teacher-school assignments for this school
    await admin.from('teacher_schools').delete().eq('school_id', pu.school_id);
    // Delete the school row
    await admin.from('schools').delete().eq('id', pu.school_id);
  }

  // ── Step 3: Delete the portal_users row ──
  const { error: dbErr } = await admin.from('portal_users').delete().eq('id', id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  // ── Step 4: Delete the Supabase Auth account ──
  const { error: authErr } = await admin.auth.admin.deleteUser(id);
  if (authErr) {
    // Auth deletion failed but DB row is already gone — log only
    console.error('Auth user deletion failed (DB row already deleted):', authErr.message);
  }

  return NextResponse.json({ success: true });
}
