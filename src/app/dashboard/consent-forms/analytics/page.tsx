'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  ChartBarIcon,
  ArrowTrendingUpIcon,
  UserGroupIcon,
  CheckCircleIcon,
  ArrowLeftIcon,
  FunnelIcon,
  ClockIcon,
} from '@/lib/icons';

// ── Types ────────────────────────────────────────────────────────────────────

interface AnalyticsSummary {
  total_leads: number;
  new: number;
  contacted: number;
  enrolled: number;
  lost: number;
  conversion_rate: number;
  crm_linked: number;
  pending_review: number;
}

interface ByProgramme {
  programme: string;
  count: number;
  enrolled: number;
}

interface BySource {
  source: string;
  count: number;
}

interface ByForm {
  form_id: string;
  title: string;
  total: number;
  enrolled: number;
  new: number;
}

interface DailySubmission {
  date: string;
  count: number;
}

interface FunnelStage {
  stage: string;
  count: number;
}

interface AnalyticsData {
  summary: AnalyticsSummary;
  by_programme: ByProgramme[];
  by_source: BySource[];
  by_form: ByForm[];
  daily_submissions: DailySubmission[];
  funnel: FunnelStage[];
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-border/40 rounded-lg ${className ?? ''}`} />
  );
}

function LoadingSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <Skeleton className="h-10 w-56" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-40" />
      <Skeleton className="h-56" />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

// ── Summary card ──────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  highlight?: boolean;
}

function StatCard({ label, value, sub, icon, highlight }: StatCardProps) {
  return (
    <div className={`bg-card border rounded-2xl p-4 flex flex-col gap-2 ${highlight ? 'border-amber-500/60' : 'border-border/50'}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
        <span className={`w-7 h-7 flex items-center justify-center rounded-lg ${highlight ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10' : 'text-muted-foreground bg-border/20'}`}>
          {icon}
        </span>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ConsentFormAnalyticsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/consent-forms/analytics');
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error((json as { error?: string }).error ?? `Error ${res.status}`);
        }
        const json = await res.json() as AnalyticsData;
        if (!cancelled) setData(json);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [authLoading, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading || loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-card border border-border/50 rounded-2xl p-6 text-center text-muted-foreground">
          <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-sm text-amber-600 dark:text-amber-400 hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.summary.total_leads === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Header />
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <ChartBarIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No form submissions yet.</p>
          <p className="text-sm text-muted-foreground mt-1">Analytics will appear once leads start coming in.</p>
        </div>
      </div>
    );
  }

  const { summary, by_programme, by_source, by_form, daily_submissions, funnel } = data;

  const maxDay = daily_submissions.length > 0
    ? Math.max(...daily_submissions.map(d => d.count))
    : 1;

  const maxProg = by_programme.length > 0
    ? Math.max(...by_programme.map(p => p.count))
    : 1;

  const topForms = by_form.slice(0, 5);

  // Funnel colours descending opacity
  const funnelOpacities = ['opacity-100', 'opacity-85', 'opacity-70', 'opacity-55', 'opacity-40'];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <Header />

      {/* ── Summary cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Responses"
          value={summary.total_leads}
          icon={<UserGroupIcon className="w-4 h-4" />}
        />
        <StatCard
          label="Enrolled"
          value={summary.enrolled}
          sub={`${summary.conversion_rate}% conversion`}
          icon={<CheckCircleIcon className="w-4 h-4" />}
          highlight
        />
        <StatCard
          label="Pending Review"
          value={summary.pending_review}
          icon={<ClockIcon className="w-4 h-4" />}
          highlight={summary.pending_review > 0}
        />
        <StatCard
          label="CRM Linked"
          value={summary.crm_linked}
          icon={<ArrowTrendingUpIcon className="w-4 h-4" />}
        />
      </div>

      {/* ── Funnel ─────────────────────────────────────────────────────────── */}
      <section className="bg-card border border-border/50 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FunnelIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <h2 className="font-semibold text-foreground">Conversion Funnel</h2>
        </div>
        <div className="space-y-2">
          {funnel.map((stage, i) => {
            const widthPct = pct(stage.count, summary.total_leads);
            return (
              <div key={stage.stage} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{stage.stage}</span>
                  <span className="font-medium text-foreground tabular-nums">
                    {stage.count}
                    <span className="text-muted-foreground text-xs ml-1">
                      ({pct(stage.count, summary.total_leads)}%)
                    </span>
                  </span>
                </div>
                <div className="h-2 bg-border/30 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-amber-500 rounded-full transition-all ${funnelOpacities[i] ?? 'opacity-40'}`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── By Programme ───────────────────────────────────────────────────── */}
      {by_programme.length > 0 && (
        <section className="bg-card border border-border/50 rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">By Programme</h2>
          <div className="space-y-3">
            {by_programme.map(p => (
              <div key={p.programme} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{p.programme}</span>
                  <span className="font-medium text-foreground tabular-nums">
                    {p.count}
                    <span className="text-muted-foreground text-xs ml-1">
                      ({p.enrolled} enrolled)
                    </span>
                  </span>
                </div>
                <div className="h-3 bg-border/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${pct(p.count, maxProg)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Top forms table ────────────────────────────────────────────────── */}
      {topForms.length > 0 && (
        <section className="bg-card border border-border/50 rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">Top Forms by Responses</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 text-muted-foreground font-medium">Form</th>
                  <th className="text-right py-2 text-muted-foreground font-medium w-16">Total</th>
                  <th className="text-right py-2 text-muted-foreground font-medium w-16">New</th>
                  <th className="text-right py-2 text-muted-foreground font-medium w-20">Enrolled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {topForms.map(f => (
                  <tr key={f.form_id} className="hover:bg-border/10 transition-colors">
                    <td className="py-2 pr-4 text-foreground truncate max-w-[200px]">{f.title}</td>
                    <td className="py-2 text-right tabular-nums font-medium text-foreground">{f.total}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{f.new}</td>
                    <td className="py-2 text-right tabular-nums">
                      <span className={f.enrolled > 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'}>
                        {f.enrolled}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Daily submissions sparkline ────────────────────────────────────── */}
      {daily_submissions.length > 0 && (
        <section className="bg-card border border-border/50 rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">Daily Submissions (last 30 days)</h2>
          <div className="flex items-end gap-[3px] h-20 w-full">
            {daily_submissions.map(d => {
              const heightPct = Math.max(4, pct(d.count, maxDay));
              return (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.count} submission${d.count !== 1 ? 's' : ''}`}
                  className="flex-1 bg-amber-500 rounded-sm min-w-[4px] cursor-default"
                  style={{ height: `${heightPct}%` }}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            {daily_submissions.length > 0 && (
              <>
                <span>{daily_submissions[0]?.date}</span>
                <span>{daily_submissions[daily_submissions.length - 1]?.date}</span>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── By source ──────────────────────────────────────────────────────── */}
      {by_source.length > 0 && (
        <section className="bg-card border border-border/50 rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold text-foreground">By Source</h2>
          <div className="space-y-2">
            {by_source.map((s, i) => (
              <div key={s.source} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4 text-right tabular-nums">{i + 1}.</span>
                  <span className="text-sm text-foreground">{s.source}</span>
                </div>
                <span className="text-xs font-medium bg-border/30 text-muted-foreground rounded-full px-2 py-0.5 tabular-nums">
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="space-y-1">
      <Link
        href="/dashboard/consent-forms"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Back to Forms
      </Link>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
          <ChartBarIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Form Analytics</h1>
          <p className="text-sm text-muted-foreground">Consent form conversion &amp; lead pipeline</p>
        </div>
      </div>
    </div>
  );
}
