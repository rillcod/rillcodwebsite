import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { syncStudentIdentityAcrossStores, harmonizeStudentParentIdentity } from '@/lib/sync/student-parent-identity';
import { cleanStudentName } from '@/lib/students/clean-name';
import { canonicalGrade } from '@/lib/classes/naming';
import { getAccountValuables } from '@/lib/students/account-valuables';

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
    const { full_name, role, phone, is_active, bio, email, is_deleted, avatar_url, section_class, grade } = body;
    if (full_name     !== undefined) update.full_name     = full_name;
    if (role          !== undefined) update.role          = role;
    if (phone         !== undefined) update.phone         = phone;
    if (is_active     !== undefined) update.is_active     = is_active;
    if (bio           !== undefined) update.bio           = bio ?? null;
    if (email         !== undefined) update.email         = email?.trim().toLowerCase() ?? null;
    if (is_deleted    !== undefined) update.is_deleted    = is_deleted;
    if (avatar_url    !== undefined) update.avatar_url    = avatar_url ?? null;
    if (section_class !== undefined) update.section_class = section_class ?? null;
    // grade is a specific single grade, kept separate from the section — normalise to the
    // canonical form so a hand-typed "jss1" becomes "JSS 1".
    if (grade         !== undefined) update.grade         = grade ? (canonicalGrade(grade) ?? grade) : null;
  } else if (isTeacher) {
    // Teachers can correct student profile details
    if ('full_name'     in body) update.full_name     = body.full_name;
    if ('section_class' in body) update.section_class = body.section_class ?? null;
    if ('grade'         in body) update.grade         = body.grade ? (canonicalGrade(body.grade) ?? body.grade) : null;
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

  // Clean edited names on write so a corrected name sticks in canonical form everywhere
  // (strips index prefixes, trailing numbers, invisible chars) — the source of truth.
  if (typeof update.full_name === 'string') {
    update.full_name = cleanStudentName(update.full_name) || update.full_name.trim();
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

  // Mirror the canonical grade to the students shadow (grade + grade_level) regardless of which
  // sync branch ran, so the specific grade is consistent across stores. grade stays SEPARATE
  // from the section/class (current_class).
  if (update.grade !== undefined) {
    await admin.from('students').update({ grade: update.grade, grade_level: update.grade }).eq('user_id', id);
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
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const delBody = await request.json().catch(() => ({} as Record<string, unknown>));
  const reassignToTeacherId = typeof delBody.reassignToTeacherId === 'string' ? delBody.reassignToTeacherId : null;
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

  // ── Safety gate: never let a same-name mix-up quietly destroy a PAID ID card or a
  // PUBLISHED progress report. If the account holds either and the caller hasn't explicitly
  // confirmed, return 409 with exactly what would be lost (incl. report term + year). ──
  if (delBody.confirmDestroy !== true && pu) {
    const { data: sRow } = await admin.from('students').select('id').eq('user_id', id).maybeSingle();
    const valuables = await getAccountValuables(admin, id, (sRow as any)?.id ?? null);
    if (valuables.hasValuables) {
      return NextResponse.json({
        requiresConfirmation: true,
        error: `${valuables.summary} Deleting removes it permanently.`,
        valuables,
      }, { status: 409 });
    }
  }

  // ── Step 0: Role-specific pre-steps the DB function can't infer ──────────
  // Parent: clear the TEXT parent_* fields on students (not FK columns) and unlink leads.
  if (pu?.role === 'parent') {
    if (pu.email) {
      await admin.from('students').update({
        parent_email: null, parent_name: null, parent_phone: null,
        updated_at: new Date().toISOString(),
      }).eq('parent_email', pu.email);
    }
    await admin.from('form_leads').update({ matched_parent_id: null }).eq('matched_parent_id', id);
  }
  // School: detach students and delete the linked schools row (schools is not a
  // portal_users FK child, so the function won't touch it).
  if (pu?.role === 'school' && pu?.school_id) {
    await admin.from('students').update({ school_id: null, school_name: null }).eq('school_id', pu.school_id);
    await admin.from('teacher_schools').delete().eq('school_id', pu.school_id);
    await admin.from('schools').delete().eq('id', pu.school_id);
  }
  // Teacher: never orphan their classes. Reassign owned classes (and their students'
  // primary_teacher_id) to a chosen replacement before the wipe. Without a valid target
  // we block and hand back the owned classes + eligible same-school teachers so the UI can
  // prompt — the "forces reassignment first" guard.
  if (pu?.role === 'teacher') {
    const { data: owned } = await admin.from('classes').select('id, name, school_id').eq('teacher_id', id);
    const ownedClasses = owned ?? [];
    if (ownedClasses.length > 0) {
      // Validate the chosen replacement is an active teacher who can access every class's school.
      let target: { id: string } | null = null;
      if (reassignToTeacherId && reassignToTeacherId !== id) {
        const { data: cand } = await admin.from('portal_users')
          .select('id, role, school_id, is_deleted').eq('id', reassignToTeacherId).maybeSingle();
        if (cand && cand.role === 'teacher' && cand.is_deleted !== true) {
          const { data: ts } = await admin.from('teacher_schools').select('school_id').eq('teacher_id', reassignToTeacherId);
          const reach = new Set([...(ts ?? []).map((r: any) => r.school_id), (cand as any).school_id].filter(Boolean));
          const coversAll = ownedClasses.every((c) => !c.school_id || reach.has(c.school_id));
          if (coversAll) target = { id: reassignToTeacherId };
        }
      }
      if (!target) {
        const schoolIds = [...new Set(ownedClasses.map((c) => c.school_id).filter(Boolean))] as string[];
        const { data: tsRows } = await admin.from('teacher_schools').select('teacher_id, school_id').in('school_id', schoolIds.length ? schoolIds : ['00000000-0000-0000-0000-000000000000']);
        const eligibleIds = [...new Set((tsRows ?? []).map((r: any) => r.teacher_id).filter((t: any) => t && t !== id))];
        const { data: eligible } = eligibleIds.length
          ? await admin.from('portal_users').select('id, full_name, email').in('id', eligibleIds).eq('role', 'teacher').neq('is_deleted', true)
          : { data: [] as Array<{ id: string; full_name: string; email: string }> };
        return NextResponse.json({
          error: `This teacher owns ${ownedClasses.length} active class(es). Choose a teacher to reassign them to before deleting.`,
          requiresReassignment: true,
          ownedClasses: ownedClasses.map((c) => ({ id: c.id, name: c.name })),
          eligibleTeachers: eligible ?? [],
        }, { status: 409 });
      }
      // Reassign classes + student ownership to the replacement teacher, and carry the
      // outgoing teacher's authored work (reports, lessons) under the new teacher's
      // authorship BEFORE the wipe nulls those references — so nothing is orphaned.
      const classIds = ownedClasses.map((c) => c.id);
      await admin.from('classes').update({ teacher_id: target.id, updated_at: new Date().toISOString() }).in('id', classIds);
      await admin.from('portal_users').update({ primary_teacher_id: target.id, updated_at: new Date().toISOString() })
        .in('class_id', classIds).eq('role', 'student');
      await admin.from('student_progress_reports').update({ teacher_id: target.id }).eq('teacher_id', id);
      await admin.from('lesson_plans').update({ created_by: target.id }).eq('created_by', id);
    }
  }

  // ── Full wipe via the semantic DB function ──────────────────────────────
  // hard_delete_portal_user walks every FK child: student-owned rows are deleted, while
  // creator/teacher references (classes.teacher_id, reports.teacher_id, lessons.created_by,
  // …) are set NULL so a teacher's content is preserved and just unlinked. Then it removes
  // the students, portal_users and auth.users rows — a clean, complete delete for ANY role
  // with nothing left to orphan or resurface as a phantom.
  const { error: wipeErr } = await (admin as any).rpc('hard_delete_portal_user', { p_id: id });
  if (wipeErr) return NextResponse.json({ error: wipeErr.message }, { status: 500 });

  // Best-effort auth removal in case the SQL side could not reach auth.users.
  await admin.auth.admin.deleteUser(id).catch(() => {});

  return NextResponse.json({ success: true, hardDeleted: true });
}
