import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

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
      .select('*, courses(title), classes(name)')
      .eq('id', id)
      .single();

    if (planErr || !plan) {
      return NextResponse.json({ error: 'Lesson plan not found' }, { status: 404 });
    }

    if (plan.status !== 'published') {
      return NextResponse.json({ error: 'Only published plans can generate projects' }, { status: 422 });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const dryRun = body.dry_run === true;
    const planData = plan.plan_data as any;
    const weeks = (planData?.weeks ?? []) as Array<{ week: number; topic: string; objectives?: string; activities?: string }>;
    const { data: existingProjects } = await supabase
      .from('assignments')
      .select('id, metadata, assignment_type')
      .eq('course_id', plan.course_id)
      .eq('school_id', plan.school_id)
      .eq('assignment_type', 'project');
    const existingWeekSet = new Set<number>(
      (existingProjects ?? [])
        .filter((a) => {
          const metadata = (a.metadata as Record<string, unknown> | null) ?? null;
          return metadata?.lesson_plan_id === id;
        })
        .map((a) => Number((a.metadata as Record<string, unknown> | null)?.week_number ?? -1))
        .filter((n) => Number.isFinite(n) && n > 0),
    );
    const projectedSkips = weeks.filter((w) => existingWeekSet.has(w.week)).length;
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

        for (const week of weeks) {
          try {
            emit({ generated, total, current: week.week, status: `Generating project for Week ${week.week}: ${week.topic}...` });

            // Calculate due date for this week (projects get more time)
            const dueDate = new Date(termStart);
            dueDate.setDate(dueDate.getDate() + (week.week * cadenceDays) + 7); // Extra week for projects

            // Call AI generate endpoint
            const aiRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ai/generate`, {
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
                assignmentType: 'project',
              }),
            });

            if (!aiRes.ok) {
              console.warn(`Failed to generate project for week ${week.week}:`, await aiRes.text());
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

            if (existingWeekSet.has(week.week)) {
              emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} (already exists)` });
              skipped++;
              continue;
            }

            // Save project as draft
            const { error: insertErr } = await supabase.from('assignments').insert({
              course_id: plan.course_id,
              class_id: plan.class_id,
              school_id: plan.school_id,
              title: aiData.data.title || `${week.topic} Project`,
              description: aiData.data.description || '',
              instructions: aiData.data.instructions || '',
              assignment_type: 'project',
              due_date: dueDate.toISOString(),
              max_points: 100,
              metadata: { ...aiData.data.metadata, lesson_plan_id: plan.id, week_number: week.week },
              questions: aiData.data.questions || [],
            });

            if (insertErr) {
              console.error(`Failed to save project for week ${week.week}:`, insertErr);
              emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} (save error)` });
              skipped++;
              continue;
            }

            generated++;
            emit({ generated, total, current: week.week, status: `Generated Week ${week.week}` });
          } catch (err: any) {
            console.error(`Error generating project for week ${week.week}:`, err);
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
    console.error('Bulk project generation error:', err);
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 });
  }
}
