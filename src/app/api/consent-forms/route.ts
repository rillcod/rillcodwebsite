import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/consent-forms
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');

  let query = supabase
    .from('consent_forms')
    .select('*, consent_responses(count), form_leads(count)')
    .order('created_at', { ascending: false })
    .limit(20);

  if (profile?.school_id) query = query.eq('school_id', profile.school_id);
  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // For parents: fetch which forms they have already signed so the UI
  // shows correct signed state across page reloads.
  let signedFormIds: string[] = [];
  if (profile?.role === 'parent' && data && data.length > 0) {
    const ids = data.map((f: any) => f.id);
    const { data: myResponses } = await supabase
      .from('consent_responses')
      .select('form_id')
      .eq('parent_id', user.id)
      .in('form_id', ids);
    signedFormIds = (myResponses ?? []).map((r: any) => r.form_id);
  }

  const enriched = (data ?? []).map((f: any) => ({
    ...f,
    has_signed: signedFormIds.includes(f.id),
  }));

  const nextCursor = data && data.length === 20 ? data[data.length - 1].created_at : null;
  return NextResponse.json({ data: enriched, nextCursor });
}

// POST /api/consent-forms — create a consent form
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { title, body, due_date, form_type, school_id: bodySchoolId } = await req.json();
  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'Title and body are required' }, { status: 400 });
  }

  // Resolve school_id: body override → profile → first school (admin fallback)
  let schoolId: string | null = bodySchoolId ?? profile.school_id ?? null;
  if (!schoolId) {
    const { data: firstSchool } = await supabase.from('schools').select('id').limit(1).single();
    schoolId = firstSchool?.id ?? null;
  }
  if (!schoolId) {
    return NextResponse.json({ error: 'Could not determine school for this form.' }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from('consent_forms')
    .insert({
      title: title.trim(),
      body: body.trim(),
      due_date: due_date || null,
      created_by: user.id,
      school_id: schoolId,
      form_type: form_type ?? 'general',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
