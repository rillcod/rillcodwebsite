/**
 * GET /api/special-programs/[id]/curriculum
 *
 * The programme's curriculum as one spine, week 1 → week N.
 *
 * A special programme stores its curriculum the way the school does — one
 * release per course — but it is not read that way. The school reads a course
 * across its terms; a holiday programme is read as a single run of weeks, with
 * different modules taking the wheel at different points. Four separate course
 * curricula, each opened on its own screen, is the same data in the wrong shape
 * for the question being asked ("what happens in week 6?").
 *
 * So this assembles the page's week spine as the backbone and hangs each
 * module's curriculum week off it. Nothing is duplicated: the releases stay the
 * single source of truth, this only joins them.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { specialProgramsAdminClient } from '@/lib/special-programs/queries';
import { resolveTrackTeachingWindow, type PageContent } from '@/lib/academic/programme-bridge';

export const dynamic = 'force-dynamic';

type SpineWeek = {
  week: number;
  /** Label from the page spine, e.g. "Week 3". */
  label: string;
  title: string;
  tag: string | null;
  desc: string | null;
  modules: Array<{
    track_id: string | null;
    track_title: string;
    module_label: string | null;
    icon: string | null;
    course_title: string | null;
    course_id: string | null;
    /** Curriculum week for this module at this week number. */
    topic: string | null;
    objectives: string[];
    activities: string[];
    /** Teaching state for this module-week. */
    lesson_status: string | null;
    has_assignment: boolean;
    has_flashcards: boolean;
    /** Locked weeks are no longer rewritten when the spine changes. */
    locked: boolean;
  }>;
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    // Staff-only: this exposes unpublished teaching state, not marketing copy.
    const session = await createServerClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sb = specialProgramsAdminClient();
    const { data: caller } = await sb
      .from('portal_users').select('role').eq('id', user.id).maybeSingle();
    if (!['admin', 'teacher', 'school'].includes(String(caller?.role ?? ''))) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { data: page } = await sb
      .from('special_program_pages')
      .select('id,title,slug,content,starts_on,ends_on,academic_offering_id')
      .eq('id', id)
      .maybeSingle();
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const content = (page.content ?? {}) as PageContent;
    const tracks = Array.isArray(content.tracks) ? content.tracks : [];
    const spine = Array.isArray(content.weeks) ? content.weeks : [];
    const offeringId = page.academic_offering_id ? String(page.academic_offering_id) : null;

    // Plans carry the built curriculum; archived ones are previous rebuilds.
    const { data: planRows } = offeringId
      ? await sb
          .from('lesson_plans')
          .select('id,course_id,status,curriculum_release_id,courses(title)')
          .eq('academic_offering_id', offeringId)
          .eq('status', 'published')
      : { data: [] as any[] };
    const plans = (planRows ?? []) as Array<{
      id: string; course_id: string | null; curriculum_release_id: string | null;
      courses?: { title?: string } | Array<{ title?: string }> | null;
    }>;

    const releaseIds = plans.map((p) => p.curriculum_release_id).filter(Boolean) as string[];
    const { data: releaseRows } = releaseIds.length
      ? await sb.from('academic_curriculum_releases').select('id,course_id,content').in('id', releaseIds)
      : { data: [] as any[] };
    const releaseByCourse = new Map<string, any>();
    for (const r of (releaseRows ?? []) as Array<{ course_id: string | null; content: any }>) {
      if (r.course_id) releaseByCourse.set(String(r.course_id), r.content);
    }

    const planIds = plans.map((p) => p.id);
    const { data: lessonRows } = planIds.length
      ? await sb
          .from('lessons')
          .select('lesson_plan_id,curriculum_week_number,status,content_locked_at')
          .in('lesson_plan_id', planIds)
      : { data: [] as any[] };
    const { data: asgRows } = planIds.length
      ? await sb.from('assignments').select('lesson_plan_id,curriculum_week_number').in('lesson_plan_id', planIds)
      : { data: [] as any[] };
    const { data: deckRows } = planIds.length
      ? await sb.from('flashcard_decks').select('lesson_plan_id,curriculum_week_number').in('lesson_plan_id', planIds)
      : { data: [] as any[] };

    const key = (planId: string, week: number) => `${planId}:${week}`;
    const lessonState = new Map<string, string>();
    const lockedSet = new Set<string>();
    for (const l of (lessonRows ?? []) as any[]) {
      if (l.lesson_plan_id && l.curriculum_week_number != null) {
        const k = key(l.lesson_plan_id, Number(l.curriculum_week_number));
        lessonState.set(k, String(l.status || 'draft'));
        if (l.content_locked_at) lockedSet.add(k);
      }
    }
    const asgSet = new Set((asgRows ?? []).map((a: any) => key(a.lesson_plan_id, Number(a.curriculum_week_number))));
    const deckSet = new Set((deckRows ?? []).map((d: any) => key(d.lesson_plan_id, Number(d.curriculum_week_number))));

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const planForTrack = (trackTitle: string) => {
      const t = norm(trackTitle);
      const words = [...new Set(t.split(' ').filter((w) => w.length > 3))];
      return plans.find((p) => {
        const c = Array.isArray(p.courses) ? p.courses[0] : p.courses;
        const title = norm(String(c?.title ?? ''));
        if (!title) return false;
        if (title === t) return true;
        const set = new Set(title.split(' ').filter((w) => w.length > 3));
        return words.length > 0 && words.every((w) => set.has(w));
      }) ?? null;
    };

    // Curriculum weeks live under content.terms[].weeks[], numbered absolutely.
    const curriculumWeek = (courseId: string | null, week: number) => {
      if (!courseId) return null;
      const c = releaseByCourse.get(courseId);
      const terms = Array.isArray(c?.terms) ? c.terms : [];
      for (const term of terms) {
        const weeks = Array.isArray(term?.weeks) ? term.weeks : [];
        const hit = weeks.find((w: any) => Number(w?.week) === week);
        if (hit) return hit;
      }
      return null;
    };

    const spineWeeks: SpineWeek[] = spine.map((w: any, index: number) => {
      const num = Number(String(w?.num ?? '').replace(/\D+/g, '')) || index + 1;
      const modules: SpineWeek['modules'] = [];

      for (const track of tracks) {
        const window = resolveTrackTeachingWindow(track, content);
        if (!window.weekNumbers.includes(num)) continue;
        const plan = planForTrack(String((track as any).title ?? ''));
        const course = plan ? (Array.isArray(plan.courses) ? plan.courses[0] : plan.courses) : null;
        const cw = curriculumWeek(plan?.course_id ?? null, num);
        const asArray = (v: unknown): string[] =>
          Array.isArray(v) ? v.map(String) : typeof v === 'string' && v.trim() ? [v] : [];

        modules.push({
          track_id: (track as any).id ?? null,
          track_title: String((track as any).title ?? 'Module'),
          module_label: (track as any).week ?? null,
          icon: (track as any).icon ?? null,
          course_title: course?.title ? String(course.title) : null,
          course_id: plan?.course_id ?? null,
          topic: cw?.topic ? String(cw.topic) : null,
          objectives: asArray(cw?.objectives),
          activities: asArray(cw?.student_activities ?? cw?.activities),
          lesson_status: plan ? lessonState.get(key(plan.id, num)) ?? null : null,
          has_assignment: plan ? asgSet.has(key(plan.id, num)) : false,
          has_flashcards: plan ? deckSet.has(key(plan.id, num)) : false,
          locked: plan ? lockedSet.has(key(plan.id, num)) : false,
        });
      }

      return {
        week: num,
        label: String(w?.num ?? `Week ${num}`),
        title: String(w?.title ?? ''),
        tag: w?.tag ? String(w.tag) : null,
        desc: w?.desc ? String(w.desc) : null,
        modules,
      };
    });

    return NextResponse.json({
      data: {
        page: { id: page.id, title: page.title, slug: page.slug, starts_on: page.starts_on, ends_on: page.ends_on },
        total_weeks: spineWeeks.length,
        weeks: spineWeeks,
        // A week nobody teaches is the failure this view exists to make visible.
        uncovered_weeks: spineWeeks.filter((w) => w.modules.length === 0).map((w) => w.week),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load curriculum' }, { status: 500 });
  }
}
