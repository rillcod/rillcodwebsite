import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  buildSyllabusAnchorText,
  findSyllabusWeek,
  inferTermNumberFromPlanTerm,
  type SyllabusContentImport,
} from '@/lib/lesson-plans/syllabusImport';
import { hasPlanBindings } from '@/lib/api-guards';
import { extractLessonPlanOperationWeeks, getWeekCompositeKey } from '@/lib/progression/lessonPlanOperation';

const ALLOWED_LESSON_TYPES = [
  'lesson', 'video', 'interactive', 'hands-on', 'hands_on', 'workshop',
  'coding', 'reading', 'quiz', 'assignment', 'article', 'project', 'lab',
  'live', 'practice', 'checkpoint', 'robotics', 'electronics', 'mechanics',
  'design', 'iot', 'ai',
];

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!['admin', 'teacher'].includes(profile?.role || '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch lesson plan with curriculum
    const { data: plan, error: planErr } = await supabase
      .from('lesson_plans')
      .select('*, courses(title, programs(name)), classes(name), curriculum:course_curricula(content, version)')
      .eq('id', id)
      .single();

    if (planErr || !plan) {
      return NextResponse.json({ error: 'Lesson plan not found' }, { status: 404 });
    }

    if (plan.status !== 'published') {
      return NextResponse.json({ error: 'Only published plans can generate lessons' }, { status: 422 });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const dryRun = body.dry_run === true;
    const planData = (plan.plan_data ?? {}) as Record<string, unknown>;
    const weeks = extractLessonPlanOperationWeeks(plan.plan_data) as Array<{
      week: number;
      topic: string;
      objectives?: string;
      activities?: string;
      syllabus_ref?: { year_number?: number; term_number?: number; week_number?: number };
    }>;
    if (!hasPlanBindings(plan)) {
      return NextResponse.json(
        { error: 'Lesson plan is missing course or school binding' },
        { status: 422 },
      );
    }
    const planCourseId = plan.course_id as string;
    const planSchoolId = plan.school_id as string;
    const { data: existingLessons } = await supabase
      .from('lessons')
      .select('id, metadata')
      .eq('course_id', planCourseId)
      .eq('school_id', planSchoolId);
    const existingWeekSet = new Set<string>(
      (existingLessons ?? [])
        .filter((l) => {
          const metadata = (l.metadata as Record<string, unknown> | null) ?? null;
          return metadata?.lesson_plan_id === id;
        })
        .map((l) => {
          const metadata = (l.metadata as Record<string, unknown> | null) ?? null;
          const week = {
            week: Number(metadata?.week ?? -1),
            syllabus_ref: {
              year_number: Number(metadata?.year_number ?? 0),
              term_number: Number(metadata?.term_number ?? 0),
            },
          };
          return getWeekCompositeKey(week);
        }),
    );
    const projectedSkips = weeks.filter((w) => existingWeekSet.has(getWeekCompositeKey(w as unknown as Record<string, unknown>))).length;
    if (dryRun) {
      return NextResponse.json({
        data: {
          dry_run: true,
          total_weeks: weeks.length,
          projected_generations: weeks.length - projectedSkips,
          projected_skips: projectedSkips,
          target: 'lessons',
        },
      });
    }

    if (weeks.length === 0) {
      return NextResponse.json({ error: 'No weeks defined in plan' }, { status: 422 });
    }

    // Extract curriculum context for richer AI generation
    const curriculumContent = plan.curriculum?.content as SyllabusContentImport | undefined;
    const allCurriculumTopics: string[] = curriculumContent?.terms
      ? curriculumContent.terms.flatMap(
          (t: { weeks?: { topic?: string }[] }) =>
            t.weeks
              ?.map((w) => w.topic)
              .filter((topic): topic is string => typeof topic === 'string' && topic.trim().length > 0) ?? [],
        )
      : [];
    const programName = (plan.courses as { programs?: { name?: string | null } | null } | null)?.programs?.name || (curriculumContent as { course_title?: string } | undefined)?.course_title || undefined;
    const courseName = (plan.courses as { title?: string | null } | null)?.title || undefined;
    const termNum = inferTermNumberFromPlanTerm(plan.term);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        let generated = 0;
        let skipped = 0;
        const total = weeks.length;
        const titlesThisRun: string[] = [];

        for (const week of weeks) {
          try {
            emit({ generated, total, current: week.week, status: `Generating lesson for Week ${week.week}: ${week.topic}...` });

            // Sibling lessons = all OTHER topics in the curriculum (for continuity)
            const siblingLessons = allCurriculumTopics.filter((t: string) => t !== week.topic);
            const yearNumber = Number(week.syllabus_ref?.year_number ?? 0);
            const termNumber = Number(week.syllabus_ref?.term_number ?? termNum);
            const effectiveTermNum = Number.isFinite(termNumber) && termNumber > 0 ? termNumber : termNum;
            const syllabusWeek = findSyllabusWeek(curriculumContent, effectiveTermNum, week.week);
            const syllabusReference = buildSyllabusAnchorText(syllabusWeek);
            const durationFromSyllabus = syllabusWeek?.lesson_plan?.duration_minutes;
            const durationMinutes =
              typeof durationFromSyllabus === 'number' && Number.isFinite(durationFromSyllabus)
                ? Math.min(180, Math.max(15, durationFromSyllabus))
                : 60;

            // Call AI generate endpoint with full curriculum context
            const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
            const aiRes = await fetch(`${appBaseUrl}/api/ai/generate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Cookie': req.headers.get('cookie') || '',
              },
              body: JSON.stringify({
                type: 'lesson',
                topic: week.topic,
                gradeLevel: plan.classes?.name || 'Basic 1–SS3',
                subject: courseName || 'Coding & Technology',
                durationMinutes,
                courseName,
                programName,
                siblingLessons: siblingLessons.slice(0, 10), // Cap to avoid huge prompts
                syllabusReference,
                planWeekObjectives: typeof week.objectives === 'string' ? week.objectives : '',
                planWeekActivities: typeof week.activities === 'string' ? week.activities : '',
                priorLessonTitlesThisRun: [...titlesThisRun],
              }),
            });

            if (!aiRes.ok) {
              console.warn(`Failed to generate lesson for week ${week.week}:`, await aiRes.text());
              emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} (AI error)` });
              skipped++;
              continue;
            }

            const aiData = await aiRes.json();
            if (!aiData.success || !aiData.data) {
              console.warn(`Invalid AI response for week ${week.week}`);
              emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} (invalid response)` });
              skipped++;
              continue;
            }

            if (existingWeekSet.has(getWeekCompositeKey(week as unknown as Record<string, unknown>))) {
              emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} (already exists)` });
              skipped++;
              continue;
            }

            // Save lesson as draft — store lesson_plan_id in metadata so we can find it later
            const { error: insertErr } = await supabase.from('lessons').insert({
              course_id: planCourseId,
              school_id: planSchoolId,
              title: aiData.data.title || week.topic,
              description: aiData.data.description || '',
              lesson_notes: aiData.data.lesson_notes || '',
              content_layout: aiData.data.content_layout || [],
              video_url: aiData.data.video_url || null,
              duration_minutes: aiData.data.duration_minutes || 60,
              lesson_type: ALLOWED_LESSON_TYPES.includes(aiData.data.lesson_type) ? aiData.data.lesson_type : 'lesson',
              status: 'draft',
              metadata: {
                source: 'lesson-plan-bulk',
                lesson_plan_id: id,
                week: week.week,
                year_number: Number.isFinite(yearNumber) && yearNumber > 0 ? yearNumber : null,
                term_number: Number.isFinite(effectiveTermNum) && effectiveTermNum > 0 ? effectiveTermNum : null,
              },
            });

            if (insertErr) {
              console.error(`Failed to save lesson for week ${week.week}:`, insertErr);
              emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} (save error)` });
              skipped++;
              continue;
            }

            const savedTitle = (aiData.data.title || week.topic) as string;
            titlesThisRun.push(savedTitle);
            generated++;
            emit({ generated, total, current: week.week, status: `Generated Week ${week.week}` });
          } catch (err: unknown) {
            console.error(`Error generating lesson for week ${week.week}:`, err);
            emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} (error)` });
            skipped++;
          }
        }

        emit({ done: true, generated, skipped, total });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: unknown) {
    console.error('Bulk lesson generation error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 },
    );
  }
}
