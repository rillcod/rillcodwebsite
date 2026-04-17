import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendToUser } from '@/lib/push';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST /api/cron/streak-reminder — runs daily at 17:00 UTC (18:00 WAT)
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = adminClient();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD in WAT

  // Get students with streak_reminder enabled
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('portal_user_id, portal_users!portal_user_id(full_name, role)')
    .eq('streak_reminder', true);

  const studentPrefs = (prefs ?? []).filter((p: any) => p.portal_users?.role === 'student');

  let sent = 0;
  let skipped = 0;

  for (const pref of studentPrefs) {
    const userId = pref.portal_user_id;
    const firstName = (pref.portal_users?.full_name ?? '').split(' ')[0] || 'there';

    // Check if student has any activity today
    const [lessons, reviews, cbt] = await Promise.all([
      supabase.from('lesson_progress').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).gte('last_accessed', today),
      supabase.from('flashcard_reviews').select('id', { count: 'exact', head: true })
        .eq('student_id', userId).gte('next_review_at', today),
      supabase.from('cbt_sessions').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).gte('start_time', today),
    ]);

    const hasActivity = (lessons.count ?? 0) > 0 || (reviews.count ?? 0) > 0 || (cbt.count ?? 0) > 0;
    if (hasActivity) { skipped++; continue; }

    await sendToUser(userId, {
      title: '🔥 Keep your streak going!',
      body: `Hey ${firstName}, you haven't done any learning today. Don't break your streak!`,
      url: '/dashboard/learning',
    });
    sent++;
  }

  return NextResponse.json({ sent, skipped, total: studentPrefs.length });
}
