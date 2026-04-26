import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  buildSyllabusAnchorText,
  findSyllabusWeek,
  inferTermNumberFromPlanTerm,
  type SyllabusContentImport,
} from '@/lib/lesson-plans/syllabusImport';
import { AIFetchError, fetchAIGenerate } from '@/lib/lesson-plans/ai-fetch';
import { validateLessonPlanForGeneration } from '@/lib/api-guards';
import { extractLessonPlanOperationWeeks, getWeekCompositeKey, parseWeekTermRefs } from '@/lib/progression/lessonPlanOperation';
import { requireStaffUser } from '@/app/api/lesson-plans/authz';
import { createSSEResponse } from '@/lib/sse-stream';

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
    const staff = await requireStaffUser(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: plan, error: planErr } = await supabase
      .from('lesson_plans')
      .select('*, courses(title, programs(name)), classes(name), curriculum:course_curricula(content, version)')
      .eq('id', id)
      .single();

    const validationError = validateLessonPlanForGeneration(planErr ? null : plan);
    if (validationError) return NextResponse.json({ error: validationError.error }, { status: validationError.status });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const dryRun = body.dry_run === true;
    const weeks = extractLessonPlanOperationWeeks(plan!.plan_data) as Array<{
      week: number;
      topic: string;
      objectives?: string;
      activities?: string;
      syllabus_ref?: { year_number?: number; term_number?: number; week_number?: number };
    }>;

    const planCourseId = plan!.course_id as string;
    const planSchoolId = plan!.school_id as string;

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
          return getWeekCompositeKey({
            week: Number(metadata?.week ?? -1),
            syllabus_ref: {
              year_number: Number(metadata?.year_number ?? 0),
              term_number: Number(metadata?.term_number ?? 0),
            },
          });
        }),
    );

    const projectedSkips = weeks.filter((w) =>
      existingWeekSet.has(getWeekCompositeKey(w as unknown as Record<string, unknown>))
    ).length;

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

    const curriculumContent = plan!.curriculum?.content as SyllabusContentImport | undefined;
    const allCurriculumTopics: string[] = curriculumContent?.terms
      ? curriculumContent.terms.flatMap(
          (t: { weeks?: { topic?: string }[] }) =>
            t.weeks
              ?.map((w) => w.topic)
              .filter((topic): topic is string => typeof topic === 'string' && topic.trim().length > 0) ?? [],
        )
      : [];
    const programName =
      (plan!.courses as { programs?: { name?: string | null } | null } | null)?.programs?.name ||
      (curriculumContent as { course_title?: string } | undefined)?.course_title ||
      undefined;
    const courseName = (plan!.courses as { title?: string | null } | null)?.title || undefined;
    const termNum = inferTermNumberFromPlanTerm(plan!.term);
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const cookieHeader = req.headers.get('cookie') || '';

    return createSSEResponse(async (emit) => {
      let generated = 0;
      let skipped = 0;
      const total = weeks.length;
      const titlesThisRun: string[] = [];
      const failures: { week: number; topic: string; reason: string }[] = [];

      for (const week of weeks) {
        try {
          emit({ generated, total, current: week.week, status: `Generating lesson for Week ${week.week}: ${week.topic}...` });

          if (existingWeekSet.has(getWeekCompositeKey(week as unknown as Record<string, unknown>))) {
            emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} (already exists)` });
            skipped++;
            continue;
          }

          const siblingLessons = allCurriculumTopics.filter((t: string) => t !== week.topic);
          const { yearNumber, effectiveTermNum } = parseWeekTermRefs(week, termNum);
          const syllabusWeek = findSyllabusWeek(curriculumContent, effectiveTermNum, week.week);
          const syllabusReference = buildSyllabusAnchorText(syllabusWeek);
          const durationFromSyllabus = syllabusWeek?.lesson_plan?.duration_minutes;
          const durationMinutes =
            typeof durationFromSyllabus === 'number' && Number.isFinite(durationFromSyllabus)
              ? Math.min(180, Math.max(15, durationFromSyllabus))
              : 60;

          let aiData: { success: true; data: unknown };
          try {
            aiData = await fetchAIGenerate(appBaseUrl, cookieHeader, {
              type: 'lesson',
              topic: week.topic,
              gradeLevel: plan!.classes?.name || 'Basic 1–SS3',
              subject: courseName || 'Coding & Technology',
              durationMinutes,
              courseName,
              programName,
              siblingLessons: siblingLessons.slice(0, 10),
              syllabusReference,
              planWeekObjectives: typeof week.objectives === 'string' ? week.objectives : '',
              planWeekActivities: typeof week.activities === 'string' ? week.activities : '',
              priorLessonTitlesThisRun: [...titlesThisRun],
            });
          } catch (err) {
            const reason = err instanceof AIFetchError ? err.reason : 'Unexpected AI error';
            failures.push({ week: week.week, topic: week.topic, reason });
            emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} — ${reason}` });
            skipped++;
            continue;
          }

          const d = aiData.data as Record<string, unknown>;
          const { error: insertErr } = await supabase.from('lessons').insert({
            course_id: planCourseId,
            school_id: planSchoolId,
            title: (d.title || week.topic) as string,
            description: (d.description || '') as string,
            lesson_notes: (d.lesson_notes || '') as string,
            content_layout: (d.content_layout || []) as [],
            video_url: (d.video_url || null) as string | null,
            duration_minutes: (d.duration_minutes || 60) as number,
            lesson_type: (ALLOWED_LESSON_TYPES.includes(d.lesson_type as string) ? d.lesson_type : 'lesson') as string,
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
            failures.push({ week: week.week, topic: week.topic, reason: 'Database save failed' });
            emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} — save error` });
            skipped++;
            continue;
          }

          titlesThisRun.push((d.title || week.topic) as string);
          generated++;
          emit({ generated, total, current: week.week, status: `Generated Week ${week.week}` });
        } catch (err: unknown) {
          console.error(`Error generating lesson for week ${week.week}:`, err);
          failures.push({ week: week.week, topic: week.topic, reason: 'Unexpected error' });
          emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} — unexpected error` });
          skipped++;
        }
      }

      if (failures.length > 0) {
        await supabase.from('lesson_plans').update({
          metadata: { last_generation_errors: { lessons: failures, generated_at: new Date().toISOString() } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any).eq('id', id);
      }

      emit({ done: true, generated, skipped, total, failures });
    });
  } catch (err: unknown) {
    console.error('Bulk lesson generation error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 },
    );
  }
}
