"use client";

import Link from "next/link";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  ClockIcon,
} from "@/lib/icons";
import { findStage, type LaneId } from "@/lib/academic/lanes";
import type { StageStatus, StageState } from "@/lib/academic/status";

const STATE_STYLE: Record<
  StageState,
  { ring: string; chip: string; label: string }
> = {
  done: {
    ring: "border-emerald-500/25 bg-emerald-500/5",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    label: "Done",
  },
  ready: {
    ring: "border-primary/30 bg-primary/5",
    chip: "bg-primary/10 text-primary",
    label: "Ready",
  },
  blocked: {
    ring: "border-amber-500/30 bg-amber-500/5",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    label: "Blocked",
  },
  waiting: {
    ring: "border-border bg-card",
    chip: "bg-muted text-muted-foreground",
    label: "Waiting",
  },
};

function StateIcon({ state }: { state: StageState }) {
  if (state === "done")
    return <CheckCircleIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />;
  if (state === "blocked")
    return <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />;
  if (state === "ready")
    return <ArrowRightIcon className="h-5 w-5 text-primary" />;
  return <ClockIcon className="h-5 w-5 text-muted-foreground opacity-60" />;
}

/**
 * Renders one lane's stages with their real state. Stage identity and order
 * come from the kernel; only state comes from the caller.
 */
export function StageList({
  statuses,
  lane,
}: {
  statuses: StageStatus[];
  lane?: LaneId;
}) {
  return (
    <ol className="space-y-2" role="list">
      {statuses.map((status, index) => {
        const meta = findStage(status.id);
        const stepNumber = meta?.step ?? index + 1;
        const stageLabel = meta?.label ?? status.id.replaceAll("_", " ");
        const style = STATE_STYLE[status.state];
        return (
          <li
            key={status.id}
            className={`rounded-2xl border p-4 transition-colors ${style.ring}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                <StateIcon state={status.state} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Step {stepNumber}
                  </span>
                  <h3 className="text-sm font-black text-foreground">
                    {stageLabel}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${style.chip}`}
                  >
                    {style.label}
                  </span>
                </div>
                <p className="mt-1 text-sm font-bold text-foreground">
                  {status.headline}
                </p>
                {status.detail && (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {status.detail}
                  </p>
                )}
              </div>
              {status.actionHref && status.actionLabel && (
                <Link
                  href={status.actionHref}
                  className="shrink-0 self-center rounded-xl border border-border bg-card px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary transition-colors hover:bg-muted"
                >
                  {status.actionLabel}
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The one honest next move. Shown above everything else so staff never have
 * to work out which of several equal-looking doors is the real one.
 */
export function NextActionCard({
  next,
  fallback = "Everything here is up to date.",
}: {
  next: StageStatus | null;
  fallback?: string;
}) {
  if (!next) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
        <CheckCircleIcon className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm font-bold text-foreground">{fallback}</p>
      </div>
    );
  }
  const blocked = next.state === "blocked";
  return (
    <div
      className={`rounded-3xl border p-5 sm:p-6 ${
        blocked
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-primary/25 bg-gradient-to-br from-primary/10 to-transparent"
      }`}
    >
      <p
        className={`text-xs font-black uppercase tracking-widest ${
          blocked ? "text-amber-600 dark:text-amber-400" : "text-primary"
        }`}
      >
        {blocked ? "Needs attention" : "Next step"}
      </p>
      <h2 className="mt-2 text-xl font-black text-foreground sm:text-2xl">
        {next.headline}
      </h2>
      {next.detail && (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {next.detail}
        </p>
      )}
      {next.actionHref && next.actionLabel && (
        <Link
          href={next.actionHref}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground transition-opacity hover:opacity-90"
        >
          {next.actionLabel}
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
