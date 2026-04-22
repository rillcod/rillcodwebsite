import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendPushNotification } from '@/lib/push';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET or POST /api/cron/streak-reminder
export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}

async function handleRequest(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = adminClient();
  
  // Use WAT timezone (UTC+1) for consistent date comparison
  const now = new Date();
  const watOffset = 1 * 60; // WAT is UTC+1
  const watTime = new Date(now.getTime() + watOffset * 60 * 1000);
  const today = watTime.toISOString().slice(0, 10); // YYYY-MM-DD in WAT
  const todayStart = `${today}T00:00:00`; // Start of day in WAT

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
    const portalUser = pref.portal_users as any;
    const firstName = (portalUser?.full_name ?? '').split(' ')[0] || 'there';

    // Check if student has any activity today (completed, not just scheduled)
    const [lessons, reviews, cbt] = await Promise.all([
      supabase.from('lesson_progress').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).gte('last_accessed', todayStart),
      supabase.from('flashcard_reviews').select('id', { count: 'exact', head: true })
        .eq('student_id', userId).gte('reviewed_at', todayStart).not('reviewed_at', 'is', null),
      supabase.from('cbt_sessions').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).gte('start_time', todayStart),
    ]);

    const hasActivity = (lessons.count ?? 0) > 0 || (reviews.count ?? 0) > 0 || (cbt.count ?? 0) > 0;
    if (hasActivity) { skipped++; continue; }

    await sendPushNotification(userId, {
      title: '🔥 Keep your streak going!',
      body: `Hey ${firstName}, you haven't done any learning today. Don't break your streak!`,
      url: '/dashboard/learning',
    }, 'streak_reminder');
    sent++;
  }

  return NextResponse.json({ sent, skipped, total: studentPrefs.length });
}
