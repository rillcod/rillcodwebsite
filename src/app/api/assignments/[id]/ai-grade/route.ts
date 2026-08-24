import { denyIfMissingCapability } from '@/lib/auth/capabilities';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { geminiGenerateText } from '@/lib/gemini/client';
import { logAudit } from '@/lib/audit/log';
import { callerCanManageAssignmentWork } from '@/lib/assignments/authz';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
  const { data } = await adminClient().from('portal_users').select('role, id, school_id').eq('id', user.id).single();
  return (data as Caller) ?? null;
}

/** Pull the first JSON object out of a model response. */
function extractJSON(raw: string): any | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const SYSTEM_PROMPT =
  'You are a fair, encouraging STEM/coding teacher at Rillcod Technologies grading a student\'s open-ended submission. ' +
  'Grade strictly against the assignment instructions, award partial credit for partial understanding, and be constructive. ' +
  'Return ONLY valid JSON — no markdown, no prose outside the JSON.';

/**
 * Build the grading prompt and call the AI. Returns a clamped score + feedback,
 * or null if the model gave nothing usable.
 */
async function gradeText(
  title: string,
  instructions: string,
  maxPoints: number,
  submissionText: string,
): Promise<{ score: number; feedback: string } | null> {
  const prompt = `Grade this student submission out of ${maxPoints} points.

ASSIGNMENT: ${title}
INSTRUCTIONS:
${instructions || '(no detailed instructions provided — grade on correctness, effort, and clarity)'}

STUDENT SUBMISSION:
${submissionText.slice(0, 8000)}

Return ONLY JSON:
{"score": <integer 0-${maxPoints}>, "feedback": "2-4 sentences: what they did well, then the single most important thing to improve. Address the student directly and kindly."}`;

  const res = await geminiGenerateText(SYSTEM_PROMPT, prompt, true).catch(() => null);
  if (!res?.text) return null;
  const parsed = extractJSON(res.text);
  if (!parsed || typeof parsed.score === 'undefined') return null;
  let score = Math.round(Number(parsed.score));
  if (!Number.isFinite(score)) return null;
  score = Math.max(0, Math.min(maxPoints, score));
  const feedback = typeof parsed.feedback === 'string' ? parsed.feedback.trim() : '';
  return { score, feedback };
}

/**
 * POST /api/assignments/[id]/ai-grade
 *
 * AI-grades OPEN-ENDED text submissions (essays, project write-ups, code
 * explanations) — the gap left by the question-based auto-grader. It writes a
 * SUGGESTION to ai_suggested_grade / ai_suggested_feedback (status
 * 'pending_review'); it never overwrites a final grade. The teacher reviews and
 * accepts via the existing suggestion banner, keeping a human in the loop.
 *
 * Body: { submission_id?: string, all?: boolean }
 *   - submission_id → grade that one submission
 *   - all: true     → grade every ungraded, un-suggested text submission on this
 *                     assignment (bounded by a 50s deadline; re-run to continue)
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // AI-suggesting a mark is grading. Scope (which assignments are in reach) is still
    // decided by callerCanManageAssignmentWork below — this only decides the action.
    const denied = denyIfMissingCapability(caller.role, 'grade');
    if (denied) {
      return NextResponse.json({ error: denied.error }, { status: denied.status });
    }

    const { id: assignment_id } = await context.params;
    const admin = adminClient();

    const { data: assignment } = await admin
      .from('assignments')
      .select('id, title, instructions, max_points, school_id, created_by, class_id, metadata')
      .eq('id', assignment_id)
      .maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    const canManage = await callerCanManageAssignmentWork(admin as any, caller, assignment as any);
    if (!canManage) {
      return NextResponse.json({ error: 'Access denied: not your assignment' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const maxPoints = (assignment as any).max_points ?? 100;
    const instructions = (assignment as any).instructions ?? '';
    const title = assignment.title ?? 'Assignment';

    // Build the target submission list.
    let query = admin
      .from('assignment_submissions')
      .select('id, portal_user_id, submission_text, grade, ai_suggested_grade, status, version')
      .eq('assignment_id', assignment_id);
    if (body.submission_id) {
      query = query.eq('id', body.submission_id);
    } else if (body.all === true) {
      query = query
        .is('grade', null)
        .is('ai_suggested_grade', null)
        .in('status', ['submitted', 'late', 'resubmitted', 'pending_review'])
        .limit(100);
    } else {
      return NextResponse.json({ error: 'submission_id or all:true required' }, { status: 400 });
    }

    const { data: subs, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const DEADLINE = Date.now() + 50_000; // stay under the 60s cap; re-run to continue
    const results: Array<{ submission_id: string; status: string; score?: number; feedback?: string }> = [];
    let graded = 0;

    for (const sub of subs ?? []) {
      if (Date.now() > DEADLINE) { results.push({ submission_id: sub.id, status: 'deferred_deadline' }); continue; }
      if (sub.grade != null) { results.push({ submission_id: sub.id, status: 'skipped_already_graded' }); continue; }
      if (!['submitted', 'late', 'resubmitted', 'pending_review'].includes(String(sub.status ?? ''))) {
        results.push({ submission_id: sub.id, status: 'skipped_not_ready_for_review' });
        continue;
      }
      const text = (sub.submission_text ?? '').trim();
      if (!text) { results.push({ submission_id: sub.id, status: 'skipped_no_text' }); continue; }

      const ai = await gradeText(title, instructions, maxPoints, text);
      if (!ai) { results.push({ submission_id: sub.id, status: 'ai_failed' }); continue; }

      const { data: savedSuggestion, error: upErr } = await admin
        .from('assignment_submissions')
        .update({
          ai_suggested_grade: ai.score,
          ai_suggested_feedback: ai.feedback,
          grading_mode: 'ai_suggested',
          status: 'pending_review',
          status_changed_by: caller.id,
          last_change_reason: 'AI prepared a draft mark for teacher review',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id)
        .eq('version', sub.version)
        .is('grade', null)
        .is('ai_suggested_grade', null)
        .in('status', ['submitted', 'late', 'resubmitted', 'pending_review'])
        .select('id, version')
        .maybeSingle();
      if (upErr) { results.push({ submission_id: sub.id, status: 'save_failed' }); continue; }
      if (!savedSuggestion) {
        results.push({ submission_id: sub.id, status: 'skipped_newer_review_preserved' });
        continue;
      }

      graded += 1;
      results.push({ submission_id: sub.id, status: 'suggested', score: ai.score, feedback: ai.feedback });
    }

    await logAudit(admin as any, {
      action: 'assignment_submission.ai_suggest',
      actorId: caller.id,
      resourceType: 'assignment',
      resourceId: assignment_id,
      newValues: { suggested: graded, total: (subs ?? []).length },
    });

    const incomplete = results.filter(result => !['suggested', 'skipped_already_graded', 'skipped_not_ready_for_review', 'skipped_no_text', 'skipped_newer_review_preserved'].includes(result.status)).length;
    return NextResponse.json({
      success: true,
      suggested: graded,
      incomplete,
      results,
      ...(incomplete > 0
        ? { message: `${incomplete} suggestion${incomplete === 1 ? '' : 's'} could not be completed. Existing work was left untouched; retry or mark manually.` }
        : {}),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 },
    );
  }
}
