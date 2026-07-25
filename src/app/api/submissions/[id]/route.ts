import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { queueService } from '@/services/queue.service';
import { buildRillcodTransactionalEmailHtml, escapeHtml } from '@/lib/email/rillcod-transactional-email';
import { normalizeGradeValueWithMax, normalizeSubmissionStatus } from '@/lib/api-guards';
import { callerCanManageAssignmentWork } from '@/lib/assignments/authz';

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

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/submissions/[id]
// Update grade, feedback, status, submission_text on a submission.
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const { id } = await context.params;
    const admin = adminClient();

    const { data: sub } = await admin
      .from('assignment_submissions')
      .select('id, assignment_id, grade, file_url, assignments(title, school_id, created_by, class_id, metadata, weight, max_points)')
      .eq('id', id)
      .maybeSingle();

    if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const assignment = (sub as any).assignments;
    const assignmentTitle: string = assignment?.title || 'Assignment';
    const assignMax: number = assignment?.max_points ?? 100;
    const assignWeight: number = assignment?.weight ?? 0;

    const canManage = await callerCanManageAssignmentWork(admin as any, caller, assignment);
    if (!canManage) {
      return NextResponse.json(
        { error: 'Access denied: this submission is outside your class/school scope' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const gradeResult = normalizeGradeValueWithMax(body.grade, assignMax);
    if ('grade' in body && gradeResult.error) {
      return NextResponse.json({ error: gradeResult.error, field: 'grade' }, { status: 400 });
    }
    if ('grade' in body && gradeResult.value === undefined) {
      return NextResponse.json({ error: 'grade must be a number or null', field: 'grade' }, { status: 400 });
    }
    const statusResult = normalizeSubmissionStatus(body.status);
    if ('status' in body && statusResult.error) {
      return NextResponse.json({ error: statusResult.error, field: 'status' }, { status: 400 });
    }

    const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ('grade' in body) allowed.grade = gradeResult.value ?? null;
    if ('feedback' in body) allowed.feedback = body.feedback ?? null;
    if ('status' in body) allowed.status = statusResult.value;
    if ('submission_text' in body) allowed.submission_text = body.submission_text ?? null;
    if ('weighted_score' in body) {
      if (body.weighted_score == null) {
        allowed.weighted_score = null;
      } else {
        const weightedScore = Number(body.weighted_score);
        if (!Number.isFinite(weightedScore) || weightedScore < 0 || (assignWeight > 0 && weightedScore > assignWeight)) {
          return NextResponse.json(
            { error: `weighted_score must be between 0 and ${assignWeight > 0 ? assignWeight : 'the assignment weight'}.`, field: 'weighted_score' },
            { status: 400 },
          );
        }
        allowed.weighted_score = weightedScore;
      }
    }

    if (body.status === 'graded' || 'grade' in body) {
      allowed.graded_by = caller.id;
      allowed.graded_at = new Date().toISOString();
      if (gradeResult.value != null && !('weighted_score' in body)) {
        allowed.weighted_score = (assignWeight > 0 && assignMax > 0)
          ? Math.round((gradeResult.value / assignMax) * assignWeight)
          : null;
      }
    }

    const { data, error } = await admin
      .from('assignment_submissions')
      .update(allowed)
      .eq('id', id)
      .select('id, grade, status, file_url, portal_user_id, weighted_score')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logAudit(admin as any, {
      action: 'grade_submission',
      actorId: caller.id,
      resourceType: 'assignment_submission',
      resourceId: id,
      oldValue: String(sub.grade ?? ''),
      newValue: `Score ${sub.grade ?? '—'} → ${allowed.grade ?? '—'}`,
    });

    if ((body.status === 'graded' || body.grade != null) && data?.portal_user_id) {
      (async () => {
        const { data: student } = await admin
          .from('portal_users').select('email, full_name').eq('id', data.portal_user_id!).single();
        if (!student) return;

        const gradeVal = (data.grade ?? allowed.grade) as number | null;
        const scoreLabel = gradeVal != null ? `${gradeVal}/${assignMax}` : 'graded';

        await admin.from('notifications').insert({
          user_id: data.portal_user_id!,
          title: 'Assignment Graded',
          message: `"${assignmentTitle}" has been graded — score: ${scoreLabel}.${allowed.feedback ? ' Feedback left by your teacher.' : ''}`,
          type: 'success',
          is_read: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).then(({ error: nErr }) => { if (nErr) console.error('[in-app notification]', nErr.message); });

        if (!student.email) return;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
        const html = buildRillcodTransactionalEmailHtml({
          title: 'Assignment Graded',
          bodyHtml: `<p>Hi ${escapeHtml(student.full_name?.split(' ')[0] || 'there')},</p>
            <p>Your assignment <strong>${escapeHtml(assignmentTitle)}</strong> has been graded by your teacher.</p>
            ${allowed.feedback ? `<p><strong>Feedback:</strong> ${escapeHtml(allowed.feedback as string)}</p>` : ''}`,
          summaryRows: [
            { label: 'Assignment', value: assignmentTitle },
            { label: 'Score', value: gradeVal != null ? `${gradeVal} / ${assignMax}` : 'Graded' },
            ...(data.weighted_score != null ? [{ label: 'Weighted Score', value: String(data.weighted_score) }] : []),
          ],
          cta: { href: `${appUrl}/dashboard/assignments`, label: 'View Results & Feedback' },
          footerNote: 'This grade was submitted by your teacher.',
        });
        await queueService.queueNotification(data.portal_user_id!, 'email', {
          to: student.email,
          subject: `Graded: "${assignmentTitle}"`,
          html,
        });
      })().catch(console.error);
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    if (caller.role === 'school') {
      return NextResponse.json({ error: 'School accounts cannot delete submissions' }, { status: 403 });
    }

    const { id } = await context.params;
    const admin = adminClient();

    const { data: sub } = await admin
      .from('assignment_submissions')
      .select('id, grade, assignments(school_id, created_by, class_id, metadata)')
      .eq('id', id)
      .maybeSingle();

    if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const canManage = await callerCanManageAssignmentWork(admin as any, caller, (sub as any).assignments);
    if (!canManage) {
      return NextResponse.json(
        { error: 'Access denied: this submission is outside your class/school scope' },
        { status: 403 },
      );
    }

    const { error } = await admin.from('assignment_submissions').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logAudit(admin as any, {
      action: 'delete_submission',
      actorId: caller.id,
      resourceType: 'assignment_submission',
      resourceId: id,
      oldValue: String(sub.grade ?? ''),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
