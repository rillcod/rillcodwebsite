import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/badges/award — award a badge to a user (admin/teacher)
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'teacher'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { badge_id, portal_user_id, notes } = await request.json();
  if (!badge_id || !portal_user_id) return NextResponse.json({ error: 'badge_id and portal_user_id required' }, { status: 400 });

  const db = createAdminClient();

  // Check if already awarded
  const { data: existing } = await db.from('user_badges').select('id').eq('badge_id', badge_id).eq('portal_user_id', portal_user_id).single();
  if (existing) return NextResponse.json({ error: 'Badge already awarded to this user' }, { status: 409 });

  // Get badge points value
  const { data: badge } = await db.from('badges').select('points_value, name').eq('id', badge_id).single();

  const { data, error } = await db.from('user_badges').insert([{
    badge_id,
    portal_user_id,
    awarded_by: user.id,
    awarded_at: new Date().toISOString(),
    notes: notes || null,
  } as any]).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Award points if badge has a points value
  if (badge?.points_value && badge.points_value > 0) {
    await db.from('point_transactions').insert([{
      portal_user_id,
      points: badge.points_value,
      activity_type: 'badge_earned',
      reference_id: badge_id,
      description: `Badge earned: ${badge.name}`,
    } as any]);
  }

  // Send notification
  await db.from('notifications').insert([{
    user_id: portal_user_id,
    title: `You earned a badge!`,
    message: `You've been awarded the "${badge?.name}" badge.`,
    type: 'success',
    is_read: false,
  } as any]);

  return NextResponse.json({ data }, { status: 201 });
}
