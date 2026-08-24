import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { gradeCbtWithManualScores } from '@/lib/cbt/grading';
import { denyIfMissingCapability } from '@/lib/auth/capabilities';
import { logAudit } from '@/lib/audit/log';

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
  return (caller as Caller) ?? null;
}

async function staffCanAccessSession(admin: ReturnType<typeof adminClient>, caller: Caller, sessionId: string) {
  const { data: session } = await admin
    .from('cbt_sessions')
    .select('id, user_id, exam_id, cbt_exams(school_id, created_by, class_id)')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) return null;
  if (caller.role === 'student') return session.user_id === caller.id ? session : null;
  if (caller.role === 'admin') return session;

  const exam = (session as any).cbt_exams;
  const examSchoolId: string | null = exam?.school_id ?? null;
  const examCreatedBy: string | null = exam?.created_by ?? null;
  const examClassId: string | null = exam?.class_id ?? null;

  if (caller.role === 'school') {
    return caller.school_id && examSchoolId === caller.school_id ? session : null;
  }

  if (caller.role === 'teacher') {
    if (examCreatedBy === caller.id) return session;
    if (examClassId) {
      const { data: ownedClass } = await admin
        .from('classes')
        .select('id')
        .eq('id', examClassId)
        .eq('teacher_id', caller.id)
        .maybeSingle();
      return ownedClass ? session : null;
    }
    if (!examSchoolId) return null;
    const { data: assignment } = await admin
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', caller.id)
      .eq('school_id', examSchoolId)
      .maybeSingle();
    return assignment ? session : null;
  }

  return null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    const admin = adminClient();
    const accessSession = await staffCanAccessSession(admin, caller, id);
    if (!accessSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const { data, error } = await admin
      .from('cbt_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/cbt/sessions/[id]
//
// Two modes depending on caller role:
//  • student  → auto-save answers (Req 3): only updates `answers` column,
//               only when session status = 'in_progress', checks deadline.
//  • teacher/admin → grade a session (existing behaviour).
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    const admin = adminClient();
    const body = await request.json();

    // ── Student auto-save path (Req 3) ────────────────────────────────────────
    if (caller.role === 'student') {
      const { answers } = body;
      if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
        return NextResponse.json({ error: 'answers must be an object' }, { status: 400 });
      }

      // Fetch session — must belong to this student and be in_progress
      const { data: session } = await admin
        .from('cbt_sessions')
        .select('id, status, start_time, cbt_exams(duration_minutes, end_date)')
        .eq('id', id)
        .eq('user_id', caller.id)
        .maybeSingle();

      if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      if (session.status !== 'in_progress') {
        return NextResponse.json({ error: 'Session is not in progress' }, { status: 422 });
      }

      // Deadline check (Req 3.5 — stop auto-save if deadline exceeded).
      // The live schema has no deadline column; compute it from start_time + exam duration.
      const exam = (session as any).cbt_exams;
      const endDateMs = exam?.end_date ? new Date(exam.end_date).getTime() : null;
      const durationDeadlineMs = session.start_time && exam?.duration_minutes
        ? new Date(session.start_time).getTime() + Number(exam.duration_minutes) * 60_000
        : null;
      const deadlineMs = [endDateMs, durationDeadlineMs]
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        .sort((a, b) => a - b)[0];
      if (deadlineMs) {
        if (Date.now() > deadlineMs + 30_000) {
          return NextResponse.json(
            { error: 'DEADLINE_EXCEEDED', deadline: new Date(deadlineMs).toISOString() },
            { status: 422 },
          );
        }
      }

      const savedAt = new Date().toISOString();
      const { data: saved, error } = await admin
        .from('cbt_sessions')
        .update({ answers, updated_at: savedAt })
        .eq('id', id)
        .eq('user_id', caller.id)
        .eq('status', 'in_progress')
        .select('id')
        .maybeSingle();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!saved) {
        return NextResponse.json({ error: 'Session is no longer in progress' }, { status: 409 });
      }
      return NextResponse.json({ saved_at: savedAt });
    }

    // ── Teacher / admin grading path (existing behaviour) ────────────────────
    if (!['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }
    const denied = denyIfMissingCapability(caller.role, 'grade');
    if (denied) {
      return NextResponse.json({ error: denied.error }, { status: denied.status });
    }

    // Fetch session + its exam's school to enforce boundary
    const { data: session } = await admin
      .from('cbt_sessions')
      .select('id, user_id, exam_id, answers, score, status, manual_scores, grading_notes, needs_grading, cbt_exams(title, school_id, created_by, class_id, passing_score, metadata)')
      .eq('id', id)
      .maybeSingle();

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const versionResult = await admin
      .from('cbt_sessions')
      .select('grading_version, moderation_status')
      .eq('id', id)
      .maybeSingle();
    const gradingColumnsPending = versionResult.error
      && (versionResult.error.code === '42703'
        || versionResult.error.code === 'PGRST204'
        || /grading_version|moderation_status/i.test(versionResult.error.message));
    if (gradingColumnsPending) {
      return NextResponse.json({
        error: 'Assessment review is temporarily unavailable while its safety update is completed. No marks were changed.',
        code: 'ACADEMIC_REVIEW_SCHEMA_REQUIRED',
      }, { status: 503 });
    }
    if (versionResult.error) {
      return NextResponse.json({ error: 'The latest marking version could not be verified. Please retry.' }, { status: 503 });
    }
    const currentVersion = versionResult.data?.grading_version ?? 1;
    if (body.expected_version === undefined) {
      return NextResponse.json({
        error: 'Refresh this assessment before saving so the latest teacher review is protected.',
        code: 'REVIEW_VERSION_REQUIRED',
        current_version: currentVersion,
      }, { status: 428 });
    }
    const expectedVersion = Number(body.expected_version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return NextResponse.json({ error: 'expected_version must be a positive integer' }, { status: 400 });
    }
    if (expectedVersion !== currentVersion) {
      return NextResponse.json({
        error: 'This marking record changed in another session. Refresh before saving.',
        code: 'STALE_ASSESSMENT_REVIEW',
        current_version: currentVersion,
      }, { status: 409 });
    }

    if (caller.role === 'school' && (!caller.school_id || (session as any).cbt_exams?.school_id !== caller.school_id)) {
      return NextResponse.json(
        { error: 'Access denied: this session belongs to an exam outside your school scope' },
        { status: 403 },
      );
    }

    if (caller.role === 'teacher') {
      const exam = (session as any).cbt_exams;
      const examSchoolId: string | null = exam?.school_id ?? null;
      const examCreatedBy: string | null = exam?.created_by ?? null;
      const examClassId: string | null = exam?.class_id ?? null;

      const canGrade = examCreatedBy === caller.id || await (async () => {
          if (examClassId) {
            const { data: ownedClass } = await admin
              .from('classes')
              .select('id')
              .eq('id', examClassId)
              .eq('teacher_id', caller.id)
              .maybeSingle();
            return !!ownedClass;
          }
          if (!examSchoolId) return false;
          const { data: ts } = await admin
            .from('teacher_schools')
            .select('school_id')
            .eq('teacher_id', caller.id)
            .eq('school_id', examSchoolId)
            .maybeSingle();
          return !!ts;
        })();

      if (!canGrade) {
        return NextResponse.json(
          { error: 'Access denied: this session belongs to an exam outside your school scope' },
          { status: 403 },
        );
      }
    }

    if ('score' in body || 'status' in body || 'needs_grading' in body) {
      return NextResponse.json({
        error: 'The final score and result status are calculated from the saved answers and question marks. Edit the question marks instead.',
        code: 'DERIVED_ASSESSMENT_RESULT',
      }, { status: 400 });
    }
    const hasManualScores = Object.prototype.hasOwnProperty.call(body, 'manual_scores');
    const hasGradingNotes = Object.prototype.hasOwnProperty.call(body, 'grading_notes');
    const hasModeration = Object.prototype.hasOwnProperty.call(body, 'moderation_status');
    if (!hasManualScores && !hasGradingNotes && !hasModeration) {
      return NextResponse.json({ error: 'Add question marks, feedback, or a review decision before saving.' }, { status: 400 });
    }

    const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (hasManualScores) {
      if (!body.manual_scores || typeof body.manual_scores !== 'object' || Array.isArray(body.manual_scores)) {
        return NextResponse.json({ error: 'manual_scores must be an object keyed by question id' }, { status: 400 });
      }
      const { data: questions, error: qErr } = await admin
        .from('cbt_questions')
        .select('id, question_type, options, correct_answer, points, metadata')
        .eq('exam_id', (session as any).exam_id)
        .order('order_index');
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

      const rawManualScores = body.manual_scores as Record<string, unknown>;
      const answers = ((session as any).answers && typeof (session as any).answers === 'object')
        ? (session as any).answers as Record<string, unknown>
        : {};
      const exam = (session as any).cbt_exams ?? {};
      const gradeResult = gradeCbtWithManualScores(
        exam,
        questions ?? [],
        answers,
        rawManualScores,
      );
      allowed.score = gradeResult.score;
      allowed.status = gradeResult.status;
      allowed.needs_grading = gradeResult.needsGrading;
      allowed.manual_scores = gradeResult.manualScores;
    }
    if (hasGradingNotes) {
      if (body.grading_notes !== null && typeof body.grading_notes !== 'string') {
        return NextResponse.json({ error: 'grading_notes must be text or null' }, { status: 400 });
      }
      allowed.grading_notes = typeof body.grading_notes === 'string'
        ? body.grading_notes.trim().slice(0, 5000) || null
        : null;
    }
    const moderationStatus = body.moderation_status;
    if (moderationStatus !== undefined) {
      if (!['unreviewed', 'reviewed', 'approved', 'returned'].includes(String(moderationStatus))) {
        return NextResponse.json({ error: 'Unsupported moderation status' }, { status: 400 });
      }
      if (moderationStatus === 'approved' && (allowed.needs_grading ?? (session as any).needs_grading) === true) {
        return NextResponse.json({ error: 'Complete all manual marking before approving this result.' }, { status: 409 });
      }
      allowed.moderation_status = moderationStatus;
    }
    const suppliedReason = typeof body.change_reason === 'string' ? body.change_reason.trim().slice(0, 500) : '';
    allowed.grading_changed_by = caller.id;
    allowed.grading_change_reason = suppliedReason
      || ((session as any).score != null ? 'Teacher corrected the assessment marking' : 'Teacher completed the assessment marking');

    const runUpdate = async (payload: Record<string, unknown>, version: number): Promise<any> => {
      let query: any = admin.from('cbt_sessions').update(payload).eq('id', id);
      query = query.eq('grading_version', version);
      return query
        .select('id, score, status, needs_grading, moderation_status, grading_version')
        .maybeSingle();
    };
    const updateResult: any = await runUpdate(allowed, currentVersion);
    const missingGradingColumns = updateResult.error
      && (updateResult.error.code === '42703'
        || updateResult.error.code === 'PGRST204'
        || /grading_changed_by|grading_change_reason|moderation_status|grading_version/i.test(updateResult.error.message));
    if (missingGradingColumns) {
      return NextResponse.json({
        error: 'Assessment review is temporarily unavailable while its safety update is completed. No marks were changed.',
        code: 'ACADEMIC_REVIEW_SCHEMA_REQUIRED',
      }, { status: 503 });
    }
    const { data, error } = updateResult;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) {
      return NextResponse.json({
        error: 'This marking record changed in another session. Refresh before saving.',
        code: 'STALE_ASSESSMENT_REVIEW',
      }, { status: 409 });
    }
    const saved = data;
    await logAudit(admin as any, {
      action: 'grade_cbt_session',
      actorId: caller.id,
      resourceType: 'cbt_session',
      resourceId: id,
      oldValue: `${(session as any).score ?? 'ungraded'} / ${(session as any).status ?? 'unknown'}`,
      newValue: `${saved?.score ?? 'ungraded'} / ${saved?.status ?? 'unknown'}`,
      oldValues: {
        score: (session as any).score ?? null,
        status: (session as any).status ?? null,
        manual_scores: (session as any).manual_scores ?? null,
      },
      newValues: {
        score: saved?.score ?? null,
        status: saved?.status ?? null,
        learner_id: (session as any).user_id ?? null,
        exam_id: (session as any).exam_id ?? null,
        manual_scores_changed: 'manual_scores' in body,
        grading_notes_changed: 'grading_notes' in body,
        moderation_status: saved?.moderation_status ?? null,
        change_reason: allowed.grading_change_reason ?? null,
        previous_version: currentVersion,
        grading_version: saved?.grading_version ?? null,
      },
    });
    const resultChanged = hasManualScores && (
      saved?.score !== (session as any).score
      || saved?.status !== (session as any).status
      || JSON.stringify(allowed.manual_scores ?? null) !== JSON.stringify((session as any).manual_scores ?? null)
    );
    if (resultChanged && saved?.needs_grading === false && (session as any).user_id) {
      const examTitle = (session as any).cbt_exams?.title || 'Assessment';
      await admin.from('notifications').insert({
        user_id: (session as any).user_id,
        title: 'Assessment result updated',
        message: `Your reviewed result for "${examTitle}" is ready: ${saved.score ?? 0}%.`,
        type: 'success',
        is_read: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).then(({ error: notificationError }) => {
        if (notificationError) console.error('[cbt-grade] in-app notification failed', notificationError.message);
      });
    }
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
