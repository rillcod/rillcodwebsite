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
    .select('*, consent_responses(count)')
    .order('created_at', { ascending: false })
    .limit(20);

  if (profile?.school_id) query = query.eq('school_id', profile.school_id);
  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const nextCursor = data && data.length === 20 ? data[data.length - 1].created_at : null;
  return NextResponse.json({ data, nextCursor });
}

// POST /api/consent-forms — create a consent form
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!['teacher', 'admin', 'school'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { title, body, due_date } = await req.json();
  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'Title and body are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('consent_forms')
    .insert({
      title: title.trim(),
      body: body.trim(),
      due_date: due_date || null,
      created_by: user.id,
      school_id: profile.school_id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
