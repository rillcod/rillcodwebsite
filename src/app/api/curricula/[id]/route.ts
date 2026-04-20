import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function requireTeacher() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient() as any;
  const { data: profile } = await admin
    .from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  if (!profile || !['admin', 'teacher'].includes(profile.role)) return null;
  return profile;
}

// PATCH /api/curricula/[id] — update is_visible_to_school
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const caller = await requireTeacher();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const body = await req.json();

  if (typeof body.is_visible_to_school !== 'boolean') {
    return NextResponse.json({ error: 'is_visible_to_school (boolean) required' }, { status: 400 });
  }

  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('course_curricula')
    .update({ is_visible_to_school: body.is_visible_to_school, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, is_visible_to_school')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
