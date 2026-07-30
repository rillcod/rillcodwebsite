'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  UserGroupIcon,
  ExclamationTriangleIcon,
  BoltIcon,
  TrophyIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
} from '@/lib/icons';
import { getWAECGrade, ACTIVITY_CAPS, getMotivationMessage } from '@/lib/grading';
import { engagementTables } from '@/types/engagement';
import { DonutChart, GaugeBar, CHART_COLORS } from '@/components/charts';
import { toast } from 'sonner';

interface StudentEngagementRow {
  student_id: string;
  full_name: string;
  school_name?: string;
  total_xp: number;
  level: number;
  this_term_xp: number;
  current_streak: number;
  longest_streak: number;
  total_assigned: number;
  total_submitted: number;
  on_time_count: number;
  submission_pct: number;
  term_number?: number;
  badge_count: number;
  grade_cap_code: string;
  risk_level: 'safe' | 'watch' | 'at_risk' | 'critical';
}

function riskLevel(submissionPct: number, streak: number): StudentEngagementRow['risk_level'] {
  if (submissionPct < 40 || streak === 0) return 'critical';
  if (submissionPct < 60) return 'at_risk';
  if (submissionPct < 80 || streak < 2) return 'watch';
  return 'safe';
}

const RISK_META = {
  safe: { label: 'Active', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/25' },
  watch: { label: 'Watch', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-500/25' },
  at_risk: { label: 'At risk', color: 'text-primary', bg: 'bg-primary/10 border-primary/25' },
  critical: { label: 'Critical', color: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-500/10 border-rose-500/25' },
};

function StudentRow({ s, onNudge }: { s: StudentEngagementRow; onNudge: (s: StudentEngagementRow) => void }) {
  const risk = RISK_META[s.risk_level];
  const grade = getWAECGrade(s.submission_pct >= 80 ? 75 : ACTIVITY_CAPS.find((c) => s.submission_pct >= c.minPct)?.maxScore ?? 48);
  const capCode = ACTIVITY_CAPS.find((c) => s.submission_pct >= c.minPct)
    ? getWAECGrade(ACTIVITY_CAPS.find((c) => s.submission_pct >= c.minPct)!.maxScore).code
    : 'D7';

  return (
    <div
      className={`rounded-2xl border bg-card p-4 space-y-3 transition-all ${
        s.risk_level === 'critical'
          ? 'border-rose-500/30'
          : s.risk_level === 'at_risk'
            ? 'border-primary/25'
            : 'border-border hover:border-primary/20'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-sm text-foreground truncate">{s.full_name}</p>
          {s.school_name && <p className="text-[11px] text-muted-foreground mt-0.5">{s.school_name}</p>}
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border shrink-0 ${risk.bg} ${risk.color}`}>
          {risk.label}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px] font-semibold">
          <span className="text-muted-foreground">Assignments submitted</span>
          <span className={s.submission_pct >= 80 ? 'text-emerald-600 dark:text-emerald-400' : s.submission_pct >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}>
            {Math.round(s.submission_pct)}% · {s.total_submitted}/{s.total_assigned}
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              s.submission_pct >= 80 ? 'bg-emerald-500' : s.submission_pct >= 60 ? 'bg-amber-500' : s.submission_pct >= 40 ? 'bg-primary' : 'bg-rose-500'
            }`}
            style={{ width: `${Math.min(100, s.submission_pct)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-muted/40 rounded-xl p-2">
          <div className={`text-sm font-black ${s.current_streak >= 3 ? 'text-primary' : 'text-foreground'}`}>{s.current_streak}</div>
          <div className="text-[10px] text-muted-foreground font-semibold">wk streak</div>
        </div>
        <div className="bg-muted/40 rounded-xl p-2">
          <div className="text-sm font-black text-amber-600 dark:text-amber-400">+{s.total_xp}</div>
          <div className="text-[10px] text-muted-foreground font-semibold">XP</div>
        </div>
        <div className="bg-muted/40 rounded-xl p-2">
          <div className={`text-sm font-black ${grade.color}`}>{capCode}</div>
          <div className="text-[10px] text-muted-foreground font-semibold">grade cap</div>
        </div>
      </div>

      {(s.risk_level === 'at_risk' || s.risk_level === 'critical') && (
        <button
          type="button"
          onClick={() => onNudge(s)}
          className="w-full py-2 rounded-xl text-xs font-bold border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
        >
          Send motivation nudge
        </button>
      )}
    </div>
  );
}

/** Staff student-risk tracker — lives in the Audit family. */
export default function StudentActivityTrackerPanel({ embedded = false }: { embedded?: boolean }) {
  const { profile } = useAuth();
  const [students, setStudents] = useState<StudentEngagementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | StudentEngagementRow['risk_level']>('all');
  const [nudgeStudent, setNudgeStudent] = useState<StudentEngagementRow | null>(null);
  const [nudgeMsg, setNudgeMsg] = useState('');
  const [sending, setSending] = useState(false);

  const isStaff = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');

  const loadData = useCallback(async () => {
    if (!isStaff) return;
    setLoading(true);
    const supabase = createClient();

    const live = (await import('@/lib/reports/academic-period')).liveAcademicSession();
    const liveTermNum = live.termLabel.includes('First') ? 1 : live.termLabel.includes('Second') ? 2 : 3;

    let usersQuery = supabase
      .from('portal_users')
      .select('id, full_name, school_name, school_id, role')
      .eq('role', 'student')
      .eq('is_deleted', false)
      .limit(300);

    if (profile?.role === 'school' && profile.school_id) {
      usersQuery = usersQuery.eq('school_id', profile.school_id);
    }

    const [usersRes, xpRes, streaksRes, asgnRes, badgesRes] = await Promise.all([
      usersQuery,
      engagementTables.xpSummary(supabase).select('student_id, total_xp, level, this_term_xp'),
      engagementTables.streaks(supabase).select('student_id, current_streak, longest_streak'),
      engagementTables.asgnEng(supabase).select('student_id, total_assigned, total_submitted, on_time_count, submission_pct, term_number, academic_year'),
      engagementTables.badges(supabase).select('student_id').then(({ data }: { data: any[] | null }) => {
        const counts: Record<string, number> = {};
        (data ?? []).forEach((b: any) => {
          counts[b.student_id] = (counts[b.student_id] ?? 0) + 1;
        });
        return counts;
      }),
    ]);

    const xpMap: Record<string, any> = {};
    const streakMap: Record<string, any> = {};
    const asgnMap: Record<string, any> = {};

    (xpRes.data ?? []).forEach((r: any) => {
      xpMap[r.student_id] = r;
    });
    (streaksRes.data ?? []).forEach((r: any) => {
      streakMap[r.student_id] = r;
    });
    (asgnRes.data ?? [])
      .sort((a: any, b: any) => {
        const aLiveYear = a.academic_year === live.periodLabel ? 1 : 0;
        const bLiveYear = b.academic_year === live.periodLabel ? 1 : 0;
        if (aLiveYear !== bLiveYear) return bLiveYear - aLiveYear;
        const aLiveTerm = a.term_number === liveTermNum ? 1 : 0;
        const bLiveTerm = b.term_number === liveTermNum ? 1 : 0;
        if (aLiveTerm !== bLiveTerm) return bLiveTerm - aLiveTerm;
        return (b.term_number ?? 0) - (a.term_number ?? 0);
      })
      .forEach((r: any) => {
        if (!asgnMap[r.student_id]) asgnMap[r.student_id] = r;
      });

    const rows: StudentEngagementRow[] = (usersRes.data ?? []).map((u: any) => {
      const xp = xpMap[u.id] ?? { total_xp: 0, level: 1, this_term_xp: 0 };
      const st = streakMap[u.id] ?? { current_streak: 0, longest_streak: 0 };
      const ag = asgnMap[u.id] ?? { total_assigned: 0, total_submitted: 0, on_time_count: 0, submission_pct: 0 };
      const subPct = Number(ag.submission_pct ?? 0);
      const cap = ACTIVITY_CAPS.find((c) => subPct >= c.minPct) ?? ACTIVITY_CAPS[ACTIVITY_CAPS.length - 1];

      return {
        student_id: u.id,
        full_name: u.full_name ?? 'Unknown',
        school_name: u.school_name ?? undefined,
        total_xp: xp.total_xp,
        level: xp.level,
        this_term_xp: xp.this_term_xp,
        current_streak: st.current_streak,
        longest_streak: st.longest_streak,
        total_assigned: ag.total_assigned,
        total_submitted: ag.total_submitted,
        on_time_count: ag.on_time_count,
        submission_pct: subPct,
        term_number: ag.term_number,
        badge_count: (badgesRes as Record<string, number>)[u.id] ?? 0,
        grade_cap_code: getWAECGrade(cap.maxScore).code,
        risk_level: riskLevel(subPct, st.current_streak),
      };
    });

    const riskOrder = { critical: 0, at_risk: 1, watch: 2, safe: 3 };
    rows.sort((a, b) => riskOrder[a.risk_level] - riskOrder[b.risk_level] || a.submission_pct - b.submission_pct);
    setStudents(rows);
    setLoading(false);
  }, [isStaff, profile?.role, profile?.school_id]);

  useEffect(() => {
    if (isStaff) loadData();
  }, [isStaff, loadData]);

  function handleNudge(s: StudentEngagementRow) {
    setNudgeStudent(s);
    setNudgeMsg(getMotivationMessage(0, s.submission_pct, s.current_streak));
  }

  async function sendNudge() {
    if (!nudgeStudent || !nudgeMsg.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: nudgeStudent.student_id,
          event_key: 'classwork_complete',
          metadata: { note: 'Teacher motivation nudge', message: nudgeMsg },
        }),
      });
      if (!res.ok) throw new Error('Nudge failed');
      toast.success(`Nudge sent to ${nudgeStudent.full_name}`);
      setNudgeStudent(null);
      setNudgeMsg('');
    } catch {
      toast.error('Could not send nudge');
    } finally {
      setSending(false);
    }
  }

  const filtered = students.filter((s) => {
    if (riskFilter !== 'all' && s.risk_level !== riskFilter) return false;
    if (
      search &&
      !s.full_name.toLowerCase().includes(search.toLowerCase()) &&
      !(s.school_name ?? '').toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const counts = {
    safe: students.filter((s) => s.risk_level === 'safe').length,
    watch: students.filter((s) => s.risk_level === 'watch').length,
    at_risk: students.filter((s) => s.risk_level === 'at_risk').length,
    critical: students.filter((s) => s.risk_level === 'critical').length,
  };

  if (!isStaff) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <ExclamationTriangleIcon className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-muted-foreground text-sm">Staff access only.</p>
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-6' : 'max-w-6xl mx-auto px-4 py-6 space-y-6'}>
      {!embedded && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BoltIcon className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">Audit family</span>
            </div>
            <h1 className="text-2xl font-black text-foreground">Student activity</h1>
            <p className="text-xs text-muted-foreground mt-1">Who is active, who needs a push — by submission %, streak, and XP</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadData}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowPathIcon className="w-3.5 h-3.5" /> Refresh
            </button>
            <Link
              href="/dashboard/showcase"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              <TrophyIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Showcase
            </Link>
          </div>
        </div>
      )}

      {embedded && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Learning engagement risk — submission rate, streaks, and XP. Separate from the security audit trail below.
          </p>
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="sm:col-span-2 bg-card border border-border rounded-2xl p-5 flex flex-col items-center justify-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Class breakdown</p>
          <DonutChart
            data={[
              { label: 'Active', value: counts.safe, color: CHART_COLORS.emerald },
              { label: 'Watch', value: counts.watch, color: CHART_COLORS.amber },
              { label: 'At Risk', value: counts.at_risk, color: CHART_COLORS.primary },
              { label: 'Critical', value: counts.critical, color: CHART_COLORS.rose },
            ]}
            centerLabel="Students"
            centerValue={students.length}
            height={180}
            innerRadius={52}
            outerRadius={80}
          />
        </div>

        <div className="sm:col-span-3 grid grid-cols-2 gap-3">
          {([
            { key: 'safe' as const, label: 'Active', count: counts.safe, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/20', barColor: CHART_COLORS.emerald },
            { key: 'watch' as const, label: 'Watch', count: counts.watch, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/5 border-amber-500/20', barColor: CHART_COLORS.amber },
            { key: 'at_risk' as const, label: 'At risk', count: counts.at_risk, color: 'text-primary', bg: 'bg-primary/5 border-primary/20', barColor: CHART_COLORS.primary },
            { key: 'critical' as const, label: 'Critical', count: counts.critical, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/5 border-rose-500/20', barColor: CHART_COLORS.rose },
          ]).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setRiskFilter(riskFilter === s.key ? 'all' : s.key)}
              className={`rounded-2xl border p-4 text-left transition-all space-y-2 ${s.bg} ${
                riskFilter === s.key ? 'ring-2 ring-offset-1 ring-offset-background ring-primary' : ''
              }`}
            >
              <p className={`text-3xl font-black leading-none ${s.color}`}>{s.count}</p>
              <p className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">{s.label}</p>
              <GaugeBar
                value={students.length > 0 ? Math.round((s.count / students.length) * 100) : 0}
                color={s.barColor}
                showValue={false}
                height={3}
              />
            </button>
          ))}
        </div>
      </div>

      {counts.critical > 0 && (
        <div className="rounded-2xl bg-rose-500/5 border border-rose-500/20 p-4 flex gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400">
              {counts.critical} student{counts.critical > 1 ? 's' : ''} urgently need intervention
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Under 40% assignment submission (or no streak). Nudge them and follow up with school or parents.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or school…"
            className="w-full rounded-xl bg-card border border-border text-foreground pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <p className="text-[11px] text-muted-foreground font-semibold">
          {filtered.length} of {students.length}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground rounded-2xl border border-dashed border-border">
          <UserGroupIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No students match this filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <StudentRow key={s.student_id} s={s} onNudge={handleNudge} />
          ))}
        </div>
      )}

      {nudgeStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && setNudgeStudent(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h2 className="font-black text-foreground">Send motivation nudge</h2>
            <p className="text-xs text-muted-foreground">
              To: <span className="text-foreground font-bold">{nudgeStudent.full_name}</span>
              {' '}· {Math.round(nudgeStudent.submission_pct)}% submission rate
            </p>
            <textarea
              value={nudgeMsg}
              onChange={(e) => setNudgeMsg(e.target.value)}
              rows={4}
              className="w-full rounded-xl bg-background border border-border text-foreground px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              placeholder="Write an encouraging message…"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setNudgeStudent(null)}
                className="flex-1 py-2.5 rounded-xl bg-background border border-border text-muted-foreground font-bold text-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={sendNudge}
                disabled={sending}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-40"
              >
                {sending ? 'Sending…' : 'Send nudge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
