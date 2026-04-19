import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
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
      .select('role, id')
      .eq('id', user.id)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 403 });

    const body = await request.json();
    const { exam_id, start_time, end_time, score, status, answers, manual_scores, grading_notes, needs_grading, auto_submitted, submitted_at } = body;

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
      .select('duration_minutes, end_date, is_active')
      .eq('id', exam_id)
      .single();

    if (!examRow || !examRow.is_active) {
      return NextResponse.json({ error: 'Exam not found or is no longer active' }, { status: 404 });
    }

    // Check exam window closed
    if (examRow.end_date && new Date(examRow.end_date) < new Date()) {
      return NextResponse.json({ error: 'The exam window has closed' }, { status: 422 });
    }

    // Enforce duration-based deadline
    if (examRow.duration_minutes && start_time) {
      const deadline = new Date(start_time).getTime() + examRow.duration_minutes * 60_000;
      const submittedMs = submitted_at ? new Date(submitted_at).getTime() : Date.now();
      const GRACE_MS = 30_000; // 30-second grace period for network latency

      if (submittedMs > deadline + GRACE_MS) {
        return NextResponse.json(
          { error: 'DEADLINE_EXCEEDED' },
          { status: 422 },
        );
      }
    }

    const { data, error } = await admin
      .from('cbt_sessions')
      .insert({
        exam_id,
        user_id: caller.id,
        start_time: start_time ?? new Date().toISOString(),
        end_time: end_time ?? new Date().toISOString(),
        score: score ?? 0,
        status: status ?? 'completed',
        answers: answers ?? {},
        manual_scores: manual_scores ?? {},
        grading_notes: grading_notes ?? null,
        needs_grading: needs_grading ?? false,
        auto_submitted: auto_submitted ?? false,
      })
      .select('id, score, status')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
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

    if (exam_id) {
      const { data } = await admin
        .from('cbt_sessions')
        .select('id, score, status, exam_id')
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
