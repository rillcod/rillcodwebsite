import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/consent-forms/[id]/signatories — staff: list who signed
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (!['teacher', 'admin', 'school'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: responses, error } = await supabase
    .from('consent_responses')
    .select('id, signed_at, portal_users!parent_id(full_name, email, phone)')
    .eq('form_id', id)
    .order('signed_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: responses ?? [] });
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

  // Confirm the form belongs to the same school (prevent cross-school deletion)
  const { data: form } = await supabase.from('consent_forms').select('school_id, created_by').eq('id', id).single();
  if (!form) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (profile?.role !== 'admin' && form.school_id !== profile?.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase.from('consent_forms').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
