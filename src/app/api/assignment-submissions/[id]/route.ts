import { denyIfMissingCapability } from '@/lib/auth/capabilities';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { queueService } from '@/services/queue.service';
import { buildRillcodTransactionalEmailHtml, escapeHtml } from '@/lib/email/rillcod-transactional-email';
import { normalizeGradeValueWithMax, normalizeSubmissionStatus } from '@/lib/api-guards';
import { callerCanManageAssignmentWork } from '@/lib/assignments/authz';
import { buildAssignmentGradeTransition } from '@/lib/assignments/grading';

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
// PATCH /api/assignment-submissions/[id]
// Update grade, feedback, status, submission_text on a submission.
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    // getCaller admits partner schools so they can READ their students' work; writing
    // a grade or feedback is a separate question, answered once in capabilities.ts.
    const denied = denyIfMissingCapability(caller.role, 'grade');
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    const { id } = await context.params;
    const admin = adminClient();

    // Fetch submission + its assignment school for boundary check (single query)
    const { data: sub } = await admin
      .from('assignment_submissions')
      .select('id, assignment_id, grade, status, file_url, assignments(school_id, created_by, class_id, metadata, weight, max_points)')
      .eq('id', id)
      .maybeSingle();

    if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const assignment = (sub as any).assignments;
    const canManage = await callerCanManageAssignmentWork(admin as any, caller, assignment);
    if (!canManage) {
      return NextResponse.json(
        { error: 'Access denied: this submission belongs to an assignment outside your school scope' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const assignMax = assignment?.max_points ?? 100;
    const assignWeight = assignment?.weight ?? 0;
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

    // ── Whitelisted update fields ──────────────────────────────────────────
    // graded_by and graded_at are NOT client-settable — always set server-side
    const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ('feedback'        in body) allowed.feedback        = body.feedback        ?? null;
    if ('submission_text' in body) allowed.submission_text = body.submission_text ?? null;

    const transition = buildAssignmentGradeTransition({
      currentGrade: sub.grade ?? null,
      currentStatus: sub.status ?? null,
      grade: 'grade' in body ? gradeResult.value ?? null : undefined,
      status: statusResult.value,
      maxPoints: assignMax,
      weight: assignWeight,
      graderId: caller.id,
    });
    if (transition.error) {
      return NextResponse.json({ error: transition.error, field: 'grade' }, { status: 400 });
    }
    Object.assign(allowed, transition.fields);


    // Keep submitted files after grading so the grade remains auditable.

    const { data, error } = await admin
      .from('assignment_submissions')
      .update(allowed)
      .eq('id', id)
      .select('id, grade, status, file_url, portal_user_id, weighted_score')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Send grade email when a submission is marked graded
    if (transition.finalized && data?.portal_user_id) {
      (async () => {
        const [{ data: student }, { data: asgn }] = await Promise.all([
          admin.from('portal_users').select('email, full_name').eq('id', data.portal_user_id!).single(),
          admin.from('assignments').select('title, max_points').eq('id', sub.assignment_id).single(),
        ]);
        if (!student?.email || !asgn) return;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
        const gradeVal = (data.grade ?? allowed.grade) as number | null;
        const html = buildRillcodTransactionalEmailHtml({
          title: 'Assignment Graded',
          bodyHtml: `<p>Hi ${escapeHtml(student.full_name?.split(' ')[0] || 'there')},</p>
            <p>Your assignment <strong>${escapeHtml(asgn.title || 'Assignment')}</strong> has been graded by your teacher.</p>
            ${(allowed.feedback as string) ? `<p><strong>Feedback:</strong> ${escapeHtml(allowed.feedback as string)}</p>` : ''}`,
          summaryRows: [
            { label: 'Assignment', value: asgn.title || 'Assignment' },
            { label: 'Score', value: gradeVal != null ? `${gradeVal} / ${asgn.max_points ?? 100}` : 'Graded' },
            ...(data.weighted_score != null ? [{ label: 'Weighted Score', value: String(data.weighted_score) }] : []),
          ],
          cta: { href: `${appUrl}/dashboard/assignments`, label: 'View Results & Feedback' },
          footerNote: 'This grade was submitted by your teacher.',
        });
        await queueService.queueNotification(data.portal_user_id!, 'email', {
          to: student.email,
          subject: `Graded: "${asgn.title || 'Assignment'}"`,
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
// DELETE /api/assignment-submissions/[id]
// Admin or teacher assigned to the assignment's school only.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    const deleteDenied = denyIfMissingCapability(caller.role, 'delete_records');
    if (deleteDenied) {
      return NextResponse.json({ error: deleteDenied.error }, { status: deleteDenied.status });
    }

    const { id } = await context.params;
    const admin = adminClient();

    const { data: sub } = await admin
      .from('assignment_submissions')
      .select('id, assignments(school_id, created_by, class_id, metadata)')
      .eq('id', id)
      .maybeSingle();

    if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const assignment = (sub as any).assignments;
    const canManage = await callerCanManageAssignmentWork(admin as any, caller, assignment);
    if (!canManage) {
      return NextResponse.json(
        { error: 'Access denied: this submission belongs to an assignment outside your school scope' },
        { status: 403 },
      );
    }

    const { error } = await admin.from('assignment_submissions').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
