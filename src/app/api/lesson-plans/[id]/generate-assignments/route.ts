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

    // Fetch lesson plan
    const { data: plan, error: planErr } = await (supabase as any)
      .from('lesson_plans')
      .select('*, courses(title, programs(name)), classes(name), curriculum:course_curricula(content, version)')
      .eq('id', id)
      .single();

    if (planErr || !plan) {
      return NextResponse.json({ error: 'Lesson plan not found' }, { status: 404 });
    }

    if (plan.status !== 'published') {
      return NextResponse.json({ error: 'Only published plans can generate assignments' }, { status: 422 });
    }
    if (!hasPlanBindings(plan)) {
      return NextResponse.json({ error: 'Lesson plan is missing course or school binding' }, { status: 422 });
    }
    const planCourseId = plan.course_id as string;
    const planSchoolId = plan.school_id as string;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const dryRun = body.dry_run === true;
    const planData = plan.plan_data as any;
    const weeks = extractLessonPlanOperationWeeks(plan.plan_data) as Array<{
      week: number;
      topic: string;
      objectives?: string;
      activities?: string;
      syllabus_ref?: { year_number?: number; term_number?: number; week_number?: number };
    }>;
    const { data: existingAssignments } = await supabase
      .from('assignments')
      .select('id, metadata, assignment_type')
      .eq('course_id', planCourseId)
      .eq('school_id', planSchoolId)
      .neq('assignment_type', 'project');
    const existingWeekSet = new Set<string>(
      (existingAssignments ?? [])
        .filter((a) => {
          const metadata = (a.metadata as Record<string, unknown> | null) ?? null;
          return metadata?.lesson_plan_id === id;
        })
        .map((a) => {
          const metadata = (a.metadata as Record<string, unknown> | null) ?? null;
          return getWeekCompositeKey({
            week: Number(metadata?.week_number ?? -1),
            syllabus_ref: {
              year_number: Number(metadata?.year_number ?? 0),
              term_number: Number(metadata?.term_number ?? 0),
            },
          });
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
          target: 'assignments',
        },
      });
    }

    if (weeks.length === 0) {
      return NextResponse.json({ error: 'No weeks defined in plan' }, { status: 422 });
    }

    const curriculumContent = plan.curriculum?.content as SyllabusContentImport | undefined;
    const termNum = inferTermNumberFromPlanTerm(plan.term);
    const programName = (plan.courses as { programs?: { name?: string | null } | null } | null)?.programs?.name;

    // Calculate due dates based on term schedule
    const termStart = plan.term_start ? new Date(plan.term_start) : new Date();
    const cadenceDays = 7; // Weekly by default

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
            emit({ generated, total, current: week.week, status: `Generating assignment for Week ${week.week}: ${week.topic}...` });

            // Calculate due date for this week
            const dueDate = new Date(termStart);
            dueDate.setDate(dueDate.getDate() + (week.week * cadenceDays));

            const yearNumber = Number(week.syllabus_ref?.year_number ?? 0);
            const termNumber = Number(week.syllabus_ref?.term_number ?? termNum);
            const effectiveTermNum = Number.isFinite(termNumber) && termNumber > 0 ? termNumber : termNum;
            const syllabusWeek = findSyllabusWeek(curriculumContent, effectiveTermNum, week.week);
            const syllabusReference = buildSyllabusAnchorText(syllabusWeek);

            // Call AI generate endpoint
            const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
            const aiRes = await fetch(`${appBaseUrl}/api/ai/generate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Cookie': req.headers.get('cookie') || '',
              },
              body: JSON.stringify({
                type: 'assignment',
                topic: week.topic,
                gradeLevel: plan.classes?.name || 'Basic 1–SS3',
                subject: plan.courses?.title || 'Coding & Technology',
                courseName: plan.courses?.title,
                programName,
                assignmentType: 'homework',
                syllabusReference,
                planWeekObjectives: typeof week.objectives === 'string' ? week.objectives : '',
                planWeekActivities: typeof week.activities === 'string' ? week.activities : '',
                priorAssignmentTitlesThisRun: [...titlesThisRun],
              }),
            });

            if (!aiRes.ok) {
              console.warn(`Failed to generate assignment for week ${week.week}:`, await aiRes.text());
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

            // Save assignment as draft — is_active:false so term-scheduler releases it week-by-week
            const { error: insertErr } = await supabase.from('assignments').insert({
              course_id: planCourseId,
              class_id: plan.class_id,
              school_id: planSchoolId,
              title: aiData.data.title || `${week.topic} Assignment`,
              description: aiData.data.description || '',
              instructions: aiData.data.instructions || '',
              assignment_type: aiData.data.assignment_type || 'homework',
              due_date: dueDate.toISOString(),
              max_points: 100,
              is_active: false,
              metadata: {
                ...aiData.data.metadata,
                lesson_plan_id: plan.id,
                week_number: week.week,
                year_number: Number.isFinite(yearNumber) && yearNumber > 0 ? yearNumber : null,
                term_number: Number.isFinite(effectiveTermNum) && effectiveTermNum > 0 ? effectiveTermNum : null,
              },
              questions: aiData.data.questions || [],
            });

            if (insertErr) {
              console.error(`Failed to save assignment for week ${week.week}:`, insertErr);
              emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} (save error)` });
              skipped++;
              continue;
            }

            titlesThisRun.push((aiData.data.title || `${week.topic} Assignment`) as string);
            generated++;
            emit({ generated, total, current: week.week, status: `Generated Week ${week.week}` });
          } catch (err: any) {
            console.error(`Error generating assignment for week ${week.week}:`, err);
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
  } catch (err: any) {
    console.error('Bulk assignment generation error:', err);
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 });
  }
}
