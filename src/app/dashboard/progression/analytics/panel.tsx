"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import Link from "next/link";
import {
  ArrowPathIcon,
  ArrowLeftIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  FingerprintIcon,
  BookOpenIcon,
  BoltIcon,
} from "@/lib/icons";
import { toast } from "sonner";

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

function InsightBar({
  value,
  color = "bg-primary",
}: {
  value: number;
  color?: string;
}) {
  const pct = Math.min(100, Math.round(value));
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 h-3 bg-muted/50 rounded-full overflow-hidden border border-border/50 shadow-inner">
        <div
          className={`h-full ${color} rounded-full transition-all duration-[2000ms] ease-out shadow-[0_0_15px_rgba(var(--primary),0.3)]`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-black w-12 text-right uppercase tracking-widest">
        {pct}%
      </span>
    </div>
  );
}

export default function ProgressionAnalyticsPage({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const { profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const canView = ["admin", "teacher"].includes(profile?.role ?? "");
  const [year, setYear] = useState<number>(
    Math.min(Math.max(Number(searchParams.get("year_number") ?? 1), 1), 10)
  );
  const [term, setTerm] = useState<number>(
    Math.min(Math.max(Number(searchParams.get("term_number") ?? 1), 1), 3)
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<AnalyticsResponse | null>(null);

  function fetchData() {
    if (!canView) return;
    const params = new URLSearchParams();
    params.set("year_number", String(year));
    params.set("term_number", String(term));
    setLoading(true);
    fetch(`/api/progression/analytics?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => setData((j.data ?? null) as AnalyticsResponse | null))
      .catch(() => toast.error("Failed to load data"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchData();
  }, [canView, year, term]); // eslint-disable-line

  if (authLoading || loading)
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );

  if (!canView)
    return (
      <div className="p-20 text-center text-muted-foreground font-black uppercase tracking-widest italic opacity-50">
        Staff access required.
      </div>
    );

  const summary = data?.summary ?? {
    completion_pct: 0,
    average_practical_score: 0,
    average_retry_count: 0,
    total_records: 0,
  };
  const weakTopics = (data?.weak_topic_heatmap ?? []).slice(0, 5);
  const classBreakdown = data?.class_breakdown ?? [];

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-10 space-y-12 pb-32">
      {/* Header */}
      <div
        className={
          embedded
            ? "relative overflow-hidden bg-card border border-border rounded-xl p-4"
            : "relative overflow-hidden bg-card border border-border rounded-[4rem] p-10 sm:p-16 shadow-2xl"
        }
      >
        <div className="absolute top-0 right-0 w-[50rem] h-[50rem] bg-blue-500/10 rounded-full blur-[120px] -mr-64 -mt-64 pointer-events-none" />

        <Link
          href="/dashboard/learner-progress?view=insights"
          className={`${
            embedded ? "hidden" : "inline-flex"
          } items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-primary mb-10 transition-colors relative z-10`}
        >
          <ArrowLeftIcon className="w-4 h-4" /> Back to Learner Progress
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 relative z-10">
          <div className={embedded ? "hidden" : "space-y-6 max-w-3xl"}>
            <div className="flex items-center gap-4">
              <SparklesIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              <h1 className="text-4xl sm:text-6xl font-black tracking-tighter text-card-foreground leading-tight uppercase">
                Learning Insights
              </h1>
            </div>
            <p className="text-xl text-muted-foreground leading-relaxed italic max-w-2xl">
              See how students are performing — curriculum completion rates,
              practical scores, and topics where students are struggling.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex bg-muted/20 p-2 rounded-2xl border border-border shadow-inner backdrop-blur-xl">
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="bg-transparent text-[10px] font-black uppercase tracking-widest px-4 py-2 focus:outline-none appearance-none cursor-pointer hover:text-primary transition-colors"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((y) => (
                  <option key={y} value={y} className="bg-card text-foreground">
                    Level {y}
                  </option>
                ))}
              </select>
              <div className="w-px h-6 bg-border self-center mx-2" />
              <select
                value={term}
                onChange={(e) => setTerm(Number(e.target.value))}
                className="bg-transparent text-[10px] font-black uppercase tracking-widest px-4 py-2 focus:outline-none appearance-none cursor-pointer hover:text-primary transition-colors"
              >
                <option value={1} className="bg-card text-foreground">
                  First Term
                </option>
                <option value={2} className="bg-card text-foreground">
                  Second Term
                </option>
                <option value={3} className="bg-card text-foreground">
                  Third Term
                </option>
              </select>
            </div>
            <button
              type="button"
              onClick={fetchData}
              className="p-4 rounded-2xl border border-border bg-card shadow-2xl hover:border-primary/50 hover:text-primary transition-all active:scale-95 group"
            >
              <ArrowPathIcon className="w-5 h-5 group-hover:rotate-180 transition-transform duration-700" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div className="group bg-card border border-border rounded-[3rem] p-10 space-y-6 hover:border-emerald-500/20 transition-all duration-500 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <BookOpenIcon className="w-12 h-12" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground relative z-10">
            Completion Rate
          </p>
          <p
            className={`text-6xl font-black tracking-tighter transition-colors duration-500 ${
              summary.completion_pct < 50
                ? "text-rose-600 dark:text-rose-400 group-hover:text-rose-600 dark:group-hover:text-rose-400"
                : "text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400"
            }`}
          >
            {summary.completion_pct}%
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed italic">
            Percentage of curriculum weeks completed.
          </p>
        </div>

        <div className="group bg-card border border-border rounded-[3rem] p-10 space-y-6 hover:border-primary/20 transition-all duration-500 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <BoltIcon className="w-12 h-12" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground relative z-10">
            Avg. Practical Score
          </p>
          <p
            className={`text-6xl font-black tracking-tighter transition-colors duration-500 ${
              summary.average_practical_score < 60
                ? "text-amber-600 dark:text-amber-400 group-hover:text-amber-600 dark:group-hover:text-amber-400"
                : "text-primary group-hover:text-primary/80"
            }`}
          >
            {summary.average_practical_score}%
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed italic">
            Average score on practical exercises.
          </p>
        </div>

        <div className="group bg-card border border-border rounded-[3rem] p-10 space-y-6 hover:border-blue-500/20 transition-all duration-500 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <ArrowPathIcon className="w-12 h-12" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground relative z-10">
            Avg. Retry Rate
          </p>
          <p className="text-6xl font-black text-foreground tracking-tighter group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-500">
            {summary.average_retry_count}
            <span className="text-2xl ml-1">x</span>
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed italic">
            Average attempts before passing a challenge.
          </p>
        </div>

        <div className="group bg-card border border-border rounded-[3rem] p-10 space-y-6 hover:border-violet-500/20 transition-all duration-500 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <FingerprintIcon className="w-12 h-12" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground relative z-10">
            Activity Records
          </p>
          <p className="text-6xl font-black text-foreground tracking-tighter group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors duration-500">
            {summary.total_records}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed italic">
            Total activity records logged.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Topics Needing Attention */}
        <div className="bg-card border border-border rounded-[3.5rem] overflow-hidden flex flex-col shadow-2xl">
          <div className="p-10 sm:p-14 border-b border-border bg-muted/10">
            <div className="flex items-center gap-4">
              <ExclamationTriangleIcon className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              <h2 className="text-[11px] font-black text-foreground uppercase tracking-[0.3em] leading-none">
                Topics Needing Attention
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mt-4 italic">
              Topics where students are struggling the most.
            </p>
          </div>
          <div className="p-10 sm:p-14 space-y-12 flex-1">
            {weakTopics.length > 0 ? (
              weakTopics.map((row) => (
                <div key={row.topic} className="space-y-4 group">
                  <div className="flex items-center justify-between px-2">
                    <p className="text-lg font-black text-foreground group-hover:text-primary transition-colors truncate max-w-[300px] uppercase tracking-tight">
                      {row.topic}
                    </p>
                    <span
                      className={`text-[9px] font-black px-4 py-2 rounded-full border shadow-sm uppercase tracking-[0.2em] ${
                        row.weakness_index > 70
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                      }`}
                    >
                      {row.weakness_index > 70 ? "Needs Help" : "Monitor"}
                    </span>
                  </div>
                  <InsightBar
                    value={row.completion_pct}
                    color={
                      row.weakness_index > 70 ? "bg-rose-500" : "bg-amber-500"
                    }
                  />
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-20 space-y-6">
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <ChartBarIcon className="w-10 h-10 text-emerald-600/40 dark:text-emerald-400/40" />
                </div>
                <div className="space-y-1">
                  <p className="text-2xl font-black text-foreground tracking-tighter uppercase">
                    All topics on track
                  </p>
                  <p className="text-sm text-muted-foreground italic">
                    No problem areas detected right now.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Class Performance */}
        <div className="bg-card border border-border rounded-[3.5rem] overflow-hidden flex flex-col shadow-2xl">
          <div className="p-10 sm:p-14 border-b border-border bg-muted/10">
            <div className="flex items-center gap-4">
              <ChartBarIcon className="w-8 h-8 text-primary" />
              <h2 className="text-[11px] font-black text-foreground uppercase tracking-[0.3em] leading-none">
                Class Performance
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mt-4 italic">
              Completion rates across your classes.
            </p>
          </div>
          <div className="p-10 sm:p-14 space-y-12 flex-1">
            {classBreakdown.length > 0 ? (
              classBreakdown.map((row) => (
                <div key={row.class_name} className="space-y-4 group">
                  <div className="flex items-center justify-between px-2">
                    <p className="text-lg font-black text-foreground group-hover:text-primary transition-colors uppercase tracking-tight">
                      {row.class_name}
                    </p>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.3em] bg-muted/50 px-4 py-2 rounded-full border border-border">
                      {row.total_records} records
                    </p>
                  </div>
                  <InsightBar value={row.completion_pct} color="bg-primary" />
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-20 space-y-6">
                <div className="w-20 h-20 rounded-full bg-muted/50 border border-border flex items-center justify-center">
                  <FingerprintIcon className="w-10 h-10 text-muted-foreground/40" />
                </div>
                <div className="space-y-1">
                  <p className="text-2xl font-black text-foreground tracking-tighter uppercase">
                    No data yet
                  </p>
                  <p className="text-sm text-muted-foreground italic">
                    Add students and start teaching to see class performance
                    here.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
