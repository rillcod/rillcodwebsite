import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCourseVisibleToLearners } from '@/lib/courses/visibility';

export const dynamic = 'force-dynamic';

/**
 * GET /api/recommendations
 *
 * Smart, instant (heuristic — no AI tokens/latency) "Recommended for you" feed for
 * the signed-in learner. Ranks content by four signals, highest-value first:
 *   1. Continue   — the next lesson in a course they've started but not finished
 *   2. Reinforce  — a lesson in a course where their graded average is weak (<60%)
 *   3. Start next — the first lesson of a course in their path they haven't begun
 *   4. Review     — spaced-repetition flashcards that are due
 * Returns up to 6 de-duplicated items.
 */
type Rec = {
  type: 'continue' | 'reinforce' | 'start' | 'review';
  title: string;
  reason: string;
  href: string;
  course_title?: string;
  priority: number;
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient();

  // 1. Enrolled programmes.
  const { data: enrollments } = await db
    .from('enrollments')
    .select('program_id, programs(id, name)')
    .eq('user_id', user.id);
  const programIds = Array.from(new Set((enrollments ?? []).map((e: any) => e.program_id).filter(Boolean)));
  if (programIds.length === 0) return NextResponse.json({ recommendations: [] });

  // 2. Visible courses in those programmes (active, content-bearing, not locked unless flagship).
  const { data: rawCourses } = await db
    .from('courses')
    .select('id, title, is_active, is_locked, program_id, programs(name), lessons(id), assignments(id)')
    .in('program_id', programIds)
    .eq('is_active', true);
  const courses = (rawCourses ?? []).filter((c: any) => isCourseVisibleToLearners(c, { requireContent: true }));
  if (courses.length === 0) return NextResponse.json({ recommendations: [] });
  const courseIds = courses.map((c: any) => c.id);
  const courseTitle: Record<string, string> = {};
  for (const c of courses) courseTitle[c.id] = c.title;

  // 3. Lessons (ordered), 4. completed set, 5. graded submissions, 6. due flashcards — in parallel.
  const [lessonsRes, doneRes, gradesRes, dueRes] = await Promise.all([
    db.from('lessons').select('id, title, course_id, order_index').in('course_id', courseIds).eq('status', 'active').order('order_index', { ascending: true }).limit(400),
    db.from('lesson_progress').select('lesson_id').eq('portal_user_id', user.id).eq('status', 'completed'),
    db.from('assignment_submissions').select('grade, assignments(course_id, max_points)').eq('portal_user_id', user.id).not('grade', 'is', null).limit(200),
    db.from('flashcard_reviews').select('next_review_at').eq('student_id', user.id),
  ]);

  const lessons = (lessonsRes.data ?? []) as any[];
  const doneSet = new Set((doneRes.data ?? []).map((d: any) => d.lesson_id));

  // Lessons grouped by course, in order.
  const byCourse: Record<string, any[]> = {};
  for (const l of lessons) (byCourse[l.course_id] ??= []).push(l);

  // Weak-course detection from graded average.
  const gradeAgg: Record<string, { sum: number; n: number }> = {};
  for (const g of (gradesRes.data ?? []) as any[]) {
    const cid = g.assignments?.course_id;
    if (!cid) continue;
    const max = Number(g.assignments?.max_points) || 100;
    const pct = (Number(g.grade) / max) * 100;
    if (!Number.isFinite(pct)) continue;
    (gradeAgg[cid] ??= { sum: 0, n: 0 });
    gradeAgg[cid].sum += pct;
    gradeAgg[cid].n += 1;
  }
  const weakCourse = (cid: string) => {
    const a = gradeAgg[cid];
    return a && a.n > 0 && Math.round(a.sum / a.n) < 60;
  };

  const now = Date.now();
  const dueCards = (dueRes.data ?? []).filter((r: any) => !r.next_review_at || new Date(r.next_review_at).getTime() <= now).length;

  // ── Build & rank recommendations ──
  const recs: Rec[] = [];
  const seenLesson = new Set<string>();

  for (const cid of courseIds) {
    const courseLessons = byCourse[cid] ?? [];
    if (courseLessons.length === 0) continue;
    const completed = courseLessons.filter((l) => doneSet.has(l.id)).length;
    const nextUndone = courseLessons.find((l) => !doneSet.has(l.id));
    const started = completed > 0;

    if (started && nextUndone && !seenLesson.has(nextUndone.id)) {
      // 1. Continue an in-progress course (top priority).
      seenLesson.add(nextUndone.id);
      recs.push({
        type: 'continue', title: nextUndone.title, course_title: courseTitle[cid],
        reason: `Continue ${courseTitle[cid]} — ${completed}/${courseLessons.length} done`,
        href: `/dashboard/lessons/${nextUndone.id}`, priority: 100,
      });
    } else if (weakCourse(cid) && nextUndone && !seenLesson.has(nextUndone.id)) {
      // 2. Reinforce a weak course.
      seenLesson.add(nextUndone.id);
      recs.push({
        type: 'reinforce', title: nextUndone.title, course_title: courseTitle[cid],
        reason: `Strengthen ${courseTitle[cid]} — your recent scores suggest a review`,
        href: `/dashboard/lessons/${nextUndone.id}`, priority: 80,
      });
    } else if (!started && nextUndone && !seenLesson.has(nextUndone.id)) {
      // 3. Start a fresh course in the path.
      seenLesson.add(nextUndone.id);
      recs.push({
        type: 'start', title: nextUndone.title, course_title: courseTitle[cid],
        reason: `Start ${courseTitle[cid]}`,
        href: `/dashboard/lessons/${nextUndone.id}`, priority: 50,
      });
    }
  }

  // 4. Spaced-repetition review nudge.
  if (dueCards > 0) {
    recs.push({
      type: 'review', title: `${dueCards} flashcard${dueCards > 1 ? 's' : ''} due`,
      reason: 'Lock in what you\'ve learned with a quick review',
      href: '/dashboard/flashcards', priority: 70,
    });
  }

  recs.sort((a, b) => b.priority - a.priority);
  return NextResponse.json({ recommendations: recs.slice(0, 6) });
}
