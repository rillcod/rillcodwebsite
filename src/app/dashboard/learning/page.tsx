// @refresh reset
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { withTimeout } from '@/lib/async-timeout';
import { academicWeekNumber } from '@/lib/academic/week-package';
import {
  loadLearnerClassWeek,
  nextLessonInClassOrder,
} from '@/lib/learning/lesson-plan-scope';
import ClassReplays from '@/components/live-session/ClassReplays';
import Link from 'next/link';
import {
  RocketLaunchIcon, BookOpenIcon, CheckBadgeIcon,
  ArrowRightIcon, PlayIcon, ClipboardDocumentListIcon,
} from '@/lib/icons';
import MyProgressPanel from '@/components/engagement/MyProgressPanel';

const GREETINGS = ['Welcome back', 'Ready to learn?', 'Let\'s continue', 'Great to see you'];
const KID_GREETINGS = ['Hey there!', 'Ready to learn?', 'Let\'s have fun!', 'Time to explore!'];

function getLearnerTier(gradeLevel?: string | null, enrollmentType?: string | null): 'kids' | 'secondary' | 'adult' {
  const g = (gradeLevel || enrollmentType || '').toLowerCase().trim();
  if (!g) return 'secondary';

  if (/\b(nursery|kg|kindergarten|pre-?school|basic\s*[1-6]|primary|grade\s*[1-6]|year\s*[1-6]|class\s*[1-6]|kid|p[1-6]\b)/i.test(g)) return 'kids';
  if (/\b(jss|ss\s*[1-3]|junior\s*sec|senior\s*sec|secondary|form\s*[1-6]|year\s*[7-9]|year\s*1[0-3])/i.test(g)) return 'secondary';
  if (/\b(adult|hnd|ond|nce|pgde|university|uni|tertiary|professional|degree|postgrad|masters|phd|ndp|diploma|college)/i.test(g)) return 'adult';

  if (g.includes('basic') || g.includes('primary') || g.includes('kid') || g.includes('grade')) return 'kids';
  if (g.includes('jss') || g.includes('ss') || g.includes('junior') || g.includes('senior')) return 'secondary';
  if (g.includes('adult') || g.includes('professional') || g.includes('university')) return 'adult';

  return 'secondary';
}

export default function StudentLearningPage() {
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const [lessons, setLessons] = useState<any[]>([]);
  const [stats, setStats] = useState({
    avgScore: 0,
    lessonsDone: 0,
    streak: 0,
    xp: 0,
    level: 1
  });
  const [loading, setLoading] = useState(true);
  const [nextLesson, setNextLesson] = useState<any>(null);
  const [thisWeekNumber, setThisWeekNumber] = useState<number | null>(null);
  const [thisWeekLessons, setThisWeekLessons] = useState<any[]>([]);
  const [completedLessonIds, setCompletedLessonIds] = useState<Set<string>>(new Set());
  const [pendingAssignments, setPendingAssignments] = useState(0);
  const [dueFlashcards, setDueFlashcards] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  const [greetingSeed] = useState(() => Math.random());
  const tier = getLearnerTier(profile?.grade_level, profile?.enrollment_type);
  const isKids = tier === 'kids';
  const isAdult = tier === 'adult';
  const greeting = isKids
    ? KID_GREETINGS[Math.floor(greetingSeed * KID_GREETINGS.length)]
    : GREETINGS[Math.floor(greetingSeed * GREETINGS.length)];

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const db = createClient();
    
    try {
      // 1. Fetch Summary Stats â€” grades/lessons/XP prefer live academic session
      const { resolveAssignmentTermId, filterByAssignmentSession, matchesAssignmentSession } = await import('@/lib/assignments/session');
      const { loadAcademicTermBounds } = await import('@/lib/cbt/session');
      const liveTermId = await resolveAssignmentTermId(db as any, {});
      const termBounds = await loadAcademicTermBounds(db as any, liveTermId);

      const [xpRes, streakRes, progressRes, subsRes] = await withTimeout(Promise.all([
        db.from('student_xp_summary').select('*').eq('student_id', profile.id).maybeSingle(),
        db.from('student_streaks').select('*').eq('student_id', profile.id).maybeSingle(),
        db.from('lesson_progress').select('id, completed_at').eq('portal_user_id', profile.id).eq('status', 'completed'),
        db.from('assignment_submissions').select('grade, assignments(max_points, term_id)').eq('portal_user_id', profile.id).not('grade', 'is', null)
      ]), [{ data: null }, { data: null }, { data: [] }, { data: [] }], 'learning summary stats');

      const scopedSubs = filterByAssignmentSession((subsRes.data ?? []) as any[], liveTermId);
      const avgScore = scopedSubs.length
        ? Math.round(scopedSubs.reduce((s: number, sub: any) => s + (sub.grade / (sub.assignments?.max_points || 100)) * 100, 0) / scopedSubs.length)
        : 0;

      const withinTerm = (iso: string | null | undefined) => {
        if (!termBounds?.start_date && !termBounds?.end_date) return true;
        if (!iso) return false;
        const t = Date.parse(iso);
        if (!Number.isFinite(t)) return false;
        if (termBounds.start_date) {
          const start = Date.parse(termBounds.start_date);
          if (Number.isFinite(start) && t < start) return false;
        }
        if (termBounds.end_date) {
          const end = Date.parse(termBounds.end_date) + (termBounds.end_date.includes('T') ? 0 : 24 * 60 * 60 * 1000 - 1);
          if (Number.isFinite(end) && t > end) return false;
        }
        return true;
      };
      const lessonsDoneThisTerm = ((progressRes.data ?? []) as any[]).filter((p) => withinTerm(p.completed_at)).length;

      setStats({
        avgScore,
        lessonsDone: lessonsDoneThisTerm,
        streak: (streakRes.data as any)?.current_streak || 0,
        xp: ((xpRes.data as any)?.this_term_xp ?? (xpRes.data as any)?.total_xp) || 0,
        level: (xpRes.data as any)?.level || 1
      });

      // 3. Fetch submitted assignments that are waiting for teacher feedback (live session).
      const { data: pendingRows } = await withTimeout(
        db
          .from('assignment_submissions')
          .select('id, assignments(term_id)')
          .eq('portal_user_id', profile.id)
          .eq('status', 'submitted'),
        { count: 0, data: [], error: null },
        'learning submitted assignments',
      );
      const pendingScoped = filterByAssignmentSession((pendingRows ?? []) as any[], liveTermId);
      setPendingAssignments(pendingScoped.length);

      // 3.5 Due flashcards in live-session decks only (skip held-for-approval decks)
      const { data: decks } = await withTimeout(
        db.from('flashcard_decks').select('id, term_id, is_public, lesson_plan_id'),
        { data: [], error: null },
        'learning flashcard decks',
      );
      const liveDeckIds = ((decks ?? []) as any[])
        .filter((d) => !(d.is_public === false && d.lesson_plan_id))
        .filter((d) => matchesAssignmentSession(d.term_id, liveTermId, true))
        .map((d) => d.id);
      let dueFlashcardsCount = 0;
      if (liveDeckIds.length > 0) {
        const { data: cards } = await withTimeout(
          db.from('flashcard_cards').select('id').in('deck_id', liveDeckIds),
          { data: [], error: null },
          'learning flashcard cards',
        );
        const cardIds = ((cards ?? []) as any[]).map((c) => c.id);
        if (cardIds.length > 0) {
          const { data: dueCards } = await withTimeout(
            db
              .from('flashcard_reviews')
              .select('card_id, next_review_at')
              .eq('student_id', profile.id)
              .in('card_id', cardIds),
            { data: [], error: null },
            'learning due flashcards',
          );
          const nowVal = new Date();
          dueFlashcardsCount = (dueCards ?? []).filter((r: any) => !r.next_review_at || new Date(r.next_review_at) <= nowVal).length;
        }
      }
      setDueFlashcards(dueFlashcardsCount);

      const { data: completedIds } = await withTimeout(
        db
          .from('lesson_progress')
          .select('lesson_id')
          .eq('portal_user_id', profile.id)
          .eq('status', 'completed'),
        { data: [], error: null },
        'learning completed lessons',
      );
      const doneSet = new Set<string>(
        ((completedIds ?? []) as any[])
          .map((c: any) => c.lesson_id)
          .filter((id: any): id is string => typeof id === 'string'),
      );
      setCompletedLessonIds(doneSet);

      const pack = await withTimeout(
        loadLearnerClassWeek(db, profile.class_id),
        { currentWeek: 1, week: null, thisWeekLessons: [], lessons: [] },
        'learning class week',
      );
      setLessons(pack.lessons);
      setThisWeekNumber(pack.week);
      setThisWeekLessons(pack.thisWeekLessons);
      setNextLesson(nextLessonInClassOrder(pack.thisWeekLessons, doneSet));

    } catch (err) {
      console.error('Error loading learning data:', err);
      setLoadError('Failed to load your dashboard data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!profile) {
      setLoading(false);
      return;
    }
    loadData();

    // Setup Realtime Sync for engagement summaries
    const db = createClient();
    const channel = db.channel(`student-engagement-${profile.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'student_xp_summary',
        filter: `student_id=eq.${profile.id}`
      }, (payload) => {
        if (payload.new) {
          setStats(prev => ({
            ...prev,
            xp: (payload.new as any).total_xp,
            level: (payload.new as any).level
          }));
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'student_streaks',
        filter: `student_id=eq.${profile.id}`
      }, (payload) => {
        if (payload.new) {
          setStats(prev => ({
            ...prev,
            streak: (payload.new as any).current_streak
          }));
        }
      })
      .subscribe();

    return () => {
      db.removeChannel(channel);
    };
  }, [profile?.id, authLoading, profileLoading, loadData]);

  const earlierWeeks = useMemo(() => {
    const groups: { week: number; lessons: any[] }[] = [];
    for (const lesson of lessons) {
      const week = academicWeekNumber(lesson);
      if (week == null || week === thisWeekNumber) continue;
      const last = groups[groups.length - 1];
      if (last && last.week === week) {
        last.lessons.push(lesson);
        continue;
      }
      groups.push({ week, lessons: [lesson] });
    }
    return groups;
  }, [lessons, thisWeekNumber]);

  if (authLoading || profileLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent animate-spin rounded-full" />
        <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest animate-pulse">Loading...</p>
      </div>
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
      <div className="text-center space-y-4">
        <p className="text-muted-foreground text-sm">Session expired. Please sign in again.</p>
        <a href="/login" className="inline-block px-6 py-3 bg-primary text-white text-sm font-bold hover:bg-primary transition-colors">Sign In</a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground mobile-page-root">

      {/* â”€â”€ Top bar: quick links â”€â”€ */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest shrink-0">Jump to:</span>
          {[
            { label: 'Assignments', href: '/dashboard/assignments', icon: 'ðŸ“‹' },
            { label: 'CBT Exams',   href: '/dashboard/cbt',         icon: 'ðŸŽ¯' },
            { label: 'Timetable',   href: '/dashboard/timetable',   icon: 'ðŸ“…' },
            { label: 'Grades',      href: '/dashboard/grades',      icon: 'ðŸ“Š' },
          ].map(({ label, href, icon }) => (
            <Link key={label} href={href}
              className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent hover:border-border rounded-full transition-all">
              {icon} {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* â”€â”€ Error banner â”€â”€ */}
        {loadError && (
          <div className="bg-destructive/10 border border-destructive/30 p-4 flex items-center justify-between gap-4">
            <p className="text-destructive text-sm font-bold">{loadError}</p>
            <button onClick={() => { setLoadError(null); loadData(); }}
              className="text-xs font-bold text-destructive border border-destructive/40 px-3 py-1.5 hover:bg-destructive/10 transition-colors shrink-0">
              Retry
            </button>
          </div>
        )}

        {/* â”€â”€ Hero: greeting + stats â”€â”€ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Greeting */}
          <div className="lg:col-span-2 bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-brand-red-accent/15 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <span className="inline-block px-3 py-1 bg-brand-red-accent text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-sm mb-3">
                {profile.grade_level || (isKids ? 'Primary School' : isAdult ? 'Professional' : 'Secondary School')}
              </span>
              <h1 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight mb-2">
                {greeting}, <span className="bg-gradient-to-r from-primary to-indigo-500 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">{profile?.full_name?.split(' ')[0]}</span>!
                {isKids && ' ðŸš€'}
              </h1>
              <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
                {thisWeekNumber
                  ? `This week is Week ${thisWeekNumber} â€” the same week your teacher opened for the class.`
                  : 'When your teacher shares this week, it will show up here.'}
              </p>

              {nextLesson && (
                <Link href={`/dashboard/lessons/${nextLesson.id}`}
                  className="inline-flex items-center gap-2 mt-5 px-5 py-3 bg-primary hover:bg-primary text-white text-xs font-black uppercase tracking-widest transition-all border-2 border-transparent hover:border-brand-red-600">
                  <RocketLaunchIcon className="w-4 h-4" />
                  Open: {nextLesson.title}
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
            <div className="bg-card border border-border p-5 flex items-center gap-4">
              <CheckBadgeIcon className="w-8 h-8 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <p className="text-2xl font-black tabular-nums text-foreground">{stats.lessonsDone}</p>
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">Lessons done</p>
              </div>
            </div>
            {pendingAssignments > 0 && (
              <Link href="/dashboard/assignments" className="bg-card border border-border p-5 flex items-center gap-4 hover:border-primary/40">
                <ClipboardDocumentListIcon className="w-8 h-8 text-primary shrink-0" />
                <div>
                  <p className="text-2xl font-black tabular-nums text-foreground">{pendingAssignments}</p>
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">Waiting on teacher</p>
                </div>
              </Link>
            )}
          </div>
        </div>

        <section className="bg-card border border-border p-6">
          <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">
            {thisWeekNumber ? `Week ${thisWeekNumber}` : 'This week'}
          </h2>
          {thisWeekLessons.length === 0 ? (
            <div className="text-center py-12">
              <BookOpenIcon className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-bold">
                Your teacher has not shared a week yet.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                This is the same week your class is on. When they open it, the lesson will be here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {thisWeekLessons.map((lesson) => {
                const isCompleted = completedLessonIds.has(lesson.id);
                const isNext = nextLesson?.id === lesson.id;
                return (
                  <Link
                    key={lesson.id}
                    href={`/dashboard/lessons/${lesson.id}`}
                    className={`flex items-start gap-3 p-4 border transition-all ${
                      isNext
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:bg-muted/30'
                    }`}
                  >
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      isCompleted
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : isNext
                        ? 'bg-primary text-white'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {isCompleted ? (
                        <CheckBadgeIcon className="h-5 w-5" />
                      ) : (
                        <PlayIcon className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      {isNext && (
                        <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-1">
                          This week
                        </p>
                      )}
                      <p className="text-sm font-black text-foreground leading-tight">
                        {lesson.title}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-border">
            <Link href="/dashboard/assignments" className="text-xs font-bold text-primary hover:underline">
              Assignments{pendingAssignments > 0 ? ` (${pendingAssignments})` : ''}
            </Link>
            <Link href="/dashboard/flashcards" className="text-xs font-bold text-primary hover:underline">
              Practice cards{dueFlashcards > 0 ? ` (${dueFlashcards} due)` : ''}
            </Link>
          </div>
        </section>

        <ClassReplays heading={isKids ? 'Class replays' : 'Class Replays'} />

        {earlierWeeks.length > 0 && (
          <details className="bg-card border border-border p-4">
            <summary className="cursor-pointer text-sm font-black text-foreground">
              Earlier weeks
            </summary>
            <div className="mt-4 space-y-5">
              {earlierWeeks.map((group) => (
                <div key={group.week}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                    Week {group.week}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.lessons.map((lesson) => (
                      <Link
                        key={lesson.id}
                        href={`/dashboard/lessons/${lesson.id}`}
                        className="flex items-center gap-2 p-3 border border-border text-sm font-bold hover:bg-muted/30"
                      >
                        {completedLessonIds.has(lesson.id) && (
                          <CheckBadgeIcon className="h-4 w-4 text-emerald-600 shrink-0" />
                        )}
                        <span className="truncate">{lesson.title}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        <MyProgressPanel />

      </div>
    </div>
  );
}
