"use client";

/**
 * "This week" — the one place a teacher needs for the current teaching week: generate it, review
 * what came out, and see how the class is doing on it. The point is that nobody has to change tab
 * to answer "is this week ready?" and "did it land?".
 *
 * Generation never publishes. It prepares draft content the teacher still reviews.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { currentTermWeek } from "@/lib/academic/delivery-calendar";
import { requestTrackedWeekGeneration } from "@/lib/academic/week-generation-client";
import { teachingMeetingLabel } from "@/lib/academic/session-identity";
import { weekReadyReviewPath } from "@/lib/academic/pending-approval";

type Props = {
  planId: string;
  termStart: string | null;
  /** Server is still the authority — this only decides whether to show the button at all. */
  canGenerate: boolean;
  sessionsPerWeek?: number | null;
};

type Summary = {
  total_records: number;
  average_practical_score: number;
  average_completion_seconds: number;
  average_retry_count: number;
  completion_rate: number;
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-black uppercase tracking-widest text-card-foreground/40">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-card-foreground truncate">{value}</p>
    </div>
  );
}

export default function ThisWeekPanel({
  planId,
  termStart,
  canGenerate,
  sessionsPerWeek,
}: Props) {
  const [week, setWeek] = useState(1);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; href?: string } | null>(null);
  const meetings = Number(sessionsPerWeek) === 2 ? 2 : 1;
  const meeting = teachingMeetingLabel(week, 1, meetings);

  // Derived on the client only, so the server render cannot disagree about "today".
  useEffect(() => setWeek(currentTermWeek(termStart)), [termStart]);

  const loadProgress = useCallback(async () => {
    if (!planId || week < 1) return;
    try {
      const res = await fetch(`/api/lesson-plans/${planId}/performance?week=${week}`, {
        cache: "no-store",
      });
      if (!res.ok) return; // progress is a bonus panel; never block the page on it
      const body = await res.json();
      setSummary(body?.summary ?? null);
    } catch {
      /* leave the last known figures rather than flashing an error */
    }
  }, [planId, week]);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  async function generateThisWeek() {
    setBusy(true);
    setMessage(null);
    try {
      const body = await requestTrackedWeekGeneration({ planId, week, session: 1 });
      if (!body.success) {
        setMessage({
          tone: "error",
          text: body?.error || "Could not prepare this week. Please try again.",
        });
        return;
      }
      const reviewHref = weekReadyReviewPath({
        planId,
        week,
        session: 1,
        autoPublish: body.auto_publish === true,
      });
      if (body.alreadyRunning) {
        setMessage({
          tone: "ok",
          text: `${meeting} is still being prepared safely. Saved items will appear as they finish; no second AI run was started.`,
          href: reviewHref,
        });
        await loadProgress();
        return;
      }
      const made = Number(body?.generated ?? 0);
      const skipped = Number(body?.skipped ?? 0);
      setMessage({
        tone: "ok",
        text: made
          ? `${meeting} is ready to review — ${made} item${made === 1 ? "" : "s"} prepared${
              skipped ? `, ${skipped} already generated for this class` : ""
            }. Nothing is published until you share it.`
          : `${meeting} already generated for this class — nothing new to prepare.`,
        href: reviewHref,
      });
      await loadProgress();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The connection was interrupted. Saved items are safe; refresh before retrying.",
      });
    } finally {
      setBusy(false);
    }
  }

  const hasProgress = (summary?.total_records ?? 0) > 0;

  return (
    <div className="print:hidden bg-card border border-white/[0.08] rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-card-foreground/40">
            This week
          </p>
          <p className="mt-0.5 text-lg font-bold text-card-foreground">{meeting}</p>
          {meetings > 1 && (
            <p className="mt-0.5 text-[11px] text-card-foreground/50">
              Prepares Class 1 now. Class 2 stays its own package so the two meetings do not repeat.
            </p>
          )}
        </div>
        {canGenerate && (
          <button
            onClick={generateThisWeek}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Preparing…" : `Prepare ${meeting}`}
          </button>
        )}
      </div>

      {message && (
        <div className="mt-3 space-y-1">
          <p
            className={`text-sm ${
              message.tone === "ok" ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {message.text}
          </p>
          {message.href && message.tone === "ok" && (
            <Link
              href={message.href}
              className="inline-flex text-[11px] font-black uppercase tracking-widest text-primary hover:underline"
            >
              Open review
            </Link>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-bold">
        <Link
          href="/dashboard/teaching/approvals"
          className="text-primary hover:underline"
        >
          Approvals queue
        </Link>
        <span className="text-card-foreground/30">·</span>
        <span className="text-card-foreground/50">
          Day-to-day teaching stays on the class workspace
        </span>
      </div>

      <div className="mt-4 border-t border-white/[0.08] pt-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-card-foreground/40 mb-2">
          How the class is doing on {meeting}
        </p>
        {hasProgress ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Learners" value={String(summary!.total_records)} />
            <Stat label="Avg score" value={`${summary!.average_practical_score}%`} />
            <Stat label="Completed" value={`${summary!.completion_rate}%`} />
            <Stat
              label="Avg time"
              value={
                summary!.average_completion_seconds >= 60
                  ? `${Math.round(summary!.average_completion_seconds / 60)}m`
                  : `${summary!.average_completion_seconds}s`
              }
            />
          </div>
        ) : (
          <p className="text-sm text-card-foreground/50">
            No learner activity recorded for {meeting} yet.
          </p>
        )}
      </div>
    </div>
  );
}
