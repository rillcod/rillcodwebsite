import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { PromotionPayload } from '@/types/progression.types';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await adminClient()
    .from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  if (!profile || !['admin', 'teacher'].includes(profile.role)) return null;
  return profile;
}

// ── PATCH /api/student-level-enrollments/[id] ────────────────────────────────
// Process a promotion decision (promote | repeat | complete | withdraw)
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const body: PromotionPayload = await req.json();
  const { decision, next_term_label, teacher_notes } = body;

  if (!decision || !['promote', 'repeat', 'complete', 'withdraw'].includes(decision)) {
    return NextResponse.json({ error: 'Choose a valid curriculum decision' }, { status: 400 });
  }
  if (['promote', 'repeat'].includes(decision) && !String(next_term_label ?? '').trim()) {
    return NextResponse.json({ error: 'Choose the next term for this decision' }, { status: 400 });
  }
  if (String(teacher_notes ?? '').length > 2000) {
    return NextResponse.json({ error: 'Decision note must be 2,000 characters or fewer' }, { status: 400 });
  }

  const { data, error } = await (adminClient() as any).rpc(
    'process_student_level_decision',
    {
      p_enrollment_id: id,
      p_decision: decision,
      p_next_term_label: String(next_term_label ?? '').trim(),
      p_actor_id: caller.id,
      p_teacher_notes: String(teacher_notes ?? '').trim() || null,
    },
  );
  if (error) {
    console.error('[curriculum-level-decision] atomic transition failed', {
      code: error.code ?? null,
      enrollmentId: id,
      actorId: caller.id,
    });
    const message = String(error.message ?? '');
    if (error.code === 'PGRST202' || /process_student_level_decision/i.test(message)) {
      return NextResponse.json(
        { error: 'Curriculum decisions are being updated. Try again shortly; no learner record was changed.' },
        { status: 503 },
      );
    }
    if (/no longer active/i.test(message)) {
      return NextResponse.json({ error: 'This learner path was already changed. Refresh before continuing.' }, { status: 409 });
    }
    if (/cannot change|active teacher|administrator/i.test(message)) {
      return NextResponse.json({ error: 'You do not have access to change this learner path.' }, { status: 403 });
    }
    if (/not found/i.test(message)) {
      return NextResponse.json({ error: 'Curriculum enrollment not found.' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'The curriculum decision was not saved. No learner record was changed.' },
      { status: 500 },
    );
  }
  return NextResponse.json({ data });
}
