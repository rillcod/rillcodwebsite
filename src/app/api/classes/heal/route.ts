import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await adminClient()
    .from('portal_users').select('id, role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') return null;
  return profile;
}

// GET /api/classes/heal — scan for anomalies
export async function GET() {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const db = adminClient();

  // 1. Students with no school_id
  const { data: noSchool } = await db
    .from('portal_users')
    .select('id, full_name, email, class_id, school_id, section_class')
    .eq('role', 'student')
    .is('school_id', null)
    .eq('is_deleted', false);

  // 2. Students with no class_id
  const { data: noClass } = await db
    .from('portal_users')
    .select('id, full_name, email, class_id, school_id, section_class, school_name')
    .eq('role', 'student')
    .is('class_id', null)
    .not('school_id', 'is', null)
    .eq('is_deleted', false);

  // 3. Students whose class belongs to a different school than their school_id
  const { data: allStudents } = await db
    .from('portal_users')
    .select('id, full_name, email, school_id, class_id, school_name')
    .eq('role', 'student')
    .not('school_id', 'is', null)
    .not('class_id', 'is', null)
    .eq('is_deleted', false);

  const { data: allClasses } = await db
    .from('classes')
    .select('id, name, school_id');

  const classSchoolMap: Record<string, string | null> = {};
  (allClasses ?? []).forEach((c: any) => { classSchoolMap[c.id] = c.school_id; });

  const mismatched = (allStudents ?? []).filter((s: any) => {
    const classSchool = classSchoolMap[s.class_id];
    return classSchool && classSchool !== s.school_id;
  });

  // 4. Duplicate class membership (student appears in multiple classes — via section_class)
  // For each school, find students whose section_class doesn't match their class's name
  const { data: sectionMismatch } = await db
    .from('portal_users')
    .select('id, full_name, email, school_id, class_id, section_class')
    .eq('role', 'student')
    .not('class_id', 'is', null)
    .not('section_class', 'is', null)
    .eq('is_deleted', false);

  const classNameMap: Record<string, string> = {};
  (allClasses ?? []).forEach((c: any) => { classNameMap[c.id] = c.name; });

  const sectionDrift = (sectionMismatch ?? []).filter((s: any) => {
    const className = classNameMap[s.class_id];
    return className && s.section_class && className !== s.section_class;
  });

  // 5. Classes with no students and no lesson plans
  const { data: emptyClasses } = await db
    .from('classes')
    .select('id, name, school_id, created_at, schools(name)')
    .not('school_id', 'is', null);

  const { data: classStudentCounts } = await db
    .from('portal_users')
    .select('class_id')
    .eq('role', 'student')
    .not('class_id', 'is', null);

  const { data: classLessonPlanCounts } = await db
    .from('lesson_plans')
    .select('class_id')
    .not('class_id', 'is', null);

  const classHasStudents = new Set((classStudentCounts ?? []).map((r: any) => r.class_id));
  const classHasLessons = new Set((classLessonPlanCounts ?? []).map((r: any) => r.class_id));

  const orphanClasses = (emptyClasses ?? []).filter(
    (c: any) => !classHasStudents.has(c.id) && !classHasLessons.has(c.id),
  );

  return NextResponse.json({
    data: {
      noSchool: noSchool ?? [],
      noClass: noClass ?? [],
      mismatched,
      sectionDrift,
      orphanClasses,
      classes: allClasses ?? [],
    },
  });
}

// POST /api/classes/heal — apply a fix action
export async function POST(req: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { action, studentIds, classId, schoolId, deleteClassId } = body;
  const db = adminClient();

  if (action === 'assign_class') {
    // Assign students to a class and set school_id from that class
    if (!classId || !studentIds?.length) {
      return NextResponse.json({ error: 'classId and studentIds required' }, { status: 400 });
    }
    const { data: cls } = await db.from('classes').select('school_id, name').eq('id', classId).single();
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    const { error } = await db
      .from('portal_users')
      .update({ class_id: classId, school_id: cls.school_id, section_class: cls.name })
      .in('id', studentIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, updated: studentIds.length });
  }

  if (action === 'assign_school') {
    if (!schoolId || !studentIds?.length) {
      return NextResponse.json({ error: 'schoolId and studentIds required' }, { status: 400 });
    }
    const { data: school } = await db.from('schools').select('name').eq('id', schoolId).single();
    const { error } = await db
      .from('portal_users')
      .update({ school_id: schoolId, school_name: school?.name ?? null })
      .in('id', studentIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, updated: studentIds.length });
  }

  if (action === 'fix_section_drift') {
    // Align section_class to the actual class name
    if (!studentIds?.length) {
      return NextResponse.json({ error: 'studentIds required' }, { status: 400 });
    }
    const { data: students } = await db
      .from('portal_users').select('id, class_id').in('id', studentIds);
    const classIds = [...new Set((students ?? []).map((s: any) => s.class_id).filter(Boolean))];
    const { data: classes } = await db.from('classes').select('id, name').in('id', classIds);
    const nameMap: Record<string, string> = {};
    (classes ?? []).forEach((c: any) => { nameMap[c.id] = c.name; });
    for (const s of (students ?? [])) {
      if (s.class_id && nameMap[s.class_id]) {
        await db.from('portal_users').update({ section_class: nameMap[s.class_id] }).eq('id', s.id);
      }
    }
    return NextResponse.json({ success: true, updated: studentIds.length });
  }

  if (action === 'delete_class') {
    if (!deleteClassId) return NextResponse.json({ error: 'deleteClassId required' }, { status: 400 });
    const { error } = await db.from('classes').delete().eq('id', deleteClassId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
