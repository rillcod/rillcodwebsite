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

// GET /api/classes/[id]/students
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: classId } = await params;
    const admin = adminClient();
    const serverSupabase = await createServerClient();

    // ── Authorization & Multi-tenant Check ──
    const { data: { user }, error: authErr } = await serverSupabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await admin.from('portal_users').select('role, school_id').eq('id', user.id).single();
    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // ── Class Verification & Leak Prevention ──
    const { data: cls, error: clsErr } = await admin
      .from('classes')
      .select('name, max_students, current_students, program_id, school_id')
      .eq('id', classId)
      .single();

    if (clsErr || !cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    // Enforce school boundary for school role
    if (caller.role === 'school' && caller.school_id !== cls.school_id) {
        return NextResponse.json({ error: 'Access denied: Class outside your scope' }, { status: 403 });
    }

    // Primary: students directly assigned to this class via class_id FK
    const { data: directStudents, error } = await admin
      .from('portal_users')
      .select('id, full_name, email, school_id, section_class, class_id')
      .eq('class_id', classId)
      .eq('role', 'student')
      .order('full_name');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fallback: include ALL students enrolled in the class's program via the enrollments
    // table. The previous .is('class_id', null) filter caused bulk-enrolled students to
    // disappear if their class_id was wiped, pointed to a deleted class, or was set by a
    // different code path. We now include everyone enrolled in the program and deduplicate.
    let programStudents: any[] = [];
    if (cls.program_id) {
      const { data: enrolledRows } = await admin
        .from('enrollments')
        .select('user_id')
        .eq('program_id', cls.program_id)
        .in('status', ['active', 'enrolled', 'approved']);  // cover all common status values

      const directIds = new Set((directStudents ?? []).map((s: any) => s.id));
      const candidateIds = (enrolledRows ?? [])
        .map((e: any) => e.user_id)
        .filter((uid: any) => uid && !directIds.has(uid));

      if (candidateIds.length > 0) {
        const { data: ps } = await admin
          .from('portal_users')
          .select('id, full_name, email, school_id, section_class, class_id')
          .in('id', candidateIds)
          // Removed .is('class_id', null) — students whose class_id was wiped or pointed
          // to a stale class after bulk-enroll/rebuild must still appear here.
          .eq('role', 'student')
          .order('full_name');
        programStudents = ps ?? [];
      }
    }

    // Auto-heal: re-assign ALL fallback students to this class so future primary lookups
    // find them instantly (also corrects stale class_id values from old/deleted classes).
    if (programStudents.length > 0) {
      const fallbackIds = programStudents.map((s: any) => s.id);
      await admin
        .from('portal_users')
        .update({ class_id: classId, section_class: cls.name })
        .in('id', fallbackIds)
        .eq('role', 'student');

      // Reflect the fix in the returned data so the UI is immediately consistent
      programStudents = programStudents.map((s: any) => ({ ...s, class_id: classId, section_class: cls.name }));

      console.log(`[students API] class="${cls.name}" (${classId}) auto-healed ${fallbackIds.length} program-enrolled student(s)`);
    }

    // Third fallback: students at the same school whose section_class text matches the
    // class name but whose class_id was never set (registered with class name text, no UUID).
    // This is the most common cause of "students not appearing" after bulk registration.
    let sectionStudents: any[] = [];
    if (cls.school_id && cls.name) {
      const knownIds = new Set([
        ...(directStudents ?? []).map((s: any) => s.id),
        ...programStudents.map((s: any) => s.id),
      ]);

      const { data: bySection } = await admin
        .from('portal_users')
        .select('id, full_name, email, school_id, section_class, class_id')
        .eq('school_id', cls.school_id)
        .eq('section_class', cls.name)
        .eq('role', 'student')
        .order('full_name');

      sectionStudents = (bySection ?? []).filter((s: any) => !knownIds.has(s.id));

      // Auto-heal: assign class_id so future queries find them in the primary lookup
      if (sectionStudents.length > 0) {
        const sectionIds = sectionStudents.map((s: any) => s.id);
        await admin
          .from('portal_users')
          .update({ class_id: classId })
          .in('id', sectionIds)
          .eq('role', 'student');
        sectionStudents = sectionStudents.map((s: any) => ({ ...s, class_id: classId }));
        console.log(`[students API] class="${cls.name}" (${classId}) auto-healed ${sectionIds.length} section_class-matched student(s)`);
      }
    }

    const students = [...(directStudents ?? []), ...programStudents, ...sectionStudents];

    // Sync current_students count to actual total after heal
    const actualCount = students.length;
    if (actualCount !== cls.current_students) {
      await admin.from('classes').update({ current_students: actualCount }).eq('id', classId);
    }

    return NextResponse.json(
      { students, max_students: cls.max_students },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
