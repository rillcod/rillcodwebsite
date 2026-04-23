import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCaller() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await adminClient()
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .maybeSingle();
  return profile ?? null;
}

function canRead(role: string | null | undefined) {
  return ['admin', 'teacher', 'school'].includes(role ?? '');
}

function canMutate(role: string | null | undefined) {
  return ['admin', 'teacher', 'school'].includes(role ?? '');
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCaller();
  if (!caller || !canRead(caller.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { data, error } = await adminClient()
    .from('curriculum_project_registry')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (caller.role === 'school' && caller.school_id && data.school_id && data.school_id !== caller.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCaller();
  if (!caller || !canMutate(caller.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = adminClient();
  const { data: current, error: currentErr } = await db
    .from('curriculum_project_registry')
    .select('id, school_id, metadata')
    .eq('id', id)
    .maybeSingle();
  if (currentErr) return NextResponse.json({ error: currentErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (caller.role === 'school' && caller.school_id && current.school_id && current.school_id !== caller.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const updatePayload: Record<string, unknown> = {};
  if (typeof body.title === 'string' && body.title.trim()) updatePayload.title = body.title.trim();
  if (typeof body.track === 'string' && body.track.trim()) updatePayload.track = body.track.trim();
  if (Array.isArray(body.concept_tags)) {
    updatePayload.concept_tags = body.concept_tags.filter((v: unknown): v is string => typeof v === 'string');
  }
  if (typeof body.difficulty_level === 'number') {
    updatePayload.difficulty_level = Math.max(1, Math.min(10, Math.round(body.difficulty_level)));
  }
  if (typeof body.classwork_prompt === 'string' || body.classwork_prompt === null) {
    updatePayload.classwork_prompt = body.classwork_prompt;
  }
  if (typeof body.estimated_minutes === 'number' || body.estimated_minutes === null) {
    updatePayload.estimated_minutes = body.estimated_minutes;
  }
  if (typeof body.is_active === 'boolean') updatePayload.is_active = body.is_active;
  if (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
    updatePayload.metadata = body.metadata;
  }
  updatePayload.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from('curriculum_project_registry')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCaller();
  if (!caller || !canMutate(caller.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = adminClient();
  const { data: current, error: currentErr } = await db
    .from('curriculum_project_registry')
    .select('id, school_id')
    .eq('id', id)
    .maybeSingle();
  if (currentErr) return NextResponse.json({ error: currentErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (caller.role === 'school' && caller.school_id && current.school_id && current.school_id !== caller.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await db.from('curriculum_project_registry').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
