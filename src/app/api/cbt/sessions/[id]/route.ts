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
    const denied = denyIfMissingCapability(caller.role, 'grade');
    if (denied) {
      return NextResponse.json({ error: denied.error }, { status: denied.status });
    }

    // Fetch session + its exam's school to enforce boundary
    const { data: session } = await admin
      .from('cbt_sessions')
      .select('id, user_id, exam_id, answers, score, status, manual_scores, grading_notes, cbt_exams(school_id, created_by, class_id, passing_score, metadata)')
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

    const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ('manual_scores' in body || 'score' in body || 'status' in body) {
      const { data: questions, error: qErr } = await admin
        .from('cbt_questions')
        .select('id, question_type, options, correct_answer, points, metadata')
        .eq('exam_id', (session as any).exam_id)
        .order('order_index');
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

      const rawManualScores = body.manual_scores && typeof body.manual_scores === 'object'
        ? body.manual_scores as Record<string, unknown>
        : {};
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
    if ('grading_notes' in body) allowed.grading_notes = body.grading_notes;

    const { data, error } = await admin
      .from('cbt_sessions')
      .update(allowed)
      .eq('id', id)
      .select('id, score, status');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const saved = Array.isArray(data) ? data[0] : data;
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
      },
    });
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
