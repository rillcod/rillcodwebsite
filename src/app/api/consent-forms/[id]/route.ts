import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/consent-forms/[id] — staff: signed responses + public leads
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (!['teacher', 'admin', 'school'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [{ data: responses, error: rErr }, { data: leads, error: lErr }] = await Promise.all([
    supabase
      .from('consent_responses')
      .select('id, signed_at, response_data, portal_users!parent_id(full_name, email, phone)')
      .eq('form_id', id)
      .order('signed_at', { ascending: false }),
    (supabase as any)
      .from('form_leads')
      .select('id, submitted_at, email, child_current_school, matched_school_id, response_data, status, match_status, match_confidence, match_notes, match_candidate_id, matched_student_id, matched_parent_id, contact_id, prospect_id, schools!matched_school_id(name), match_candidate:portal_users!match_candidate_id(id, full_name, section_class, email)')
      .eq('form_id', id)
      .order('submitted_at', { ascending: false }),
  ]);

  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  return NextResponse.json({ data: responses ?? [], leads: leads ?? [] });
}

// PATCH /api/consent-forms/[id] — staff: toggle is_public / form_type
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!['teacher', 'admin', 'school'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const allowed = ['is_public', 'form_type', 'title', 'body', 'due_date'] as const;
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data: form } = await supabase.from('consent_forms').select('school_id').eq('id', id).single();
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (profile?.role !== 'admin' && form.school_id !== profile?.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase.from('consent_forms').update(updates as { is_public?: boolean; form_type?: string }).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/consent-forms/[id] — staff only
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!['teacher', 'admin', 'school'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: form } = await supabase.from('consent_forms').select('school_id').eq('id', id).single();
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (profile?.role !== 'admin' && form.school_id !== profile?.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase.from('consent_forms').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
