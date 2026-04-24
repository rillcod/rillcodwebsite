import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createEngagementAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { XP_EVENTS, BADGES } from '@/lib/grading';
import { engagementTables } from '@/types/engagement';

export const dynamic = 'force-dynamic';

// ── Auth helper ───────────────────────────────────────────────────────────────
async function getCallerProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createAdminClient()
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  return data ?? null;
}

async function assertSchoolCanViewStudent(
  profile: { id: string; role: string; school_id: string | null },
  studentPortalUserId: string,
) {
  if (profile.role !== 'school') return;
  if (!profile.school_id) {
    throw new Error('School context required');
  }
  const { data: target } = await createAdminClient()
    .from('portal_users')
    .select('school_id')
    .eq('id', studentPortalUserId)
    .maybeSingle();
  if (!target || target.school_id !== profile.school_id) {
    throw new Error('Forbidden');
  }
}

// ── GET /api/engagement ───────────────────────────────────────────────────────
// Query params: student_id (optional), include (csv: xp,badges,streak,assignments,showcase)
export async function GET(req: NextRequest) {
  try {
  const profile = await getCallerProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const studentId = url.searchParams.get('student_id') ?? profile.id;
  const include   = (url.searchParams.get('include') ?? 'xp,badges,streak,assignments').split(',');

  const isStaff = ['admin', 'teacher', 'school'].includes(profile.role);
  if (!isStaff && studentId !== profile.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await assertSchoolCanViewStudent(profile, studentId);

  const db = createEngagementAdminClient();
  const et = engagementTables;
  const result: Record<string, unknown> = {};

  await Promise.all([
    include.includes('xp') && et.xpSummary(db)
      .select('total_xp, level, this_term_xp, last_updated')
      .eq('student_id', studentId)
      .single()
      .then(({ data }) => { result.xp = data ?? { total_xp: 0, level: 1, this_term_xp: 0 }; }),

    include.includes('xp') && et.xpLedger(db)
      .select('event_key, event_label, xp, ref_type, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { result.recent_xp = data ?? []; }),

    include.includes('badges') && et.badges(db)
      .select('badge_key, badge_label, badge_icon, earned_at')
      .eq('student_id', studentId)
      .order('earned_at', { ascending: false })
      .then(({ data }) => { result.badges = data ?? []; }),

    include.includes('streak') && et.streaks(db)
      .select('current_streak, longest_streak, last_active_week, total_active_weeks')
      .eq('student_id', studentId)
      .single()
      .then(({ data }) => { result.streak = data ?? { current_streak: 0, longest_streak: 0 }; }),

    include.includes('assignments') && et.asgnEng(db)
      .select('total_assigned, total_submitted, on_time_count, late_count, submission_pct, term_number, course_id')
      .eq('student_id', studentId)
      .order('term_number', { ascending: false })
      .limit(3)
      .then(({ data }) => { result.assignment_engagement = data ?? []; }),

    include.includes('showcase') && et.showcase(db)
      .select('id, title, description, thumbnail_url, item_type, course_name, term_number, is_pinned, teacher_note, created_at')
      .eq('student_id', studentId)
      .eq('is_published', true)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => { result.showcase = data ?? []; }),
  ]);

  return NextResponse.json({ data: result });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (msg === 'School context required') return NextResponse.json({ error: msg }, { status: 403 });
    console.error('[api/engagement GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── POST /api/engagement — award XP, check + grant badges, update streak ─────
export async function POST(req: NextRequest) {
  const profile = await getCallerProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!['admin', 'teacher'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden — only admin/teacher can award XP' }, { status: 403 });
  }

  const body = await req.json();
  const { student_id, event_key, ref_id, ref_type, term_number, school_id, metadata = {} } = body;

  if (!student_id || !event_key) {
    return NextResponse.json({ error: 'student_id and event_key are required' }, { status: 400 });
  }

  const xpEvent = XP_EVENTS.find(e => e.key === event_key);
  if (!xpEvent) {
    return NextResponse.json({ error: `Unknown event_key: ${event_key}` }, { status: 400 });
  }

  const db = createEngagementAdminClient();
  const et = engagementTables;

  // 1. Insert XP ledger entry — trigger auto-updates student_xp_summary
  const { data: ledgerEntry, error: ledgerErr } = await et.xpLedger(db)
    .insert({
      student_id,
      event_key,
      event_label: xpEvent.label,
      xp: xpEvent.xp,
      ref_id: ref_id ?? null,
      ref_type: ref_type ?? null,
      term_number: term_number ?? null,
      school_id: school_id ?? null,
      metadata,
    })
    .select()
    .single();

  if (ledgerErr) {
    return NextResponse.json({ error: ledgerErr.message }, { status: 500 });
  }

  // 2. Update submission streak for submission events
  const isSubmission = ['assignment_submitted', 'project_submitted', 'assignment_early'].includes(event_key);
  if (isSubmission) {
    await updateStreak(db, et, student_id);
  }

  // 3. Check and award any newly unlocked badges
  const newBadges = await checkAndAwardBadges(db, et, student_id, event_key, school_id);

  return NextResponse.json({
    data: {
      xp_awarded: xpEvent.xp,
      event_label: xpEvent.label,
      ledger_entry: ledgerEntry,
      new_badges: newBadges,
    }
  }, { status: 201 });
}

// ── Streak update ─────────────────────────────────────────────────────────────
async function updateStreak(db: ReturnType<typeof createEngagementAdminClient>, et: typeof engagementTables, studentId: string) {
  const thisMonday = getMondayStr(new Date());

  const { data: existing } = await et.streaks(db)
    .select('current_streak, longest_streak, last_active_week, total_active_weeks')
    .eq('student_id', studentId)
    .single();

  if (!existing) {
    await et.streaks(db).insert({
      student_id: studentId,
      current_streak: 1,
      longest_streak: 1,
      last_active_week: thisMonday,
      total_active_weeks: 1,
    });
    return;
  }

  const lastMondayStr = existing.last_active_week
    ? getMondayStr(new Date(String(existing.last_active_week)))
    : null;

  // Already counted this week — no change
  if (lastMondayStr === thisMonday) return;

  const prevMonday = shiftDays(thisMonday, -7);
  const newStreak = lastMondayStr === prevMonday
    ? (existing.current_streak ?? 0) + 1  // consecutive week
    : 1;                                    // gap — reset

  await et.streaks(db)
    .update({
      current_streak: newStreak,
      longest_streak: Math.max(newStreak, existing.longest_streak ?? 0),
      last_active_week: thisMonday,
      total_active_weeks: (existing.total_active_weeks ?? 0) + 1,
    })
    .eq('student_id', studentId);
}

// ── Badge checking ────────────────────────────────────────────────────────────
async function checkAndAwardBadges(
  db: ReturnType<typeof createEngagementAdminClient>,
  et: typeof engagementTables,
  studentId: string,
  eventKey: string,
  schoolId?: string,
) {
  const [{ data: earned }, { count: asnCount }, { count: projCount }, { data: streakData }] = await Promise.all([
    et.badges(db).select('badge_key').eq('student_id', studentId),
    et.xpLedger(db).select('id', { count: 'exact', head: true }).eq('student_id', studentId).eq('event_key', 'assignment_submitted'),
    et.xpLedger(db).select('id', { count: 'exact', head: true }).eq('student_id', studentId).eq('event_key', 'project_submitted'),
    et.streaks(db).select('current_streak, longest_streak').eq('student_id', studentId).single(),
  ]);

  const earnedSet  = new Set((earned ?? []).map((b: { badge_key: string }) => b.badge_key));
  const streak     = streakData?.current_streak  ?? 0;
  const longStreak = streakData?.longest_streak  ?? 0;

  const rules: { key: string; condition: boolean }[] = [
    { key: 'first_assignment', condition: (asnCount ?? 0) >= 1 },
    { key: 'consistent_10',    condition: (asnCount ?? 0) >= 10 },
    { key: 'project_master',   condition: (projCount ?? 0) >= 3 },
    { key: 'streak_hero',      condition: longStreak >= 6 },
  ];

  const toInsert = rules
    .filter(r => r.condition && !earnedSet.has(r.key))
    .map(r => {
      const badge = BADGES.find(b => b.key === r.key)!;
      return {
        student_id: studentId,
        badge_key:  badge.key,
        badge_label: badge.label,
        badge_icon: badge.icon,
        school_id: schoolId ?? null,
      };
    });

  if (toInsert.length > 0) {
    await et.badges(db).insert(toInsert);
  }

  return toInsert;
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function getMondayStr(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

function shiftDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
