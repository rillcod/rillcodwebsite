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
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const supabase = await createServerClient();
    const cronSecret = extractCronSecret(req);
    const isCron = isValidCronSecret(cronSecret);
    const staff = isCron ? { id: 'cron', role: 'admin' } : await requireStaffUser(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: plan, error: planErr } = await (supabase as any)
      .from('lesson_plans')
      .select('*, courses(title, programs(name)), classes(name), curriculum:course_curricula(content, version)')
      .eq('id', id)
      .single();

    const validationError = validateLessonPlanForGeneration(planErr ? null : plan);
    if (validationError) return NextResponse.json({ error: validationError.error }, { status: validationError.status });

    const planCourseId = plan.course_id as string;
    const planSchoolId = plan.school_id as string;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const dryRun = body.dry_run === true;
    const maxWeeks = typeof body.max_weeks === 'number' && body.max_weeks > 0 ? body.max_weeks : undefined;
    const extraHeaders = isCron ? { 'x-cron-secret': cronSecret } : undefined;
    const weeks = extractLessonPlanOperationWeeks(plan.plan_data) as Array<{
      week: number;
      topic: string;
      objectives?: string;
      activities?: string;
      notes?: string;
      project?: { title?: string; description?: string; deliverables?: string[] };
      practical_assessment?: { skill_checkpoints?: string[]; max_score?: number };
      syllabus_ref?: { year_number?: number; term_number?: number; week_number?: number };
    }>;

    const { data: existingProjects } = await supabase
      .from('assignments')
      .select('id, metadata, assignment_type')
      .eq('course_id', planCourseId)
      .eq('school_id', planSchoolId)
      .eq('assignment_type', 'project');

    const existingWeekSet = new Set<string>(
      (existingProjects ?? [])
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
          target: 'projects',
        },
      });
    }

    if (weeks.length === 0) {
      return NextResponse.json({ error: 'No weeks defined in plan' }, { status: 422 });
    }

    const curriculumContent = plan.curriculum?.content as SyllabusContentImport | undefined;
    const termNum = inferTermNumberFromPlanTerm(plan.term);
    const programName = (plan.courses as { programs?: { name?: string | null } | null } | null)?.programs?.name;
    const termStart = plan.term_start ? new Date(plan.term_start) : new Date();
    const cadenceDays = 7;
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const cookieHeader = req.headers.get('cookie') || '';

    return createSSEResponse(async (emit) => {
      let generated = 0;
      let skipped = 0;
      const total = weeks.length;
      const failures: { week: number; topic: string; reason: string }[] = [];

      for (const week of weeks) {
        try {
          emit({ generated, total, current: week.week, status: `Generating project for Week ${week.week}: ${week.topic}...` });

          if (existingWeekSet.has(getWeekCompositeKey(week as unknown as Record<string, unknown>))) {
            emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} (already exists)` });
            skipped++;
            continue;
          }

          const dueDate = new Date(termStart);
          dueDate.setDate(dueDate.getDate() + (week.week * cadenceDays) + 7);

          const { yearNumber, effectiveTermNum } = parseWeekTermRefs(week, termNum);
          const syllabusWeek = findSyllabusWeek(curriculumContent, effectiveTermNum, week.week);
          const syllabusReference = buildSyllabusAnchorText(syllabusWeek);

          let aiData: { success: true; data: unknown };
          try {
            aiData = await fetchAIGenerate(appBaseUrl, cookieHeader, {
              type: 'assignment',
              topic: week.topic,
              gradeLevel: plan.classes?.name || 'Basic 1–SS3',
              subject: plan.courses?.title || 'Coding & Technology',
              courseName: plan.courses?.title,
              assignmentType: 'project',
              programName,
              syllabusReference,
              planWeekObjectives: typeof week.objectives === 'string' ? week.objectives : '',
              planWeekActivities: typeof week.activities === 'string' ? week.activities : '',
              projectTitle: week.project?.title || `${week.topic} Project`,
              projectDescription: week.project?.description || week.notes || '',
              projectDeliverables: Array.isArray(week.project?.deliverables) ? week.project!.deliverables : [],
              practicalCheckpoints: Array.isArray(week.practical_assessment?.skill_checkpoints)
                ? week.practical_assessment!.skill_checkpoints
                : [],
            }, extraHeaders);
          } catch (err) {
            const reason = err instanceof AIFetchError ? err.reason : 'Unexpected AI error';
            failures.push({ week: week.week, topic: week.topic, reason });
            emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} — ${reason}` });
            skipped++;
            continue;
          }

          const d = aiData.data as Record<string, unknown>;
          const { error: insertErr } = await supabase.from('assignments').insert({
            course_id: planCourseId,
            class_id: plan.class_id,
            school_id: planSchoolId,
            title: (d.title || week.project?.title || `${week.topic} Project`) as string,
            description: (d.description || week.project?.description || '') as string,
            instructions: (d.instructions || (Array.isArray(week.project?.deliverables) ? week.project!.deliverables.join('\n') : '')) as string,
            assignment_type: 'project',
            due_date: dueDate.toISOString(),
            max_points: week.practical_assessment?.max_score || 100,
            metadata: {
              ...(d.metadata as Record<string, unknown> | undefined),
              lesson_plan_id: plan.id,
              week_number: week.week,
              year_number: Number.isFinite(yearNumber) && yearNumber > 0 ? yearNumber : null,
              term_number: Number.isFinite(effectiveTermNum) && effectiveTermNum > 0 ? effectiveTermNum : null,
              generated_from: 'progression_project_route',
            } as import('@/types/supabase').Json,
            questions: (d.questions || []) as import('@/types/supabase').Json[],
          });

          if (insertErr) {
            console.error(`Failed to save project for week ${week.week}:`, insertErr);
            failures.push({ week: week.week, topic: week.topic, reason: 'Database save failed' });
            emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} — save error` });
            skipped++;
            continue;
          }

          generated++;
          emit({ generated, total, current: week.week, status: `Generated Week ${week.week}` });
          if (maxWeeks && generated >= maxWeeks) break;
        } catch (err: unknown) {
          console.error(`Error generating project for week ${week.week}:`, err);
          failures.push({ week: week.week, topic: week.topic, reason: 'Unexpected error' });
          emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} — unexpected error` });
          skipped++;
        }
      }

      if (failures.length > 0) {
        await supabase.from('lesson_plans').update({
          metadata: { last_generation_errors: { projects: failures, generated_at: new Date().toISOString() } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any).eq('id', id);
      }

      emit({ done: true, generated, skipped, total, failures, truncated: maxWeeks ? generated >= maxWeeks : false });
    });
  } catch (err: unknown) {
    console.error('Bulk project generation error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 },
    );
  }
}
