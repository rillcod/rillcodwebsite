'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { fetchAnalyticsOverview, fetchTeachers, fetchStudents } from '@/services/dashboard.service';
import {
  ChartBarIcon, UserGroupIcon, AcademicCapIcon, CheckCircleIcon,
  ArrowTrendingUpIcon, StarIcon, GlobeAltIcon, ClockIcon, BoltIcon,
  BuildingOfficeIcon, ArrowDownTrayIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
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

  useEffect(() => {
    if (authLoading || !profile) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const [overviewData, teacherData, programData] = await Promise.all([
          fetchAnalyticsOverview(),
          fetchTeachers(),
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
  }, [profile?.id, authLoading]); // eslint-disable-line

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Loading analytics…</p>
      </div>
    </div>
  );

  if (profile?.role !== 'admin') return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="text-center">
        <ChartBarIcon className="w-12 h-12 mx-auto mb-4 text-white/20" />
        <h2 className="text-xl font-bold text-white mb-2">Access Restricted</h2>
        <p className="text-white/40 text-sm">Analytics is only available to administrators.</p>
      </div>
    </div>
  );

  const maxEnrollment = Math.max(...programs.map((p: any) => p.enrollments?.length ?? 0), 1);

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ChartBarIcon className="w-5 h-5 text-violet-400" />
              <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Admin</span>
            </div>
            <h1 className="text-3xl font-extrabold">Analytics Dashboard</h1>
            <p className="text-white/40 text-sm mt-1">Live performance and engagement metrics</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleExport('performance')}
              disabled={exporting}
              className="px-4 py-2 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-xs font-bold flex items-center gap-2 disabled:opacity-50"
            >
              <ArrowDownTrayIcon className="w-4 h-4" /> Export performance
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">{error}</div>
        )}

        {/* KPI Cards */}
        {overview && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Students', value: overview.totalStudents.toLocaleString(), icon: UserGroupIcon, gradient: 'from-violet-600 to-violet-400', change: 'Live from DB' },
              { label: 'Active Students', value: overview.activeStudents.toLocaleString(), icon: CheckCircleIcon, gradient: 'from-emerald-600 to-emerald-400', change: 'Live from DB' },
              { label: 'Teachers', value: overview.totalTeachers, icon: AcademicCapIcon, gradient: 'from-blue-600 to-blue-400', change: 'Live from DB' },
              { label: 'Avg Progress', value: `${overview.avgProgress}%`, icon: ChartBarIcon, gradient: 'from-amber-600 to-amber-400', change: 'From graded work' },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/8 hover:border-white/20 transition-all">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center`}>
                    <kpi.icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xs font-medium text-white/30 flex items-center gap-1">
                    <ArrowTrendingUpIcon className="w-3.5 h-3.5 text-emerald-400" />{kpi.change}
                  </span>
                </div>
                <p className="text-2xl font-extrabold text-white">{kpi.value}</p>
                <p className="text-white/40 text-sm mt-1">{kpi.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Charts - Column Span 2 */}
          <div className="lg:col-span-2 space-y-8">
            {/* Program Enrollment */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <AcademicCapIcon className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-bold">Program Enrollment</h3>
              </div>
              {programs.length === 0 ? (
                <p className="text-white/30 text-sm">No programs found in the database.</p>
              ) : (
                <div className="space-y-4">
                  {programs.map((prog: any, i: number) => {
                    const count = prog.enrollments?.length ?? 0;
                    const pct = Math.round((count / maxEnrollment) * 100);
                    const colors = ['bg-violet-500', 'bg-blue-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];
                    return (
                      <div key={prog.id}>
                        <div className="flex justify-between text-sm mb-1.5">
                          <span className="text-white/60 truncate pr-4">{prog.name}</span>
                          <span className="text-white font-bold flex-shrink-0">{count} enrolled</span>
                        </div>
                        <div className="w-full h-7 bg-white/5 rounded-lg overflow-hidden">
                          <div
                            className={`h-full rounded-lg ${colors[i % colors.length]} flex items-center justify-end pr-3 transition-all duration-500`}
                            style={{ width: `${Math.max(pct, 8)}%` }}
                          >
                            {count > 0 && <span className="text-xs font-bold text-white">{count}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Teaching Staff */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-6 border-b border-white/10 flex items-center gap-2">
                <StarIcon className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold">Teaching Staff Overview</h3>
              </div>
              {teachers.length === 0 ? (
                <div className="p-6 text-center text-white/30 text-sm">No teachers registered yet.</div>
              ) : (
                <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
                  {teachers.map((t: any) => (
                    <div key={t.id} className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-sm font-black text-white flex-shrink-0">
                        {(t.full_name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm truncate">{t.full_name}</p>
                        <p className="text-xs text-white/40 truncate">{t.email}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${t.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/30'}`}>
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
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-6">
                <ExclamationTriangleIcon className="w-5 h-5 text-rose-400" />
                <h3 className="text-lg font-bold text-rose-400">At-Risk Learners</h3>
              </div>
              <p className="text-white/40 text-xs mb-4">Flagged based on performance and last login date (7+ days inactive).</p>
              <AtRiskList schoolId={undefined} />
            </div>

            {/* Quick Metrics */}
            <div className="bg-gradient-to-br from-violet-600/10 to-blue-600/10 border border-violet-500/20 rounded-2xl p-6">
              <h3 className="font-bold mb-4">Quick Stats</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white/40">Active Programs</span>
                  <span className="text-cyan-400 font-bold">{programs.length}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white/40">Pending Students</span>
                  <span className="text-rose-400 font-bold">{overview ? overview.totalStudents - overview.activeStudents : 0}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white/40">Grading Rate</span>
                  <span className="text-emerald-400 font-bold">94%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}