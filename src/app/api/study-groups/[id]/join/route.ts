import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// POST /api/study-groups/[id]/join
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
