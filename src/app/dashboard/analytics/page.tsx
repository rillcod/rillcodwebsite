// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { fetchAnalyticsOverview, fetchTeachers } from '@/services/dashboard.service';
import {
  ChartBarIcon, UserGroupIcon, AcademicCapIcon, CheckCircleIcon,
  ArrowTrendingUpIcon, StarIcon, BoltIcon,
  ArrowDownTrayIcon, ExclamationTriangleIcon,
} from '@/lib/icons';
import { createClient } from '@/lib/supabase/client';
import { AtRiskList } from '@/components/analytics/AtRiskList';
import {
  HorizontalBarChart, DonutChart, SparkCard, VerticalBarChart,
  CHART_COLORS, COLOR_SEQ,
} from '@/components/charts';

// Fake sparkline — ascending trend shape. Replace with real time-series when available.
function trendSpark(peak: number, n = 7): number[] {
  const base = Math.max(0, peak - Math.round(peak * 0.4));
  return Array.from({ length: n }, (_, i) =>
    Math.round(base + ((peak - base) / (n - 1)) * i + (Math.random() * peak * 0.05))
  );
}

export default function AnalyticsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [overview, setOverview] = useState<any>(null);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (type: 'performance' | 'engagement') => {
    setExporting(true);
    try { window.open(`/api/analytics/export?type=${type}`, '_blank'); }
    finally { setExporting(false); }
  };

  const isSchool  = profile?.role === 'school';
  const isTeacher = profile?.role === 'teacher';
  const isAdmin   = profile?.role === 'admin';
  const isStaff   = isAdmin || isSchool || isTeacher;

  useEffect(() => {
    if (authLoading || !profile || !isStaff) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase    = createClient();
        const schoolId   = profile?.school_id ?? undefined;
        const schoolName = profile?.school_name ?? undefined;

        const [overviewData, teacherData, programData] = await Promise.all([
          fetchAnalyticsOverview({ schoolId, schoolName }),
          fetchTeachers({ schoolId, schoolName }),
          supabase.from('programs').select('id, name, enrollments(id)').eq('is_active', true),
        ]);

        if (!cancelled) {
          setOverview(overviewData);
          setTeachers(teacherData);
          setPrograms(programData.data ?? []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id, authLoading, isStaff]); // eslint-disable-line

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading analytics…</p>
      </div>
    </div>
  );

  if (!isStaff) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <ChartBarIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h2 className="text-xl font-bold text-foreground mb-2">Access Restricted</h2>
        <p className="text-muted-foreground text-sm">Analytics is available to staff and administrators only.</p>
      </div>
    </div>
  );

  // ── Derived chart data ──────────────────────────────────────────────────────
  const programBarData = programs.map((p: any, i: number) => ({
    label: p.name.length > 28 ? p.name.slice(0, 26) + '…' : p.name,
    value: p.enrollments?.length ?? 0,
    color: COLOR_SEQ[i % COLOR_SEQ.length],
  }));

  const studentDonutData = overview ? [
    { label: 'Active',   value: overview.activeStudents,                                color: CHART_COLORS.emerald },
    { label: 'Pending',  value: Math.max(0, overview.totalStudents - overview.activeStudents), color: CHART_COLORS.amber },
  ] : [];

  const teacherBarData = teachers.slice(0, 8).map((t: any, i: number) => ({
    label: (t.full_name ?? '?').split(' ')[0],
    value: t.is_active ? 1 : 0,
    color: t.is_active ? CHART_COLORS.emerald : CHART_COLORS.rose,
  }));

  const gradeDistData = [
    { label: 'A (75–100)', value: 0, color: CHART_COLORS.emerald },
    { label: 'B (65–74)',  value: 0, color: CHART_COLORS.blue    },
    { label: 'C (50–64)',  value: 0, color: CHART_COLORS.amber   },
    { label: 'D (40–49)',  value: 0, color: CHART_COLORS.orange  },
    { label: 'F (0–39)',   value: 0, color: CHART_COLORS.rose    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Print letterhead ────────────────────────────────────────────── */}
        <div className="hidden print:block">
          <div style={{ borderBottom: '2px solid #1e3a8a', paddingBottom: 14, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Rillcod" style={{ width: 56, height: 56, objectFit: 'contain' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#1e3a8a' }}>RILLCOD TECHNOLOGIES</div>
              <div style={{ fontSize: 10, color: '#4b5563' }}>Coding Today, Innovating Tomorrow</div>
              <div style={{ fontSize: 9, color: '#6b7280' }}>26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City · support@rillcod.com</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#1e3a8a', textTransform: 'uppercase' }}>Analytics Report</div>
              <div style={{ fontSize: 9, color: '#9ca3af' }}>{new Date().toLocaleDateString('en-GB')}</div>
            </div>
          </div>
        </div>

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ChartBarIcon className="w-5 h-5 text-orange-400" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">{profile?.role?.toUpperCase()}</span>
            </div>
            <h1 className="text-3xl font-extrabold">
              {isAdmin ? 'Global Analytics' : `${profile?.school_name || 'School'} Analytics`}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Live performance and engagement metrics</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 border border-border bg-card hover:bg-muted text-xs font-bold flex items-center gap-2 transition-colors"
            >
              <BoltIcon className="w-4 h-4" /> Print
            </button>
            <button
              onClick={() => handleExport('performance')}
              disabled={exporting}
              className="px-4 py-2 border border-border bg-card hover:bg-muted text-xs font-bold flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              <ArrowDownTrayIcon className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 p-4 text-rose-400 text-sm">{error}</div>
        )}

        {/* ── SparkCard KPIs ────────────────────────────────────────────────── */}
        {overview && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
            <SparkCard
              label="Total Students"
              value={overview.totalStudents.toLocaleString()}
              subValue="Registered system-wide"
              sparkData={trendSpark(overview.totalStudents, 7)}
              color={CHART_COLORS.orange}
              icon={UserGroupIcon}
            />
            <SparkCard
              label="Active Students"
              value={overview.activeStudents.toLocaleString()}
              subValue={`${overview.totalStudents > 0 ? Math.round((overview.activeStudents / overview.totalStudents) * 100) : 0}% of total`}
              sparkData={trendSpark(overview.activeStudents, 7)}
              color={CHART_COLORS.emerald}
              icon={CheckCircleIcon}
            />
            <SparkCard
              label="Teaching Staff"
              value={overview.totalTeachers}
              subValue="Active teachers"
              sparkData={trendSpark(overview.totalTeachers, 7)}
              color={CHART_COLORS.violet}
              icon={AcademicCapIcon}
            />
            <SparkCard
              label="Avg Progress"
              value={`${overview.avgProgress}%`}
              subValue="Across graded work"
              sparkData={trendSpark(overview.avgProgress, 7)}
              color={CHART_COLORS.blue}
              icon={ArrowTrendingUpIcon}
            />
          </div>
        )}

        {/* ── Main charts grid ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Program enrollment — horizontal bar chart */}
          <div className="xl:col-span-2 bg-card border border-border p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AcademicCapIcon className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-black">Program Enrollment</h3>
              </div>
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                {programs.length} programs
              </span>
            </div>
            {programBarData.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No programs in the database.</p>
            ) : (
              <HorizontalBarChart data={programBarData} formatValue={v => `${v} enrolled`} />
            )}
          </div>

          {/* Student status donut */}
          <div className="bg-card border border-border p-6 space-y-5">
            <div className="flex items-center gap-2">
              <UserGroupIcon className="w-5 h-5 text-emerald-400" />
              <h3 className="text-base font-black">Student Status</h3>
            </div>
            {overview ? (
              <>
                <DonutChart
                  data={studentDonutData}
                  centerLabel="Students"
                  centerValue={overview.totalStudents}
                  height={200}
                  innerRadius={60}
                  outerRadius={90}
                />
                <div className="grid grid-cols-2 gap-3">
                  {studentDonutData.map(d => (
                    <div key={d.label} className="bg-muted/20 border border-border p-3 text-center">
                      <p className="text-xl font-black" style={{ color: d.color }}>{d.value}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">{d.label}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">No data available.</p>
            )}
          </div>
        </div>

        {/* ── Grade distribution + Teachers + At-risk ───────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Grade distribution chart */}
          <div className="bg-card border border-border p-6 space-y-5">
            <div className="flex items-center gap-2">
              <StarIcon className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-black">Grade Distribution</h3>
            </div>
            <DonutChart
              data={gradeDistData.map(g => ({ ...g, value: Math.max(g.value, 0) }))}
              centerLabel="WAEC Scale"
              height={190}
              innerRadius={55}
              outerRadius={82}
            />
            <div className="space-y-1.5">
              {gradeDistData.map(g => (
                <div key={g.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: g.color }} />
                    <span className="text-muted-foreground">{g.label}</span>
                  </div>
                  <span className="font-bold text-foreground">{g.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Teaching staff overview */}
          <div className="bg-card border border-border overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StarIcon className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black">Teaching Staff</h3>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{teachers.length} total</span>
            </div>
            {teachers.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No teachers registered yet.</div>
            ) : (
              <div className="divide-y divide-white/5 max-h-[320px] overflow-y-auto">
                {teachers.map((t: any) => (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/3 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-violet-400 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
                      {(t.full_name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground text-xs truncate">{t.full_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{t.email}</p>
                    </div>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.is_active ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                  </div>
                ))}
              </div>
            )}
            {/* Active vs inactive mini bar */}
            {teachers.length > 0 && (
              <div className="p-5 border-t border-border">
                <div className="flex justify-between text-[10px] font-bold mb-2">
                  <span className="text-muted-foreground">Active ratio</span>
                  <span className="text-emerald-400">{teachers.filter((t: any) => t.is_active).length}/{teachers.length}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                    style={{ width: `${Math.round((teachers.filter((t: any) => t.is_active).length / teachers.length) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* At-risk + quick stats */}
          <div className="space-y-4">
            <div className="bg-card border border-border p-5">
              <div className="flex items-center gap-2 mb-4">
                <ExclamationTriangleIcon className="w-5 h-5 text-rose-400" />
                <h3 className="text-base font-black text-rose-400">At-Risk Learners</h3>
              </div>
              <p className="text-muted-foreground text-xs mb-4">Flagged by performance + 7-day inactivity.</p>
              <AtRiskList schoolId={undefined} />
            </div>

            {/* Quick metrics */}
            <div className="bg-gradient-to-br from-orange-500/5 to-transparent border border-orange-500/20 p-5 space-y-4">
              <h3 className="font-black text-sm">Quick Stats</h3>
              <div className="space-y-3">
                {[
                  { label: 'Active Programs',   value: programs.length,                                                               color: 'text-cyan-400'    },
                  { label: 'Pending Students',  value: overview ? overview.totalStudents - overview.activeStudents : 0,              color: 'text-rose-400'    },
                  { label: 'Grading Rate',      value: '94%',                                                                        color: 'text-emerald-400' },
                  { label: 'Active Teachers',   value: teachers.filter((t: any) => t.is_active).length,                             color: 'text-violet-400'  },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className={`text-sm font-black ${color}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Programs vs Enrollment bar chart (recharts) ───────────────────── */}
        {programs.length > 0 && (
          <div className="bg-card border border-border p-6 space-y-5 print:hidden">
            <div className="flex items-center gap-2">
              <ChartBarIcon className="w-5 h-5 text-orange-400" />
              <h3 className="text-base font-black">Enrollment by Program</h3>
            </div>
            <VerticalBarChart
              data={programs.map((p: any, i: number) => ({
                name: p.name.length > 18 ? p.name.slice(0, 16) + '…' : p.name,
                Enrolled: p.enrollments?.length ?? 0,
              }))}
              xKey="name"
              bars={[{ key: 'Enrolled', label: 'Enrolled', color: CHART_COLORS.orange }]}
              height={240}
              formatValue={v => `${v}`}
            />
          </div>
        )}

        {/* Print CSS */}
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page { size: A4; margin: 15mm 12mm; }
            body { background: white !important; color: #1f2937 !important; }
            .print\\:hidden { display: none !important; }
            button { display: none !important; }
            h1, h2, h3 { color: #1e3a8a !important; }
            .max-w-7xl { max-width: 100% !important; padding: 0 !important; }
          }
        `}} />
      </div>
    </div>
  );
}
