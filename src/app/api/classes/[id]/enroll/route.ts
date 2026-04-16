import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { queueService } from '@/services/queue.service';

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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/classes/[id]/enroll
// Returns students eligible for this class (scoped to its school), sorted so
// unassigned students come first.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json(
      { error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' },
      { status: 403 },
    );
  }
  const caller = staffResult as Caller;
  const { id: classId } = await params;
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
  { params }: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json(
      { error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' },
      { status: 403 },
    );
  }
  const caller = staffResult as Caller;

  const { id: classId } = await params;
  const body = await request.json();
  const studentId: string | undefined = body.studentId;
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  const admin = adminClient();

  // Fetch class — include max_students for the capacity guard
  const { data: cls, error: clsErr } = await admin
    .from('classes')
    .select('id, name, program_id, max_students, school_id')
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
  if (caller.role !== 'admin' && cls.school_id) {
    const { data: clsSchool } = await admin.from('schools').select('name').eq('id', cls.school_id).single();
    const { data: student } = await admin
      .from('portal_users')
      .select('school_id, school_name, full_name')
      .eq('id', studentId)
      .single();

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

  // Assign student → class; keep section_class in sync
  const { error: updateErr } = await admin
    .from('portal_users')
    .update({ class_id: classId, section_class: cls.name })
    .eq('id', studentId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

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
      .select('id')
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
    }
  }

  // WhatsApp Alert
  queueService.queueNotification(studentId, 'whatsapp', {
    body: `Welcome! You have been successfully enrolled in "${cls.name}". Log in to your Rillcod dashboard to access your learning materials.`
  }).catch(console.error);

  return NextResponse.json({ success: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/classes/[id]/enroll
// Body: { studentIds: string[] } — batch-enrol multiple students at once
// ─────────────────────────────────────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json(
      { error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' },
      { status: 403 },
    );
  }
  const caller = staffResult as Caller;

  const { id: classId } = await params;
  const body = await request.json();
  const studentIds: string[] | undefined = body.studentIds;
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return NextResponse.json({ error: 'studentIds array required' }, { status: 400 });
  }

  const admin = adminClient();

  // Fetch class — include max_students for the capacity guard
  const { data: cls } = await admin
    .from('classes')
    .select('id, name, program_id, max_students, school_id')
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

  // Batch-assign class_id and keep section_class in sync
  const { error: updateErr } = await admin
    .from('portal_users')
    .update({ class_id: classId, section_class: cls.name })
    .in('id', allowedIds)
    .eq('role', 'student');

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

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
        .select('id')
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
      }
    }
  }

  // WhatsApp Alert for Batch Enrollment
  for (const sid of allowedIds) {
    queueService.queueNotification(sid, 'whatsapp', {
      body: `Welcome! You have been successfully enrolled in "${cls.name}". Log in to your Rillcod dashboard to access your learning materials.`
    }).catch(console.error);
  }

  return NextResponse.json({
    enrolled: allowedIds.length,
    skipped: studentIds.length - allowedIds.length,
    rejectedSchoolBoundary: rejectedNames,
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
  { params }: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json(
      { error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' },
      { status: 403 },
    );
  }
  const caller = staffResult as Caller;
  const { id: classId } = await params;
  const admin = adminClient();

  // Fetch class school for the access guard
  const { data: cls } = await admin.from('classes').select('school_id').eq('id', classId).single();

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

  const { error } = await admin
    .from('portal_users')
    .update({ class_id: null, section_class: null })
    .in('id', ids)
    .eq('class_id', classId); // safety: only remove students actually in this class

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resync class count (exact — never drift)
  const { count: afterCount } = await admin
    .from('portal_users')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId)
    .eq('role', 'student');
  await admin.from('classes').update({ current_students: afterCount ?? 0 }).eq('id', classId);

  return NextResponse.json({ success: true, removed: ids.length });
}
