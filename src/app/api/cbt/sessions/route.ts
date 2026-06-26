import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  cbtExamVisibleToStudent,
  loadCbtStudentProfile,
  resolveStudentCbtScope,
} from '@/lib/cbt/visibility';
import { gradeCbtSubmission } from '@/lib/cbt/grading';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

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
// Called by students when they submit a CBT exam.
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
    const { exam_id, start_time, answers, auto_submitted, submitted_at } = body;

    if (!exam_id) return NextResponse.json({ error: 'exam_id required' }, { status: 400 });

    // Prevent duplicate submissions — check if session already exists
    const { data: existing } = await admin
      .from('cbt_sessions')
      .select('id')
      .eq('exam_id', exam_id)
      .eq('user_id', caller.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Exam already submitted' }, { status: 409 });
    }

    // ── Server-side deadline enforcement ─────────────────────────────────────
    // Compute deadline from exam duration + student's start_time.
    // (Querying cbt_sessions for the deadline was dead code — no session exists yet.)
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
    if (examRow.end_date && new Date(examRow.end_date) < new Date()) {
      return NextResponse.json({ error: 'The exam window has closed' }, { status: 422 });
    }

    // Enforce duration-based deadline
    const startMs = start_time ? new Date(start_time).getTime() : Date.now();
    const safeStartMs = Number.isFinite(startMs) && startMs <= Date.now() + 60_000 ? startMs : Date.now();
    if (examRow.duration_minutes) {
      const deadline = safeStartMs + examRow.duration_minutes * 60_000;
      const submittedMs = submitted_at ? new Date(submitted_at).getTime() : Date.now();
      const GRACE_MS = 30_000; // 30-second grace period for network latency

      if (submittedMs > deadline + GRACE_MS) {
        return NextResponse.json(
          { error: 'DEADLINE_EXCEEDED' },
          { status: 422 },
        );
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
      .insert({
        exam_id,
        user_id: caller.id,
        start_time: new Date(safeStartMs).toISOString(),
        end_time: new Date().toISOString(),
        score: grading.score,
        status: grading.status,
        answers: cleanAnswers,
        manual_scores: grading.manualScores,
        grading_notes: gradingNotes || null,
        needs_grading: grading.needsGrading,
      })
      .select('id, score, status, needs_grading, manual_scores, grading_notes, end_time')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
        .select('id, score, status, exam_id, answers, end_time, needs_grading, manual_scores, grading_notes')
        .eq('exam_id', exam_id)
        .eq('user_id', user.id)
        .maybeSingle();
      return NextResponse.json({ data });
    }

    // No exam_id — return all sessions for this user
    const { data, error } = await admin
      .from('cbt_sessions')
      .select('id, exam_id, score, status, end_time')
      .eq('user_id', user.id)
      .order('end_time', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
