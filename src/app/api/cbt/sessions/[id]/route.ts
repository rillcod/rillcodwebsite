import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

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
    .select('id, user_id, exam_id, cbt_exams(school_id, created_by)')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) return null;
  if (caller.role === 'student') return session.user_id === caller.id ? session : null;
  if (caller.role === 'admin') return session;

  const exam = (session as any).cbt_exams;
  const examSchoolId: string | null = exam?.school_id ?? null;
  const examCreatedBy: string | null = exam?.created_by ?? null;

  if (caller.role === 'school') {
    return !examSchoolId || examSchoolId === caller.school_id ? session : null;
  }

  if (caller.role === 'teacher') {
    if (examCreatedBy === caller.id) return session;
    if (examSchoolId && caller.school_id === examSchoolId) return session;
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
      if (!answers) return NextResponse.json({ error: 'answers required' }, { status: 400 });

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
      const { error } = await admin
        .from('cbt_sessions')
        .update({ answers, updated_at: savedAt })
        .eq('id', id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ saved_at: savedAt });
    }

    // ── Teacher / admin grading path (existing behaviour) ────────────────────
    if (!['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    // Fetch session + its exam's school to enforce boundary
    const { data: session } = await admin
      .from('cbt_sessions')
      .select('id, exam_id, cbt_exams(school_id, created_by)')
      .eq('id', id)
      .maybeSingle();

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

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

      const canGrade =
        examCreatedBy === caller.id ||
        (examSchoolId && caller.school_id === examSchoolId) ||
        await (async () => {
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

    const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ('score'         in body) allowed.score         = body.score;
    if ('status'        in body) allowed.status        = body.status;
    if ('manual_scores' in body) allowed.manual_scores = body.manual_scores;
    if ('grading_notes' in body) allowed.grading_notes = body.grading_notes;
    if ('needs_grading' in body) allowed.needs_grading = body.needs_grading;

    const { data, error } = await admin
      .from('cbt_sessions')
      .update(allowed)
      .eq('id', id)
      .select('id, score, status');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
