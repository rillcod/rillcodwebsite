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

// GET /api/user-points — get points for a user or leaderboard
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id') || user.id;
  const leaderboard = searchParams.get('leaderboard') === 'true';
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

  const db = createAdminClient();

  if (leaderboard) {
    const cursorPoints = searchParams.get('cursor_points');
    const cursorId = searchParams.get('cursor_id');

    let q = db
      .from('user_points')
      .select('*, portal_users(id, full_name, email, school_id, section_class)')
      .order('total_points', { ascending: false })
      .order('portal_user_id', { ascending: false })
      .limit(21);

    // Cursor: rows with fewer points, or same points but lower id
    if (cursorPoints && cursorId) {
      q = q.or(`total_points.lt.${cursorPoints},and(total_points.eq.${cursorPoints},portal_user_id.lt.${cursorId})`) as any;
    }

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = data ?? [];
    const hasMore = rows.length === 21;
    const page = hasMore ? rows.slice(0, 20) : rows;
    const last = page[page.length - 1] as any;
    const nextCursor = hasMore && last
      ? { points: last.total_points, id: last.portal_user_id }
      : null;

    return NextResponse.json({ data: page, nextCursor });
  }

  // Individual user points + transaction history
  const [pointsRes, txRes] = await Promise.all([
    db.from('user_points').select('*').eq('portal_user_id', userId).single(),
    db.from('point_transactions').select('*').eq('portal_user_id', userId).order('created_at', { ascending: false }).limit(20),
  ]);

  return NextResponse.json({
    points: pointsRes.data,
    transactions: txRes.data ?? [],
  });
}

// POST /api/user-points — manually award points (admin only)
export async function POST(request: Request) {
  const user = await getUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { portal_user_id, points, activity_type, description } = await request.json();
  if (!portal_user_id || !points || !activity_type) {
    return NextResponse.json({ error: 'portal_user_id, points, and activity_type required' }, { status: 400 });
  }

  const db = createAdminClient();

  // Log transaction
  await db.from('point_transactions').insert([{
    portal_user_id, points, activity_type, description,
  } as any]);

  // Upsert user_points
  const { data: current } = await db.from('user_points').select('total_points').eq('portal_user_id', portal_user_id).single();
  const newTotal = (current?.total_points ?? 0) + points;

  const achievement_level = newTotal >= 5000 ? 'Platinum' : newTotal >= 2000 ? 'Gold' : newTotal >= 500 ? 'Silver' : 'Bronze';

  await db.from('user_points').upsert({
    portal_user_id,
    total_points: newTotal,
    achievement_level,
    updated_at: new Date().toISOString(),
  } as any, { onConflict: 'portal_user_id' });

  return NextResponse.json({ success: true, new_total: newTotal, achievement_level }, { status: 201 });
}
