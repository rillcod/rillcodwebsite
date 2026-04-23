'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { ArrowPathIcon, ChartBarIcon } from '@/lib/icons';
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

export default function ProgressionAnalyticsPage() {
  const { profile, loading: authLoading } = useAuth();
  const canView = ['admin', 'teacher'].includes(profile?.role ?? '');
  const [year, setYear] = useState<number>(1);
  const [term, setTerm] = useState<number>(1);
  const [track, setTrack] = useState<string>('');
  const [frequency, setFrequency] = useState<string>('');
  const [deliveryMode, setDeliveryMode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<AnalyticsResponse | null>(null);

  useEffect(() => {
    if (!canView) return;
    const params = new URLSearchParams();
    params.set('year_number', String(year));
    params.set('term_number', String(term));
    if (track) params.set('track', track);
    if (frequency) params.set('frequency', frequency);
    if (deliveryMode) params.set('delivery_mode', deliveryMode);
    setLoading(true);
    fetch(`/api/progression/analytics?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => setData((j.data ?? null) as AnalyticsResponse | null))
      .catch(() => toast.error('Failed to load progression analytics'))
      .finally(() => setLoading(false));
  }, [canView, year, term, track, frequency, deliveryMode]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!canView) return <div className="p-6 text-sm text-muted-foreground">Teacher/Admin access required.</div>;

  const summary = data?.summary ?? { completion_pct: 0, average_practical_score: 0, average_retry_count: 0, total_records: 0 };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-card-foreground flex items-center gap-2">
            <ChartBarIcon className="w-5 h-5 text-violet-400" />
            LMS Settings - Progression Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">School-level metrics, class and student drilldown, and weak-topic heatmap.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/progression/settings" className="px-3 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30">
            Settings Home
          </Link>
          <Link href="/dashboard/progression/policies" className="px-3 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30">
            Policy Controls
          </Link>
          <Link href="/dashboard/progression/project-registry" className="px-3 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30">
            Project Registry
          </Link>
          <Link href="/dashboard/progression/marker-integrity" className="px-3 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30">
            Marker Integrity
          </Link>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
        <input type="number" min={1} max={10} value={year} onChange={(e) => setYear(Math.min(Math.max(Number(e.target.value || 1), 1), 10))} className="px-3 py-2 bg-background border border-border rounded-xl text-xs" placeholder="Year" />
        <input type="number" min={1} max={3} value={term} onChange={(e) => setTerm(Math.min(Math.max(Number(e.target.value || 1), 1), 3))} className="px-3 py-2 bg-background border border-border rounded-xl text-xs" placeholder="Term" />
        <input value={track} onChange={(e) => setTrack(e.target.value)} className="px-3 py-2 bg-background border border-border rounded-xl text-xs" placeholder="Track (optional)" />
        <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="px-3 py-2 bg-background border border-border rounded-xl text-xs">
          <option value="">Freq any</option>
          <option value="1">1/week</option>
          <option value="2">2/week</option>
        </select>
        <select value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value)} className="px-3 py-2 bg-background border border-border rounded-xl text-xs">
          <option value="">Mode any</option>
          <option value="optional">Optional</option>
          <option value="compulsory">Compulsory</option>
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground">Completion %</p><p className="text-lg font-black">{summary.completion_pct}%</p></div>
        <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground">Avg Practical Score</p><p className="text-lg font-black">{summary.average_practical_score}</p></div>
        <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground">Avg Retries</p><p className="text-lg font-black">{summary.average_retry_count}</p></div>
        <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground">Total Records</p><p className="text-lg font-black">{summary.total_records}</p></div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4">
        <h2 className="text-sm font-black mb-2">Class Drilldown</h2>
        <div className="space-y-2">
          {(data?.class_breakdown ?? []).map((row) => (
            <div key={`${row.class_id ?? row.class_name}`} className="p-3 rounded-xl bg-background/50 border border-border text-xs flex flex-wrap items-center gap-3">
              <span className="font-bold">{row.class_name}</span>
              <span>Completion: {row.completion_pct}%</span>
              <span>Avg Score: {row.average_practical_score}</span>
              <span>Avg Retries: {row.average_retry_count}</span>
              <span>Records: {row.total_records}</span>
            </div>
          ))}
          {(data?.class_breakdown ?? []).length === 0 && <p className="text-xs text-muted-foreground">No class analytics available.</p>}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4">
        <h2 className="text-sm font-black mb-2">Student Drilldown (Lowest Scores)</h2>
        <div className="space-y-2">
          {(data?.student_breakdown ?? []).map((row) => (
            <div key={row.student_id} className="p-3 rounded-xl bg-background/50 border border-border text-xs flex flex-wrap items-center gap-3">
              <span className="font-mono">{row.student_id.slice(0, 8)}...</span>
              <span>Completion: {row.completion_pct}%</span>
              <span>Avg Score: {row.average_practical_score}</span>
              <span>Avg Retries: {row.average_retry_count}</span>
              <span>Records: {row.total_records}</span>
            </div>
          ))}
          {(data?.student_breakdown ?? []).length === 0 && <p className="text-xs text-muted-foreground">No student analytics available.</p>}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4">
        <h2 className="text-sm font-black mb-2">Weak Topic Heatmap</h2>
        <div className="space-y-2">
          {(data?.weak_topic_heatmap ?? []).map((row) => (
            <div key={row.topic} className="p-3 rounded-xl bg-background/50 border border-border text-xs flex flex-wrap items-center gap-3">
              <span className="font-bold">{row.topic}</span>
              <span>Weakness Index: {row.weakness_index}</span>
              <span>Completion: {row.completion_pct}%</span>
              <span>Avg Score: {row.average_practical_score}</span>
              <span>Avg Retries: {row.average_retry_count}</span>
            </div>
          ))}
          {(data?.weak_topic_heatmap ?? []).length === 0 && <p className="text-xs text-muted-foreground">No weak-topic data yet.</p>}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setLoading(true);
          const params = new URLSearchParams();
          params.set('year_number', String(year));
          params.set('term_number', String(term));
          if (track) params.set('track', track);
          if (frequency) params.set('frequency', frequency);
          if (deliveryMode) params.set('delivery_mode', deliveryMode);
          fetch(`/api/progression/analytics?${params.toString()}`)
            .then((r) => r.json())
            .then((j) => setData((j.data ?? null) as AnalyticsResponse | null))
            .finally(() => setLoading(false));
        }}
        className="inline-flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-lg"
      >
        <ArrowPathIcon className="w-4 h-4" /> Refresh Analytics
      </button>
    </div>
  );
}
