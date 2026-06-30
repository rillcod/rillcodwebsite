import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { queueService } from '@/services/queue.service';
import type { Database, TablesUpdate } from '@/types/supabase';
import { normalizeGradeValueWithMax, normalizeSubmissionStatus } from '@/lib/api-guards';
import { buildRillcodTransactionalEmailHtml, escapeHtml } from '@/lib/email/rillcod-transactional-email';
import {
  assignmentVisibleToStudent,
  resolveStudentProgramScope,
  type AssignmentStudentScope,
} from '@/lib/assignments/visibility';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient<Database>(
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
  return (caller as Caller) ?? null;
}

async function getStudentClassTeacherId(admin: ReturnType<typeof adminClient>, classId: string | null): Promise<string | null> {
  if (!classId) return null;
  const { data } = await admin
    .from('classes')
    .select('teacher_id')
    .eq('id', classId)
    .maybeSingle();
  return data?.teacher_id ?? null;
}

async function sendGradeNotifications(
  admin: ReturnType<typeof adminClient>,
  studentId: string,
  assignmentTitle: string,
  grade: number | null | undefined,
  assignMax: number,
  weightedScore: number | null | undefined,
  feedback?: string | null,
) {
  const { data: student } = await admin
    .from('portal_users').select('email, full_name').eq('id', studentId).single();
  if (!student) return;

  // ── In-app notification (always) ──────────────────────────────────────────
  const scoreLabel = grade != null ? `${grade}/${assignMax}` : 'graded';
  await admin.from('notifications').insert({
    user_id: studentId,
    title: 'Assignment Graded',
    message: `"${assignmentTitle}" has been graded — score: ${scoreLabel}.${feedback ? ' Feedback left by your teacher.' : ''}`,
    type: 'success',
    is_read: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).then(({ error }) => { if (error) console.error('[grade notification]', error.message); });

  // ── Email (only if address exists) ────────────────────────────────────────
  if (!student.email) return;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
  const html = buildRillcodTransactionalEmailHtml({
    title: 'Assignment Graded',
    bodyHtml: `<p>Hi ${escapeHtml(student.full_name?.split(' ')[0] || 'there')},</p>
      <p>Your assignment <strong>${escapeHtml(assignmentTitle)}</strong> has been graded by your teacher.</p>
      ${feedback ? `<p><strong>Feedback:</strong> ${escapeHtml(feedback)}</p>` : ''}`,
    summaryRows: [
      { label: 'Assignment', value: assignmentTitle },
      { label: 'Score', value: `${grade ?? 'N/A'} / ${assignMax}` },
      ...(weightedScore != null ? [{ label: 'Weighted Score', value: String(weightedScore) }] : []),
    ],
    cta: { href: `${appUrl}/dashboard/assignments`, label: 'View Results & Feedback' },
    footerNote: 'This grade was submitted by your teacher.',
  });
  await queueService.queueNotification(studentId, 'email', {
    to: student.email,
    subject: `Graded: "${assignmentTitle}"`,
    html,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assignments/[id]/grade
// Grades a submission or creates a graded one if none exists yet.
// Body: { submission_id?, student_id?, grade, feedback?, status?, submission_text? }
// Teacher must be in the assignment's school or have created it.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { id: assignment_id } = await context.params;
    const admin = adminClient();

    // Fetch assignment to verify access + get weight/max_points
    const { data: assignment } = await admin
      .from('assignments')
      .select('weight, max_points, school_id, school_name, course_id, program_id, created_by, title, metadata, class_id')
      .eq('id', assignment_id)
      .maybeSingle();

    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    // Teacher grading access — three tiers:
    // 1. Creator: always allowed
    // 2. Class-targeted assignment: only the teacher who owns that class can grade
    //    (admin may create platform work for Suleiman's class; Suleiman grades it)
    // 3. School-wide platform assignment: any teacher at that school can grade
    if (caller.role === 'teacher' && assignment.created_by !== caller.id) {
      const meta = (assignment as any).metadata || {};
      const targetClassId = meta.target_class_id || (assignment as any).class_id;

      if (targetClassId) {
        // Class-targeted: only the class owner can grade
        const { data: targetClass } = await admin
          .from('classes').select('teacher_id').eq('id', targetClassId).maybeSingle();
        if (!targetClass || targetClass.teacher_id !== caller.id) {
          return NextResponse.json(
            { error: 'Access denied: you do not teach the class this assignment targets' },
            { status: 403 },
          );
        }
      } else if (assignment.school_id) {
        // School-wide platform assignment: teacher must be at this school
        const atSchool = caller.school_id === assignment.school_id || await (async () => {
          const { data: ts } = await admin.from('teacher_schools').select('id')
            .eq('teacher_id', caller.id).eq('school_id', assignment.school_id!).maybeSingle();
          return !!ts;
        })();
        if (!atSchool) {
          return NextResponse.json(
            { error: 'Access denied: assignment is outside your school' },
            { status: 403 },
          );
        }
      } else {
        return NextResponse.json(
          { error: 'Access denied: not your assignment' },
          { status: 403 },
        );
      }
    }
    if (caller.role === 'school' && (!caller.school_id || assignment.school_id !== caller.school_id)) {
      return NextResponse.json(
        { error: 'Access denied: assignment belongs to a different school' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { submission_id, student_id, grade, feedback, status, submission_text } = body;

    const assignWeight = assignment.weight ?? 0;
    const assignMax    = assignment.max_points ?? 100;
    const gradeResult = normalizeGradeValueWithMax(grade, assignMax);
    if ('grade' in body && gradeResult.error) {
      return NextResponse.json({ error: gradeResult.error, field: 'grade' }, { status: 400 });
    }
    if ('grade' in body && gradeResult.value === undefined) {
      return NextResponse.json({ error: 'grade must be a number or null', field: 'grade' }, { status: 400 });
    }
    const statusResult = normalizeSubmissionStatus(status);
    if ('status' in body && statusResult.error) {
      return NextResponse.json({ error: statusResult.error, field: 'status' }, { status: 400 });
    }
    const normalizedGrade = gradeResult.value;

    function computeWeightedScore(g: number | null | undefined): number | null {
      if (g == null || assignWeight === 0 || assignMax === 0) return null;
      return Math.round((g / assignMax) * assignWeight);
    }

    let existingSub: any = null;
    if (submission_id) {
      const { data } = await admin
        .from('assignment_submissions')
        .select('id, assignment_id, file_url, grade')
        .eq('id', submission_id)
        .eq('assignment_id', assignment_id)
        .maybeSingle();
      existingSub = data;
      if (!existingSub) return NextResponse.json({ error: 'Submission not found on this assignment' }, { status: 404 });
    } else if (student_id) {
      const { data } = await admin
        .from('assignment_submissions')
        .select('id, assignment_id, file_url, grade')
        .eq('assignment_id', assignment_id)
        .eq('portal_user_id', student_id)
        .maybeSingle();
      existingSub = data;
    }

    if (student_id && caller.role !== 'admin') {
      const { data: targetStudent } = await admin
        .from('portal_users')
        .select('role, id, school_id, school_name, class_id, section_class, primary_teacher_id, enrollment_type')
        .eq('id', student_id)
        .maybeSingle();

      if (!targetStudent || targetStudent.role !== 'student') {
        return NextResponse.json({ error: 'student_id must point to a valid student account' }, { status: 400 });
      }

      const scope = await resolveStudentProgramScope(admin, student_id, targetStudent.class_id);
      const classTeacherId = await getStudentClassTeacherId(admin, targetStudent.class_id);
      const creatorRoles: Record<string, string> = {};
      if (assignment.created_by) {
        const { data: creatorUser } = await admin
          .from('portal_users')
          .select('role')
          .eq('id', assignment.created_by)
          .maybeSingle();
        if (creatorUser?.role) creatorRoles[assignment.created_by] = creatorUser.role;
      }

      if (!assignmentVisibleToStudent(assignment, targetStudent as unknown as AssignmentStudentScope, scope, creatorRoles, classTeacherId)) {
        return NextResponse.json({ error: 'Target student is not in this assignment audience' }, { status: 403 });
      }
    }

    if (submission_id) {
      const updatePayload: TablesUpdate<'assignment_submissions'> = {
        updated_at: new Date().toISOString(),
      };
      if (normalizedGrade !== undefined) updatePayload.grade = normalizedGrade;
      if (feedback !== undefined) updatePayload.feedback = feedback ?? null;
      if (status !== undefined) updatePayload.status = statusResult.value;
      if (submission_text !== undefined) updatePayload.submission_text = submission_text ?? null;
      if (statusResult.value === 'graded' || normalizedGrade !== undefined) {
        updatePayload.graded_by = caller.id;
        updatePayload.graded_at = new Date().toISOString();
        updatePayload.weighted_score = computeWeightedScore(normalizedGrade);

        // Keep submitted files attached after grading so teachers, students, and
        // parents can still review the evidence behind the mark.
      }

      const { data, error } = await admin
        .from('assignment_submissions')
        .update(updatePayload)
        .eq('id', submission_id)
        .select('id, grade, status, weighted_score, portal_user_id')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      
      // Write audit log
      await admin.from('audit_logs').insert({
        actor_id: caller.id,
        resource_type: 'assignment_submission',
        resource_id: data.id,
        action: 'grade_submission',
        old_value: String(existingSub?.grade ?? ''),
        new_value: String(data.grade ?? ''),
      }).then(({ error }) => { if (error) console.error('[audit_log]', error.message); });

      if (updatePayload.graded_by && data?.portal_user_id) {
        sendGradeNotifications(
          admin, data.portal_user_id, assignment.title || 'Assignment',
          data.grade, assignMax, data.weighted_score, feedback,
        ).catch(console.error);
      }

      return NextResponse.json({ data });
    }

    if (student_id) {
      const insertPayload: any = {
        assignment_id,
        portal_user_id:  student_id,
        grade:           normalizedGrade ?? null,
        feedback:        feedback ?? null,
        status:          statusResult.value ?? 'graded',
        submission_text: submission_text ?? null,
        graded_by:       caller.id,
        graded_at:       new Date().toISOString(),
        submitted_at:    new Date().toISOString(),
        updated_at:      new Date().toISOString(),
        weighted_score:  computeWeightedScore(normalizedGrade),
      };

      // Keep submitted files attached after grading so the grade remains auditable.

      const { data, error } = await admin
        .from('assignment_submissions')
        .upsert(insertPayload, { onConflict: 'assignment_id,portal_user_id' })
        .select('id, grade, status, weighted_score, portal_user_id')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Write audit log
      await admin.from('audit_logs').insert({
        actor_id: caller.id,
        resource_type: 'assignment_submission',
        resource_id: data.id,
        action: 'grade_submission',
        old_value: String(existingSub?.grade ?? ''),
        new_value: String(data.grade ?? ''),
      }).then(({ error }) => { if (error) console.error('[audit_log]', error.message); });

      if (data?.portal_user_id) {
        sendGradeNotifications(
          admin, data.portal_user_id, assignment.title || 'Assignment',
          data.grade, assignMax, data.weighted_score, feedback,
        ).catch(console.error);
      }

      return NextResponse.json({ data });
    }

    return NextResponse.json({ error: 'submission_id or student_id required' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 },
    );
  }
}
