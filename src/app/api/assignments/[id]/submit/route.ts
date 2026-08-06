import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createEngagementAdminClient } from '@/lib/supabase/admin';
import { queueService } from '@/services/queue.service';
import { XP_EVENTS } from '@/lib/grading';
import { engagementTables } from '@/types/engagement';
import { buildRillcodTransactionalEmailHtml, escapeHtml } from '@/lib/email/rillcod-transactional-email';
import {
  assignmentVisibleToStudent,
  resolveStudentProgramScope,
  type AssignmentStudentScope,
} from '@/lib/assignments/visibility';
import { callerCanManageAssignmentWork } from '@/lib/assignments/authz';
import {
  computeAssignmentWeightedScore,
  gradeAssignmentAnswers,
} from '@/lib/assignments/grading';
import { generateAIContent, type GenerateRequest } from '@/lib/ai/generate-core';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
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


// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assignments/[id]/submit
// Students submit their own work. Staff may submit on behalf (admin/teacher only).
// Enforces: assignment is active, student can access it, no re-submission unless staff.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin
      .from('portal_users')
      .select('role, id, school_id, school_name, class_id, section_class, primary_teacher_id, enrollment_type')
      .eq('id', user.id)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 403 });

    const { id: assignment_id } = await context.params;
    const body = await request.json();
    const { portal_user_id, submission_text, file_url, answers, attachments } = body;

    // Free-form work snapshots (multi-step submissions). Stored inside the JSON
    // `answers` column under `snapshots` — no migration needed, and the auto-grader
    // only reads numeric question indices so it ignores this key.
    const snapshots = Array.isArray(body.snapshots)
      ? body.snapshots
          .filter((s: any) => s && typeof s.url === 'string' && s.url.trim())
          .slice(0, 20)
          .map((s: any) => ({ url: String(s.url), caption: typeof s.caption === 'string' ? s.caption.slice(0, 200) : '' }))
      : null;

    // Only admin/teacher may submit on behalf of another student
    const isStaff = ['admin', 'teacher'].includes(caller.role);
    if (isStaff && !portal_user_id) {
      return NextResponse.json({ error: 'portal_user_id is required when staff submit on behalf of a student' }, { status: 400 });
    }
    const effectiveUserId = isStaff ? (portal_user_id ?? caller.id) : caller.id;

    // Fetch assignment to validate access
    const { data: assignment } = await admin
      .from('assignments')
      .select('is_active, course_id, program_id, class_id, school_id, school_name, assignment_type, metadata, questions, max_points, weight, created_by, title, grading_mode, due_date')
      .eq('id', assignment_id)
      .maybeSingle();

    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    if (isStaff) {
      // Teachers may only proxy-submit for assignments they can manage.
      if (caller.role === 'teacher') {
        const canManage = await callerCanManageAssignmentWork(admin as any, {
          id: caller.id,
          role: caller.role,
          school_id: caller.school_id,
        }, assignment as any);
        if (!canManage) {
          return NextResponse.json({ error: 'Access denied: you cannot submit for this assignment' }, { status: 403 });
        }
      }

      const { data: targetStudent } = await admin
        .from('portal_users')
        .select('role, id, school_id, school_name, class_id, section_class, primary_teacher_id, enrollment_type')
        .eq('id', effectiveUserId)
        .maybeSingle();

      if (!targetStudent || targetStudent.role !== 'student') {
        return NextResponse.json({ error: 'Staff submissions must target a valid student account' }, { status: 400 });
      }

      if (caller.role !== 'admin') {
        const scope = await resolveStudentProgramScope(admin, effectiveUserId, targetStudent.class_id);
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
    }

    // Fetch existing submission to check if already graded (students only)
    let existingSubmissionStatus: string | null = null;
    if (!isStaff) {
      const { data: existingSub } = await admin
        .from('assignment_submissions')
        .select('status')
        .eq('assignment_id', assignment_id)
        .eq('portal_user_id', effectiveUserId)
        .maybeSingle();

      existingSubmissionStatus = existingSub?.status ?? null;
      if (existingSub && existingSub.status === 'graded') {
        return NextResponse.json({ error: 'This assignment has already been graded and cannot be resubmitted' }, { status: 403 });
      }
    }

    // Students: assignment must be active
    if (!isStaff && !assignment.is_active) {
      return NextResponse.json({ error: 'This assignment is no longer active' }, { status: 403 });
    }

    // Students: full assignment visibility check
    if (!isStaff) {
      const scope = await resolveStudentProgramScope(admin, effectiveUserId, caller.class_id);
      const classTeacherId = await getStudentClassTeacherId(admin, caller.class_id);

        const creatorRoles: Record<string, string> = {};
      if (assignment.created_by) {
        const { data: creatorUser } = await admin
          .from('portal_users')
          .select('role')
          .eq('id', assignment.created_by)
          .maybeSingle();
        if (creatorUser?.role) {
          creatorRoles[assignment.created_by] = creatorUser.role;
        }
      }

      if (!assignmentVisibleToStudent(assignment, caller as unknown as AssignmentStudentScope, scope, creatorRoles, classTeacherId)) {
        return NextResponse.json({ error: 'You do not have access to this assignment' }, { status: 403 });
      }
    }

    // Mark late if submitted after due_date (students only — staff on-behalf always 'submitted')
    const isLate = !isStaff && assignment.due_date
      ? new Date() > new Date(assignment.due_date)
      : false;

    const upsertData: Record<string, unknown> = {
      assignment_id,
      portal_user_id: effectiveUserId,
      submitted_at:   new Date().toISOString(),
      status:         isLate ? 'late' : 'submitted',
      updated_at:     new Date().toISOString(),
    };
    if (submission_text !== undefined) upsertData.submission_text = submission_text || null;
    if (file_url        !== undefined) upsertData.file_url        = file_url        || null;
    // A submission can carry several files. Only entries with a url are kept —
    // the sync_submission_attachments trigger rejects the rest and mirrors the
    // first into file_url, so the older single-file readers keep working.
    if (Array.isArray(attachments)) {
        upsertData.attachments = attachments
            .filter((a: unknown): a is { url: string } =>
                !!a && typeof a === 'object' && typeof (a as { url?: unknown }).url === 'string'
                && (a as { url: string }).url.trim() !== '')
            .slice(0, 10)
            .map((a) => {
                const raw = a as { url: string; name?: unknown; type?: unknown; size?: unknown };
                return {
                    url: raw.url,
                    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Submission',
                    type: typeof raw.type === 'string' ? raw.type : null,
                    size: typeof raw.size === 'number' ? raw.size : null,
                    uploaded_at: new Date().toISOString(),
                };
            });
    }
    // Merge snapshots into answers without clobbering quiz answers.
    if (snapshots && snapshots.length > 0) {
      const base = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};
      upsertData.answers = { ...base, snapshots };
    } else if (answers != null) {
      upsertData.answers = answers;
    }

    const { data, error } = await admin
      .from('assignment_submissions')
      .upsert(upsertData, { onConflict: 'assignment_id,portal_user_id' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Grading mode pipeline
    const gradingMode = assignment.grading_mode || 'manual';
    const questions: any[] = Array.isArray(assignment.questions) ? assignment.questions : [];
    const maxPts = assignment.max_points ?? 100;
    const assignWeight = assignment.weight ?? 0;

    if (gradingMode === 'auto' && answers && data) {
      // Only fully objective work is finalized automatically. Mixed or unsupported
      // legacy assessments enter the teacher queue instead of silently losing marks.
      try {
        const autoResult = gradeAssignmentAnswers(questions, answers, maxPts);
        if (autoResult && !autoResult.needsReview) {
          const autoGrade = autoResult.grade;
          const weightedScore = computeAssignmentWeightedScore(autoGrade, maxPts, assignWeight);
          const gradedAt = new Date().toISOString();
          const { data: gradedRow } = await admin
            .from('assignment_submissions')
            .update({
              grade: autoGrade,
              status: 'graded',
              weighted_score: weightedScore,
              graded_at: gradedAt,
              updated_at: gradedAt,
            })
            .eq('assignment_id', assignment_id)
            .eq('portal_user_id', effectiveUserId)
            .select()
            .single();

          if (gradedRow) {
            // Notify student with rich HTML email
            (async () => {
              const { data: studentInfo } = await admin.from('portal_users').select('email, full_name').eq('id', effectiveUserId).single();
              if (!studentInfo?.email) return;
              const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
              const html = buildRillcodTransactionalEmailHtml({
                title: 'Assignment Graded',
                bodyHtml: `<p>Hi ${escapeHtml(studentInfo.full_name?.split(' ')[0] || 'there')},</p><p>Your assignment has been automatically marked. Your result is below.</p>`,
                summaryRows: [
                  { label: 'Assignment', value: assignment.title || 'Assignment' },
                  { label: 'Score', value: `${autoGrade} / ${maxPts}` },
                  ...(weightedScore !== null ? [{ label: 'Weighted Score', value: String(weightedScore) }] : []),
                ],
                cta: { href: `${appUrl}/dashboard/assignments`, label: 'View Results' },
              });
              await queueService.queueNotification(effectiveUserId, 'email', {
                to: studentInfo.email,
                subject: `Graded: "${assignment.title || 'Assignment'}"`,
                html,
              });
            })().catch(console.error);
            return NextResponse.json({ data: gradedRow }, { status: 201 });
          }
        } else {
          const reviewAt = new Date().toISOString();
          await admin
            .from('assignment_submissions')
            .update({
              grade: null,
              weighted_score: null,
              status: 'pending_review',
              updated_at: reviewAt,
            })
            .eq('assignment_id', assignment_id)
            .eq('portal_user_id', effectiveUserId);
          data.status = 'pending_review';
          data.grade = null;
          data.weighted_score = null;
        }
      } catch (autoErr) {
        console.error('[auto-grade] failed:', autoErr);
      }
    } else if (gradingMode === 'ai_suggested' && answers && data) {
      // AI-assisted: call AI grading endpoint, store suggestions, set status='pending_review'
      try {
        // In-process, not a self-fetch: NEXT_PUBLIC_APP_URL names the production
        // host wherever this runs, so posting back to it graded against a
        // different deployment — or, with no cookie surviving the hop, not at
        // all. The submitting user is already authorised here.
        const aiData = await generateAIContent({
          type: 'cbt-grading',
          topic: assignment.title || 'Assignment grading',
          questions,
          studentAnswers: answers,
        } as GenerateRequest);

        if (aiData?.data) {
          const totalScore = Object.values(aiData.data.scores || {}).reduce((sum: number, s: any) => sum + Number(s || 0), 0);
          await admin
            .from('assignment_submissions')
            .update({
              ai_suggested_grade: totalScore,
              ai_suggested_feedback: aiData.data.feedback || '',
              status: 'pending_review',
              updated_at: new Date().toISOString(),
            })
            .eq('assignment_id', assignment_id)
            .eq('portal_user_id', effectiveUserId);
        }
      } catch (aiErr) {
        console.error('[ai-assisted-grade] failed:', aiErr);
      }
    }
    // Manual mode: status remains 'submitted', teacher grades later

    if (!isStaff && assignment.created_by) {
      Promise.all([
        admin.from('portal_users').select('email, full_name').eq('id', assignment.created_by).single(),
        admin.from('portal_users').select('full_name').eq('id', effectiveUserId).single(),
      ]).then(([{ data: teacher }, { data: student }]) => {
        if (!teacher?.email) return;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
        const html = buildRillcodTransactionalEmailHtml({
          title: 'New Assignment Submission',
          bodyHtml: `<p>Hi ${escapeHtml(teacher.full_name?.split(' ')[0] || 'there')},</p><p><strong>${escapeHtml(student?.full_name || 'A student')}</strong> has just submitted work for your assignment.</p>`,
          summaryRows: [
            { label: 'Assignment', value: assignment.title || 'Assignment' },
            { label: 'Student', value: student?.full_name || 'Unknown' },
          ],
          cta: { href: `${appUrl}/dashboard/assignments`, label: 'Review Submission' },
        });
        return queueService.queueNotification(assignment.created_by!, 'email', {
          to: teacher.email,
          subject: `New Submission: "${assignment.title || 'Assignment'}"`,
          html,
        });
      }).catch(console.error);
    }

    // ── Auto-award XP on student submission ───────────────────────────────────
    if (!isStaff && !existingSubmissionStatus) {
      const engAdmin = createEngagementAdminClient();
      awardSubmissionXP(engAdmin, effectiveUserId, assignment_id, assignment).catch(console.error);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// ── XP Automation ─────────────────────────────────────────────────────────────
// Called fire-and-forget after successful student submission.
// Awards assignment_submitted XP + bonus if submitted early.
async function awardSubmissionXP(
  admin: ReturnType<typeof createEngagementAdminClient>,
  studentId: string,
  assignmentId: string,
  assignment: { due_date?: string | null; title?: string | null; school_id?: string | null },
) {
  const et = engagementTables;
  const now = new Date();

  // Base XP event
  const baseEvent = XP_EVENTS.find(e => e.key === 'assignment_submitted');
  if (!baseEvent) return;

  await et.xpLedger(admin).insert({
    student_id:  studentId,
    event_key:   baseEvent.key,
    event_label: baseEvent.label,
    xp:          baseEvent.xp,
    ref_id:      assignmentId,
    ref_type:    'assignment',
    school_id:   assignment.school_id ?? null,
    metadata:    { title: assignment.title ?? '' },
  });

  // Bonus XP if submitted 2+ days early
  if (assignment.due_date) {
    const due = new Date(assignment.due_date);
    const daysEarly = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysEarly >= 2) {
      const earlyEvent = XP_EVENTS.find(e => e.key === 'assignment_early');
      if (earlyEvent) {
        await et.xpLedger(admin).insert({
          student_id:  studentId,
          event_key:   earlyEvent.key,
          event_label: earlyEvent.label,
          xp:          earlyEvent.xp,
          ref_id:      assignmentId,
          ref_type:    'assignment',
          school_id:   assignment.school_id ?? null,
          metadata:    { days_early: Math.floor(daysEarly) },
        });
      }
    }
  }

  // Update weekly streak
  await updateWeekStreak(admin, et, studentId);
}

function getMondayStr(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

function shiftDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

async function updateWeekStreak(
  admin: ReturnType<typeof createEngagementAdminClient>,
  et: typeof engagementTables,
  studentId: string,
) {
  const thisMonday = getMondayStr(new Date());
  const { data: existing } = await et.streaks(admin)
    .select('current_streak, longest_streak, last_active_week, total_active_weeks')
    .eq('student_id', studentId)
    .single();

  if (!existing) {
    await et.streaks(admin).insert({
      student_id: studentId, current_streak: 1, longest_streak: 1,
      last_active_week: thisMonday, total_active_weeks: 1,
    });
    return;
  }

  const lastMondayStr = existing.last_active_week
    ? getMondayStr(new Date(String(existing.last_active_week)))
    : null;

  if (lastMondayStr === thisMonday) return; // already counted this week

  const prevMonday = shiftDays(thisMonday, -7);
  const newStreak = lastMondayStr === prevMonday ? (existing.current_streak ?? 0) + 1 : 1;

  await et.streaks(admin).update({
    current_streak: newStreak,
    longest_streak: Math.max(newStreak, existing.longest_streak ?? 0),
    last_active_week: thisMonday,
    total_active_weeks: (existing.total_active_weeks ?? 0) + 1,
  }).eq('student_id', studentId);
}
