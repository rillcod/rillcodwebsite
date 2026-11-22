import { NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { checkExamMaterialLock } from '@/lib/cbt/exam-material-lock';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function isPriorityTitle(title: string | null | undefined): boolean {
  return /\[PRIORITY\]/i.test(String(title ?? ''));
}

function isProtectedTitle(title: string | null | undefined): boolean {
  return /\[PROTECTED\]/i.test(String(title ?? ''));
}

function cleanTitle(title: string | null | undefined): string {
  return String(title ?? '')
    .replace(/\[PRIORITY\]\s*/gi, '')
    .replace(/\[PROTECTED\]\s*/gi, '')
    .trim();
}

/**
 * GET /api/learning/priority-materials
 * Returns priority exam study materials pushed by teachers for the signed-in student's
 * class/course, plus live exam lockdown status — rendered prominently in the Student Overview.
 */
export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = adminClient();
    const { data: portal } = await admin
      .from('portal_users')
      .select('id, role, class_id, school_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!portal || portal.role !== 'student') {
      return NextResponse.json({ materials: [], examLock: { locked: false } });
    }

    const [examLock, classRes, examsRes] = await Promise.all([
      checkExamMaterialLock(admin as any, { userRole: portal.role }),
      portal.class_id
        ? admin.from('classes').select('id, current_course_id, program_id').eq('id', portal.class_id).maybeSingle()
        : Promise.resolve({ data: null as any }),
      portal.class_id
        ? admin
            .from('cbt_exams')
            .select('id, title, course_id, metadata')
            .eq('class_id', portal.class_id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(15)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const courseIds = new Set<string>();
    const referencedLessonIds = new Set<string>();
    const examTitleByLessonId = new Map<string, string>();

    if (classRes?.data?.current_course_id) {
      courseIds.add(classRes.data.current_course_id);
    }

    for (const ex of examsRes?.data ?? []) {
      if (ex.course_id) courseIds.add(ex.course_id);
      const meta = ex.metadata && typeof ex.metadata === 'object' ? ex.metadata : {};
      const refIds: string[] = Array.isArray(meta.referenced_lesson_ids) ? meta.referenced_lesson_ids : [];
      for (const lid of refIds) {
        if (lid) {
          referencedLessonIds.add(lid);
          if (!examTitleByLessonId.has(lid)) examTitleByLessonId.set(lid, ex.title || 'Upcoming Exam');
        }
      }
    }

    if (courseIds.size === 0 && referencedLessonIds.size === 0) {
      return NextResponse.json(
        { materials: [], examLock },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const orClauses: string[] = [];
    if (courseIds.size > 0) orClauses.push(`course_id.in.(${[...courseIds].join(',')})`);
    if (referencedLessonIds.size > 0) orClauses.push(`id.in.(${[...referencedLessonIds].join(',')})`);

    const { data: lessons } = await admin
      .from('lessons')
      .select('id, title, session_number, lesson_materials(id, title, file_url, file_type, created_at)')
      .or(orClauses.join(','))
      .order('session_number', { ascending: false })
      .limit(30);

    const items: Array<{
      id: string;
      title: string;
      isProtected: boolean;
      fileType: string | null;
      lessonId: string;
      lessonTitle: string;
      examTitle: string | null;
      createdAt: string | null;
    }> = [];

    for (const lesson of lessons ?? []) {
      const mats = Array.isArray((lesson as any).lesson_materials) ? (lesson as any).lesson_materials : [];
      const isReferenced = referencedLessonIds.has(lesson.id);
      for (const m of mats) {
        if (m.file_type === 'slide-deck') continue;
        // Surface all [PRIORITY] materials, plus any material in an exam-referenced lesson
        if (!isPriorityTitle(m.title) && !isReferenced) continue;
        items.push({
          id: m.id,
          title: cleanTitle(m.title) || lesson.title || 'Study Material',
          isProtected: isProtectedTitle(m.title),
          fileType: m.file_type ?? null,
          lessonId: lesson.id,
          lessonTitle: lesson.title || 'Lesson',
          examTitle: examTitleByLessonId.get(lesson.id) ?? null,
          createdAt: m.created_at ?? null,
        });
      }
    }

    items.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

    return NextResponse.json(
      { materials: items.slice(0, 8), examLock },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Could not load priority materials' }, { status: 500 });
  }
}
