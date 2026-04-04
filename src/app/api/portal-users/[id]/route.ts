import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCallerRole(userId: string) {
  const supabase = await createServerClient();
  const { data: caller } = await supabase
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', userId)
    .single();
  return caller ?? null;
}

// PATCH /api/portal-users/[id] — update profile fields
// - Admins can update any user's full_name, role, phone, is_active, bio, email, is_deleted, avatar_url
// - Any authenticated user can update their OWN full_name, phone, bio, avatar_url (self-edit)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const isSelf = user.id === id;
  const caller = await getCallerRole(user.id);
  const isAdmin = caller?.role === 'admin';

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const body = await request.json();
  const update: Record<string, any> = { updated_at: new Date().toISOString() };

  if (isAdmin) {
    // Admin can update all fields
    const { full_name, role, phone, is_active, bio, email, is_deleted, avatar_url } = body;
    if (full_name  !== undefined) update.full_name  = full_name;
    if (role       !== undefined) update.role       = role;
    if (phone      !== undefined) update.phone      = phone;
    if (is_active  !== undefined) update.is_active  = is_active;
    if (bio        !== undefined) update.bio        = bio ?? null;
    if (email      !== undefined) update.email      = email?.trim().toLowerCase() ?? null;
    if (is_deleted !== undefined) update.is_deleted = is_deleted;
    if (avatar_url !== undefined) update.avatar_url = avatar_url ?? null;
  } else {
    // Self-edit: only safe profile fields
    if ('full_name'  in body) update.full_name  = body.full_name;
    if ('phone'      in body) update.phone      = body.phone ?? null;
    if ('bio'        in body) update.bio        = body.bio ?? null;
    if ('avatar_url' in body) update.avatar_url = body.avatar_url ?? null;
  }

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
  if (update.full_name !== undefined) metaUpdate.full_name = update.full_name;
  if (update.role      !== undefined) metaUpdate.role      = update.role;
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
  const supabase = await createServerClient();
  const { data: { user }, error: deleteAuthErr } = await supabase.auth.getUser();
  if (deleteAuthErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const caller = await getCallerRole(user.id);
  if (!caller || !['admin', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { id } = await params;

  // Prevent self-deletion
  if (id === caller.id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }

  const admin = adminClient();

  // Fetch target user info (including email for parent cleanup)
  const { data: pu } = await admin
    .from('portal_users')
    .select('role, school_id, email')
    .eq('id', id)
    .single();

  // Teachers can only delete students, and only from their assigned school
  if (caller.role === 'teacher') {
    if (!pu || pu.role !== 'student') {
      return NextResponse.json({ error: 'Teachers can only delete student accounts' }, { status: 403 });
    }

    // Gather assigned school IDs from teacher_schools + profile fallback
    const { data: assignments } = await admin
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', caller.id);

    const assignedIds: string[] = (assignments ?? [])
      .map((a: any) => a.school_id)
      .filter(Boolean);
    if (caller.school_id) assignedIds.push(caller.school_id);

    if (!pu.school_id || !assignedIds.includes(pu.school_id)) {
      return NextResponse.json({ error: 'You can only delete students from your assigned school' }, { status: 403 });
    }
  }

  // ── Step 0: If this is a parent, clear linked student records ────────
  if (pu?.role === 'parent' && pu?.email) {
    await admin.from('students').update({ parent_email: null, parent_name: null }).eq('parent_email', pu.email);
  }

  // ── Step 1: Remove all child records that FK-reference this portal user ──

  // Teacher-school assignments (teacher side)
  await admin.from('teacher_schools').delete().eq('teacher_id', id);

  // Nullify teacher references in progress reports (keep the reports themselves)
  await admin.from('student_progress_reports').update({ teacher_id: null }).eq('teacher_id', id);

  // Unlink students whose user_id points here (preserve the student records)
  await admin.from('students').update({ user_id: null }).eq('user_id', id);

  // Nullify created_by on students created by this user (keeps student records intact)
  await admin.from('students').update({ created_by: null }).eq('created_by', id);

  // Delete enrollments belonging to this user
  await admin.from('enrollments').delete().eq('user_id', id);

  // Delete assignment submissions by this user
  await admin.from('assignment_submissions').delete().eq('portal_user_id', id);

  // Nullify graded_by references in submissions
  await admin.from('assignment_submissions').update({ graded_by: null }).eq('graded_by', id);

  // ── Step 1.5: Nullify teacher references in classes ──────────────────
  await admin.from('classes').update({ teacher_id: null }).eq('teacher_id', id);

  // ── Step 1.6: Nullify teacher references in timetable slots ─────────
  // We keep the slot but clear the ID/name linkage
  await admin.from('timetable_slots').update({ teacher_id: null }).eq('teacher_id', id);

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
