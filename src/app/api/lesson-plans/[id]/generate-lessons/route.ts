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

    // Fetch lesson plan with curriculum
    const { data: plan, error: planErr } = await (supabase as any)
      .from('lesson_plans')
      .select('*, courses(title, programs(title)), classes(name), curriculum:course_curricula(content, version)')
      .eq('id', id)
      .single();

    if (planErr || !plan) {
      return NextResponse.json({ error: 'Lesson plan not found' }, { status: 404 });
    }

    if (plan.status !== 'published') {
      return NextResponse.json({ error: 'Only published plans can generate lessons' }, { status: 422 });
    }

    const planData = plan.plan_data as any;
    const weeks = (planData?.weeks ?? []) as Array<{ week: number; topic: string; objectives?: string; activities?: string }>;
    if (weeks.length === 0) {
      return NextResponse.json({ error: 'No weeks defined in plan' }, { status: 422 });
    }

    // Extract curriculum context for richer AI generation
    const curriculumContent = plan.curriculum?.content;
    const allCurriculumTopics: string[] = curriculumContent?.terms
      ? curriculumContent.terms.flatMap((t: any) => t.weeks?.map((w: any) => w.topic).filter(Boolean) ?? [])
      : [];
    const programName = (plan.courses as any)?.programs?.title || curriculumContent?.course_title || undefined;
    const courseName = (plan.courses as any)?.title || undefined;

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
            emit({ generated, total, current: week.week, status: `Generating lesson for Week ${week.week}: ${week.topic}...` });

            // Sibling lessons = all OTHER topics in the curriculum (for continuity)
            const siblingLessons = allCurriculumTopics.filter((t: string) => t !== week.topic);

            // Call AI generate endpoint with full curriculum context
            const aiRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ai/generate`, {
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
                durationMinutes: 60,
                courseName,
                programName,
                siblingLessons: siblingLessons.slice(0, 10), // Cap to avoid huge prompts
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

            // Save lesson as draft — store lesson_plan_id in metadata so we can find it later
            const { error: insertErr } = await supabase.from('lessons').insert({
              course_id: plan.course_id,
              school_id: plan.school_id,
              title: aiData.data.title || week.topic,
              description: aiData.data.description || '',
              lesson_notes: aiData.data.lesson_notes || '',
              content_layout: aiData.data.content_layout || [],
              video_url: aiData.data.video_url || null,
              duration_minutes: aiData.data.duration_minutes || 60,
              lesson_type: aiData.data.lesson_type || 'workshop',
              status: 'draft',
              metadata: {
                source: 'lesson-plan-bulk',
                lesson_plan_id: id,
                week: week.week,
              },
            });

            if (insertErr) {
              console.error(`Failed to save lesson for week ${week.week}:`, insertErr);
              emit({ generated, total, current: week.week, status: `Skipped Week ${week.week} (save error)` });
              skipped++;
              continue;
            }

            generated++;
            emit({ generated, total, current: week.week, status: `Generated Week ${week.week}` });
          } catch (err: any) {
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
  } catch (err: any) {
    console.error('Bulk lesson generation error:', err);
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 });
  }
}
