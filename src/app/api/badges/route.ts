import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  return data ? { ...user, role: data.role, school_id: data.school_id } : null;
}

// GET /api/badges — list all badges (all authenticated users can view)
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient();
  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('school_id');

  let query = db.from('badges').select('*').eq('is_active', true).order('created_at', { ascending: false });
  if (schoolId) query = query.eq('school_id', schoolId);
  else if (user.role !== 'admin') query = query.or(`school_id.is.null,school_id.eq.${user.school_id || '00000000-0000-0000-0000-000000000000'}`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/badges — create badge (admin only)
export async function POST(request: Request) {
  const user = await getUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { name, description, icon_url, criteria, points_value, school_id } = body;
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const db = createAdminClient();
  const { data, error } = await db.from('badges').insert([{
    name, description, icon_url, criteria: criteria ?? {}, points_value: points_value ?? 0,
    school_id: school_id || null, is_active: true,
  }]).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
