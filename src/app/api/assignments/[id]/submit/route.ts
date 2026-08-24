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
import { logAudit } from '@/lib/audit/log';
import { hasProtectedAssignmentScoreEvidence } from '@/lib/academic/record-retention';
import { normalizeGradeValueWithMax } from '@/lib/api-guards';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function safeAssignmentAudit(
  admin: ReturnType<typeof adminClient>,
  event: Parameters<typeof logAudit>[1],
) {
  try {
    await logAudit(admin as any, event);
  } catch (error) {
    console.warn('[assignment-submit] audit event needs reconciliation', {
      action: event.action,
      resourceId: event.resourceId,
      error,
    });
  }
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

    // Never mutate the submitted evidence underneath an existing score. This
    // applies to staff proxy submissions too; grade corrections use the
    // dedicated grading route, which keeps a before/after audit trail.
    const { data: existingSub, error: existingError } = await admin
      .from('assignment_submissions')
      .select('id,status,grade,weighted_score,graded_at,graded_by,grading_mode,version')
      .eq('assignment_id', assignment_id)
      .eq('portal_user_id', effectiveUserId)
      .maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    const existingSubmissionStatus = existingSub?.status ?? null;
    if (existingSub && hasProtectedAssignmentScoreEvidence(existingSub)) {
      return NextResponse.json({
        error: 'This assignment already contains recorded score evidence. Correct the grade through the grading workflow instead of replacing the submission.',
        code: 'PROTECTED_ACADEMIC_EVIDENCE',
      }, { status: 409 });
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

    const desiredStatus = existingSubmissionStatus === 'returned_for_revision'
      ? 'resubmitted'
      : isLate ? 'late' : 'submitted';
    const upsertData: Record<string, unknown> = {
      assignment_id,
      portal_user_id: effectiveUserId,
      submitted_at:   new Date().toISOString(),
      status:         desiredStatus,
      ai_suggested_grade: null,
      ai_suggested_feedback: null,
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

    const submissionResult = existingSub
      ? await admin
          .from('assignment_submissions')
          .update(upsertData)
          .eq('id', existingSub.id)
          .eq('version', existingSub.version)
          .is('grade', null)
          .select()
          .maybeSingle()
      : await admin
          .from('assignment_submissions')
          .insert(upsertData)
          .select()
          .maybeSingle();

    const { data, error } = submissionResult;

    if (error?.code === '23514' && desiredStatus === 'resubmitted') {
      return NextResponse.json({
        error: 'Revision submission is temporarily unavailable while its review workflow is updated. Your work remains on this device; please retry shortly.',
        code: 'ACADEMIC_REVIEW_SCHEMA_REQUIRED',
      }, { status: 503 });
    }
    if (error?.code === '23505') {
      return NextResponse.json({
        error: 'This submission changed in another session. Refresh before submitting again; the newer copy was left untouched.',
        code: 'STALE_SUBMISSION_REVIEW',
      }, { status: 409 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) {
      return NextResponse.json({
        error: 'This submission changed in another session. Refresh before submitting again; the newer copy was left untouched.',
        code: 'STALE_SUBMISSION_REVIEW',
      }, { status: 409 });
    }

    // Grading mode pipeline
    const gradingMode = assignment.grading_mode || 'manual';
    const questions: any[] = Array.isArray(assignment.questions) ? assignment.questions : [];
    const maxPts = assignment.max_points ?? 100;
    const assignWeight = assignment.weight ?? 0;
    let automationNotice: string | null = null;

    if (gradingMode === 'auto' && answers && data) {
      // Only fully objective work is finalized automatically. Mixed or unsupported
      // legacy assessments enter the teacher queue instead of silently losing marks.
      try {
        const autoResult = gradeAssignmentAnswers(questions, answers, maxPts);
        if (autoResult && !autoResult.needsReview) {
          const autoGrade = autoResult.grade;
          const weightedScore = computeAssignmentWeightedScore(autoGrade, maxPts, assignWeight);
          const gradedAt = new Date().toISOString();
          const { data: gradedRow, error: gradedError } = await admin
            .from('assignment_submissions')
            .update({
              grade: autoGrade,
              status: 'graded',
              weighted_score: weightedScore,
              grading_mode: 'auto',
              graded_at: gradedAt,
              status_changed_by: caller.id,
              last_change_reason: 'Automatically marked using the assignment answer key',
              updated_at: gradedAt,
            })
            .eq('id', data.id)
            .eq('version', data.version)
            .is('grade', null)
            .in('status', ['submitted', 'late', 'resubmitted'])
            .select()
            .maybeSingle();

          if (gradedError) throw new Error(gradedError.message);

          if (gradedRow) {
            await safeAssignmentAudit(admin, {
              action: 'submit_and_auto_grade_assignment',
              actorId: caller.id,
              resourceType: 'assignment_submission',
              resourceId: gradedRow.id,
              tableName: 'assignment_submissions',
              newValues: {
                assignment_id,
                student_id: effectiveUserId,
                submitted_by_staff: isStaff,
                status: gradedRow.status,
                grade: gradedRow.grade,
                weighted_score: gradedRow.weighted_score,
              },
            });
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
            if (!isStaff && !existingSubmissionStatus) {
              const engAdmin = createEngagementAdminClient();
              awardSubmissionXP(engAdmin, effectiveUserId, assignment_id, assignment).catch(console.error);
            }
            return NextResponse.json({ data: gradedRow }, { status: 201 });
          }
          automationNotice = 'Your work was saved. A newer teacher review was already present, so automatic marking left it untouched.';
          await safeAssignmentAudit(admin, {
            action: 'assignment_auto_grading_skipped_stale_review',
            actorId: caller.id,
            resourceType: 'assignment_submission',
            resourceId: data.id,
            newValues: { assignment_id, student_id: effectiveUserId, preserved_newer_review: true },
          });
        } else {
          const reviewAt = new Date().toISOString();
          const { data: reviewRow, error: reviewError } = await admin
            .from('assignment_submissions')
            .update({
              status: 'pending_review',
              status_changed_by: caller.id,
              last_change_reason: 'Teacher review is required for one or more responses',
              updated_at: reviewAt,
            })
            .eq('id', data.id)
            .eq('version', data.version)
            .is('grade', null)
            .in('status', ['submitted', 'late', 'resubmitted'])
            .select('id, status, version')
            .maybeSingle();
          if (reviewError) throw new Error(reviewError.message);
          if (reviewRow) {
            data.status = reviewRow.status;
            data.version = reviewRow.version;
          } else {
            automationNotice = 'Your work was saved. A newer teacher review was already present and was left untouched.';
          }
        }
      } catch (autoErr) {
        console.error('[auto-grade] failed:', autoErr);
        const { data: recoveryRow, error: recoveryError } = await admin
          .from('assignment_submissions')
          .update({
            status: 'pending_review',
            status_changed_by: caller.id,
            last_change_reason: 'Automatic marking was unavailable; teacher review is required',
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.id)
          .eq('version', data.version)
          .is('grade', null)
          .in('status', ['submitted', 'late', 'resubmitted'])
          .select('id, status, version')
          .maybeSingle();
        if (recoveryError) {
          console.error('[assignment-submit] auto-grade recovery update failed; submission remains in the teacher queue', recoveryError);
        } else if (recoveryRow) {
          data.status = recoveryRow.status;
          data.version = recoveryRow.version;
        } else {
          automationNotice = 'Your work was saved. A newer teacher review was already present and was left untouched.';
        }
        await safeAssignmentAudit(admin, {
          action: 'assignment_auto_grading_failed', actorId: caller.id,
          resourceType: 'assignment_submission', resourceId: data.id,
          newValue: autoErr instanceof Error ? autoErr.message : 'Automatic grading failed',
          newValues: {
            assignment_id,
            student_id: effectiveUserId,
            recovered_to: recoveryRow ? 'pending_review' : null,
            preserved_newer_review: !recoveryRow,
          },
        });
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

        if (!aiData?.data) throw new Error('AI grader returned no suggestion');
        const rawTotalScore = Object.values(aiData.data.scores || {}).reduce((sum: number, s: any) => sum + Number(s || 0), 0);
        const normalizedSuggestion = normalizeGradeValueWithMax(rawTotalScore, maxPts);
        if (normalizedSuggestion.error || normalizedSuggestion.value === undefined || normalizedSuggestion.value === null) {
          throw new Error('AI grader returned an invalid score suggestion');
        }
        const totalScore = normalizedSuggestion.value;
        const { data: suggestionRow, error: suggestionError } = await admin
          .from('assignment_submissions')
          .update({
            ai_suggested_grade: totalScore,
            ai_suggested_feedback: aiData.data.feedback || '',
            status: 'pending_review',
            status_changed_by: caller.id,
            last_change_reason: 'AI prepared a draft mark for teacher review',
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.id)
          .eq('version', data.version)
          .is('grade', null)
          .in('status', ['submitted', 'late', 'resubmitted'])
          .select('id, status, version, ai_suggested_grade, ai_suggested_feedback')
          .maybeSingle();
        if (suggestionError) throw new Error(suggestionError.message);
        if (suggestionRow) {
          data.status = suggestionRow.status;
          data.version = suggestionRow.version;
          data.ai_suggested_grade = suggestionRow.ai_suggested_grade;
          data.ai_suggested_feedback = suggestionRow.ai_suggested_feedback;
        } else {
          automationNotice = 'Your work was saved. A newer teacher review was already present, so the AI draft was not applied.';
          await safeAssignmentAudit(admin, {
            action: 'assignment_ai_suggestion_skipped_stale_review',
            actorId: caller.id,
            resourceType: 'assignment_submission',
            resourceId: data.id,
            newValues: { assignment_id, student_id: effectiveUserId, preserved_newer_review: true },
          });
        }
      } catch (aiErr) {
        console.error('[ai-assisted-grade] failed:', aiErr);
        const { data: recoveryRow, error: recoveryError } = await admin
          .from('assignment_submissions')
          .update({
            status: 'pending_review',
            status_changed_by: caller.id,
            last_change_reason: 'AI suggestion was unavailable; teacher review is required',
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.id)
          .eq('version', data.version)
          .is('grade', null)
          .in('status', ['submitted', 'late', 'resubmitted'])
          .select('id, status, version')
          .maybeSingle();
        if (recoveryError) {
          console.error('[assignment-submit] AI-grade recovery update failed; submission remains in the teacher queue', recoveryError);
        } else if (recoveryRow) {
          data.status = recoveryRow.status;
          data.version = recoveryRow.version;
        } else {
          automationNotice = 'Your work was saved. A newer teacher review was already present and was left untouched.';
        }
        await safeAssignmentAudit(admin, {
          action: 'assignment_ai_grading_failed', actorId: caller.id,
          resourceType: 'assignment_submission', resourceId: data.id,
          newValue: aiErr instanceof Error ? aiErr.message : 'AI-assisted grading failed',
          newValues: {
            assignment_id,
            student_id: effectiveUserId,
            recovered_to: recoveryRow ? 'pending_review' : null,
            preserved_newer_review: !recoveryRow,
          },
        });
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

    await safeAssignmentAudit(admin, {
      action: isStaff ? 'submit_assignment_for_student' : 'submit_assignment',
      actorId: caller.id,
      resourceType: 'assignment_submission',
      resourceId: data.id,
      tableName: 'assignment_submissions',
      oldValues: { prior_status: existingSubmissionStatus },
      newValues: {
        assignment_id,
        student_id: effectiveUserId,
        status: data.status,
        grading_mode: gradingMode,
        late: isLate,
      },
    });

    return NextResponse.json({ data, ...(automationNotice ? { message: automationNotice } : {}) }, { status: 201 });
  } catch (error) {
    console.error('[assignment-submit] unexpected failure', error);
    return NextResponse.json({ error: 'We could not save this submission just now. Your work remains on this device; please try again.' }, { status: 500 });
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
