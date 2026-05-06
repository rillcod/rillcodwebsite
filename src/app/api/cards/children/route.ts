import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getParentLinkScope } from '@/lib/parents/links';

/**
 * GET /api/cards/children
 * Parent-accessible endpoint — returns identity_cards rows for all children
 * linked to the authenticated parent, keyed by holder_id.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;

  const { data: parentProfile, error: profileError } = await admin
    .from('portal_users')
    .select('id, email, role')
    .eq('id', user.id)
    .single();

  if (profileError || !parentProfile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }
  if (parentProfile.role !== 'parent') {
    return NextResponse.json({ error: 'Forbidden: parent accounts only' }, { status: 403 });
  }

  const linkScope = await getParentLinkScope(admin, {
    id: parentProfile.id,
    email: parentProfile.email,
  });

  const userIds = linkScope.studentUserIds;
  if (!userIds.length) return NextResponse.json({ data: [] });

  const { data: cards, error } = await admin
    .from('identity_cards')
    .select('*')
    .in('holder_id', userIds)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: cards ?? [] });
}
