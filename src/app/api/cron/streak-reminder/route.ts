import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendPushNotification } from '@/lib/push';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';

import { loadOfficeAutomationControls } from '@/lib/communication/automation-controls';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { resolveOptedInUsers } from '@/lib/notifications/opt-in';
import { loadTermWindow } from '@/lib/notifications/term-window';
export const dynamic = 'force-dynamic';

// How far back a learner must have shown any activity before a streak nudge is honest.
const STREAK_HISTORY_DAYS = 30;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET or POST /api/cron/streak-reminder
export async function GET(req: NextRequest) {
  return runMonitoredCron('streak-reminder', 15, () => handleRequest(req));
}

export async function POST(req: NextRequest) {
  return runMonitoredCron('streak-reminder', 15, () => handleRequest(req));
}

async function handleRequest(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = adminClient();
  try {
    const controls = await loadOfficeAutomationControls(supabase as any);
    if (!controls.retention_streaks_enabled) {
      return NextResponse.json({ success: true, disabled: true, reason: 'retention_streaks_switch', sent: 0, skipped: 0, total: 0 });
    }
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Controls unavailable' }, { status: 503 });
  }

  
  // Use WAT timezone (UTC+1) for consistent date comparison
  const now = new Date();
  const watOffset = 1 * 60; // WAT is UTC+1
  const watTime = new Date(now.getTime() + watOffset * 60 * 1000);
  const today = watTime.toISOString().slice(0, 10); // YYYY-MM-DD in WAT
  const todayStart = `${today}T00:00:00`; // Start of day in WAT

  // Nigerian termly calendar: the gaps between terms are real holidays. Learners are meant
  // to be away, so a streak nudge during a break is noise at best and a reason to mute
  // notifications at worst. Stay quiet until term resumes.
  try {
    const term = await loadTermWindow(supabase as any);
    if (!term.inTerm) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'term_break',
        nextTermStarts: term.nextTermStarts,
        sent: 0,
      });
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Academic calendar unavailable' },
      { status: 503 },
    );
  }

  // Everyone who has not explicitly switched streak reminders off. The old query read
  // `.eq('streak_reminder', true)` straight off notification_preferences, but rows are only
  // written when a user edits their settings — so with an empty table this addressed nobody
  // while the settings screen showed the reminder as ON. See lib/notifications/opt-in.
  let students: Array<{ id: string; full_name: string | null }>;
  try {
    students = await resolveOptedInUsers(supabase as any, { role: 'student', prefKey: 'streak_reminder' });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Audience unavailable' },
      { status: 503 },
    );
  }

  // A streak reminder only makes sense for someone who has a streak to lose. Without this,
  // the first healthy run would cold-message every learner who has never opened the app —
  // that is not a reminder, and it trains people to ignore us.
  const historyWindow = new Date(Date.now() - STREAK_HISTORY_DAYS * 864e5).toISOString();
  const everActive = new Set<string>();
  {
    const [lp, fr, cs] = await Promise.all([
      supabase.from('lesson_progress').select('portal_user_id').gte('last_accessed_at', historyWindow),
      supabase.from('flashcard_reviews').select('student_id').gte('last_reviewed_at', historyWindow),
      supabase.from('cbt_sessions').select('user_id').gte('start_time', historyWindow),
    ]);
    const readError = [lp, fr, cs].find((r) => r.error);
    if (readError) {
      return NextResponse.json(
        { success: false, error: `Streak history unavailable: ${readError.error?.message}` },
        { status: 503 },
      );
    }
    for (const r of (lp.data ?? []) as Array<{ portal_user_id: string | null }>) if (r.portal_user_id) everActive.add(r.portal_user_id);
    for (const r of (fr.data ?? []) as Array<{ student_id: string | null }>) if (r.student_id) everActive.add(r.student_id);
    for (const r of (cs.data ?? []) as Array<{ user_id: string | null }>) if (r.user_id) everActive.add(r.user_id);
  }

  const withStreak = students.filter((s) => everActive.has(s.id));

  let sent = 0;
  let skipped = 0;
  let probeErrors = 0;
  const noStreakYet = students.length - withStreak.length;
  // Stop ~10s before the 60s serverless cap so the run exits gracefully under load
  // instead of being killed mid-loop.
  const DEADLINE = Date.now() + 50_000;

  for (const student of withStreak) {
    if (Date.now() > DEADLINE) break;
    const userId = student.id;
    const firstName = (student.full_name ?? '').split(' ')[0] || 'there';

    // Check if student has any activity today (completed, not just scheduled)
    const [lessons, reviews, cbt] = await Promise.all([
      supabase.from('lesson_progress').select('id', { count: 'exact', head: true })
        .eq('portal_user_id', userId).gte('last_accessed_at', todayStart),
      supabase.from('flashcard_reviews').select('id', { count: 'exact', head: true })
        .eq('student_id', userId).gte('last_reviewed_at', todayStart).not('last_reviewed_at', 'is', null),
      supabase.from('cbt_sessions').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).gte('start_time', todayStart),
    ]);

    // A failed probe returns count=null, which reads identically to "no activity" —
    // that would nag a student who studied all day. Stay silent unless we actually
    // know the day was empty.
    const probeFailed = [lessons, reviews, cbt].find((r) => r.error);
    if (probeFailed) {
      console.error('[cron/streak-reminder] activity probe failed; skipping', userId, probeFailed.error);
      probeErrors++;
      continue;
    }

    const hasActivity = (lessons.count ?? 0) > 0 || (reviews.count ?? 0) > 0 || (cbt.count ?? 0) > 0;
    if (hasActivity) { skipped++; continue; }

    await sendPushNotification(userId, {
      title: '🔥 Keep your streak going!',
      body: `Hey ${firstName}, you haven't done any learning today. Don't break your streak!`,
      url: '/dashboard/learning',
    }, 'streak_reminder');
    sent++;
  }

  return NextResponse.json({
    sent,
    skipped,
    probeErrors,
    noStreakYet,
    eligible: withStreak.length,
    total: students.length,
  });
}
