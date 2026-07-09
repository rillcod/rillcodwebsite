import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { queueService } from '@/services/queue.service';
import { buildRillcodTransactionalEmailHtml, escapeHtml } from '@/lib/email/rillcod-transactional-email';
import { defaultRosterBillingPayload } from '@/lib/rosters/billing-sync';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function requireStaff(): Promise<Caller | { _err: string } | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { _err: `auth:${error?.message ?? 'no user'}` };
  const { data: caller, error: dbErr } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller) return { _err: `profile:${dbErr?.message ?? 'not found'} uid=${user.id}` };
  if (!['admin', 'teacher', 'school'].includes(caller.role)) return { _err: `role:${caller.role}` };
  return caller as Caller;
}

/**
 * Returns true if the calling staff member is allowed to manage students in the given class.
 * - admin:  always allowed
 * - school: class must belong to their school
 * - teacher: class must belong to one of their assigned schools
 */
async function callerHasClassAccess(caller: Caller, classSchoolId: string | null): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (!classSchoolId) return true; // class has no school restriction

  if (caller.role === 'school') {
    return caller.school_id === classSchoolId;
  }

  if (caller.role === 'teacher') {
    if (caller.school_id === classSchoolId) return true;
    const { data: ts } = await adminClient()
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', caller.id)
      .eq('school_id', classSchoolId)
      .maybeSingle();
    return !!ts;
  }

  return false;
}

async function upsertClassTermRoster(
  admin: ReturnType<typeof adminClient>,
  cls: { id: string; term_id?: string | null; school_id?: string | null; program_id?: string | null },
  studentIds: string[],
  status: 'active' | 'paused' | 'withdrawn' | 'completed',
  actorId: string,
) {
  if (studentIds.length === 0) return;
  for (const studentId of studentIds) {
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
      console.warn('[class_term_rosters] lookup failed', lookupErr);
      continue;
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
    if (error?.code === '42P01') return;
    if (error) console.warn('[class_term_rosters] upsert failed', error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/classes/[id]/enroll
// Returns students eligible for this class (scoped to its school), sorted so
// unassigned students come first.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json(
      { error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' },
      { status: 403 },
    );
  }
  const caller = staffResult as Caller;
  const { id: classId } = await context.params;
  const admin = adminClient();

  // Fetch the class to determine its school
  const { data: cls } = await admin
    .from('classes')
    .select('school_id')
    .eq('id', classId)
    .single();

  // Non-admin: verify they have access to this class's school
  if (caller.role !== 'admin') {
    const hasAccess = await callerHasClassAccess(caller, cls?.school_id ?? null);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied to this class' }, { status: 403 });
    }
  }

  let query = admin
    .from('portal_users')
    .select('id, full_name, email, school_id, school_name, section_class, class_id, classes:class_id(id, name)')
    .eq('role', 'student')
    .or('is_active.eq.true,is_active.is.null');

  if (caller.role === 'admin') {
    // Admin sees every student — no school filter
  } else if (cls?.school_id) {
    // Scope strictly to this class's school only.
    // This is the key guard: teachers/school users can only see students from the
    // class's school, NOT from all their assigned schools. This prevents accidental
    // cross-school enrolment via the picker.
    const { data: schoolRow } = await admin.from('schools').select('name').eq('id', cls.school_id).single();
    const schoolName = schoolRow?.name ?? null;

    const idPart = `school_id.eq.${cls.school_id}`;
    const namePart = schoolName
      ? `and(school_id.is.null,school_name.eq.${JSON.stringify(schoolName)})`
      : '';
    const orClause = [idPart, namePart].filter(Boolean).join(',');
    query = query.or(orClause) as any;
  } else {
    // Class has no school — non-admins see nothing (no unconstrained exposure)
    if (caller.role !== 'admin') {
      return NextResponse.json({ students: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }
  }

  const { data: allData, error } = await query.order('full_name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Exclude students already IN this class; unassigned students sort first
  const students = (allData ?? [])
    .filter((u: any) => u.class_id !== classId)
    .sort((a: any, b: any) => {
      if (!a.class_id && b.class_id) return -1;
      if (a.class_id && !b.class_id) return 1;
      return 0;
    });

  return NextResponse.json({ students }, { headers: { 'Cache-Control': 'no-store' } });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/classes/[id]/enroll
// Body: { studentId: string } — enrol a single student
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json(
      { error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' },
      { status: 403 },
    );
  }
  const caller = staffResult as Caller;

  const { id: classId } = await context.params;
  const body = await request.json();
  const studentId: string | undefined = body.studentId;
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  const admin = adminClient();

  // Fetch class — include max_students for the capacity guard
  const { data: cls, error: clsErr } = await admin
    .from('classes')
    .select('id, name, program_id, max_students, school_id, term_id, teacher_id')
    .eq('id', classId)
    .single();

  if (clsErr || !cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  // ── Caller school/class access guard ─────────────────────────────────────
  const hasAccess = await callerHasClassAccess(caller, cls.school_id ?? null);
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'Access denied: you are not assigned to the school this class belongs to.' },
      { status: 403 },
    );
  }

  // ── School boundary guard (hard reject) ──────────────────────────────────
  let studentProfile: any = null;
  if (caller.role !== 'admin' && cls.school_id) {
    const { data: clsSchool } = await admin.from('schools').select('name').eq('id', cls.school_id).single();
    const { data: student } = await admin
      .from('portal_users')
      .select('school_id, school_name, full_name, class_id')
      .eq('id', studentId)
      .single();
    studentProfile = student;

    const sameById   = student?.school_id === cls.school_id;
    const sameByName = clsSchool?.name && student?.school_name === clsSchool.name;
    if (!sameById && !sameByName) {
      return NextResponse.json(
        {
          error: `School boundary violation: "${student?.full_name ?? studentId}" belongs to a different school and cannot be enrolled in this class.`,
        },
        { status: 403 },
      );
    }
  }

  // ── Teacher-class ownership guard (single enroll) ─────────────────────────
  if (caller.role === 'teacher') {
    const currentClassId = studentProfile?.class_id ?? null;
    if (currentClassId && currentClassId !== classId) {
      const { data: currentClass } = await admin
        .from('classes')
        .select('teacher_id, name')
        .eq('id', currentClassId)
        .maybeSingle();
      if (currentClass?.teacher_id && currentClass.teacher_id !== caller.id) {
        return NextResponse.json(
          {
            error: `"${studentProfile?.full_name ?? studentId}" is already in "${currentClass.name}" which belongs to another teacher. Only an admin can reassign them.`,
          },
          { status: 409 },
        );
      }
    }
  }

  // ── Capacity guard ────────────────────────────────────────────────────────
  if (cls.max_students != null && cls.max_students > 0) {
    const { count: liveCount } = await admin
      .from('portal_users')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('role', 'student');
    const occupied = liveCount ?? 0;
    if (occupied >= cls.max_students) {
      return NextResponse.json(
        {
          error: `Class "${cls.name}" is full (${occupied}/${cls.max_students} students). Increase the capacity or remove a student first.`,
        },
        { status: 409 },
      );
    }
  }

  // Capture previous class for count resync
  const { data: studentBefore } = await admin
    .from('portal_users')
    .select('class_id')
    .eq('id', studentId)
    .single();
  const prevClassId = studentBefore?.class_id ?? null;

  // Assign student → class; keep section_class in sync. Set primary_teacher_id to
  // the destination class teacher so the guard_student_class_division trigger
  // treats this as an authorized transfer (see batch PUT for the full rationale).
  const authorizedTeacher = cls.teacher_id ?? (caller.role === 'teacher' ? caller.id : null);
  const movePayload: Record<string, unknown> = { class_id: classId, section_class: cls.name };
  if (authorizedTeacher) movePayload.primary_teacher_id = authorizedTeacher;

  const { error: updateErr } = await admin
    .from('portal_users')
    .update(movePayload)
    .eq('id', studentId)
    .eq('role', 'student');

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await admin.from('students').update({ class_id: classId }).eq('user_id', studentId);

  await upsertClassTermRoster(admin, cls, [studentId], 'active', caller.id);

  // Resync new class count (exact — never drift)
  const { count: newCount } = await admin
    .from('portal_users')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId)
    .eq('role', 'student');
  await admin.from('classes').update({ current_students: newCount ?? 0 }).eq('id', classId);

  // Resync old class count if student was moved from elsewhere
  if (prevClassId && prevClassId !== classId) {
    const { count: oldCount } = await admin
      .from('portal_users')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', prevClassId)
      .eq('role', 'student');
    await admin.from('classes').update({ current_students: oldCount ?? 0 }).eq('id', prevClassId);
  }

  // Ensure program enrollment record exists
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

  // Enrollment email notification
  (async () => {
    const { data: student } = await admin.from('portal_users').select('email, full_name').eq('id', studentId).single();
    if (!student?.email) return;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
    const html = buildRillcodTransactionalEmailHtml({
      title: `Enrolled in ${cls.name}`,
      bodyHtml: `<p>Hi ${escapeHtml(student.full_name?.split(' ')[0] || 'there')},</p>
        <p>You have been successfully enrolled in <strong>${escapeHtml(cls.name)}</strong>. Your learning materials are ready.</p>`,
      summaryRows: [{ label: 'Class', value: cls.name }],
      cta: { href: `${appUrl}/dashboard`, label: 'Go to Dashboard' },
    });
    await queueService.queueNotification(studentId, 'email', {
      to: student.email,
      subject: `Enrolled in ${cls.name}`,
      html,
    });
  })().catch(console.error);

  return NextResponse.json({ success: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/classes/[id]/enroll
// Body: { studentIds: string[] } — batch-enrol multiple students at once
// ─────────────────────────────────────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json(
      { error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' },
      { status: 403 },
    );
  }
  const caller = staffResult as Caller;

  const { id: classId } = await context.params;
  const body = await request.json();
  const studentIds: string[] | undefined = body.studentIds;
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return NextResponse.json({ error: 'studentIds array required' }, { status: 400 });
  }

  const admin = adminClient();

  // Fetch class — include max_students for the capacity guard, teacher_id for authorized transfer
  const { data: cls } = await admin
    .from('classes')
    .select('id, name, program_id, max_students, school_id, term_id, teacher_id')
    .eq('id', classId)
    .single();
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  // ── Caller school/class access guard ─────────────────────────────────────
  const hasAccess = await callerHasClassAccess(caller, cls.school_id ?? null);
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'Access denied: you are not assigned to the school this class belongs to.' },
      { status: 403 },
    );
  }

  // ── School boundary guard — filter out cross-school students ─────────────
  let allowedIds: string[] = studentIds;
  let rejectedNames: string[] = [];

  if (caller.role !== 'admin' && cls.school_id) {
    const { data: clsSchool } = await admin.from('schools').select('name').eq('id', cls.school_id).single();
    const clsSchoolName = clsSchool?.name ?? null;

    const { data: studentRows } = await admin
      .from('portal_users')
      .select('id, full_name, school_id, school_name')
      .in('id', studentIds)
      .eq('role', 'student');

    const eligible = (studentRows ?? []).filter((s: any) => {
      const sameById   = s.school_id === cls.school_id;
      const sameByName = clsSchoolName && s.school_name === clsSchoolName;
      return sameById || sameByName;
    });
    const rejected = (studentRows ?? []).filter((s: any) => !eligible.some((e: any) => e.id === s.id));

    rejectedNames = rejected.map((s: any) => s.full_name ?? s.id);
    allowedIds = eligible.map((s: any) => s.id);

    if (allowedIds.length === 0) {
      return NextResponse.json(
        {
          error: `School boundary violation: none of the selected students belong to this class's school.`,
          rejected: rejectedNames,
        },
        { status: 403 },
      );
    }
  }

  // ── Teacher-class ownership guard ─────────────────────────────────────────
  // Teachers cannot silently poach students out of another teacher's class.
  // Only admins can move students across teacher-owned classes.
  let rejectedOtherTeacher: string[] = [];
  if (caller.role === 'teacher' && allowedIds.length > 0) {
    const { data: studentsWithClass } = await admin
      .from('portal_users')
      .select('id, full_name, class_id')
      .in('id', allowedIds)
      .not('class_id', 'is', null)
      .neq('class_id', classId)
      .eq('role', 'student');

    if ((studentsWithClass ?? []).length > 0) {
      const occupiedClassIds = [...new Set((studentsWithClass ?? []).map((s: any) => s.class_id))];
      const { data: occupiedClasses } = await admin
        .from('classes')
        .select('id, teacher_id')
        .in('id', occupiedClassIds);

      const otherTeacherClassIds = new Set(
        (occupiedClasses ?? [])
          .filter((c: any) => c.teacher_id && c.teacher_id !== caller.id)
          .map((c: any) => c.id),
      );

      if (otherTeacherClassIds.size > 0) {
        const protected_ = (studentsWithClass ?? []).filter((s: any) => otherTeacherClassIds.has(s.class_id));
        const protectedIds = new Set(protected_.map((s: any) => s.id));
        rejectedOtherTeacher = protected_.map((s: any) => s.full_name ?? s.id);
        allowedIds = allowedIds.filter((id) => !protectedIds.has(id));

        if (allowedIds.length === 0) {
          return NextResponse.json(
            {
              error: `Cannot move students: ${rejectedOtherTeacher.length} student(s) already belong to another teacher's class and can only be moved by an admin.`,
              protectedStudents: rejectedOtherTeacher,
            },
            { status: 409 },
          );
        }
      }
    }
  }

  // ── Capacity guard ────────────────────────────────────────────────────────
  if (cls.max_students != null && cls.max_students > 0) {
    // Students already IN this class being re-assigned don't consume extra seats
    const { data: alreadyIn } = await admin
      .from('portal_users')
      .select('id')
      .in('id', allowedIds)
      .eq('class_id', classId)
      .eq('role', 'student');
    const netNew = allowedIds.length - (alreadyIn ?? []).length;

    const { count: liveCount } = await admin
      .from('portal_users')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('role', 'student');
    const occupied = liveCount ?? 0;
    const seatsLeft = cls.max_students - occupied;

    if (netNew > seatsLeft) {
      return NextResponse.json(
        {
          error: `Not enough seats: "${cls.name}" has ${seatsLeft} seat${seatsLeft !== 1 ? 's' : ''} available but you're trying to add ${netNew} new student${netNew !== 1 ? 's' : ''}. Reduce your selection or increase the class capacity.`,
          seatsAvailable: seatsLeft,
          netNewRequested: netNew,
        },
        { status: 409 },
      );
    }
  }

  // Capture previous classes for count resync
  const { data: studentsBefore } = await admin
    .from('portal_users')
    .select('id, class_id')
    .in('id', allowedIds)
    .eq('role', 'student');
  const prevClassIds = [
    ...new Set(
      (studentsBefore ?? [])
        .map((s: any) => s.class_id)
        .filter((cid: any) => cid && cid !== classId),
    ),
  ];

  // Batch-assign class_id and keep section_class in sync.
  // Also set primary_teacher_id to the destination class teacher so the
  // guard_student_class_division trigger treats this as an AUTHORIZED transfer
  // (moving a student already owned by another teacher is otherwise blocked at
  // the DB level). Falls back to the calling teacher when the class has no tutor.
  const authorizedTeacher = cls.teacher_id ?? (caller.role === 'teacher' ? caller.id : null);
  const movePayload: Record<string, unknown> = { class_id: classId, section_class: cls.name };
  if (authorizedTeacher) movePayload.primary_teacher_id = authorizedTeacher;

  const { error: updateErr } = await admin
    .from('portal_users')
    .update(movePayload)
    .in('id', allowedIds)
    .eq('role', 'student');

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Keep the legacy students table aligned so rosters, cards and reports resolve
  // the same class no matter which table a downstream feature reads.
  await admin.from('students').update({ class_id: classId }).in('user_id', allowedIds);

  await upsertClassTermRoster(admin, cls, allowedIds, 'active', caller.id);

  // Resync new class count (exact — never drift)
  const { count } = await admin
    .from('portal_users')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId)
    .eq('role', 'student');
  await admin.from('classes').update({ current_students: count ?? 0 }).eq('id', classId);

  // Resync counts on all classes students were moved FROM
  for (const prevCid of prevClassIds) {
    const { count: oldCount } = await admin
      .from('portal_users')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', prevCid)
      .eq('role', 'student');
    await admin.from('classes').update({ current_students: oldCount ?? 0 }).eq('id', prevCid);
  }

  // Ensure program enrollment records exist
  if (cls.program_id) {
    for (const sid of allowedIds) {
      const { data: existing } = await admin
        .from('enrollments')
        .select('id, status')
        .eq('user_id', sid)
        .eq('program_id', cls.program_id)
        .maybeSingle();
      if (!existing) {
        await admin.from('enrollments').insert({
          user_id: sid,
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
  }

  // Enrollment email notifications for batch (fire-and-forget)
  (async () => {
    const { data: students } = await admin.from('portal_users').select('id, email, full_name').in('id', allowedIds).eq('role', 'student');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
    for (const student of students ?? []) {
      if (!student.email) continue;
      const html = buildRillcodTransactionalEmailHtml({
        title: `Enrolled in ${cls.name}`,
        bodyHtml: `<p>Hi ${escapeHtml(student.full_name?.split(' ')[0] || 'there')},</p>
          <p>You have been successfully enrolled in <strong>${escapeHtml(cls.name)}</strong>. Your learning materials are ready.</p>`,
        summaryRows: [{ label: 'Class', value: cls.name }],
        cta: { href: `${appUrl}/dashboard`, label: 'Go to Dashboard' },
      });
      await queueService.queueNotification(student.id, 'email', {
        to: student.email,
        subject: `Enrolled in ${cls.name}`,
        html,
      });
    }
  })().catch(console.error);

  return NextResponse.json({
    enrolled: allowedIds.length,
    enrolledIds: allowedIds,            // precise ids actually moved — lets the UI update optimistically without name-guessing
    skipped: studentIds.length - allowedIds.length,
    rejectedSchoolBoundary: rejectedNames,
    rejectedOtherTeacher,
    total: count ?? 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/classes/[id]/enroll
// Body: { studentId: string }    — single remove
//    OR { studentIds: string[] } — bulk remove
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json(
      { error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' },
      { status: 403 },
    );
  }
  const caller = staffResult as Caller;
  const { id: classId } = await context.params;
  const admin = adminClient();

  // Fetch class school for the access guard
  const { data: cls } = await admin.from('classes').select('id, school_id, program_id, term_id').eq('id', classId).single();

  // ── Caller school/class access guard ─────────────────────────────────────
  const hasAccess = await callerHasClassAccess(caller, cls?.school_id ?? null);
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'Access denied: you are not assigned to the school this class belongs to.' },
      { status: 403 },
    );
  }

  // Normalise single or bulk into an array
  const body = await request.json();
  let ids: string[] = [];
  if (Array.isArray(body.studentIds) && body.studentIds.length > 0) {
    ids = body.studentIds;
  } else if (typeof body.studentId === 'string' && body.studentId) {
    ids = [body.studentId];
  }
  if (ids.length === 0) return NextResponse.json({ error: 'studentId or studentIds required' }, { status: 400 });

  // Two modes:
  //  • Soft unenrol (default): KEEP the class tie so the student is never classless and the
  //    class keeps its history — they're just marked 'withdrawn' in this term's roster.
  //  • Hard remove (body.hard === true): fully WIPE the student account (all FK children +
  //    students + portal_users + auth) — a complete admin-style delete, not just a detach.
  if (body.hard === true) {
    // Only students actually in THIS class can be wiped from here (safety).
    const { data: inClass } = await admin
      .from('portal_users').select('id').in('id', ids).eq('class_id', classId).eq('role', 'student');
    const wipeIds = (inClass ?? []).map((r: any) => r.id);
    let wiped = 0;
    for (const uid of wipeIds) {
      const { error } = await (admin as any).rpc('hard_delete_portal_user', { p_id: uid });
      if (!error) { await admin.auth.admin.deleteUser(uid).catch(() => {}); wiped += 1; }
    }
    // Resync count and return — the accounts no longer exist, so no roster/enrolment steps.
    const { count: afterCount } = await admin
      .from('portal_users').select('id', { count: 'exact', head: true }).eq('class_id', classId).eq('role', 'student');
    await admin.from('classes').update({ current_students: afterCount ?? 0 }).eq('id', classId);
    return NextResponse.json({ success: true, hardDeleted: wiped });
  }

  if (cls) await upsertClassTermRoster(admin, cls, ids, 'withdrawn', caller.id);

  if (cls?.program_id) {
    await admin
      .from('enrollments')
      .update({
        status: 'suspended',
        updated_at: new Date().toISOString(),
        notes: 'Paused from current term class roster; history and reports preserved.',
      })
      .in('user_id', ids)
      .eq('program_id', cls.program_id);
  }

  // Resync class count (exact — never drift)
  const { count: afterCount } = await admin
    .from('portal_users')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId)
    .eq('role', 'student');
  await admin.from('classes').update({ current_students: afterCount ?? 0 }).eq('id', classId);

  return NextResponse.json({ success: true, removed: ids.length });
}
