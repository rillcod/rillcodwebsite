import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveStudentProgramScope } from '@/lib/assignments/visibility';

export const dynamic = 'force-dynamic';

// POST /api/study-groups/[id]/join
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id, class_id')
    .eq('id', user.id)
    .single();

  const admin = createAdminClient();
  const { data: group } = await admin
    .from('study_groups')
    .select('id, school_id, course_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!group || group.status !== 'active') return NextResponse.json({ error: 'Group not found' }, { status: 404 });

  if (profile?.role === 'student') {
    if (group.school_id && group.school_id !== profile.school_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (group.course_id) {
      const scope = await resolveStudentProgramScope(admin as any, user.id, profile.class_id);
      if (!scope.courseIds.has(group.course_id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  // Check member count cap (20)
  const { count } = await supabase
    .from('study_group_members')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', id);

  if ((count ?? 0) >= 20) {
    return NextResponse.json({ error: 'GROUP_FULL', message: 'This group has reached the maximum of 20 members.' }, { status: 409 });
  }

  const { error } = await supabase
    .from('study_group_members')
    .insert({ group_id: id, user_id: user.id });

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Already a member' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
