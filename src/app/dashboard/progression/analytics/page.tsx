'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { ArrowPathIcon, ArrowLeftIcon, ChartBarIcon, ExclamationTriangleIcon } from '@/lib/icons';
import { toast } from 'sonner';

type AnalyticsResponse = {
  summary: {
    completion_pct: number;
    average_practical_score: number;
    average_retry_count: number;
    total_records: number;
  };
  class_breakdown: Array<{
    class_id: string | null;
    class_name: string;
    completion_pct: number;
    average_practical_score: number;
    average_retry_count: number;
    total_records: number;
  }>;
  student_breakdown: Array<{
    student_id: string;
    completion_pct: number;
    average_practical_score: number;
    average_retry_count: number;
    total_records: number;
  }>;
  weak_topic_heatmap: Array<{
    topic: string;
    average_practical_score: number;
    average_retry_count: number;
    completion_pct: number;
    weakness_index: number;
    total_records: number;
  }>;
};

function ScoreBar({ value, max = 100, color = 'bg-violet-500' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-black w-8 text-right">{value}%</span>
    </div>
  );
}

export default function ProgressionAnalyticsPage() {
  const { profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const canView = ['admin', 'teacher'].includes(profile?.role ?? '');
  const [year, setYear] = useState<number>(Math.min(Math.max(Number(searchParams.get('year_number') ?? 1), 1), 10));
  const [term, setTerm] = useState<number>(Math.min(Math.max(Number(searchParams.get('term_number') ?? 1), 1), 3));
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<AnalyticsResponse | null>(null);

  function fetchData() {
    if (!canView) return;
    const params = new URLSearchParams();
    params.set('year_number', String(year));
    params.set('term_number', String(term));
    setLoading(true);
    fetch(`/api/progression/analytics?${params.toString()}`)
      .then(r => r.json())
      .then(j => setData((j.data ?? null) as AnalyticsResponse | null))
      .catch(() => toast.error('Failed to load analytics'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchData(); }, [canView, year, term]); // eslint-disable-line

  if (authLoading || loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!canView) return <div className="p-6 text-sm text-muted-foreground">Teacher or Admin access required.</div>;

  const summary = data?.summary ?? { completion_pct: 0, average_practical_score: 0, average_retry_count: 0, total_records: 0 };
  const weakTopics = (data?.weak_topic_heatmap ?? []).slice(0, 10);
  const classBreakdown = data?.class_breakdown ?? [];

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">

      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <Link href="/dashboard/progression/settings" className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeftIcon className="w-4 h-4" /> Back to LMS Settings
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              <ChartBarIcon className="w-5 h-5 text-violet-400" />
              How Are Students Doing?
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              A snapshot of completion rates, scores, and which topics students are struggling with most.
            </p>
          </div>
          <button type="button" onClick={fetchData} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-border rounded-xl hover:bg-muted/30 shrink-0">
            <ArrowPathIcon className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Year</label>
          <select
            title="Year"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="px-3 py-2 bg-background border border-border rounded-xl text-sm"
          >
            {[1,2,3,4,5,6,7,8,9,10].map(y => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Term</label>
          <select
            title="Term"
            value={term}
            onChange={e => setTerm(Number(e.target.value))}
            className="px-3 py-2 bg-background border border-border rounded-xl text-sm"
          >
            <option value={1}>Term 1</option>
            <option value={2}>Term 2</option>
            <option value={3}>Term 3</option>
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Lessons completed</p>
          <p className={`text-2xl font-black ${summary.completion_pct < 50 ? 'text-rose-400' : summary.completion_pct < 75 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {summary.completion_pct}%
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">of all lessons finished</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Average score</p>
          <p className={`text-2xl font-black ${summary.average_practical_score < 50 ? 'text-rose-400' : summary.average_practical_score < 70 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {summary.average_practical_score}%
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">across all practical tasks</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Average retries</p>
          <p className={`text-2xl font-black ${summary.average_retry_count > 3 ? 'text-rose-400' : summary.average_retry_count > 1 ? 'text-amber-400' : 'text-foreground'}`}>
            {summary.average_retry_count}×
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">attempts per task on average</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total records</p>
          <p className="text-2xl font-black">{summary.total_records}</p>
          <p className="text-[10px] text-muted-foreground mt-1">student activity records</p>
        </div>
      </div>

      {/* Struggling topics */}
      {weakTopics.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-amber-400" />
            <div>
              <p className="text-sm font-black">Topics students are struggling with</p>
              <p className="text-xs text-muted-foreground">These topics have the lowest scores and most retries. Consider revisiting them in class.</p>
            </div>
          </div>
          <div className="space-y-3">
            {weakTopics.map(row => (
              <div key={row.topic} className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-foreground truncate">{row.topic}</p>
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full ${row.weakness_index > 70 ? 'bg-rose-500/20 text-rose-400' : row.weakness_index > 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-muted text-muted-foreground'}`}>
                    {row.weakness_index > 70 ? 'High concern' : row.weakness_index > 40 ? 'Needs attention' : 'Mild'}
                  </span>
                </div>
                <ScoreBar value={row.completion_pct} color={row.completion_pct < 50 ? 'bg-rose-500' : 'bg-amber-500'} />
                <p className="text-[10px] text-muted-foreground">Avg score: {row.average_practical_score}% · Avg retries: {row.average_retry_count}×</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Class breakdown */}
      {classBreakdown.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-sm font-black">Class by class</p>
            <p className="text-xs text-muted-foreground mt-0.5">How each class is performing compared to the others.</p>
          </div>
          <div className="space-y-3">
            {classBreakdown.map(row => (
              <div key={`${row.class_id ?? row.class_name}`} className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">{row.class_name}</p>
                  <p className="text-xs text-muted-foreground">{row.total_records} records</p>
                </div>
                <ScoreBar value={row.completion_pct} color={row.completion_pct >= 75 ? 'bg-emerald-500' : row.completion_pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'} />
                <p className="text-[10px] text-muted-foreground">Avg score: {row.average_practical_score}% · Avg retries: {row.average_retry_count}×</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.total_records === 0 && (
        <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
          <ChartBarIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No data yet for Year {year}, Term {term}.</p>
          <p className="text-xs text-muted-foreground mt-1">Data appears here once students start completing lessons and assessments.</p>
        </div>
      )}
    </div>
  );
}
