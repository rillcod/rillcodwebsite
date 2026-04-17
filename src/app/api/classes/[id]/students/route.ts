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
// Returns all students enrolled in this class, with school-boundary enforcement
// and safe auto-heal for stale/missing class_id assignments.
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: classId } = await context.params;
    const admin = adminClient();
    const serverSupabase = await createServerClient();

    // ── Auth ────────────────────────────────────────────────────────────────
    const { data: { user }, error: authErr } = await serverSupabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await admin
      .from('portal_users')
      .select('role, id, school_id')
      .eq('id', user.id)
      .single();

    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // ── Fetch class ──────────────────────────────────────────────────────────
    const { data: cls, error: clsErr } = await admin
      .from('classes')
      .select('name, max_students, current_students, program_id, school_id')
      .eq('id', classId)
      .single();

    if (clsErr || !cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    // ── School/class access guard ────────────────────────────────────────────
    // school role: must match class's school
    if (caller.role === 'school' && cls.school_id && caller.school_id !== cls.school_id) {
      return NextResponse.json({ error: 'Access denied: class is outside your school scope' }, { status: 403 });
    }
    // teacher role: must be assigned to the class's school
    if (caller.role === 'teacher' && cls.school_id) {
      const { data: ts } = await admin
        .from('teacher_schools')
        .select('school_id')
        .eq('teacher_id', caller.id)
        .eq('school_id', cls.school_id)
        .maybeSingle();
      const primaryMatch = caller.school_id === cls.school_id;
      if (!primaryMatch && !ts) {
        return NextResponse.json({ error: 'Access denied: you are not assigned to this class\'s school' }, { status: 403 });
      }
    }

    // ── Primary: students directly assigned via class_id FK ─────────────────
    const { data: directStudents, error: directErr } = await admin
      .from('portal_users')
      .select('id, full_name, email, school_id, school_name, section_class, class_id')
      .eq('class_id', classId)
      .eq('role', 'student')
      .order('full_name');

    if (directErr) return NextResponse.json({ error: directErr.message }, { status: 500 });

    const knownIds = new Set((directStudents ?? []).map((s: any) => s.id));

    // ── Fallback: program-enrolled students whose class_id is missing/stale ──
    // Only auto-heals students with no class_id or a stale class_id (not students
    // intentionally in a DIFFERENT active class — that would be a cross-class steal).
    // Also enforces school boundary during heal.
    let programStudents: any[] = [];
    if (cls.program_id) {
      const { data: enrolledRows } = await admin
        .from('enrollments')
        .select('user_id')
        .eq('program_id', cls.program_id)
        .in('status', ['active', 'enrolled', 'approved']);

      const candidateIds = (enrolledRows ?? [])
        .map((e: any) => e.user_id)
        .filter((uid: any) => uid && !knownIds.has(uid));

      if (candidateIds.length > 0) {
        // Fetch candidates — include school_id so we can enforce boundary
        let psQuery = admin
          .from('portal_users')
          .select('id, full_name, email, school_id, school_name, section_class, class_id')
          .in('id', candidateIds)
          .eq('role', 'student')
          .order('full_name');

        // Scope to class's school — prevents cross-school heal
        if (cls.school_id) {
          psQuery = psQuery.or(
            `school_id.eq.${cls.school_id},and(school_id.is.null,school_name.eq.${JSON.stringify(cls.name)})`,
          ) as any;
        }

        const { data: ps } = await psQuery;
        // Only heal students with NO class_id or whose class_id is this class (stale/same)
        // Students actively in another class are excluded — don't steal them
        programStudents = (ps ?? []).filter(
          (s: any) => !s.class_id || s.class_id === classId,
        );
      }
    }

    // Auto-heal program fallback students → assign class_id so primary lookup catches them next time
    if (programStudents.length > 0) {
      const fallbackIds = programStudents.map((s: any) => s.id);
      await admin
        .from('portal_users')
        .update({ class_id: classId, section_class: cls.name })
        .in('id', fallbackIds)
        .eq('role', 'student');
      programStudents = programStudents.map((s: any) => ({
        ...s,
        class_id: classId,
        section_class: cls.name,
      }));
      console.log(`[students API] class="${cls.name}" (${classId}) auto-healed ${fallbackIds.length} program-enrolled student(s)`);
      fallbackIds.forEach((id: string) => knownIds.add(id));
    }

    // ── Section-name fallback: students at same school whose section_class text ─
    // matches the class name but class_id was never set (legacy bulk registration)
    let sectionStudents: any[] = [];
    if (cls.school_id && cls.name) {
      const { data: bySection } = await admin
        .from('portal_users')
        .select('id, full_name, email, school_id, school_name, section_class, class_id')
        .eq('school_id', cls.school_id)   // hard school boundary
        .eq('section_class', cls.name)
        .is('class_id', null)             // only heal those with no class_id set
        .eq('role', 'student')
        .order('full_name');

      sectionStudents = (bySection ?? []).filter((s: any) => !knownIds.has(s.id));

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

    // ── Sync current_students count from DB (not from local array) ───────────
    const { count: liveCount } = await admin
      .from('portal_users')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('role', 'student');
    const actualCount = liveCount ?? students.length;
    if (actualCount !== cls.current_students) {
      await admin.from('classes').update({ current_students: actualCount }).eq('id', classId);
    }

    return NextResponse.json(
      { students, max_students: cls.max_students, total: actualCount },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
