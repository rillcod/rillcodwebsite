import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultRosterBillingPayload } from '@/lib/rosters/billing-sync';

export type ReinstateActor = {
  id: string;
  role: string;
};

export type ReinstateToClassOptions = {
  studentId: string;
  classId: string;
  actor: ReinstateActor;
  /** Optional grade to stamp on the student (bulk-register row grade). */
  grade?: string | null;
  classArm?: string | null;
  /**
   * When true, take the student immediately â€” no transfer request, no destination-owner
   * check, no â€œactive under another teacherâ€ block. Used by paste-name claim (and admins).
   */
  forceCrossTeacher?: boolean;
};

export type ReinstateToClassResult =
  | {
      ok: true;
      studentId: string;
      fullName: string;
      email: string;
      fromClassId: string | null;
      toClassId: string;
      toClassName: string;
      ownerTeacherId: string | null;
      reportsTransferred: number;
      wasWithdrawn: boolean;
    }
  | {
      ok: false;
      error: string;
      code: 'NOT_FOUND' | 'SCHOOL' | 'CAPACITY' | 'OTHER_TEACHER' | 'FORBIDDEN' | 'UPDATE';
    };

async function upsertRoster(
  admin: SupabaseClient,
  cls: { id: string; term_id?: string | null; school_id?: string | null; program_id?: string | null },
  studentId: string,
  status: 'active' | 'withdrawn',
  actorId: string,
) {
  let lookup = (admin as any)
    .from('class_term_rosters')
    .select('id')
    .eq('class_id', cls.id)
    .eq('student_id', studentId)
    .limit(1);
  lookup = cls.term_id ? lookup.eq('term_id', cls.term_id) : lookup.is('term_id', null);
  const { data: existing, error: lookupErr } = await lookup.maybeSingle();
  if (lookupErr?.code === '42P01') return;
  if (lookupErr) {
    console.warn('[reinstate] roster lookup failed', lookupErr);
    return;
  }

  const active = status === 'active';
  const billingPayload = active ? await defaultRosterBillingPayload(admin as any, cls) : {};
  const payload = {
    class_id: cls.id,
    student_id: studentId,
    term_id: cls.term_id ?? null,
    school_id: cls.school_id ?? null,
    program_id: cls.program_id ?? null,
    status,
    ended_at: active ? null : new Date().toISOString(),
    reinstated_at: active ? new Date().toISOString() : null,
    ...billingPayload,
    updated_by: actorId,
  };

  const { error } = existing?.id
    ? await (admin as any).from('class_term_rosters').update(payload).eq('id', existing.id)
    : await (admin as any).from('class_term_rosters').insert({
        ...payload,
        started_at: new Date().toISOString(),
        created_by: actorId,
      });
  if (error && error.code !== '42P01') console.warn('[reinstate] roster upsert failed', error);
}

async function resyncClassCount(admin: SupabaseClient, classId: string) {
  const { data } = await (admin as any).rpc('active_class_student_count', { p_class_id: classId });
  await admin.from('classes').update({ current_students: Number(data ?? 0) }).eq('id', classId);
}

/**
 * Move an existing student (often withdrawn) into a destination class, keeping the same
 * portal account + records, while assigning current class ownership:
 * - portal_users.primary_teacher_id
 * - class_term_rosters active on dest / withdrawn on previous class
 */
export async function reinstateStudentToClass(
  admin: SupabaseClient,
  opts: ReinstateToClassOptions,
): Promise<ReinstateToClassResult> {
  const { studentId, classId, actor, grade, classArm } = opts;
  // Direct claim / admin: bypass every ownership + transfer gate.
  const force = opts.forceCrossTeacher === true || actor.role === 'admin';

  const [{ data: student }, { data: cls }] = await Promise.all([
    admin
      .from('portal_users')
      .select('id, full_name, email, role, school_id, school_name, class_id, primary_teacher_id, is_deleted, is_active')
      .eq('id', studentId)
      .maybeSingle(),
    admin
      .from('classes')
      .select('id, name, school_id, program_id, term_id, teacher_id, max_students, qa_grade_key, qa_grade_band')
      .eq('id', classId)
      .maybeSingle(),
  ]);

  if (!student || student.role !== 'student' || student.is_deleted) {
    return { ok: false, code: 'NOT_FOUND', error: 'Student account not found or deleted.' };
  }
  if (!cls) {
    return { ok: false, code: 'NOT_FOUND', error: 'Destination class not found.' };
  }

  // School boundary â€” force claim still requires same school (by id or name), but
  // never asks for a transfer request.
  if (cls.school_id && student.school_id && student.school_id !== cls.school_id) {
    const { data: school } = await admin.from('schools').select('name').eq('id', cls.school_id).maybeSingle();
    const destName = (school?.name ?? '').trim().toLowerCase();
    const studentName = (student.school_name ?? '').trim().toLowerCase();
    const sameByName = Boolean(destName && studentName && destName === studentName);
    if (!sameByName) {
      return {
        ok: false,
        code: 'SCHOOL',
        error: `"${student.full_name}" belongs to a different school and cannot join this class.`,
      };
    }
  }

  // Destination ownership: teachers normally may only manage their own class.
  // forceCrossTeacher / admin: any authorised staff may claim directly.
  if (
    !force
    && actor.role === 'teacher'
    && cls.teacher_id
    && cls.teacher_id !== actor.id
  ) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      error: 'Only the primary owner of this class can reinstate students into it.',
    };
  }

  const prevClassId = student.class_id ?? null;
  let wasWithdrawn = false;
  let prevOwnerTeacherId: string | null = null;

  if (prevClassId && prevClassId !== classId) {
    const { data: prevClass } = await admin
      .from('classes')
      .select('id, teacher_id')
      .eq('id', prevClassId)
      .maybeSingle();
    prevOwnerTeacherId = prevClass?.teacher_id ?? student.primary_teacher_id ?? null;

    const { data: prevRoster } = await (admin as any)
      .from('class_term_rosters')
      .select('id, status')
      .eq('class_id', prevClassId)
      .eq('student_id', studentId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Missing roster while class_id is set â†’ treat as still active (same as enroll PUT).
    const prevStatus = ((prevRoster as { status?: string } | null)?.status ?? 'active').toLowerCase();
    wasWithdrawn = prevStatus !== 'active';

    // Active under another teacher â†’ block unless force/admin (direct claim bypasses this).
    if (
      !force
      && actor.role === 'teacher'
      && prevOwnerTeacherId
      && prevOwnerTeacherId !== actor.id
      && prevStatus === 'active'
    ) {
      return {
        ok: false,
        code: 'OTHER_TEACHER',
        error: `"${student.full_name}" is still active in another teacher's class. Send a transfer request, or ask an admin to move them.`,
      };
    }
  } else if (prevClassId === classId) {
    const { data: sameRoster } = await (admin as any)
      .from('class_term_rosters')
      .select('status')
      .eq('class_id', classId)
      .eq('student_id', studentId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const sameStatus = ((sameRoster as { status?: string } | null)?.status ?? 'active').toLowerCase();
    wasWithdrawn = sameStatus !== 'active' || student.is_active === false;
  } else if (!prevClassId && student.primary_teacher_id && student.primary_teacher_id !== actor.id && !force && actor.role === 'teacher') {
    // Owned by another teacher but not currently on a class â€” still require force/admin.
    return {
      ok: false,
      code: 'OTHER_TEACHER',
      error: `"${student.full_name}" is owned by another teacher. Send a transfer request, or use paste-name claim / ask an admin.`,
    };
  }

  // Capacity (skip if already on this class)
  if (prevClassId !== classId && cls.max_students != null && cls.max_students > 0) {
    const { data: activeCount } = await (admin as any).rpc('active_class_student_count', { p_class_id: classId });
    const count = Number(activeCount ?? 0);
    if ((count ?? 0) >= cls.max_students) {
      return {
        ok: false,
        code: 'CAPACITY',
        error: `Class "${cls.name}" is full (${count}/${cls.max_students}).`,
      };
    }
  }

  // Full ownership always lands on the destination class owner.
  // If the class has no teacher assigned yet, the claiming teacher becomes the owner.
  const ownerTeacherId = cls.teacher_id ?? (actor.role === 'teacher' ? actor.id : null);

  // When force-claiming into an unowned class as a teacher, also stamp the class owner
  // so subsequent ownership checks stay coherent.
  if (force && actor.role === 'teacher' && !cls.teacher_id) {
    await admin
      .from('classes')
      .update({ teacher_id: actor.id, updated_at: new Date().toISOString() })
      .eq('id', classId)
      .is('teacher_id', null);
  }

  const effectiveOwnerId = ownerTeacherId ?? (force && actor.role === 'teacher' ? actor.id : null);

  const portalUpdate: Record<string, unknown> = {
    class_id: classId,
    section_class: cls.name,
    school_id: cls.school_id ?? student.school_id,
    updated_at: new Date().toISOString(),
    is_active: true,
  };
  // Always stamp ownership on force claim / when we know the destination owner.
  if (effectiveOwnerId) portalUpdate.primary_teacher_id = effectiveOwnerId;
  if (grade?.trim()) portalUpdate.grade = grade.trim();
  if (classArm?.trim()) portalUpdate.class_arm = classArm.trim().toUpperCase();
  if (cls.school_id) {
    const { data: school } = await admin.from('schools').select('name').eq('id', cls.school_id).maybeSingle();
    if (school?.name) portalUpdate.school_name = school.name;
  }

  const { error: portalErr } = await admin
    .from('portal_users')
    .update(portalUpdate)
    .eq('id', studentId)
    .eq('role', 'student');
  if (portalErr) {
    return { ok: false, code: 'UPDATE', error: `Failed to move student: ${portalErr.message}` };
  }

  const registryUpdate: Record<string, unknown> = {
    school_id: (portalUpdate.school_id as string) ?? cls.school_id,
    school_name: (portalUpdate.school_name as string) ?? null,
    section: cls.name,
    current_class: cls.name,
    updated_at: new Date().toISOString(),
    is_active: true,
    status: 'active',
  };
  if (grade?.trim()) {
    registryUpdate.grade = grade.trim();
    registryUpdate.grade_level = grade.trim();
  }
  const { error: registryErr } = await admin.from('students').update(registryUpdate).eq('user_id', studentId);
  if (registryErr) {
    console.warn('[reinstate] registry sync failed', registryErr);
  }

  // Withdraw previous class roster (keep history)
  if (prevClassId && prevClassId !== classId) {
    const { data: prevCls } = await admin
      .from('classes')
      .select('id, term_id, school_id, program_id')
      .eq('id', prevClassId)
      .maybeSingle();
    if (prevCls) {
      await upsertRoster(admin, prevCls as any, studentId, 'withdrawn', actor.id);
    }
  }

  await upsertRoster(admin, cls as any, studentId, 'active', actor.id);

  // Programme enrollment
  if (cls.program_id) {
    const { data: existing } = await admin
      .from('enrollments')
      .select('id, status')
      .eq('user_id', studentId)
      .eq('program_id', cls.program_id)
      .maybeSingle();
    if (!existing) {
      await admin.from('enrollments').insert({
        user_id: studentId,
        program_id: cls.program_id,
        role: 'student',
        status: 'active',
      });
    } else if (existing.status !== 'active') {
      await admin
        .from('enrollments')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    }
  }
  // Class moves never rewrite historical or manually entered report authorship.
  const reportsTransferred = 0;

  // Direct claim supersedes any pending transfer paperwork for this student.
  if (force) {
    try {
      await (admin as any)
        .from('student_transfer_requests')
        .update({
          status: 'cancelled',
          decision_note: 'Superseded by direct class claim',
          decided_by: actor.id,
          decided_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('student_id', studentId)
        .eq('status', 'pending');
    } catch (e) {
      console.warn('[reinstate] pending transfer cancel failed', e);
    }
  }

  await resyncClassCount(admin, classId);
  if (prevClassId && prevClassId !== classId) {
    await resyncClassCount(admin, prevClassId);
  }

  await admin.from('audit_logs').insert({
    user_id: actor.id,
    action: force ? 'student_direct_claimed_to_class' : 'student_reinstated_to_class',
    table_name: 'portal_users',
    record_id: studentId,
    new_values: {
      from_class_id: prevClassId,
      to_class_id: classId,
      to_class_name: cls.name,
      owner_teacher_id: effectiveOwnerId,
      reports_transferred: reportsTransferred,
      was_withdrawn: wasWithdrawn,
      primary_teacher_id: effectiveOwnerId,
      force_cross_teacher: force,
      previous_owner_teacher_id: prevOwnerTeacherId,
    },
  });

  return {
    ok: true,
    studentId,
    fullName: student.full_name,
    email: student.email ?? '',
    fromClassId: prevClassId,
    toClassId: classId,
    toClassName: cls.name,
    ownerTeacherId: effectiveOwnerId,
    reportsTransferred,
    wasWithdrawn,
  };
}
