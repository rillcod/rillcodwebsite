import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { queueService } from '@/services/queue.service';
import { buildRillcodTransactionalEmailHtml, escapeHtml } from '@/lib/email/rillcod-transactional-email';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function getCaller(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller as Caller;
}

/**
 * Returns true if the caller may manage (grade) a submission.
 */
async function callerCanManageSubmission(
  caller: Caller,
  assignmentSchoolId: string | null,
  assignmentCreatedBy: string | null,
): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (caller.role === 'school') {
    return !assignmentSchoolId || assignmentSchoolId === caller.school_id;
  }
  if (caller.role === 'teacher') {
    if (assignmentCreatedBy === caller.id) return true;
    if (!assignmentSchoolId) return false;
    if (caller.school_id === assignmentSchoolId) return true;
    const { data: ts } = await adminClient()
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', caller.id)
      .eq('school_id', assignmentSchoolId)
      .maybeSingle();
    return !!ts;
  }
  return false;
}

// PATCH /api/grading/submissions/[id] — accept AI grade or override
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    const admin = adminClient();

    // Fetch existing submission and assignment details
    const { data: submission } = await admin
      .from('assignment_submissions')
      .select('id, grade, ai_suggested_grade, grading_mode, file_url, portal_user_id, assignments(title, school_id, created_by, weight, max_points)')
      .eq('id', id)
      .maybeSingle();

    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const assignment = (submission as any).assignments;
    const assignmentSchoolId: string | null  = assignment?.school_id   ?? null;
    const assignmentCreatedBy: string | null = assignment?.created_by  ?? null;
    const assignmentTitle: string            = assignment?.title       || 'Assignment';
    const assignMax: number                  = assignment?.max_points  ?? 100;
    const assignWeight: number               = assignment?.weight      ?? 0;
    const studentId: string                  = submission.portal_user_id;

    const canManage = await callerCanManageSubmission(caller, assignmentSchoolId, assignmentCreatedBy);
    if (!canManage) {
      return NextResponse.json({ error: 'Forbidden: submission is outside your school scope' }, { status: 403 });
    }

    const { action, grade, feedback } = await req.json();

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    let auditAction = '';

    if (action === 'accept_ai') {
      updateData.grade = submission.ai_suggested_grade;
      updateData.grading_mode = 'auto';
      updateData.status = 'graded';
      updateData.graded_at = new Date().toISOString();
      updateData.graded_by = caller.id;
      auditAction = 'accept_ai_grade';
    } else if (action === 'override') {
      if (grade == null) return NextResponse.json({ error: 'grade is required for override', field: 'grade' }, { status: 400 });
      updateData.grade = grade;
      updateData.feedback = feedback || null;
      updateData.grading_mode = 'manual';
      updateData.status = 'graded';
      updateData.graded_at = new Date().toISOString();
      updateData.graded_by = caller.id;
      auditAction = 'override_grade';
    } else {
      return NextResponse.json({ error: 'Invalid action. Use accept_ai or override' }, { status: 400 });
    }

    // Auto-compute weighted_score
    if (updateData.grade != null) {
      updateData.weighted_score = (assignWeight > 0 && assignMax > 0)
        ? Math.round((Number(updateData.grade) / assignMax) * assignWeight)
        : null;
    }

    // When marking as graded, delete image files from storage to free space
    if (submission.file_url) {
      if (/\.(png|jpe?g|gif|webp|bmp|heic)(\?|$)/i.test(submission.file_url)) {
        const marker    = '/object/public/assignments/';
        const markerIdx = submission.file_url.indexOf(marker);
        if (markerIdx !== -1) {
          const storagePath = decodeURIComponent(
            submission.file_url.slice(markerIdx + marker.length).split('?')[0],
          );
          await admin.storage.from('assignments').remove([storagePath]);
        }
        updateData.file_url = null;
      }
    }

    const { error } = await admin.from('assignment_submissions').update(updateData as any).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Write audit log
    await admin.from('audit_logs').insert({
      actor_id: caller.id,
      resource_type: 'assignment_submission',
      resource_id: id,
      action: auditAction,
      old_value: String(submission.grade ?? submission.ai_suggested_grade ?? ''),
      new_value: String(updateData.grade ?? ''),
    }).then(({ error }) => { if (error) console.error('[audit_log]', error.message); });

    // Send notifications (in-app and email) when graded
    if (studentId) {
      (async () => {
        const { data: student } = await admin
          .from('portal_users').select('email, full_name').eq('id', studentId).single();
        if (!student) return;

        const gradeVal = updateData.grade as number | null;
        const scoreLabel = gradeVal != null ? `${gradeVal}/${assignMax}` : 'graded';

        // 1. In-app notification
        await admin.from('notifications').insert({
          user_id: studentId,
          title: 'Assignment Graded',
          message: `"${assignmentTitle}" has been graded — score: ${scoreLabel}.${updateData.feedback ? ' Feedback left by your teacher.' : ''}`,
          type: 'success',
          is_read: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).then(({ error }) => { if (error) console.error('[in-app notification]', error.message); });

        // 2. Email notification
        if (!student.email) return;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
        const html = buildRillcodTransactionalEmailHtml({
          title: 'Assignment Graded',
          bodyHtml: `<p>Hi ${escapeHtml(student.full_name?.split(' ')[0] || 'there')},</p>
            <p>Your assignment <strong>${escapeHtml(assignmentTitle)}</strong> has been graded by your teacher.</p>
            ${updateData.feedback ? `<p><strong>Feedback:</strong> ${escapeHtml(updateData.feedback as string)}</p>` : ''}`,
          summaryRows: [
            { label: 'Assignment', value: assignmentTitle },
            { label: 'Score', value: gradeVal != null ? `${gradeVal} / ${assignMax}` : 'Graded' },
            ...(updateData.weighted_score != null ? [{ label: 'Weighted Score', value: String(updateData.weighted_score) }] : []),
          ],
          cta: { href: `${appUrl}/dashboard/assignments`, label: 'View Results & Feedback' },
          footerNote: 'This grade was submitted by your teacher.',
        });
        await queueService.queueNotification(studentId, 'email', {
          to: student.email,
          subject: `Graded: "${assignmentTitle}"`,
          html,
        });
      })().catch(console.error);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
