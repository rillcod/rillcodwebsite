import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function caller() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;
  const db: any = createAdminClient();
  const { data } = await db.from('portal_users').select('id,role,school_id').eq('id', user.id).maybeSingle();
  return data as { id: string; role: string; school_id: string | null } | null;
}

export async function GET() {
  const user = await caller();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'teacher', 'school'].includes(user.role)) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  const db: any = createAdminClient();
  let query = db.from('academic_assessment_schemes')
    .select('id,name,school_id,course_id,academic_term_id,components,status,updated_at,schools(name),courses(title)')
    .eq('status', 'active').order('updated_at', { ascending: false });
  if (user.role === 'school') query = query.or(`school_id.is.null,school_id.eq.${user.school_id}`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await caller();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Only the Academic Office can change result weights.' }, { status: 403 });
  const body = await req.json();
  const components = body.components && typeof body.components === 'object' ? body.components : null;
  if (!components) return NextResponse.json({ error: 'Supply the six result component weights.' }, { status: 400 });
  const db: any = createAdminClient();
  const { data, error } = await db.rpc('publish_academic_assessment_scheme', {
    p_name: String(body.name || 'Academic result weighting').trim(),
    p_components: components,
    p_actor_id: user.id,
    p_school_ids: Array.isArray(body.school_ids) && body.school_ids.length ? body.school_ids : null,
    p_course_id: body.course_id || null,
    p_academic_term_id: body.academic_term_id || null,
  });
  if (error) return NextResponse.json({ error: error.message, detail: error.details }, { status: 400 });
  return NextResponse.json({ data, message: 'The weighting scheme is now active for the selected schools.' }, { status: 201 });
}
