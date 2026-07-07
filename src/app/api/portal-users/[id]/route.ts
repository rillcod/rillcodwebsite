import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { syncStudentIdentityAcrossStores, harmonizeStudentParentIdentity } from '@/lib/sync/student-parent-identity';

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
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const isSelf = user.id === id;
  const caller = await getCallerRole(user.id);
  const isAdmin = caller?.role === 'admin';
  const isTeacher = caller?.role === 'teacher';
  const isStaff = isAdmin || isTeacher;

  if (!isStaff && !isSelf) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const body = await request.json();
  const update: Record<string, any> = { updated_at: new Date().toISOString() };

  if (isAdmin) {
    // Admin can update all fields
    const { full_name, role, phone, is_active, bio, email, is_deleted, avatar_url, section_class } = body;
    if (full_name     !== undefined) update.full_name     = full_name;
    if (role          !== undefined) update.role          = role;
    if (phone         !== undefined) update.phone         = phone;
    if (is_active     !== undefined) update.is_active     = is_active;
    if (bio           !== undefined) update.bio           = bio ?? null;
    if (email         !== undefined) update.email         = email?.trim().toLowerCase() ?? null;
    if (is_deleted    !== undefined) update.is_deleted    = is_deleted;
    if (avatar_url    !== undefined) update.avatar_url    = avatar_url ?? null;
    if (section_class !== undefined) update.section_class = section_class ?? null;
  } else if (isTeacher) {
    // Teachers can correct student profile details
    if ('full_name'     in body) update.full_name     = body.full_name;
    if ('section_class' in body) update.section_class = body.section_class ?? null;
    if ('phone'         in body) update.phone         = body.phone ?? null;
    if ('grade_level'   in body) update.grade_level   = body.grade_level ?? null;
    if ('school_id'     in body) update.school_id     = body.school_id ?? null;
    if ('school_name'   in body) update.school_name   = body.school_name ?? null;
    if ('gender'        in body) update.gender        = body.gender ?? null;
    if ('date_of_birth' in body) update.date_of_birth = body.date_of_birth ?? null;
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

  const isStudentProfile = data?.role === 'student' || update.gender !== undefined || update.date_of_birth !== undefined;
  if (isStudentProfile && (update.gender !== undefined || update.date_of_birth !== undefined || update.full_name !== undefined || update.section_class !== undefined)) {
    await syncStudentIdentityAcrossStores(admin, id, {
      gender: update.gender,
      date_of_birth: update.date_of_birth,
      full_name: update.full_name,
      section_class: update.section_class,
    }, 'overwrite');
    await harmonizeStudentParentIdentity(admin, { studentUserId: id });
  } else {
  // Sync students shadow table when profile fields change
  const studentSync: Record<string, any> = {};
  if (update.full_name     !== undefined) { studentSync.full_name = update.full_name; studentSync.name = update.full_name; }
  if (update.section_class !== undefined) { studentSync.current_class = update.section_class; studentSync.grade_level = update.section_class; }
  if (update.school_id     !== undefined) { studentSync.school_id = update.school_id; }
  if (update.school_name   !== undefined) { studentSync.school_name = update.school_name; }
  if (update.gender        !== undefined) { studentSync.gender = update.gender; }
  if (update.date_of_birth !== undefined) { studentSync.date_of_birth = update.date_of_birth; }
  if (update.phone         !== undefined) { studentSync.parent_phone = update.phone; }
  if (Object.keys(studentSync).length > 0) {
    await admin.from('students').update(studentSync).eq('user_id', id);
  }
  }

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
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerClient();
  const { data: { user }, error: deleteAuthErr } = await supabase.auth.getUser();
  if (deleteAuthErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const caller = await getCallerRole(user.id);
  if (!caller || !['admin', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { id } = await context.params;

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

  // ── Students: full wipe via the DB function ──────────────────────────
  // A student can have rows in ~150 FK-linked tables; hand-listing a subset here left
  // orphans and sometimes failed the portal_users delete outright. hard_delete_portal_user
  // clears every child (and the students + auth.users rows) in one shot — a clean, complete
  // delete with nothing left to resurface as a phantom.
  if (pu?.role === 'student') {
    const { error: wipeErr } = await (admin as any).rpc('hard_delete_portal_user', { p_id: id });
    if (wipeErr) return NextResponse.json({ error: wipeErr.message }, { status: 500 });
    // Best-effort auth removal in case the SQL side could not reach auth.users.
    await admin.auth.admin.deleteUser(id).catch(() => {});
    return NextResponse.json({ success: true, hardDeleted: true });
  }

  // ── Step 0: If this is a parent, wipe all linked data ──────────────
  if (pu?.role === 'parent') {
    // Clear parent fields from all students linked by email
    if (pu.email) {
      await admin.from('students').update({
        parent_email: null, parent_name: null, parent_phone: null,
        updated_at: new Date().toISOString(),
      }).eq('parent_email', pu.email);
    }
    // Remove explicit parent-child link rows
    await admin.from('parent_student_links').delete().eq('parent_id', id);
    // Unlink from any consent-form leads so the UI doesn't show stale data
    await admin.from('form_leads').update({ matched_parent_id: null }).eq('matched_parent_id', id);
  }

  // ── Step 1: Remove all child records that FK-reference this portal user ──

  // Teacher-school assignments (teacher side)
  await admin.from('teacher_schools').delete().eq('teacher_id', id);

  // Nullify teacher references in progress reports (keep the reports themselves)
  await admin.from('student_progress_reports').update({ teacher_id: null }).eq('teacher_id', id);

  // Delete linked students registration row (prevents orphaned/duplicate records on re-register)
  await admin.from('students').delete().eq('user_id', id);

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

  // ── Step 1.7: Nullify uploaded_by on files (keep the files themselves) ──
  await admin.from('files').update({ uploaded_by: null }).eq('uploaded_by', id);

  // ── Step 1.8: Study groups cleanup ──
  await admin.from('study_group_messages').update({ sender_id: null }).eq('sender_id', id);
  await admin.from('study_group_members').delete().eq('user_id', id);
  await admin.from('study_groups').update({ created_by: null }).eq('created_by', id);

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
