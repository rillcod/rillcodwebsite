import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
  const schoolId = url.searchParams.get('school_id');
  const action = url.searchParams.get('action_type');
  const planId = url.searchParams.get('lesson_plan_id');

  let query = supabase
    .from('progression_override_audit')
    .select('id,lesson_plan_id,school_id,actor_id,actor_role,year_number,term_number,week_number,action_type,reason,before_state,after_state,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (profile.role !== 'admin' && profile.school_id) query = query.eq('school_id', profile.school_id);
  if (schoolId && profile.role === 'admin') query = query.eq('school_id', schoolId);
  if (action) query = query.eq('action_type', action);
  if (planId) query = query.eq('lesson_plan_id', planId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
