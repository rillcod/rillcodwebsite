import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff(): Promise<{ role: string; id: string; school_id: string | null } | { _err: string } | null> {
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
  return caller;
}

// GET /api/classes/[id]/enroll
// Returns students not yet assigned to this class, scoped to caller's school(s)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json({ error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' }, { status: 403 });
  }
  const caller = staffResult;

  const { id: classId } = await params;
  const admin = adminClient();

  // Get the class to determine its school — use class's school_id as the primary filter.
  // This ensures teachers can always see students at the class's school even if the
  // teacher's own school_id changed (e.g. Hilltop students becoming inaccessible after
  // teacher reassignment).
  const { data: cls } = await admin
    .from('classes')
    .select('school_id')
    .eq('id', classId)
    .single();

  // Build school ID filter — class school takes priority over caller's school
  let schoolIds: string[] = [];

  if (cls?.school_id) {
    // Always include the class's own school
    schoolIds = [cls.school_id];
  }

  if (caller.role === 'admin') {
    schoolIds = []; // Admin sees all — no school filter
  } else if (caller.role === 'school' && caller.school_id) {
    if (!schoolIds.includes(caller.school_id)) schoolIds.push(caller.school_id);
  } else if (caller.role === 'teacher') {
    // Also include teacher's own schools so they can pull in students from other schools
    const ids: string[] = [...schoolIds];
    if (caller.school_id && !ids.includes(caller.school_id)) ids.push(caller.school_id);
    const { data: ts } = await admin
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', caller.id);
    (ts ?? []).forEach((r: any) => { if (r.school_id && !ids.includes(r.school_id)) ids.push(r.school_id); });
    schoolIds = ids;
  }

  let query = admin
    .from('portal_users')
    .select('id, full_name, email, school_id, school_name, section_class, class_id')
    .eq('role', 'student')
    .or('is_active.eq.true,is_active.is.null');

  if (caller.role === 'admin') {
    // Admin sees every student — no school filter applied
  } else if (schoolIds.length === 0) {
    // Non-admin with no school assignments — return nothing to prevent exposing all students
    return NextResponse.json({ students: [] }, { headers: { 'Cache-Control': 'no-store' } });
  } else {
    // Fetch the names of the schools in scope to also match legacy school_name records
    const { data: schoolRows } = await admin
      .from('schools')
      .select('name')
      .in('id', schoolIds);
    const schoolNames = (schoolRows ?? []).map((s: any) => s.name as string).filter(Boolean);

    // Include ONLY students from this teacher's/school's jurisdiction:
    // 1. school_id matches one of the scoped schools (properly linked)
    // 2. school_id=null but school_name matches (legacy record — registered mentioning this school)
    // Exclude: students with school_id=null + school_name=null (unclaimed, no jurisdiction)
    //          and students with school_id=null + a DIFFERENT school_name (another school's students)
    const idPart = `school_id.in.(${schoolIds.join(',')})`;
    const namePart = schoolNames.length > 0
      ? schoolNames.map(n => `and(school_id.is.null,school_name.eq.${JSON.stringify(n)})`).join(',')
      : '';
    const orClause = [idPart, namePart].filter(Boolean).join(',');
    if (!orClause) {
      return NextResponse.json({ students: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }
    query = query.or(orClause) as any;
  }

  const { data: allData, error } = await query.order('full_name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Exclude students already in THIS class; unassigned students sort first
  const students = (allData ?? [])
    .filter((u: any) => u.class_id !== classId)
    .sort((a: any, b: any) => {
      if (!a.class_id && b.class_id) return -1;
      if (a.class_id && !b.class_id) return 1;
      return 0;
    });

  return NextResponse.json({ students }, { headers: { 'Cache-Control': 'no-store' } });
}

// POST /api/classes/[id]/enroll
// Body: { studentId: string }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json({ error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' }, { status: 403 });
  }
  const caller = staffResult;

  const { id: classId } = await params;
  const { studentId } = await request.json();
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  const admin = adminClient();

  const { data: cls, error: clsErr } = await admin
    .from('classes')
    .select('id, name, program_id, current_students, school_id')
    .eq('id', classId)
    .single();

  if (clsErr || !cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  // School boundary check — non-admins cannot enroll a student from a different school
  if (caller.role !== 'admin' && cls.school_id) {
    const { data: student } = await admin
      .from('portal_users')
      .select('school_id')
      .eq('id', studentId)
      .single();

    if (!student?.school_id || student.school_id !== cls.school_id) {
      return NextResponse.json(
        { error: 'School boundary violation: this student belongs to a different school and cannot be enrolled in this class.' },
        { status: 403 },
      );
    }
  }

  // Assign student to this class via class_id FK
  const { error: updateErr } = await admin
    .from('portal_users')
    .update({ class_id: classId })
    .eq('id', studentId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Bump current_students count
  await admin
    .from('classes')
    .update({ current_students: (cls.current_students ?? 0) + 1 })
    .eq('id', classId);

  // Ensure program enrollment exists
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

  return NextResponse.json({ success: true });
}

// PUT /api/classes/[id]/enroll
// Body: { studentIds: string[] } — batch-enroll multiple students at once
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json({ error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' }, { status: 403 });
  }
  const caller = staffResult;

  const { id: classId } = await params;
  const { studentIds } = await request.json();
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return NextResponse.json({ error: 'studentIds array required' }, { status: 400 });
  }

  const admin = adminClient();
  const { data: cls } = await admin.from('classes').select('id, program_id, current_students, school_id').eq('id', classId).single();
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  // School boundary check — silently exclude students from a different school
  let allowedIds = studentIds;
  if (caller.role !== 'admin' && cls.school_id) {
    const { data: studentRows } = await admin
      .from('portal_users')
      .select('id, school_id')
      .in('id', studentIds)
      .eq('role', 'student');

    allowedIds = (studentRows ?? [])
      .filter((s: any) => s.school_id && s.school_id === cls.school_id)
      .map((s: any) => s.id);

    if (allowedIds.length === 0) {
      return NextResponse.json({ error: 'No eligible students: all selected students belong to a different school.' }, { status: 403 });
    }
  }

  // Batch-assign class_id
  const { error: updateErr } = await admin
    .from('portal_users')
    .update({ class_id: classId })
    .in('id', allowedIds)
    .eq('role', 'student');

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Sync current_students count
  const { count } = await admin
    .from('portal_users')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId)
    .eq('role', 'student');
  await admin.from('classes').update({ current_students: count ?? 0 }).eq('id', classId);

  // Ensure program enrollments exist
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

  return NextResponse.json({ enrolled: allowedIds.length, skipped: studentIds.length - allowedIds.length, total: count ?? 0 });
}

// DELETE /api/classes/[id]/enroll
// Body: { studentId: string }
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json({ error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' }, { status: 403 });
  }
  const caller = staffResult;

  const { id: classId } = await params;
  const { studentId } = await request.json();
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  const admin = adminClient();

  const { data: cls } = await admin
    .from('classes')
    .select('current_students')
    .eq('id', classId)
    .single();

  const { error } = await admin
    .from('portal_users')
    .update({ class_id: null })
    .eq('id', studentId)
    .eq('class_id', classId); // safety: only remove if actually in this class

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin
    .from('classes')
    .update({ current_students: Math.max(0, (cls?.current_students ?? 1) - 1) })
    .eq('id', classId);

  return NextResponse.json({ success: true });
}
