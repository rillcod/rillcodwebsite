import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { buildAssignmentEmail, isInAppEmail } from '@/lib/email/rillcod-transactional-email';
import { notificationsService } from '@/services/notifications.service';
import { SMTP_FROM_EMAIL } from '@/config/brand';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { scheduledWeekForDate } from './schedule';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET or POST /api/cron/term-scheduler
export async function GET(req: NextRequest) {
  return runMonitoredCron('term-scheduler', 1440, () => handleRequest(req));
}

export async function POST(req: NextRequest) {
  return runMonitoredCron('term-scheduler', 1440, () => handleRequest(req));
}

async function handleRequest(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = adminClient();

  // Get all active schedules
  const { data: schedules } = await supabase
    .from('term_schedules')
    .select('*, lesson_plans!lesson_plan_id(id, plan_data, class_id, course_id)')
    .eq('is_active', true);

  let released = 0;
  let waiting = 0;
  let finished = 0;
  let errors = 0;

  for (const schedule of schedules ?? []) {
    try {
      const planData = schedule.lesson_plans?.plan_data;
      if (!planData?.weeks) continue;

      const currentWeek = schedule.current_week;
      const weeks = Array.isArray(planData.weeks) ? planData.weeks : [];
      if (currentWeek > weeks.length) {
        const { error: finishError } = await supabase
          .from('term_schedules')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', schedule.id);
        if (finishError) throw finishError;
        finished += 1;
        continue;
      }
      const dueWeek = scheduledWeekForDate(schedule.term_start, schedule.cadence_days);
      if (dueWeek < currentWeek) {
        waiting += 1;
        continue;
      }
      const weekData = planData.weeks[currentWeek - 1];
      if (!weekData) continue;

      // Release lessons for current week (teacher-approved = those with a title set)
      const { error: lessonReleaseError } = await supabase
        .from('lessons')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('lesson_plan_id', schedule.lesson_plan_id)
        .eq('week_number', currentWeek)
        .eq('status', 'draft');
      if (lessonReleaseError) throw lessonReleaseError;

      // Release assignments for current week — keyed via metadata.lesson_plan_id + metadata.week_number
      const { data: activatedAssignments, error: assignmentReleaseError } = await supabase
        .from('assignments')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .filter('metadata->>lesson_plan_id', 'eq', schedule.lesson_plan_id)
        .filter('metadata->>week_number', 'eq', String(currentWeek))
        .or('is_active.is.null,is_active.eq.false')
        .select('id, title, description, instructions, due_date, max_points, metadata, courses(title)');
      if (assignmentReleaseError) throw assignmentReleaseError;

      // Notify students and parents by email for each activated assignment
      if (activatedAssignments && activatedAssignments.length > 0) {
        try {
          const classId = schedule.lesson_plans?.class_id;
          if (classId) {
            // Fetch students in this class who have email addresses
            const { data: students } = await supabase
              .from('portal_users')
              .select('id, email, full_name, school_id')
              .eq('section_class', classId)
              .eq('role', 'student')
              .eq('is_active', true)
              .not('email', 'is', null);

            const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rillcod.com';
            const portalUrl = `${appUrl}/dashboard/assignments`;

            for (const assignment of activatedAssignments) {
              const courseName = (assignment.courses as any)?.title ?? '';
              const className = (assignment.metadata as any)?.target_class_name ?? classId;

              for (const student of (students ?? [])) {
                if (!student.email || isInAppEmail(student.email)) continue;
                try {
                  const html = buildAssignmentEmail({
                    recipientName:    student.full_name ?? 'Student',
                    assignmentTitle:  assignment.title,
                    courseName:       courseName || undefined,
                    className:        className || undefined,
                    dueDate:          assignment.due_date || undefined,
                    maxPoints:        assignment.max_points ?? undefined,
                    instructions:     (assignment.instructions || assignment.description) ?? undefined,
                    portalUrl,
                    appUrl,
                  });
                  await notificationsService.sendEmail(student.id, {
                    to:        student.email,
                    subject:   `New Assignment: ${assignment.title} — Rillcod Technologies`,
                    fromName:  'Rillcod Technologies',
                    fromEmail: SMTP_FROM_EMAIL,
                    html,
                  });
                } catch { /* non-critical per-student failure */ }
              }
            }
          }
        } catch (notifyErr) {
          console.error('[term-scheduler] assignment email notification failed:', notifyErr);
        }
      }

      // Increment current_week
      const { error: advanceError } = await supabase
        .from('term_schedules')
        .update({ current_week: currentWeek + 1, updated_at: new Date().toISOString() })
        .eq('id', schedule.id);
      if (advanceError) throw advanceError;

      released++;
    } catch (e) {
      console.error(`Failed to release schedule ${schedule.id}:`, e);
      errors++;
    }
  }

  return NextResponse.json({ released, waiting, finished, errors, total: (schedules ?? []).length });
}
