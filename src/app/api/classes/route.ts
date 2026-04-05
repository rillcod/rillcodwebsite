import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/classes
// Returns classes visible to the current user, with live student counts.
// - admin: all classes
// - teacher: classes where teacher_id = me OR school_id IN teacher_schools
// - school: classes where school_id = caller.school_id
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin
      .from('portal_users')
      .select('role, id, school_id')
      .eq('id', user.id)
      .single();

    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { searchParams } = new URL(_request.url);
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

    if (schoolFilter) {
      query = query.eq('school_id', schoolFilter) as any;
    }

    if (caller.role === 'teacher') {
      // Only show classes assigned to this specific teacher
      query = query.eq('teacher_id', caller.id) as any;
    } else if (caller.role === 'school') {
      const sid = caller.school_id;
      if (sid) query = query.eq('school_id', sid) as any;
    }
    // admin: no filter → all classes

    const { data: classes, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const classData = classes ?? [];

    // Get live enrolled student counts — run direct + enrollment queries in parallel
    const classIds = classData.map((c: any) => c.id).filter(Boolean);
    const programIds = [...new Set(classData.map((c: any) => c.program_id).filter(Boolean))] as string[];

    const countMap: Record<string, number> = {};
    classIds.forEach((cid: string) => { countMap[cid] = 0; });

    if (classIds.length > 0) {
      // Run both count queries in parallel
      const [{ data: directStudents }, { data: enrolledRows }] = await Promise.all([
        // Direct: students with class_id assigned
        admin
          .from('portal_users')
          .select('class_id')
          .eq('role', 'student')
          .in('class_id', classIds),
        // Fallback: program-enrolled students (class_id may be null)
        programIds.length > 0
          ? admin
              .from('enrollments')
              .select('user_id, program_id')
              .in('program_id', programIds)
              .eq('status', 'active')
          : Promise.resolve({ data: [] as any[] }),
      ]);

      (directStudents ?? []).forEach((s: any) => {
        if (s.class_id) countMap[s.class_id] = (countMap[s.class_id] ?? 0) + 1;
      });

      if (enrolledRows && enrolledRows.length > 0) {
        const candidateIds = [...new Set(enrolledRows.map((e: any) => e.user_id).filter(Boolean))] as string[];
        const { data: unassigned } = await admin
          .from('portal_users')
          .select('id')
          .in('id', candidateIds)
          .is('class_id', null)
          .eq('role', 'student');

        const unassignedIds = new Set((unassigned ?? []).map((u: any) => u.id));
        const programFallbackCount: Record<string, number> = {};
        enrolledRows.forEach((e: any) => {
          if (e.user_id && unassignedIds.has(e.user_id)) {
            programFallbackCount[e.program_id] = (programFallbackCount[e.program_id] ?? 0) + 1;
          }
        });
        classData.forEach((c: any) => {
          if (c.program_id && programFallbackCount[c.program_id]) {
            countMap[c.id] = (countMap[c.id] ?? 0) + programFallbackCount[c.program_id];
          }
        });
      }
    }

    const enriched = classData.map((c: any) => ({
      ...c,
      current_students: countMap[c.id] ?? 0,
    }));

    return NextResponse.json({ data: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// POST /api/classes — create a new class
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin
      .from('portal_users')
      .select('role, id')
      .eq('id', user.id)
      .single();

    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const body = await request.json();
    // Teachers can only create classes assigned to themselves
    if (caller.role === 'teacher') {
      body.teacher_id = caller.id;
    }
    const { data, error } = await admin
      .from('classes')
      .insert({ ...body, created_at: new Date().toISOString() })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
