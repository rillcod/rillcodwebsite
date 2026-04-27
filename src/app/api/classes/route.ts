import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function getCaller(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return null;
  const admin = adminClient();
  const { data: caller } = await admin
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller as Caller;
}

/** Returns all school IDs a teacher is assigned to (primary + teacher_schools). */
async function teacherSchoolIds(caller: Caller): Promise<string[]> {
  const ids: string[] = [];
  if (caller.school_id) ids.push(caller.school_id);
  const { data: ts } = await adminClient()
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', caller.id);
  (ts ?? []).forEach((r: any) => {
    if (r.school_id && !ids.includes(r.school_id)) ids.push(r.school_id);
  });
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/classes
// Returns classes visible to the current user with accurate student counts.
//   admin:   all classes (optionally filtered by ?school_id=)
//   teacher: classes in their assigned school(s) (optionally filtered by ?school_id= if in scope)
//   school:  only classes belonging to their own school
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const admin = adminClient();
    const { searchParams } = new URL(request.url);
    const schoolFilter = searchParams.get('school_id');

    let query = admin
      .from('classes')
      .select(`
        id, name, description, status, max_students, current_students,
        start_date, end_date, schedule, teacher_id, program_id, school_id, created_at,
        programs ( id, name ),
        portal_users!classes_teacher_id_fkey ( id, full_name ),
        schools ( id, name )
      `)
      .order('created_at', { ascending: false });

    if (caller.role === 'admin') {
      // Admin may optionally filter by school
      if (schoolFilter) query = query.eq('school_id', schoolFilter) as any;
    } else if (caller.role === 'school') {
      // School role: strictly limited to their own school only — ignore any schoolFilter param
      if (!caller.school_id) return NextResponse.json({ data: [] });
      query = query.eq('school_id', caller.school_id) as any;
    } else if (caller.role === 'teacher') {
      // Check if isolation is enabled
      const { data: isoSetting } = await admin
        .from('app_settings')
        .select('value')
        .eq('key', 'lms_teacher_isolation')
        .maybeSingle();
      const isIsolated = isoSetting?.value === 'true';

      if (isIsolated) {
        // Teacher ONLY sees classes they personally teach
        query = query.eq('teacher_id', caller.id) as any;
      } else {
        const scopedIds = await teacherSchoolIds(caller);

      if (schoolFilter) {
        // Teacher requesting a specific school — must be in their scope
        if (!scopedIds.includes(schoolFilter)) {
          return NextResponse.json({ data: [] }); // out of scope, return empty not 403
        }
        query = query.eq('school_id', schoolFilter) as any;
      } else if (scopedIds.length > 0) {
        // Default: all classes in their assigned schools + any they personally teach
        query = query.or(
          `teacher_id.eq.${caller.id},school_id.in.(${scopedIds.join(',')})`,
        ) as any;
      } else {
        // Teacher with no school assignments — only classes they personally teach
        query = query.eq('teacher_id', caller.id) as any;
      }
    }
}

    const { data: classes, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const classData = classes ?? [];
    if (classData.length === 0) return NextResponse.json({ data: [] });

    // ── Live student count: count direct class_id assignments only ────────────
    // The program-enrollment fallback (class_id = null) would inflate counts when
    // multiple classes share a program, so we count strictly by class_id FK.
    const classIds = classData.map((c: any) => c.id).filter(Boolean) as string[];
    const countMap: Record<string, number> = {};
    classIds.forEach((cid) => { countMap[cid] = 0; });

    const { data: directStudents } = await admin
      .from('portal_users')
      .select('class_id')
      .eq('role', 'student')
      .in('class_id', classIds);

    (directStudents ?? []).forEach((s: any) => {
      if (s.class_id) countMap[s.class_id] = (countMap[s.class_id] ?? 0) + 1;
    });

    const enriched = classData.map((c: any) => ({
      ...c,
      current_students: countMap[c.id] ?? c.current_students ?? 0,
    }));

    return NextResponse.json({ data: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/classes — create a new class
// admin: full control; teacher: must be assigned to the chosen school
// school role: cannot create classes via API
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    if (!['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Only admins and teachers can create classes' }, { status: 403 });
    }

    const body = await request.json();

    // ── Field whitelist — never trust raw body ────────────────────────────────
    const insertRow: Record<string, unknown> = {};
    const allowedFields = ['name', 'description', 'program_id', 'max_students', 'status', 'schedule', 'start_date', 'end_date'];
    for (const f of allowedFields) {
      if (f in body && body[f] != null) insertRow[f] = body[f];
    }

    if (!insertRow.name) {
      return NextResponse.json({ error: 'Class name is required' }, { status: 400 });
    }

    const admin = adminClient();

    if (caller.role === 'teacher') {
      // Force teacher_id to the caller — they cannot assign to another teacher
      insertRow.teacher_id = caller.id;

      // Validate school_id is one the teacher is actually assigned to
      const requestedSchoolId: string | null = typeof body.school_id === 'string' ? body.school_id : null;
      if (requestedSchoolId) {
        const scopedIds = await teacherSchoolIds(caller);
        if (!scopedIds.includes(requestedSchoolId)) {
          return NextResponse.json(
            { error: 'You are not assigned to the school you selected for this class.' },
            { status: 403 },
          );
        }
        insertRow.school_id = requestedSchoolId;
      } else if (caller.school_id) {
        // Default to teacher's primary school if none specified
        insertRow.school_id = caller.school_id;
      }
    } else {
      // Admin: allow any school_id and teacher_id
      if ('school_id' in body) insertRow.school_id = body.school_id ?? null;
      if ('teacher_id' in body) insertRow.teacher_id = body.teacher_id ?? null;
    }

    insertRow.created_at = new Date().toISOString();
    // current_students starts at 0 — set by enroll routes, never by client
    insertRow.current_students = 0;

    const { data, error } = await admin
      .from('classes')
      .insert(insertRow)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
