import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/log';

type ProgressionPolicy = Record<string, unknown>;

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCaller() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await adminClient()
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .maybeSingle();
  return profile ?? null;
}

export async function GET() {
  const caller = await getCaller();
  if (!caller || !['teacher', 'admin'].includes(caller.role ?? '')) {
    return NextResponse.json({ error: 'Teacher or admin access required.' }, { status: 403 });
  }

  const { data, error } = await adminClient()
    .from('programs')
    .select('id,name,is_active,program_scope,delivery_type,session_frequency_per_week,school_progression_enabled,progression_policy,updated_at')
    .eq('program_scope', 'regular_school')
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function PUT(req: NextRequest) {
  const caller = await getCaller();
  if (!caller || caller.role !== 'admin') {
    return NextResponse.json({ error: 'Only the Academic Office can change central programme rules.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const programId = typeof body.program_id === 'string' ? body.program_id : '';
  if (!programId) {
    return NextResponse.json({ error: 'program_id is required.' }, { status: 400 });
  }

  const db = adminClient();
  const { data: currentProgram, error: currentErr } = await db
    .from('programs')
    .select('id, progression_policy')
    .eq('id', programId)
    .eq('program_scope', 'regular_school')
    .maybeSingle();
  if (currentErr) return NextResponse.json({ error: currentErr.message }, { status: 500 });
  if (!currentProgram) return NextResponse.json({ error: 'Program not found.' }, { status: 404 });

  const currentPolicy =
    currentProgram.progression_policy && typeof currentProgram.progression_policy === 'object'
      ? (currentProgram.progression_policy as ProgressionPolicy)
      : {};

  const nextPolicy: ProgressionPolicy = { ...currentPolicy };
  if (typeof body.strict_route_default === 'boolean') nextPolicy.strict_route_default = body.strict_route_default;
  if (typeof body.auto_flashcards_default === 'boolean') nextPolicy.auto_flashcards_default = body.auto_flashcards_default;
  if (typeof body.project_based_default === 'boolean') nextPolicy.project_based_default = body.project_based_default;
  if (typeof body.essential_routes_only === 'boolean') nextPolicy.essential_routes_only = body.essential_routes_only;
  if (Number.isFinite(Number(body.standard_weeks_per_term))) {
    nextPolicy.standard_weeks_per_term = Math.min(20, Math.max(1, Number(body.standard_weeks_per_term)));
  }
  if (body.mastery_mode === 'strict' || body.mastery_mode === 'soft') nextPolicy.mastery_mode = body.mastery_mode;
  if (Array.isArray(body.track_priority)) {
    nextPolicy.track_priority = body.track_priority.filter((v: unknown): v is string => typeof v === 'string');
  }
  if (Number.isFinite(Number(body.qa_min_pass_score))) {
    nextPolicy.qa_min_pass_score = Math.min(100, Math.max(40, Number(body.qa_min_pass_score)));
  }
  if (Number.isFinite(Number(body.qa_required_teacher_steps))) {
    nextPolicy.qa_required_teacher_steps = Math.min(8, Math.max(1, Number(body.qa_required_teacher_steps)));
  }
  if (Number.isFinite(Number(body.qa_required_student_steps))) {
    nextPolicy.qa_required_student_steps = Math.min(8, Math.max(1, Number(body.qa_required_student_steps)));
  }
  if (body.qa_assessment_drift_mode === 'warn' || body.qa_assessment_drift_mode === 'fail') {
    nextPolicy.qa_assessment_drift_mode = body.qa_assessment_drift_mode;
  }
  if (body.qa_exam_drift_mode === 'warn' || body.qa_exam_drift_mode === 'fail') {
    nextPolicy.qa_exam_drift_mode = body.qa_exam_drift_mode;
  }
  if (body.qa_five_step_mode === 'warn' || body.qa_five_step_mode === 'fail') {
    nextPolicy.qa_five_step_mode = body.qa_five_step_mode;
  }
  if ([1, 2, 3].includes(Number(body.program_start_term))) {
    nextPolicy.program_start_term = Number(body.program_start_term);
  }

  const updatePayload: Record<string, unknown> = {
    progression_policy: nextPolicy,
    updated_at: new Date().toISOString(),
  };
  if (body.delivery_type === 'optional' || body.delivery_type === 'compulsory') {
    updatePayload.delivery_type = body.delivery_type;
  }
  if (body.session_frequency_per_week === 1 || body.session_frequency_per_week === 2) {
    updatePayload.session_frequency_per_week = body.session_frequency_per_week;
  }
  if (typeof body.school_progression_enabled === 'boolean') {
    updatePayload.school_progression_enabled = body.school_progression_enabled;
  }

  const { data, error } = await db
    .from('programs')
    .update(updatePayload)
    .eq('id', programId)
    .select('id,name,is_active,program_scope,delivery_type,session_frequency_per_week,school_progression_enabled,progression_policy,updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(db as any, {
    action: 'update_progression_program_policy', actorId: caller.id,
    resourceType: 'program', resourceId: programId, tableName: 'programs',
    oldValues: { progression_policy: currentPolicy },
    newValues: updatePayload,
    newValue: `Updated central programme rules for ${data.name}`,
  });
  return NextResponse.json({ data });
}
