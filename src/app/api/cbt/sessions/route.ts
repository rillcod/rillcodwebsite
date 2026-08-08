import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  cbtExamVisibleToStudent,
  loadCbtStudentProfile,
  resolveStudentCbtScope,
} from '@/lib/cbt/visibility';
import { gradeCbtSubmission } from '@/lib/cbt/grading';
import { logAudit } from '@/lib/audit/log';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

const FINAL_CBT_STATUSES = ['completed', 'passed', 'failed', 'pending_grading'] as const;

function cbtDeadlineMs(session: { start_time?: string | null }, exam: { duration_minutes?: number | null; end_date?: string | null }) {
  const deadlines: number[] = [];
  if (session.start_time && exam.duration_minutes) {
    const start = new Date(session.start_time).getTime();
    if (Number.isFinite(start)) deadlines.push(start + Number(exam.duration_minutes) * 60_000);
  }
  if (exam.end_date) {
    const end = new Date(exam.end_date).getTime();
    if (Number.isFinite(end)) deadlines.push(end);
  }
  return deadlines.sort((a, b) => a - b)[0] ?? null;
}

function hasAnswers(answers: unknown): answers is Record<string, unknown> {
  return !!answers && typeof answers === 'object' && !Array.isArray(answers) && Object.keys(answers).length > 0;
}

async function finalizeExpiredSession(
  admin: ReturnType<typeof adminClient>,
  existing: any,
  examRow: any,
) {
  const { data: questionRows, error: questionsErr } = await admin
    .from('cbt_questions')
    .select('id, question_type, options, correct_answer, points, metadata')
    .eq('exam_id', examRow.id)
    .order('order_index');

  if (questionsErr) throw new Error(questionsErr.message);
  if (!questionRows || questionRows.length === 0) {
    throw new Error('This exam has no questions configured');
  }

  const savedAnswers = hasAnswers(existing.answers) ? existing.answers : {};
  // Once the deadline has elapsed, only answers persisted by the 10-second
  // autosave are admissible. Accepting a fresh request body here would allow
  // answers to be supplied after time expired.
  const cleanAnswers = hasAnswers(savedAnswers) ? savedAnswers : {};
  const grading = gradeCbtSubmission(examRow, questionRows, cleanAnswers);
  const gradingNotes = [
    grading.needsGrading ? `Awaiting instructor review for ${grading.manualQuestionCount} subjective question(s).` : null,
    'Auto-finalized by the server when the exam deadline elapsed.',
  ].filter(Boolean).join(' ');

  const { data, error } = await admin
    .from('cbt_sessions')
    .update({
      end_time: new Date().toISOString(),
      score: grading.score,
      status: grading.status,
      answers: cleanAnswers,
      manual_scores: grading.manualScores,
      grading_notes: gradingNotes,
      needs_grading: grading.needsGrading,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .eq('user_id', existing.user_id)
    .select('id, score, status, needs_grading, manual_scores, grading_notes, end_time')
    .single();

  if (error) throw new Error(error.message);
  await logAudit(admin as any, {
    action: 'auto_finalize_expired_cbt_session',
    actorId: existing.user_id,
    resourceType: 'cbt_session',
    resourceId: existing.id,
    tableName: 'cbt_sessions',
    oldValues: { status: existing.status ?? null },
    newValues: { status: data.status, score: data.score, needs_grading: data.needs_grading, exam_id: examRow.id },
  });
  return {
    ...data,
    correct: grading.correct,
    passed: grading.score >= Number(examRow.passing_score ?? 70),
    expired: true,
  };
}

async function callerCanAccessExam(admin: ReturnType<typeof adminClient>, caller: Caller, examId: string) {
  const { data: exam } = await admin
    .from('cbt_exams')
    .select('id, school_id, created_by')
    .eq('id', examId)
    .maybeSingle();

  if (!exam) return false;
  if (caller.role === 'admin') return true;
  if (caller.role === 'school') return !!caller.school_id && exam.school_id === caller.school_id;
  if (caller.role === 'teacher') {
    if (exam.created_by === caller.id) return true;
    if (exam.school_id && exam.school_id === caller.school_id) return true;
    if (!exam.school_id) return false;
    const { data: assignment } = await admin
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', caller.id)
      .eq('school_id', exam.school_id)
      .maybeSingle();
    return !!assignment;
  }
  return false;
}

// POST /api/cbt/sessions
// Students call with action=start to begin/resume and action=submit to finish.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin
      .from('portal_users')
      .select('role, id, school_id')
      .eq('id', user.id)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 403 });
    if (caller.role !== 'student') {
      return NextResponse.json({ error: 'Only students can submit CBT exams' }, { status: 403 });
    }

    const body = await request.json();
    const { exam_id, answers, auto_submitted } = body;
    const action = body.action === 'start' ? 'start' : 'submit';

    if (!exam_id) return NextResponse.json({ error: 'exam_id required' }, { status: 400 });

    const { data: examRow } = await admin
      .from('cbt_exams')
      .select('id, duration_minutes, start_date, end_date, is_active, program_id, course_id, school_id, metadata, passing_score')
      .eq('id', exam_id)
      .single();

    if (!examRow || !examRow.is_active) {
      return NextResponse.json({ error: 'Exam not found or is no longer active' }, { status: 404 });
    }

    // Students must be allowed to take this exam (class / programme / school scope).
    const student = await loadCbtStudentProfile(admin, caller.id);
    if (!student) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    const scope = await resolveStudentCbtScope(admin, caller.id, student.class_id);
    if (!cbtExamVisibleToStudent(examRow, student, scope)) {
      return NextResponse.json({ error: 'You do not have access to this exam' }, { status: 403 });
    }

    // Check exam window closed
    if (examRow.start_date && new Date(examRow.start_date) > new Date()) {
      return NextResponse.json({ error: 'The exam window has not opened yet' }, { status: 422 });
    }
    const { data: existing } = await admin
      .from('cbt_sessions')
      .select('id, user_id, status, start_time, answers, score, needs_grading, manual_scores, grading_notes, end_time')
      .eq('exam_id', exam_id)
      .eq('user_id', caller.id)
      .maybeSingle();

    if (existing && FINAL_CBT_STATUSES.includes(existing.status as any)) {
      if (action === 'start') return NextResponse.json({ data: existing });
      return NextResponse.json({ error: 'Exam already submitted' }, { status: 409 });
    }

    if (examRow.end_date && new Date(examRow.end_date) < new Date()) {
      if (!existing) {
        return NextResponse.json({ error: 'The exam window has closed' }, { status: 422 });
      }
      const finalized = await finalizeExpiredSession(admin, existing, examRow);
      return NextResponse.json({ data: finalized }, { status: 201 });
    }

    if (action === 'start') {
      if (existing) {
        const deadline = cbtDeadlineMs(existing, examRow);
        if (deadline && Date.now() > deadline + 30_000) {
          const finalized = await finalizeExpiredSession(admin, existing, examRow);
          return NextResponse.json({ data: finalized });
        }
        return NextResponse.json({ data: existing });
      }

      const { data: started, error: startErr } = await admin
        .from('cbt_sessions')
        .insert({
          exam_id,
          user_id: caller.id,
          start_time: new Date().toISOString(),
          status: 'in_progress',
          answers: {},
          manual_scores: {},
          needs_grading: false,
        })
        .select('id, user_id, status, start_time, answers, score, needs_grading, manual_scores, grading_notes, end_time')
        .single();

      if (startErr) {
        if ((startErr as any).code === '23505') {
          const { data: resumed } = await admin
            .from('cbt_sessions')
            .select('id, user_id, status, start_time, answers, score, needs_grading, manual_scores, grading_notes, end_time')
            .eq('exam_id', exam_id)
            .eq('user_id', caller.id)
            .maybeSingle();
          if (resumed) return NextResponse.json({ data: resumed });
        }
        return NextResponse.json({ error: startErr.message }, { status: 500 });
      }
      await logAudit(admin as any, {
        action: 'start_cbt_session', actorId: caller.id,
        resourceType: 'cbt_session', resourceId: started.id,
        tableName: 'cbt_sessions',
        newValues: { exam_id, status: started.status },
      });
      return NextResponse.json({ data: started }, { status: 201 });
    }

    if (!existing) {
      return NextResponse.json({ error: 'Start the exam before submitting.' }, { status: 409 });
    }

    const startMs = existing.start_time ? new Date(existing.start_time).getTime() : Date.now();
    const safeStartMs = Number.isFinite(startMs) ? startMs : Date.now();
    const deadline = cbtDeadlineMs({ start_time: new Date(safeStartMs).toISOString() }, examRow);
    if (deadline) {
      const submittedMs = Date.now();
      const GRACE_MS = 30_000; // 30-second grace period for network latency

      if (submittedMs > deadline + GRACE_MS) {
        const finalized = await finalizeExpiredSession(admin, existing, examRow);
        return NextResponse.json({ data: finalized }, { status: 201 });
      }
    }

    const { data: questionRows, error: questionsErr } = await admin
      .from('cbt_questions')
      .select('id, question_type, options, correct_answer, points, metadata')
      .eq('exam_id', exam_id)
      .order('order_index');

    if (questionsErr) return NextResponse.json({ error: questionsErr.message }, { status: 500 });
    if (!questionRows || questionRows.length === 0) {
      return NextResponse.json({ error: 'This exam has no questions configured' }, { status: 422 });
    }

    const cleanAnswers = answers && typeof answers === 'object' && !Array.isArray(answers)
      ? answers as Record<string, unknown>
      : {};
    const grading = gradeCbtSubmission(examRow, questionRows, cleanAnswers);
    const gradingNotes = [
      grading.needsGrading ? `Awaiting instructor review for ${grading.manualQuestionCount} subjective question(s).` : null,
      auto_submitted ? 'Auto-submitted when the timer expired.' : null,
    ].filter(Boolean).join(' ');

    const { data, error } = await admin
      .from('cbt_sessions')
      .update({
        end_time: new Date().toISOString(),
        score: grading.score,
        status: grading.status,
        answers: cleanAnswers,
        manual_scores: grading.manualScores,
        grading_notes: gradingNotes || null,
        needs_grading: grading.needsGrading,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('user_id', caller.id)
      .select('id, score, status, needs_grading, manual_scores, grading_notes, end_time')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit(admin as any, {
      action: auto_submitted ? 'auto_submit_cbt_session' : 'submit_cbt_session',
      actorId: caller.id,
      resourceType: 'cbt_session',
      resourceId: existing.id,
      tableName: 'cbt_sessions',
      oldValues: { status: existing.status ?? null },
      newValues: { exam_id, status: data.status, score: data.score, needs_grading: data.needs_grading },
    });
    return NextResponse.json({
      data: {
        ...data,
        correct: grading.correct,
        passed: grading.score >= Number(examRow.passing_score ?? 70),
      },
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// GET /api/cbt/sessions — fetch current user's sessions
// Query param: exam_id (optional) — if provided, returns single session for that exam
//                                   if omitted, returns all sessions for the current user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const exam_id = searchParams.get('exam_id');
    const admin = adminClient();
    const { data: caller } = await admin
      .from('portal_users')
      .select('role, id, school_id')
      .eq('id', user.id)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 403 });
    const isStaff = ['admin', 'teacher', 'school'].includes(caller.role);

    if (exam_id) {
      if (isStaff) {
        const canAccess = await callerCanAccessExam(admin, caller as Caller, exam_id);
        if (!canAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        const { data, error } = await admin
          .from('cbt_sessions')
          .select('*')
          .eq('exam_id', exam_id)
          .order('created_at', { ascending: false });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ data: data ?? [] });
      }

      const { data } = await admin
        .from('cbt_sessions')
        .select('id, score, status, exam_id, answers, start_time, end_time, needs_grading, manual_scores, grading_notes')
        .eq('exam_id', exam_id)
        .eq('user_id', user.id)
        .maybeSingle();
      return NextResponse.json({ data });
    }

    // No exam_id — return all sessions for this user
    const { data, error } = await admin
      .from('cbt_sessions')
      .select('id, exam_id, score, status, start_time, end_time')
      .eq('user_id', user.id)
      .order('end_time', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
