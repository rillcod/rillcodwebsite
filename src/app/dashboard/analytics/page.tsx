// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { fetchAnalyticsOverview, fetchTeachers, fetchStudents } from '@/services/dashboard.service';
import {
  ChartBarIcon, UserGroupIcon, AcademicCapIcon, CheckCircleIcon,
  ArrowTrendingUpIcon, StarIcon, GlobeAltIcon, ClockIcon, BoltIcon,
  BuildingOfficeIcon, ArrowDownTrayIcon, ExclamationTriangleIcon,
} from '@/lib/icons';
import { createClient } from '@/lib/supabase/client';
import { AtRiskList } from '@/components/analytics/AtRiskList';

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
    try {
      window.open(`/api/analytics/export?type=${type}`, '_blank');
    } finally {
      setExporting(false);
    }
  };

  const isSchool = profile?.role === 'school';
  const isTeacher = profile?.role === 'teacher';
  const isAdmin = profile?.role === 'admin';
  const isStaff = isAdmin || isSchool || isTeacher;

  useEffect(() => {
    if (authLoading || !profile || !isStaff) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const schoolId = profile?.school_id || undefined;
        const schoolName = profile?.school_name || undefined;

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
        <p className="text-muted-foreground text-sm">Analytics is only available to school staff and administrators.</p>
      </div>
    </div>
  );

  const maxEnrollment = Math.max(...programs.map((p: any) => p.enrollments?.length ?? 0), 1);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Branded letterhead (print-only) ── */}
        <div className="hidden print:block">
          {/* Top letterhead bar */}
          <div style={{ borderBottom: '2px solid #1e3a8a', paddingBottom: '14px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Rillcod Technologies" style={{ width: '56px', height: '56px', objectFit: 'contain', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#1e3a8a', letterSpacing: '-0.3px', lineHeight: 1.1 }}>RILLCOD TECHNOLOGIES</div>
              <div style={{ fontSize: '10px', color: '#4b5563', marginTop: '2px' }}>Coding Today, Innovating Tomorrow</div>
              <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '2px' }}>26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City &nbsp;·&nbsp; 08116600091 &nbsp;·&nbsp; support@rillcod.com</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '9px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.2px' }}>Official Document</div>
              <div style={{ fontSize: '14px', fontWeight: 900, color: '#1e3a8a', textTransform: 'uppercase' }}>Analytics Report</div>
              <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '4px' }}>
                Ref: {Date.now().toString(36).toUpperCase()} &nbsp;·&nbsp; {new Date().toLocaleDateString('en-GB')}
              </div>
            </div>
          </div>

          {/* Report title block */}
          <div style={{
            background: '#1e3a8a',
            borderRadius: '8px', padding: '12px 16px', marginBottom: '20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            color: '#fff'
          }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 900 }}>
                {isAdmin ? 'Global Performance Overview' : `${profile?.school_name || 'Institutional'} Analytics`}
              </div>
              <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>Comprehensive metrics for student engagement and academic progress</div>
            </div>
            <div style={{ textAlign: 'right', opacity: 0.9, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
              Generated by: {profile?.full_name || 'Staff Member'}
            </div>
          </div>

          {/* KPI Summary (Professional Alignment) */}
          {overview && (
            <table style={{ width: '100%', marginBottom: '24px', border: '1px solid #e5e7eb', borderRadius: '8px', borderCollapse: 'separate', borderSpacing: 0, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Metric', 'Current Value', 'Target / Status', 'Description'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '10px', color: '#4b5563', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ fontSize: '11px' }}>
                {[
                  { label: 'Total Students', value: overview.totalStudents.toLocaleString(), status: 'Active DB', desc: 'Total students registered across all categories' },
                  { label: 'Active Students', value: overview.activeStudents.toLocaleString(), status: 'Engagement OK', desc: 'Students with active portal accounts' },
                  { label: 'Teaching Staff', value: overview.totalTeachers, status: 'Staffed', desc: 'Registered teachers in the system' },
                  { label: 'Avg Academic Progress', value: `${overview.avgProgress}%`, status: 'On Track', desc: 'Average progress across all active courses' },
                ].map((row, i) => (
                  <tr key={row.label}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, borderBottom: i < 3 ? '1px solid #f3f4f6' : '0', borderRight: '1px solid #e5e7eb' }}>{row.label}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 900, color: '#1e3a8a', borderBottom: i < 3 ? '1px solid #f3f4f6' : '0', borderRight: '1px solid #e5e7eb' }}>{row.value}</td>
                    <td style={{ padding: '10px 12px', borderBottom: i < 3 ? '1px solid #f3f4f6' : '0', borderRight: '1px solid #e5e7eb' }}>{row.status}</td>
                    <td style={{ padding: '10px 12px', color: '#6b7280', borderBottom: i < 3 ? '1px solid #f3f4f6' : '0' }}>{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Quick Stats Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            <div style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
              <div style={{ fontSize: '9px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>Active Programs</div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#1e3a8a' }}>{programs.length}</div>
            </div>
            <div style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
              <div style={{ fontSize: '9px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>Pending Approvals</div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#dc2626' }}>{overview ? overview.totalStudents - overview.activeStudents : 0}</div>
            </div>
            <div style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
              <div style={{ fontSize: '9px', color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>System Grading Rate</div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#059669' }}>94%</div>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between print:hidden">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ChartBarIcon className="w-5 h-5 text-orange-400" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">{profile?.role?.toUpperCase()}</span>
            </div>
            <h1 className="text-3xl font-extrabold">{isAdmin ? 'Global Analytics' : `${profile?.school_name || 'School'} Analytics`}</h1>
            <p className="text-muted-foreground text-sm mt-1">Live performance and engagement metrics</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 border border-border rounded-none bg-card shadow-sm hover:bg-muted transition-all text-xs font-bold flex items-center gap-2"
            >
              <BoltIcon className="w-4 h-4" /> Print Analytics
            </button>
            <button
              onClick={() => handleExport('performance')}
              disabled={exporting}
              className="px-4 py-2 border border-border rounded-none bg-card shadow-sm hover:bg-muted transition-all text-xs font-bold flex items-center gap-2 disabled:opacity-50"
            >
              <ArrowDownTrayIcon className="w-4 h-4" /> Export performance
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-none p-4 text-rose-400 text-sm">{error}</div>
        )}

        {/* KPI Cards */}
        {overview && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:hidden" aria-hidden="true">
            {[
              { label: 'Total Students', value: overview.totalStudents.toLocaleString(), icon: UserGroupIcon, gradient: 'from-orange-600 to-orange-400', change: 'Live from DB' },
              { label: 'Active Students', value: overview.activeStudents.toLocaleString(), icon: CheckCircleIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400', change: 'Live from DB' },
              { label: 'Teachers', value: overview.totalTeachers, icon: AcademicCapIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400', change: 'Live from DB' },
              { label: 'Avg Progress', value: `${overview.avgProgress}%`, icon: ChartBarIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400', change: 'From graded work' },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-card shadow-sm border border-border rounded-none p-6 hover:bg-white/8 hover:border-border transition-all">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-10 h-10 rounded-none bg-gradient-to-br ${kpi.gradient} flex items-center justify-center`}>
                    <kpi.icon className="w-5 h-5 text-foreground" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <ArrowTrendingUpIcon className="w-3.5 h-3.5 text-emerald-400" />{kpi.change}
                  </span>
                </div>
                <p className="text-2xl font-extrabold text-foreground">{kpi.value}</p>
                <p className="text-muted-foreground text-sm mt-1">{kpi.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Charts - Column Span 2 */}
          <div className="lg:col-span-2 space-y-8">
            {/* Program Enrollment */}
            <div className="bg-card shadow-sm border border-border rounded-none p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <AcademicCapIcon className="w-5 h-5 text-blue-400" />
                  <h3 className="text-lg font-bold">Program Enrollment</h3>
                </div>
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-widest">{programs.length} programs</span>
              </div>
              {programs.length === 0 ? (
                <p className="text-muted-foreground text-sm">No programs found in the database.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {programs.map((prog: any, i: number) => {
                    const count = prog.enrollments?.length ?? 0;
                    const totalEnrolled = programs.reduce((s: number, p: any) => s + (p.enrollments?.length ?? 0), 0) || 1;
                    const pct = Math.round((count / totalEnrolled) * 100);
                    const palettes = [
                      { border: 'border-orange-500/40', bg: 'bg-orange-500/10', text: 'text-orange-400', bar: '#f97316' },
                      { border: 'border-blue-500/40', bg: 'bg-blue-500/10', text: 'text-blue-400', bar: '#3b82f6' },
                      { border: 'border-cyan-500/40', bg: 'bg-cyan-500/10', text: 'text-cyan-400', bar: '#06b6d4' },
                      { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-400', bar: '#10b981' },
                      { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-400', bar: '#f59e0b' },
                      { border: 'border-rose-500/40', bg: 'bg-rose-500/10', text: 'text-rose-400', bar: '#f43f5e' },
                      { border: 'border-violet-500/40', bg: 'bg-violet-500/10', text: 'text-violet-400', bar: '#8b5cf6' },
                    ];
                    const p = palettes[i % palettes.length];
                    return (
                      <div key={prog.id} className={`border ${p.border} ${p.bg} p-4 rounded-none flex flex-col gap-3 hover:opacity-90 transition-opacity`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-foreground leading-tight line-clamp-2">{prog.name}</p>
                          <span className={`text-2xl font-black ${p.text} flex-shrink-0 leading-none`}>{count}</span>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Enrolled</span>
                            <span>{pct}% of total</span>
                          </div>
                          <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${Math.max(pct, 4)}%`, background: p.bar }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Teaching Staff */}
            <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden">
              <div className="p-6 border-b border-border flex items-center gap-2">
                <StarIcon className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold">Teaching Staff Overview</h3>
              </div>
              {teachers.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No teachers registered yet.</div>
              ) : (
                <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
                  {teachers.map((t: any) => (
                    <div key={t.id} className="flex items-center gap-4 p-4 hover:bg-card shadow-sm transition-colors">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-600 from-orange-600 to-orange-400 flex items-center justify-center text-sm font-black text-foreground flex-shrink-0">
                        {(t.full_name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{t.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{t.email}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${t.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                        {t.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - Column Span 1 */}
          <div className="space-y-8">
            {/* At Risk Detection */}
            <div className="bg-card shadow-sm border border-border rounded-none p-6">
              <div className="flex items-center gap-2 mb-6">
                <ExclamationTriangleIcon className="w-5 h-5 text-rose-400" />
                <h3 className="text-lg font-bold text-rose-400">At-Risk Learners</h3>
              </div>
              <p className="text-muted-foreground text-xs mb-4">Flagged based on performance and last login date (7+ days inactive).</p>
              <AtRiskList schoolId={undefined} />
            </div>

            {/* Quick Metrics */}
            <div className="bg-gradient-to-br from-orange-600/10 from-orange-600 to-orange-400/10 border border-orange-500/20 rounded-none p-6">
              <h3 className="font-bold mb-4">Quick Stats</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Active Programs</span>
                  <span className="text-cyan-400 font-bold">{programs.length}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Pending Students</span>
                  <span className="text-rose-400 font-bold">{overview ? overview.totalStudents - overview.activeStudents : 0}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Grading Rate</span>
                  <span className="text-emerald-400 font-bold">94%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Global Print Styles */}
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page { size: A4; margin: 15mm 12mm; }
            body { background: white !important; color: #1f2937 !important; font-family: 'Segoe UI', Helvetica, Arial, sans-serif !important; }
            .bg-\\[\\#0f0f1a\\] { background: white !important; }
            .min-h-screen { min-height: unset !important; }
            .bg-white\\/5, .bg-white\\/8, .bg-white\\/10 { background: #fff !important; border-color: #f3f4f6 !important; }
            .bg-gradient-to-br { background: #fff !important; }
            .text-foreground { color: #111827 !important; }
            .text-foreground\\/60, .text-foreground\\/50, .text-foreground\\/40, .text-foreground\\/30 { color: #4b5563 !important; }
            .border-border\\/10, .border-border\\/20, .border-border\\/5 { border-color: #e5e7eb !important; border-width: 1px !important; }
            .divide-white\\/5 > * + * { border-color: #f3f4f6 !important; }
            .max-w-7xl { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
            .print\\:hidden { display: none !important; }
            button, .no-print { display: none !important; }
            input, select { display: none !important; }
            h1, h2, h3 { color: #1e3a8a !important; margin-bottom: 15px !important; }
            .grid.grid-cols-1.lg\\:grid-cols-3 { display: block !important; }
            .lg\\:col-span-2 { width: 100% !important; margin-bottom: 30px !important; }
            .space-y-8 > * + * { margin-top: 25px !important; }
            
            /* Clean up chart bars for print */
            .bg-orange-500, .bg-blue-500, .bg-cyan-500, .bg-emerald-500, .bg-amber-500, .bg-rose-500 {
              background-color: #1e3a8a !important; /* Solid brand color for all bars in print */
              opacity: 0.8;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
            .w-full.h-7.bg-white\\/5 {
              background-color: #f3f4f6 !important;
              border: 1px solid #e5e7eb !important;
            }

            /* Risk Indicators in Print */
            .bg-rose-500\\/20, .bg-rose-500\\/10 { background-color: #fef2f2 !important; border: 1px solid #fee2e2 !important; }
            .bg-emerald-500\\/20, .bg-emerald-500\\/10 { background-color: #ecfdf5 !important; border: 1px solid #d1fae5 !important; }
            .bg-amber-500\\/20, .bg-amber-500\\/10 { background-color: #fffbeb !important; border: 1px solid #fef3c7 !important; }
            .text-rose-400 { color: #dc2626 !important; font-weight: 700 !important; }
            .text-emerald-400 { color: #059669 !important; font-weight: 700 !important; }
            .text-amber-400 { color: #d97706 !important; font-weight: 700 !important; }
            .text-blue-400 { color: #1e3a8a !important; }
            .text-orange-400 { color: #1e3a8a !important; }
          }
        `}} />
      </div>
    </div>
  );
}
