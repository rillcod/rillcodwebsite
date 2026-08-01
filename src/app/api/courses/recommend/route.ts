/**
 * GET /api/courses/recommend?program_id=&school_id=&grade=&class_id=
 *
 * The evidence behind a course choice, gathered in one round trip: which editions this school
 * adopted, which courses have a published edition or any syllabus at all, what sibling classes
 * already teach, and how each course's grade tags line up with the band being created.
 *
 * Every course picker reads from here, so class creation, report entry and the teaching
 * workspace propose the same course for the same class instead of each guessing separately.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadCourseRecommendation } from '@/lib/courses/recommend-server';

export const dynamic = 'force-dynamic';

async function caller() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;
  const db: any = createAdminClient();
  const { data } = await db.from('portal_users').select('id,role,school_id').eq('id', user.id).maybeSingle();
  return data as { id: string; role: string; school_id: string | null } | null;
}

/** Schools this caller may pull adoption evidence for. `null` means unrestricted (admin). */
async function allowedSchoolIds(db: any, user: { id: string; role: string; school_id: string | null }) {
  if (user.role === 'admin') return null;
  const { data: assigned } = await db.from('teacher_schools').select('school_id').eq('teacher_id', user.id);
  return Array.from(new Set([
    ...(user.school_id ? [user.school_id] : []),
    ...((assigned ?? []) as Array<{ school_id: string }>).map((row) => row.school_id).filter(Boolean),
  ]));
}

export async function GET(request: NextRequest) {
  try {
    const user = await caller();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'teacher', 'school'].includes(user.role)) {
      return NextResponse.json({ error: 'Academic staff access required' }, { status: 403 });
    }

    const params = request.nextUrl.searchParams;
    const classId = params.get('class_id') || '';
    let programId = params.get('program_id') || '';
    let grade = params.get('grade') || '';
    let schoolId = params.get('school_id') || '';
    let currentCourseId = params.get('current_course_id') || '';
    let classLabel = params.get('class_label') || '';

    if (!programId && !classId) {
      return NextResponse.json({ error: 'program_id or class_id is required' }, { status: 400 });
    }

    const db: any = createAdminClient();

    // An existing class supplies its own programme, school, band, label and current course —
    // so callers that already have a class id need pass nothing else.
    if (classId) {
      const { data: klass } = await db
        .from('classes')
        .select('id,name,school_id,program_id,current_course_id,qa_grade_band,academic_offerings(programme_id)')
        .eq('id', classId)
        .maybeSingle();
      if (klass) {
        // Bootcamp and online classes carry no program_id — their programme comes from the
        // academic offering. The teaching workspace resolves it the same way.
        const offering = Array.isArray(klass.academic_offerings)
          ? klass.academic_offerings[0]
          : klass.academic_offerings;
        programId = programId || klass.program_id || offering?.programme_id || '';
        schoolId = schoolId || klass.school_id || '';
        grade = grade || klass.qa_grade_band || '';
        classLabel = classLabel || klass.name || '';
        currentCourseId = currentCourseId || klass.current_course_id || '';
      }
      if (!programId) {
        return NextResponse.json({ error: 'This class has no programme, so its course cannot be worked out.' }, { status: 400 });
      }
    }

    if (schoolId) {
      const scoped = await allowedSchoolIds(db, user);
      if (scoped && !scoped.includes(schoolId)) {
        return NextResponse.json({ error: 'You are not assigned to that school.' }, { status: 403 });
      }
    } else if (user.role === 'school' && user.school_id) {
      schoolId = user.school_id;
    }

    const data = await loadCourseRecommendation(db, {
      programId,
      schoolId,
      grade,
      classLabel,
      classId,
      currentCourseId,
    });

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Could not work out a course for this class.' },
      { status: 500 },
    );
  }
}
