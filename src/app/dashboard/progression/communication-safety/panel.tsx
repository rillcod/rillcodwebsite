"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import {
  ArrowLeftIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  DocumentTextIcon,
} from "@/lib/icons";

type SafetyData = {
  abuse_events_24h: number;
  open_reports: number;
  open_escalations: number;
  top_abuse_reasons_7d: Array<{ label: string; count: number }>;
};

export default function CommunicationSafetyPage({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const { profile, loading: authLoading } = useAuth();
  const canView = ["admin", "teacher", "school"].includes(profile?.role ?? "");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SafetyData | null>(null);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    fetch("/api/progression/communication-safety")
      .then((r) => r.json())
      .then((j) => setData((j.data ?? null) as SafetyData | null))
      .catch(() => toast.error("Failed to load security metrics"))
      .finally(() => setLoading(false));
  }, [canView]);

  if (authLoading || loading)
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );

  if (!canView)
    return (
      <div className="p-20 text-center text-muted-foreground font-bold tracking-widest">
        Access denied
      </div>
    );

  if (!data)
    return (
      <div className="p-20 text-center text-muted-foreground font-black tracking-widest italic opacity-50">
        No security data available.
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-10 space-y-12 mobile-page-root">
      {/* Security Header */}
      <div
        className={
          embedded
            ? "hidden"
            : "relative overflow-hidden bg-card border border-border rounded-3xl p-10 sm:p-16 shadow-2xl"
        }
      >
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-rose-500/10 rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none" />

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-xs font-black tracking-[0.2em] text-muted-foreground hover:text-primary mb-10 transition-colors relative z-10"
        >
          <ArrowLeftIcon className="w-4 h-4" /> Back to dashboard
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 relative z-10">
          <div className="space-y-6 max-w-2xl">
            <div className="flex items-center gap-4">
              <ShieldCheckIcon className="w-8 h-8 text-rose-600 dark:text-rose-400" />
              <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-card-foreground leading-tight">
                Safety Centre
              </h1>
            </div>
            <p className="text-xl text-muted-foreground leading-relaxed italic max-w-xl">
              A clear view of communication concerns, user reports and urgent
              cases that need human review.
            </p>
          </div>
          <Link
            href="/dashboard/learner-safety?view=cases"
            className="px-10 py-5 text-xs font-black tracking-[0.2em] rounded-[2rem] bg-rose-500 text-white shadow-[0_20px_50px_rgba(244,63,94,0.3)] hover:scale-[1.05] active:scale-[0.98] transition-all flex items-center gap-3 shrink-0"
          >
            Open safety cases
          </Link>
        </div>
      </div>

      {/* Real-time Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="group bg-card border border-border rounded-2xl p-10 space-y-6 hover:border-rose-500/20 transition-all duration-500 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <ShieldExclamationIcon className="w-12 h-12" />
          </div>
          <div className="flex items-center justify-between relative z-10">
            <p className="text-xs font-black tracking-[0.3em] text-muted-foreground">
              Harmful messages blocked (24h)
            </p>
            <div className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)] animate-pulse" />
          </div>
          <p className="text-6xl font-black text-foreground tracking-tighter group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors duration-500">
            {data.abuse_events_24h}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed italic">
            Messages stopped by the safety rules before reaching users.
          </p>
        </div>

        <div className="group bg-card border border-border rounded-2xl p-10 space-y-6 hover:border-blue-500/20 transition-all duration-500 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <DocumentTextIcon className="w-12 h-12" />
          </div>
          <p className="text-xs font-black tracking-[0.3em] text-muted-foreground relative z-10">
            Pending Reports
          </p>
          <p className="text-6xl font-black text-foreground tracking-tighter group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-500">
            {data.open_reports}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed italic">
            Active user-submitted reports awaiting moderator review.
          </p>
        </div>

        <div className="group bg-card border border-border rounded-2xl p-10 space-y-6 hover:border-orange-500/20 transition-all duration-500 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <ExclamationTriangleIcon className="w-12 h-12" />
          </div>
          <p className="text-xs font-black tracking-[0.3em] text-muted-foreground relative z-10">
            Urgent cases
          </p>
          <p
            className={`text-6xl font-black tracking-tighter transition-colors duration-500 ${
              data.open_escalations > 0
                ? "text-rose-600 dark:text-rose-400 group-hover:text-rose-600 dark:group-hover:text-rose-400"
                : "text-foreground"
            }`}
          >
            {data.open_escalations}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed italic">
            High-risk events flagged for immediate administrative attention.
          </p>
        </div>
      </div>

      {/* Risk Distribution Chart */}
      <div className="bg-card border border-border rounded-[3.5rem] overflow-hidden shadow-2xl">
        <div className="p-10 sm:p-14 border-b border-border bg-muted/10 flex items-center gap-6">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ChartBarIcon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-[11px] font-black text-foreground tracking-[0.3em] leading-none">
              Safety overview
            </h2>
            <p className="text-sm text-muted-foreground mt-2 italic">
              Primary reasons for automated blocks and user reports (Last 7
              Days).
            </p>
          </div>
        </div>
        <div className="p-10 sm:p-14 space-y-10">
          {data.top_abuse_reasons_7d.length === 0 ? (
            <div className="py-20 text-center space-y-4">
              <ShieldCheckIcon className="w-16 h-16 text-emerald-600/20 dark:text-emerald-400/20 mx-auto" />
              <div className="space-y-1">
                <p className="text-2xl font-black text-foreground tracking-tighter">
                  No unusual safety pattern detected
                </p>
                <p className="text-sm text-muted-foreground italic">
                  No significant risk patterns detected in the current window.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-10">
              {data.top_abuse_reasons_7d.map((item) => {
                const maxCount = Math.max(
                  ...data.top_abuse_reasons_7d.map((r) => r.count),
                  1
                );
                const pct = (item.count / maxCount) * 100;

                return (
                  <div key={item.label} className="group/item space-y-4">
                    <div className="flex items-center justify-between px-4">
                      <p className="text-lg font-black text-foreground tracking-tight group-hover/item:text-primary transition-colors">
                        {item.label}
                      </p>
                      <span className="text-xs font-black text-rose-600 dark:text-rose-400 bg-rose-400/10 px-6 py-2 rounded-full border border-rose-400/20 shadow-sm tracking-widest">
                        {item.count} Occurrences
                      </span>
                    </div>
                    <div className="h-4 bg-muted/50 rounded-2xl overflow-hidden shadow-inner border border-border/50">
                      <div
                        className="h-full bg-gradient-to-r from-rose-600 via-rose-500 to-orange-400 rounded-full transition-all duration-[2000ms] ease-out shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
