import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: caller } = await supabase
      .from('portal_users')
      .select('role, school_id')
      .eq('id', user.id)
      .single();

    if (!caller || (caller.role !== 'admin' && caller.role !== 'teacher')) {
      return NextResponse.json({ error: 'Only admins and teachers can bulk-enroll students' }, { status: 403 });
    }

    const body = await request.json();
    const {
      userIds,       // string[]  — students to enroll
      program_id,    // string    — target program
      school_id,     // string?   — optionally (re-)set school on student profiles
      class_id,      // string?   — optionally assign to a class (FK to classes table)
      section_class, // string?   — optionally set section/class label on the profile
    } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'No student IDs provided' }, { status: 400 });
    }
    if (!program_id) {
      return NextResponse.json({ error: 'program_id is required' }, { status: 400 });
    }

    // Verify all IDs are student accounts
    const { data: verified } = await supabaseAdmin
      .from('portal_users')
      .select('id, school_id, school_name')
      .in('id', userIds)
      .eq('role', 'student');

    type PortalUserSlim = { id: string; school_id: string | null; school_name: string | null };
    let safeStudents: PortalUserSlim[] = (verified ?? []) as PortalUserSlim[];

    // School boundary check — if a class_id is specified, enforce school scoping for non-admins
    if (caller.role !== 'admin' && class_id) {
      const { data: targetClass } = await supabaseAdmin
        .from('classes')
        .select('school_id, schools(name)')
        .eq('id', class_id)
        .single();

      if (targetClass?.school_id) {
        const clsSchoolName = (targetClass as unknown as { schools: { name: string } | null }).schools?.name ?? null;
        // Accept students linked by school_id OR by school_name (legacy records)
        safeStudents = safeStudents.filter(
          s =>
            s.school_id === targetClass.school_id ||
            (clsSchoolName && s.school_name === clsSchoolName),
        );
      }
    }

    // Also enforce when school_id is explicitly passed — students must belong to that school
    if (caller.role !== 'admin' && school_id) {
      // Fetch the school name so we can also match legacy school_name-only records
      const { data: schoolRow } = await supabaseAdmin
        .from('schools')
        .select('name')
        .eq('id', school_id)
        .maybeSingle();
      const schoolName = schoolRow?.name ?? null;

      safeStudents = safeStudents.filter(
        s =>
          s.school_id === school_id ||
          (schoolName && s.school_name === schoolName),
      );
    }

    const safeIds = safeStudents.map(u => u.id);
    if (safeIds.length === 0) {
      // Don't fail hard — the class was already created. Return a 200 with a warning so
      // the caller can redirect and the teacher can manually add students.
      return NextResponse.json({
        enrolled: 0, skipped: userIds.length, program_id,
        warning: 'No matching student accounts found after school scoping. Use the class enrolment page to add students manually.',
      });
    }

    // Optionally update school, class, and/or section_class on the student profiles
    if (school_id || class_id || section_class) {
      const profileUpdate: Record<string, string | null> = {};
      if (class_id)      profileUpdate.class_id      = class_id;
      if (section_class) profileUpdate.section_class = section_class;

      if (school_id) {
        profileUpdate.school_id = school_id;
        // Also sync school_name so the column stays accurate after refresh
        const { data: schoolRow } = await supabaseAdmin
          .from('schools')
          .select('name')
          .eq('id', school_id)
          .single();
        if (schoolRow?.name) profileUpdate.school_name = schoolRow.name;
      }

      const { error: profileErr } = await supabaseAdmin
        .from('portal_users')
        .update({ ...profileUpdate, updated_at: new Date().toISOString() })
        .in('id', safeIds);

      if (profileErr) {
        return NextResponse.json({ error: `Profile update failed: ${profileErr.message}` }, { status: 500 });
      }
    }

    // Check which students are already enrolled to avoid duplicates
    const { data: alreadyEnrolled } = await supabaseAdmin
      .from('enrollments')
      .select('user_id')
      .eq('program_id', program_id)
      .in('user_id', safeIds);

    const enrolledIds = new Set((alreadyEnrolled ?? []).map(e => e.user_id));
    const toInsert = safeIds
      .filter((uid) => !enrolledIds.has(uid))
      .map((userId) => ({ user_id: userId, program_id, status: 'active', role: 'student' }));

    if (toInsert.length > 0) {
      const { error: enrollErr } = await supabaseAdmin.from('enrollments').insert(toInsert);
      if (enrollErr) {
        return NextResponse.json({ error: `Enrollment failed: ${enrollErr.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({
      enrolled: safeIds.length,
      skipped:  userIds.length - safeIds.length,
      program_id,
      class_id:  class_id  ?? null,
      school_id: school_id ?? null,
    });

  } catch (err: any) {
    console.error('Bulk enroll error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
