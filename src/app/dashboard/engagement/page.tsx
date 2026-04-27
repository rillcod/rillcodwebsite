'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  UserGroupIcon, FireIcon, ExclamationTriangleIcon, CheckCircleIcon,
  BoltIcon, TrophyIcon, ChartBarIcon, MagnifyingGlassIcon,
  ArrowRightIcon, ArrowPathIcon, AcademicCapIcon,
} from '@/lib/icons';
import { getWAECGrade, ACTIVITY_CAPS, getMotivationMessage } from '@/lib/grading';
import { engagementTables } from '@/types/engagement';
import { DonutChart, GaugeBar, CHART_COLORS } from '@/components/charts';

// ── Types ─────────────────────────────────────────────────────────────────────
interface StudentEngagementRow {
  student_id: string;
  full_name: string;
  school_name?: string;
  class_name?: string;
  // XP
  total_xp: number;
  level: number;
  this_term_xp: number;
  // Streak
  current_streak: number;
  longest_streak: number;
  // Assignments
  total_assigned: number;
  total_submitted: number;
  on_time_count: number;
  submission_pct: number;
  term_number?: number;
  // Badges
  badge_count: number;
  // Derived
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
  safe:     { label: 'Active',    color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  watch:    { label: 'Watch',     color: 'text-amber-400',   bg: 'bg-amber-500/10   border-amber-500/20'   },
  at_risk:  { label: 'At Risk',   color: 'text-primary',  bg: 'bg-primary/10  border-primary/20'  },
  critical: { label: 'Critical',  color: 'text-rose-400',    bg: 'bg-rose-500/10    border-rose-500/20'    },
};

// ── Student Row ────────────────────────────────────────────────────────────────
function StudentRow({ s, onNudge }: { s: StudentEngagementRow; onNudge: (s: StudentEngagementRow) => void }) {
  const risk   = RISK_META[s.risk_level];
  const grade  = getWAECGrade(s.submission_pct >= 80 ? 75 : ACTIVITY_CAPS.find(c => s.submission_pct >= c.minPct)?.maxScore ?? 48);
  const capCode = ACTIVITY_CAPS.find(c => s.submission_pct >= c.minPct)
    ? getWAECGrade(ACTIVITY_CAPS.find(c => s.submission_pct >= c.minPct)!.maxScore).code
    : 'D7';

  return (
    <div className={`bg-card border p-4 space-y-3 transition-all ${
      s.risk_level === 'critical' ? 'border-rose-500/30' :
      s.risk_level === 'at_risk'  ? 'border-primary/20' :
      'border-border hover:border-primary/20'
    }`}>
      {/* Name + risk */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-black text-sm truncate">{s.full_name}</p>
          {s.school_name && <p className="text-[10px] text-muted-foreground">{s.school_name}</p>}
        </div>
        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 border shrink-0 ${risk.bg} ${risk.color}`}>
          {risk.label}
        </span>
      </div>

      {/* Submission progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] font-bold">
          <span className="text-muted-foreground">Assignment submission</span>
          <span className={s.submission_pct >= 80 ? 'text-emerald-400' : s.submission_pct >= 60 ? 'text-amber-400' : 'text-rose-400'}>
            {Math.round(s.submission_pct)}% ({s.total_submitted}/{s.total_assigned})
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              s.submission_pct >= 80 ? 'bg-emerald-500' :
              s.submission_pct >= 60 ? 'bg-amber-500' :
              s.submission_pct >= 40 ? 'bg-primary' : 'bg-rose-500'
            }`}
            style={{ width: `${Math.min(100, s.submission_pct)}%` }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-muted/30 p-2">
          <div className={`text-sm font-black ${s.current_streak >= 3 ? 'text-primary' : 'text-foreground'}`}>
            {s.current_streak}
          </div>
          <div className="text-[9px] text-muted-foreground font-bold">wk streak</div>
        </div>
        <div className="bg-muted/30 p-2">
          <div className="text-sm font-black text-amber-400">+{s.total_xp}</div>
          <div className="text-[9px] text-muted-foreground font-bold">XP total</div>
        </div>
        <div className="bg-muted/30 p-2">
          <div className={`text-sm font-black ${grade.color}`}>{capCode}</div>
          <div className="text-[9px] text-muted-foreground font-bold">grade cap</div>
        </div>
      </div>

      {/* Action */}
      {(s.risk_level === 'at_risk' || s.risk_level === 'critical') && (
        <button
          onClick={() => onNudge(s)}
          className="w-full py-1.5 text-xs font-bold border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors"
        >
          ⚠️ Send Motivation Nudge
        </button>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function EngagementPage() {
  const { profile } = useAuth();
  const [students, setStudents]   = useState<StudentEngagementRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | StudentEngagementRow['risk_level']>('all');
  const [nudgeStudent, setNudgeStudent] = useState<StudentEngagementRow | null>(null);
  const [nudgeMsg, setNudgeMsg]   = useState('');
  const [sending, setSending]     = useState(false);

  const isStaff = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');

  useEffect(() => { if (isStaff) loadData(); }, [isStaff]);

  async function loadData() {
    setLoading(true);
    const supabase = createClient();

    // Load students + their engagement data in parallel
    const [usersRes, xpRes, streaksRes, asgnRes, badgesRes] = await Promise.all([
      supabase.from('portal_users').select('id, full_name, school_name, role').eq('role', 'student').limit(200),
      engagementTables.xpSummary(supabase).select('student_id, total_xp, level, this_term_xp'),
      engagementTables.streaks(supabase).select('student_id, current_streak, longest_streak'),
      engagementTables.asgnEng(supabase).select('student_id, total_assigned, total_submitted, on_time_count, submission_pct, term_number'),
      engagementTables.badges(supabase).select('student_id').then(({ data }: { data: any[] | null }) => {
        // Count badges per student
        const counts: Record<string, number> = {};
        (data ?? []).forEach((b: any) => { counts[b.student_id] = (counts[b.student_id] ?? 0) + 1; });
        return counts;
      }),
    ]);

    const xpMap: Record<string, any>     = {};
    const streakMap: Record<string, any> = {};
    const asgnMap: Record<string, any>   = {};

    (xpRes.data ?? []).forEach((r: any) => { xpMap[r.student_id] = r; });
    (streaksRes.data ?? []).forEach((r: any) => { streakMap[r.student_id] = r; });
    // Latest term first
    (asgnRes.data ?? []).sort((a: any, b: any) => (b.term_number ?? 0) - (a.term_number ?? 0))
      .forEach((r: any) => { if (!asgnMap[r.student_id]) asgnMap[r.student_id] = r; });

    const rows: StudentEngagementRow[] = (usersRes.data ?? []).map((u: any) => {
      const xp = xpMap[u.id] ?? { total_xp: 0, level: 1, this_term_xp: 0 };
      const st = streakMap[u.id] ?? { current_streak: 0, longest_streak: 0 };
      const ag = asgnMap[u.id] ?? { total_assigned: 0, total_submitted: 0, on_time_count: 0, submission_pct: 0 };
      const subPct = Number(ag.submission_pct ?? 0);
      const capCode = (() => {
        const cap = ACTIVITY_CAPS.find(c => subPct >= c.minPct) ?? ACTIVITY_CAPS[ACTIVITY_CAPS.length - 1];
        return getWAECGrade(cap.maxScore).code;
      })();

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
        grade_cap_code: capCode,
        risk_level: riskLevel(subPct, st.current_streak),
      };
    });

    // Sort: critical first, then at_risk, then watch, then safe; within same risk, by submission_pct asc
    const riskOrder = { critical: 0, at_risk: 1, watch: 2, safe: 3 };
    rows.sort((a, b) => riskOrder[a.risk_level] - riskOrder[b.risk_level] || a.submission_pct - b.submission_pct);
    setStudents(rows);
    setLoading(false);
  }

  function handleNudge(s: StudentEngagementRow) {
    setNudgeStudent(s);
    setNudgeMsg(getMotivationMessage(0, s.submission_pct, s.current_streak));
  }

  async function sendNudge() {
    if (!nudgeStudent || !nudgeMsg.trim()) return;
    setSending(true);
    // Award a "teacher_praised" XP event (optional) + log a CRM interaction
    await fetch('/api/engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: nudgeStudent.student_id,
        event_key: 'classwork_complete',
        metadata: { note: 'Teacher motivation nudge', message: nudgeMsg },
      }),
    }).catch(() => {});
    setSending(false);
    setNudgeStudent(null);
    setNudgeMsg('');
  }

  const filtered = students.filter(s => {
    if (riskFilter !== 'all' && s.risk_level !== riskFilter) return false;
    if (search && !s.full_name.toLowerCase().includes(search.toLowerCase()) &&
        !(s.school_name ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = {
    safe:     students.filter(s => s.risk_level === 'safe').length,
    watch:    students.filter(s => s.risk_level === 'watch').length,
    at_risk:  students.filter(s => s.risk_level === 'at_risk').length,
    critical: students.filter(s => s.risk_level === 'critical').length,
  };

  if (!isStaff) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <ExclamationTriangleIcon className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Staff access only.</p>
        <Link href="/dashboard" className="mt-4 text-primary text-sm font-bold">← Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BoltIcon className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-red-600">Class Engagement</span>
          </div>
          <h1 className="text-2xl font-black">Student Activity Tracker</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Who's active, who needs a push — updated in real time
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowPathIcon className="w-3.5 h-3.5" /> Refresh
          </button>
          <Link href="/dashboard/showcase"
            className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
            <TrophyIcon className="w-3.5 h-3.5 text-amber-400" /> Showcase
          </Link>
        </div>
      </div>

      {/* Risk overview — donut + tap-to-filter cards */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        {/* Donut chart */}
        <div className="sm:col-span-2 bg-card border border-border p-5 flex flex-col items-center justify-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Class Breakdown</p>
          <DonutChart
            data={[
              { label: 'Active',   value: counts.safe,     color: CHART_COLORS.emerald },
              { label: 'Watch',    value: counts.watch,    color: CHART_COLORS.amber   },
              { label: 'At Risk',  value: counts.at_risk,  color: CHART_COLORS.primary  },
              { label: 'Critical', value: counts.critical, color: CHART_COLORS.rose    },
            ]}
            centerLabel="Students"
            centerValue={students.length}
            height={180}
            innerRadius={52}
            outerRadius={80}
          />
        </div>

        {/* Filter cards */}
        <div className="sm:col-span-3 grid grid-cols-2 gap-3">
          {([
            { key: 'safe',     label: 'Active',   count: counts.safe,     color: 'text-emerald-400', bg: 'bg-emerald-500/5  border-emerald-500/20', barColor: CHART_COLORS.emerald },
            { key: 'watch',    label: 'Watch',    count: counts.watch,    color: 'text-amber-400',   bg: 'bg-amber-500/5   border-amber-500/20',   barColor: CHART_COLORS.amber   },
            { key: 'at_risk',  label: 'At Risk',  count: counts.at_risk,  color: 'text-primary',  bg: 'bg-primary/5  border-primary/20',  barColor: CHART_COLORS.primary  },
            { key: 'critical', label: 'Critical', count: counts.critical, color: 'text-rose-400',    bg: 'bg-rose-500/5    border-rose-500/20',    barColor: CHART_COLORS.rose    },
          ] as const).map(s => (
            <button
              key={s.key}
              onClick={() => setRiskFilter(riskFilter === s.key ? 'all' : s.key)}
              className={`border p-4 text-left transition-all space-y-2 ${s.bg} ${
                riskFilter === s.key ? 'ring-2 ring-offset-1 ring-primary' : ''
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

      {/* At-risk alert bar */}
      {counts.critical > 0 && (
        <div className="bg-rose-500/5 border border-rose-500/20 p-4 flex gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-black text-rose-400">{counts.critical} student{counts.critical > 1 ? 's' : ''} urgently need intervention</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              These students submitted fewer than 40% of assignments and may not pass this term.
              Send motivation nudges and contact their school or parents today.
            </p>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or school…"
            className="w-full bg-card border border-border text-foreground pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-bold">
          {filtered.length} of {students.length} students
        </div>
      </div>

      {/* Student grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <UserGroupIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No students found matching your filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => (
            <StudentRow key={s.student_id} s={s} onNudge={handleNudge} />
          ))}
        </div>
      )}

      {/* Nudge modal */}
      {nudgeStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border w-full max-w-md p-6 space-y-4">
            <h2 className="font-black">Send Motivation Nudge</h2>
            <p className="text-xs text-muted-foreground">
              To: <span className="text-foreground font-bold">{nudgeStudent.full_name}</span>
              {' '}· {Math.round(nudgeStudent.submission_pct)}% submission rate
            </p>
            <textarea
              value={nudgeMsg}
              onChange={e => setNudgeMsg(e.target.value)}
              rows={4}
              className="w-full bg-background border border-border text-foreground px-3 py-2.5 text-sm focus:outline-none focus:border-primary resize-none"
              placeholder="Write an encouraging message…"
            />
            <div className="flex gap-3">
              <button onClick={() => setNudgeStudent(null)}
                className="flex-1 py-2.5 bg-background border border-border text-muted-foreground font-bold text-sm hover:bg-muted">
                Cancel
              </button>
              <button onClick={sendNudge} disabled={sending}
                className="flex-1 py-2.5 bg-primary hover:bg-primary disabled:opacity-40 text-white font-bold text-sm transition-colors">
                {sending ? 'Sending…' : 'Send Nudge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
