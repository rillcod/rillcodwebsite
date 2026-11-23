'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
  AcademicCapIcon,
  ArrowRightIcon,
  ArrowPathIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentListIcon,
  CogIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
} from '@/lib/icons';
import TeacherQuickMaterialsCard from '@/components/dashboard/TeacherQuickMaterialsCard';

interface DashStats { label: string; value: string | number; icon: any; gradient: string; href?: string }
interface Activity { id: string; title: string; desc: string; time: string; icon: any; color: string }
interface QuickAction { name: string; href: string; icon: any; desc: string }
interface Slot { id: string; start_time: string; subject: string; room: string | null; school_name?: string }

interface TeacherClassCard {
  id: string;
  name: string;
  current_students: number | null;
  max_students: number | null;
  qa_grade_key: string | null;
  school_name: string | null;
}

interface TeacherDashboardProps {
  profile: { full_name: string | null; email: string };
  stats: DashStats[];
  activities: Activity[];
  upcomingSlots: Slot[];
  teacherActionCenter: { ungradedAssignments: number; ungradedExams: number } | null;
  quickActions: QuickAction[];
  dataLoading: boolean;
  onRefresh: () => void;
}

function greetingForHour(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function TeacherDashboard({
  profile,
  stats,
  activities,
  upcomingSlots,
  teacherActionCenter,
  quickActions,
  dataLoading,
  onRefresh,
}: TeacherDashboardProps) {
  const { profile: authProfile } = useAuth();
  const [myClasses, setMyClasses] = useState<TeacherClassCard[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classSearch, setClassSearch] = useState('');

  const pending = (teacherActionCenter?.ungradedAssignments ?? 0) + (teacherActionCenter?.ungradedExams ?? 0);
  const firstName = (profile.full_name || 'Teacher').trim().split(/\s+/)[0];

  useEffect(() => {
    const teacherId = authProfile?.id;
    if (!teacherId) {
      setClassesLoading(false);
      return;
    }
    let cancelled = false;
    const db = createClient();
    (async () => {
      try {
        const { data } = await db
          .from('classes')
          .select('id, name, current_students, max_students, qa_grade_key, schools(name)')
          .eq('teacher_id', teacherId)
          .eq('status', 'active')
          .order('name', { ascending: true })
          .limit(30);
        if (cancelled) return;
        const list: TeacherClassCard[] = (data ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          current_students: c.current_students ?? 0,
          max_students: c.max_students ?? null,
          qa_grade_key: c.qa_grade_key ?? null,
          school_name: Array.isArray(c.schools) ? c.schools[0]?.name ?? null : c.schools?.name ?? null,
        }));
        setMyClasses(list);
      } catch {
        // Non-blocking on transient network errors
      } finally {
        if (!cancelled) setClassesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authProfile?.id]);

  const filteredClasses = useMemo(() => {
    const q = classSearch.trim().toLowerCase();
    if (!q) return myClasses;
    return myClasses.filter((c) =>
      `${c.name} ${c.school_name ?? ''} ${c.qa_grade_key ?? ''}`.toLowerCase().includes(q),
    );
  }, [myClasses, classSearch]);

  const todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 1. Executive Teacher Greeting & Daily Command Header */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/25 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary">
                Teacher Command
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">{todayLabel}</span>
              {pending > 0 ? (
                <Link
                  href="/dashboard/grades"
                  className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-[10px] font-black text-rose-700 dark:text-rose-300"
                >
                  {pending} awaiting marking
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  <CheckCircleIcon className="w-3 h-3" /> All marked
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground truncate">
              {greetingForHour()}, {firstName}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {myClasses.length > 0
                ? `${myClasses.length} active class${myClasses.length === 1 ? '' : 'es'} · ${upcomingSlots.length} class${upcomingSlots.length === 1 ? '' : 'es'} scheduled today`
                : 'Manage your classes, attendance, study materials, and student grading from one hub.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={dataLoading}
            className="inline-flex self-start sm:self-center items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-foreground bg-background hover:bg-muted border border-border rounded-xl transition-colors disabled:opacity-40 shrink-0"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 ${dataLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Mobile-First 4-Tile Quick Launch Bar */}
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Link
            href="/dashboard/classes"
            className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 py-3 hover:border-primary/50 hover:bg-muted/40 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <UserGroupIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-black text-foreground truncate">My Classes</span>
              <span className="block text-[10px] text-muted-foreground truncate">Rosters &amp; teaching</span>
            </div>
          </Link>

          <Link
            href="/dashboard/attendance"
            className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 py-3 hover:border-primary/50 hover:bg-muted/40 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <ClipboardDocumentCheckIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-black text-foreground truncate">Attendance</span>
              <span className="block text-[10px] text-muted-foreground truncate">Mark today&apos;s roll</span>
            </div>
          </Link>

          <Link
            href="/dashboard/cbt/new"
            className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 py-3 hover:border-primary/50 hover:bg-muted/40 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AcademicCapIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-black text-foreground truncate">New Exam</span>
              <span className="block text-[10px] text-muted-foreground truncate">Build CBT paper</span>
            </div>
          </Link>

          <Link
            href="/dashboard/grades"
            className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 py-3 hover:border-primary/50 hover:bg-muted/40 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-400 flex items-center justify-center shrink-0">
              <ClipboardDocumentListIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-black text-foreground truncate">
                Grade Queue {pending > 0 ? `(${pending})` : ''}
              </span>
              <span className="block text-[10px] text-muted-foreground truncate">Mark submissions</span>
            </div>
          </Link>
        </div>
      </div>

      {/* 2. Quick Retrieval — My Active Classes */}
      <section className="space-y-3" aria-label="My active classes quick access">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Quick Class Retrieval ({myClasses.length})
            </p>
          </div>
          <div className="flex items-center gap-2">
            {myClasses.length >= 4 && (
              <div className="relative flex-1 sm:w-56">
                <MagnifyingGlassIcon className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={classSearch}
                  onChange={(e) => setClassSearch(e.target.value)}
                  placeholder="Find a class…"
                  aria-label="Filter my classes"
                  className="w-full rounded-xl border border-border bg-card pl-8 pr-3 py-1.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
                />
              </div>
            )}
            <Link href="/dashboard/classes" className="text-xs font-bold text-primary hover:underline shrink-0">
              All Classes →
            </Link>
          </div>
        </div>

        {classesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-2xl border border-border bg-card animate-pulse" />
            ))}
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">
            {myClasses.length === 0
              ? 'No active classes assigned yet. Contact an admin or open Classes to view school schedules.'
              : `No classes match "${classSearch}".`}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredClasses.slice(0, 6).map((cls) => (
              <div
                key={cls.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm hover:border-primary/40 transition-colors flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/classes/${cls.id}`}
                      className="text-sm font-black text-foreground hover:text-primary transition-colors line-clamp-1"
                    >
                      {cls.name}
                    </Link>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {cls.school_name || 'Rillcod School'}
                      {cls.qa_grade_key ? ` · ${cls.qa_grade_key}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-foreground tabular-nums">
                    {cls.current_students ?? 0}{cls.max_students ? `/${cls.max_students}` : ''}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/60">
                  <Link
                    href={`/dashboard/classes/${cls.id}`}
                    className="rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition-colors"
                  >
                    Open
                  </Link>
                  <Link
                    href={`/dashboard/attendance?class_id=${cls.id}`}
                    className="rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-foreground hover:bg-muted transition-colors"
                  >
                    Attendance
                  </Link>
                  <Link
                    href={`/dashboard/reports/builder?class_id=${cls.id}`}
                    className="rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-foreground hover:bg-muted transition-colors"
                  >
                    Results
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Stats Strip */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        {dataLoading
          ? Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-4 sm:p-5 animate-pulse">
              <div className="h-7 bg-muted rounded w-1/2 mb-2" />
              <div className="h-3 bg-muted rounded w-2/3" />
            </div>
          ))
          : stats.map(({ label, value, icon: Icon, href }) => {
            const inner = (
              <>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  {href && <ArrowRightIcon className="h-3.5 w-3.5 text-muted-foreground opacity-60" />}
                </div>
                <p className="text-xl sm:text-3xl font-black text-foreground tracking-tight tabular-nums">{value}</p>
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-wider mt-1 truncate">{label}</p>
              </>
            );
            const cls = 'bg-card shadow-sm border border-border rounded-2xl p-3.5 sm:p-5 hover:border-primary/40 transition-colors block';
            return href ? <Link key={label} href={href} className={cls}>{inner}</Link> : <div key={label} className={cls}>{inner}</div>;
          })}
      </div>

      {/* 4. Structured Study Materials Publishing Console */}
      <TeacherQuickMaterialsCard />

      {/* 5. Main 2-Column Area: Grading + Activity (Left) | Today's Timetable + Profile (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          {/* Grading Center */}
          {teacherActionCenter !== null && (
            <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest">Grading Center</p>
                  <h2 className="text-base font-black text-foreground mt-0.5">
                    {pending > 0 ? `${pending} submission${pending === 1 ? '' : 's'} to mark` : 'All caught up on marking'}
                  </h2>
                </div>
                <Link href="/dashboard/grades" className="text-xs font-bold text-primary hover:underline shrink-0">
                  Open Gradebook →
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  href="/dashboard/grades"
                  className={`flex items-center justify-between gap-3 p-3.5 sm:p-4 border rounded-xl transition-colors ${
                    teacherActionCenter.ungradedAssignments > 0
                      ? 'bg-rose-500/5 border-rose-500/25 hover:border-rose-500/50'
                      : 'bg-background border-border hover:border-primary/40'
                  }`}
                >
                  <div>
                    <p className={`text-2xl font-black tabular-nums ${teacherActionCenter.ungradedAssignments > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {teacherActionCenter.ungradedAssignments}
                    </p>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mt-0.5">Assignments</p>
                  </div>
                  <ArrowRightIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                </Link>
                <Link
                  href="/dashboard/grades"
                  className={`flex items-center justify-between gap-3 p-3.5 sm:p-4 border rounded-xl transition-colors ${
                    teacherActionCenter.ungradedExams > 0
                      ? 'bg-amber-500/5 border-amber-500/25 hover:border-amber-500/50'
                      : 'bg-background border-border hover:border-primary/40'
                  }`}
                >
                  <div>
                    <p className={`text-2xl font-black tabular-nums ${teacherActionCenter.ungradedExams > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {teacherActionCenter.ungradedExams}
                    </p>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mt-0.5">CBT Exams</p>
                  </div>
                  <ArrowRightIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                </Link>
              </div>
            </div>
          )}

          {/* Extra Quick Actions (from parent props, e.g. Progress Reports / Students) */}
          {quickActions.length > 0 && (
            <div className="grid gap-2.5 sm:grid-cols-3">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center justify-between gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 hover:border-primary/40 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-foreground truncate">{action.name}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">{action.desc}</span>
                  </span>
                  <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}

          {/* Recent Activity */}
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-black text-foreground uppercase tracking-widest">Recent Activity</h2>
              <Link href="/dashboard/students" className="text-xs font-bold text-primary hover:underline">
                Find Students →
              </Link>
            </div>
            {dataLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 bg-muted/50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : activities.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-xl">
                No recent activity recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {activities.slice(0, 5).map((a) => (
                  <div key={a.id} className="flex items-center gap-3 py-2.5">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${a.color}`}>
                      <a.icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{a.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{a.desc}</p>
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">{a.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Today's Schedule + Teacher Profile Card */}
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-foreground text-xs uppercase tracking-widest flex items-center gap-1.5">
                <CalendarDaysIcon className="w-4 h-4 text-primary" />
                Today&apos;s Timetable
              </h3>
              <Link href="/dashboard/timetable" className="text-[11px] font-bold text-primary hover:underline">
                Full Week →
              </Link>
            </div>
            <div className="space-y-2">
              {upcomingSlots.length > 0 ? upcomingSlots.map((slot) => (
                <div key={slot.id} className="p-3 bg-background border border-border rounded-xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 bottom-0 w-1 bg-primary" />
                  <div className="flex justify-between items-start gap-2 pl-1">
                    <p className="text-xs font-bold text-foreground truncate">{slot.subject}</p>
                    <span className="text-[10px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                      {slot.start_time}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 truncate pl-1">
                    {slot.room || 'Classroom TBD'}
                    {slot.school_name ? ` · ${slot.school_name}` : ''}
                  </p>
                </div>
              )) : (
                <div className="text-center py-6 border border-dashed border-border rounded-xl">
                  <p className="text-xs text-muted-foreground font-semibold">No classes scheduled today</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-base font-black shrink-0">
                {(profile.full_name ?? 'T')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm text-foreground truncate">{profile.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
              </div>
            </div>
            <div className="pt-3 border-t border-border flex flex-wrap gap-2">
              <Link
                href="/dashboard/profile"
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors"
              >
                <AcademicCapIcon className="w-3.5 h-3.5 text-primary" /> Profile
              </Link>
              <Link
                href="/dashboard/settings"
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors"
              >
                <CogIcon className="w-3.5 h-3.5 text-primary" /> Settings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
