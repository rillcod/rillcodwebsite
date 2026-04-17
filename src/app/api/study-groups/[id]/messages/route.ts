import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');
  let query = supabase
    .from('study_group_messages')
    .select('*, portal_users!sender_id(full_name, avatar_url)')
    .eq('group_id', id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const nextCursor = data && data.length === 30 ? data[data.length - 1].created_at : null;
  return NextResponse.json({ data: (data ?? []).reverse(), nextCursor });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (profile?.role === 'teacher' || profile?.role === 'school') {
    return NextResponse.json({ error: 'Teachers have read-only access to study groups' }, { status: 403 });
  }

  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: 'Message content is required', field: 'content' }, { status: 400 });

  const { data, error } = await supabase
    .from('study_group_messages')
    .insert({ group_id: id, sender_id: user.id, content: content.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
