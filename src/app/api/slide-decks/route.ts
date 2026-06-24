import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/slide-decks
 *
 * Catalog of view-only slide decks, grouped Program → Course → Lesson, scoped by role:
 *   • admin            → all decks
 *   • teacher / school  → decks in their school(s)
 *   • student / parent  → decks in programmes they're enrolled in
 * Each deck carries its raw file_url so the client can open it in the SlideViewer
 * (which streams through the enrolment-locked /api/slides route).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient();
  const { data: prof } = await db.from('portal_users').select('role, school_id').eq('id', user.id).maybeSingle();
  const role = (prof as any)?.role ?? '';
  const schoolId = (prof as any)?.school_id ?? null;

  // Scope inputs
  let teacherSchoolIds: string[] = [];
  let enrolledProgramIds = new Set<string>();
  if (role === 'teacher') {
    const ids = new Set<string>();
    if (schoolId) ids.add(schoolId);
    const { data: ts } = await db.from('teacher_schools').select('school_id').eq('teacher_id', user.id);
    for (const r of ts ?? []) if ((r as any).school_id) ids.add((r as any).school_id);
    teacherSchoolIds = Array.from(ids);
  } else if (role === 'student' || role === 'parent') {
    const { data: enr } = await db.from('enrollments').select('program_id').eq('user_id', user.id);
    enrolledProgramIds = new Set((enr ?? []).map((e: any) => e.program_id).filter(Boolean));
  }

  const { data: rows, error } = await db
    .from('lesson_materials')
    .select('id, title, file_url, lesson_id, created_at, lessons(id, title, school_id, course_id, courses(id, title, program_id, programs(id, name)))')
    .eq('file_type', 'slide-deck')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type ProgramGroup = { program_id: string | null; program_name: string; courses: Record<string, any> };
  const groups: Record<string, ProgramGroup> = {};

  for (const m of (rows ?? []) as any[]) {
    const lesson = m.lessons;
    const course = lesson?.courses;
    const program = course?.programs;
    const lessonSchoolId = lesson?.school_id ?? null;
    const programId = course?.program_id ?? null;

    // Role scoping
    if (role === 'admin') { /* all */ }
    else if (role === 'teacher') { if (!lessonSchoolId || !teacherSchoolIds.includes(lessonSchoolId)) continue; }
    else if (role === 'school') { if (!schoolId || lessonSchoolId !== schoolId) continue; }
    else { if (!programId || !enrolledProgramIds.has(programId)) continue; } // student/parent

    const pKey = programId ?? 'none';
    const pName = program?.name ?? 'Other';
    (groups[pKey] ??= { program_id: programId, program_name: pName, courses: {} });

    const cKey = course?.id ?? 'none';
    const cName = course?.title ?? 'Uncategorised';
    (groups[pKey].courses[cKey] ??= { course_id: course?.id ?? null, course_title: cName, decks: [] });

    groups[pKey].courses[cKey].decks.push({
      id: m.id,
      title: m.title,
      file_url: m.file_url,
      lesson_id: m.lesson_id,
      lesson_title: lesson?.title ?? null,
    });
  }

  // Flatten to arrays for a stable client shape.
  const programs = Object.values(groups).map((g) => ({
    program_id: g.program_id,
    program_name: g.program_name,
    courses: Object.values(g.courses),
  }));

  return NextResponse.json({ programs });
}
