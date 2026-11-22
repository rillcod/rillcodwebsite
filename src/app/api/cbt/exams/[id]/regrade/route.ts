import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { gradeCbtWithManualScores } from '@/lib/cbt/grading';
import { isPaperCaptureAnswers } from '@/lib/cbt/paper-capture';
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
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  return (caller as Caller) ?? null;
}

async function callerCanRegradeExam(
  admin: ReturnType<typeof adminClient>,
  caller: Caller,
  exam: { created_by?: string | null; class_id?: string | null; school_id?: string | null },
): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (caller.role !== 'teacher') return false;
  if (exam.created_by && exam.created_by === caller.id) return true;
  if (exam.class_id) {
    const { data: cls } = await admin
      .from('classes')
      .select('teacher_id')
      .eq('id', exam.class_id)
      .maybeSingle();
    if (cls?.teacher_id === caller.id) return true;
  }
  if (exam.school_id && caller.school_id && exam.school_id === caller.school_id) {
    return true;
  }
  return false;
}

const SUBMITTED_STATUSES = new Set(['completed', 'passed', 'failed', 'pending_grading']);

/**
 * POST /api/cbt/exams/[id]/regrade
 *
 * Allows a teacher/admin to correct one or more answer keys on a live/completed
 * CBT exam and automatically re-mark EVERY submitted student session in place
 * without resetting any student's exam or modifying any student's answers.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Only teachers and admins can correct answer keys and re-mark sessions.' }, { status: 403 });
  }

  const { id: examId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const rawCorrections: Array<{ question_id?: unknown; correct_answer?: unknown }> = Array.isArray(body?.corrections)
    ? body.corrections
    : [];
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

  const admin = adminClient();

  const { data: exam, error: examErr } = await admin
    .from('cbt_exams')
    .select('id, title, passing_score, created_by, class_id, school_id, metadata, cbt_questions(*)')
    .eq('id', examId)
    .maybeSingle();

  if (examErr) return NextResponse.json({ error: examErr.message }, { status: 500 });
  if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 });

  const allowed = await callerCanRegradeExam(admin, caller, exam);
  if (!allowed) {
    return NextResponse.json({ error: 'You do not have permission to re-mark this exam.' }, { status: 403 });
  }

  const questions: any[] = Array.isArray(exam.cbt_questions) ? [...exam.cbt_questions] : [];
  const questionById = new Map(questions.map((q) => [String(q.id), q]));

  // 1. Apply answer-key corrections ONLY (never touches question_text, options, points, or student answers)
  const appliedCorrections: Array<{ question_id: string; old_answer: string; new_answer: string }> = [];
  for (const item of rawCorrections) {
    const qid = typeof item?.question_id === 'string' ? item.question_id.trim() : '';
    const nextAnswer = typeof item?.correct_answer === 'string' ? item.correct_answer.trim() : '';
    if (!qid || !nextAnswer) continue;
    const existing = questionById.get(qid);
    if (!existing) continue;
    const prevAnswer = String(existing.correct_answer ?? '').trim();
    if (prevAnswer === nextAnswer) continue;

    const { error: updErr } = await admin
      .from('cbt_questions')
      .update({ correct_answer: nextAnswer })
      .eq('id', qid)
      .eq('exam_id', examId);

    if (updErr) {
      return NextResponse.json({ error: `Failed to update question key: ${updErr.message}` }, { status: 500 });
    }
    existing.correct_answer = nextAnswer;
    appliedCorrections.push({ question_id: qid, old_answer: prevAnswer, new_answer: nextAnswer });
  }

  // 2. Re-mark all submitted sessions in place (preserving every student's answers & manual theory scores)
  const { data: sessions, error: sessErr } = await admin
    .from('cbt_sessions')
    .select('id, user_id, status, score, answers, manual_scores, grading_notes')
    .eq('exam_id', examId);

  if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 });

  const changes: Array<{
    session_id: string;
    user_id: string;
    old_score: number | null;
    new_score: number;
    old_status: string | null;
    new_status: string;
  }> = [];

  let sessionsChecked = 0;

  for (const session of sessions ?? []) {
    const currentStatus = String(session.status ?? '').toLowerCase();
    if (!SUBMITTED_STATUSES.has(currentStatus)) continue;
    // Never overwrite manual hall-mark paper capture sessions
    if (isPaperCaptureAnswers(session.answers)) continue;

    sessionsChecked += 1;
    const answersObj =
      session.answers && typeof session.answers === 'object' && !Array.isArray(session.answers)
        ? (session.answers as Record<string, unknown>)
        : {};
    const manualObj =
      session.manual_scores && typeof session.manual_scores === 'object' && !Array.isArray(session.manual_scores)
        ? (session.manual_scores as Record<string, unknown>)
        : {};

    const regraded = gradeCbtWithManualScores(exam, questions, answersObj, manualObj);
    const oldScore = typeof session.score === 'number' ? session.score : null;
    const newScore = regraded.score;
    const newStatus = regraded.status;

    if (oldScore !== newScore || currentStatus !== newStatus) {
      const { error: updateSessErr } = await admin
        .from('cbt_sessions')
        .update({
          score: newScore,
          status: newStatus,
        })
        .eq('id', session.id);

      if (updateSessErr) {
        return NextResponse.json(
          { error: `Failed to update re-marked session ${session.id}: ${updateSessErr.message}` },
          { status: 500 },
        );
      }

      changes.push({
        session_id: session.id,
        user_id: session.user_id,
        old_score: oldScore,
        new_score: newScore,
        old_status: session.status,
        new_status: newStatus,
      });
    }
  }

  await logAudit(admin, {
    action: 'cbt_exam.regrade_after_key_correction',
    resourceType: 'cbt_exam',
    resourceId: examId,
    actorId: caller.id,
    newValues: {
      examTitle: exam.title,
      actorRole: caller.role,
      reason: reason || null,
      correctionsCount: appliedCorrections.length,
      corrections: appliedCorrections,
      sessionsChecked,
      sessionsChanged: changes.length,
    },
  }).catch(() => {});

  return NextResponse.json({
    data: {
      updatedQuestionsCount: appliedCorrections.length,
      sessionsChecked,
      sessionsChanged: changes.length,
      changes,
      questions: questions.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    },
  });
}
