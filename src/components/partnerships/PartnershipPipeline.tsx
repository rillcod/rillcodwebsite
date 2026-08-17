"use client";

/**
 * Every document, every school, one list.
 *
 * The archive is per-school, which is right when you are working on a school
 * and useless when you are working on the business: to find what was
 * outstanding you had to pick a school, read its documents, go back, pick the
 * next. Nobody does that forty times, so nothing got chased.
 *
 * Two jobs here, and they are different. The top of the page is what the signed
 * deals have in common — the only honest basis for what we recommend to the
 * next school. Below it is what needs a person today, sorted so the list is
 * short enough to act on rather than long enough to ignore.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
} from "@/lib/icons";
import { describeTerms } from "@/lib/partnerships/terms";
import { publicDocumentSharePath } from "@/lib/partnerships/signing";
import type { PartnershipTerms } from "@/lib/partnerships/terms";

type PipelineDoc = {
  id: string;
  reference: string | null;
  kind: "proposal" | "mou";
  status: string;
  school_id: string;
  school_name: string;
  school_city: string | null;
  created_at: string;
  sent_at: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  share_token: string | null;
  valid_until: string | null;
  expired: boolean;
  open_count: number;
  last_opened_at: string | null;
  needs_attention: boolean;
  attention_reason: string;
  attention_tab?: "compose" | "document";
  terms: PartnershipTerms | null;
};

type Outcomes = {
  issued: number;
  sent: number;
  opened: number;
  signed: number;
  declined: number;
  signedRate: number | null;
  openRate: number | null;
  medianAgreedRate: number | null;
  medianSchoolShare: number | null;
  medianDaysToSign: number | null;
};

type Lens = "attention" | "open" | "signed" | "all";

const LENSES: ReadonlyArray<{ id: Lens; label: string }> = [
  { id: "attention", label: "Needs you" },
  { id: "open", label: "Waiting on them" },
  { id: "signed", label: "Signed" },
  { id: "all", label: "All of them" },
];

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  signed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  declined: "bg-red-500/15 text-red-300",
  void: "bg-muted/40 text-muted-foreground",
};

const money = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const shortDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";

/** One number and what it means, for the row of them across the top. */
function Stat({
  value,
  label,
  hint,
  tone,
}: {
  value: string;
  label: string;
  hint?: string;
  tone?: "good" | "warn";
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-muted/30 px-4 py-3">
      <div
        className={`text-xl font-black tracking-tight ${
          tone === "good"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "warn"
              ? "text-amber-600 dark:text-amber-400"
              : "text-foreground"
        }`}
      >
        {value}
      </div>
      <div className="text-[11px] font-semibold text-foreground/70 mt-0.5">{label}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{hint}</div>}
    </div>
  );
}

export function PartnershipPipeline({
  onOpenSchool,
}: {
  /** Jump to the school's own workspace, where the document can be acted on. */
  onOpenSchool: (
    schoolId: string,
    hint?: { tab?: "compose" | "terms" | "document"; kind?: "proposal" | "mou"; documentId?: string },
  ) => void;
}) {
  const [docs, setDocs] = useState<PipelineDoc[]>([]);
  const [outcomes, setOutcomes] = useState<Outcomes | null>(null);
  const [lens, setLens] = useState<Lens>("attention");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/partnerships/pipeline");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load the pipeline.");
      setDocs(json.documents ?? []);
      setOutcomes(json.outcomes ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the pipeline.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const byLens = docs.filter((d) => {
      if (lens === "attention") return d.needs_attention;
      if (lens === "open") return d.status === "draft" || d.status === "sent";
      if (lens === "signed") return d.status === "signed";
      return true;
    });
    // Anything wanting a person comes first; within that, whatever moved least
    // recently, because that is what is actually going cold.
    return [...byLens].sort((a, b) => {
      if (a.needs_attention !== b.needs_attention) return a.needs_attention ? -1 : 1;
      return (a.sent_at ?? a.created_at) < (b.sent_at ?? b.created_at) ? -1 : 1;
    });
  }, [docs, lens]);

  const attentionCount = docs.filter((d) => d.needs_attention).length;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Where every school stands</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Everything you have sent, who has read it, and what the schools who said yes agreed to.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 min-h-[38px]"
        >
          <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && (
        <p className="text-xs text-destructive flex items-start gap-2">
          <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-px" />
          {error}
        </p>
      )}

      {/*
        What actually gets signed.

        Every one of these was already in the database and none of it had ever
        been read back — so the option we recommend to the next school was a
        rule of thumb, when it could have been what the last forty deals did.
        Medians rather than averages: one unusual deal should not move the
        number a person is about to quote from.
      */}
      {outcomes && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <Stat
            value={outcomes.signedRate === null ? "—" : `${outcomes.signedRate}%`}
            label="Said yes"
            hint="Schools that signed an MoU, of those who received a proposal"
            tone="good"
          />
          <Stat
            value={outcomes.openRate === null ? "—" : `${outcomes.openRate}%`}
            label="Actually read it"
            hint={
              outcomes.openRate === null
                ? "Nothing sent yet"
                : `${outcomes.sent - outcomes.opened} never opened it`
            }
            tone={outcomes.openRate !== null && outcomes.openRate < 50 ? "warn" : undefined}
          />
          <Stat
            value={outcomes.medianAgreedRate ? money(outcomes.medianAgreedRate) : "—"}
            label="What schools pay"
            hint={
              outcomes.medianSchoolShare != null
                ? `Per student, per term · they keep ${outcomes.medianSchoolShare}%`
                : "The middle of what has been agreed"
            }
          />
          <Stat
            value={outcomes.medianDaysToSign == null ? "—" : `${outcomes.medianDaysToSign}d`}
            label="Time to sign"
            hint="From sending it to getting it back"
          />
        </div>
      )}

      <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border overflow-x-auto">
        {LENSES.map((l) => {
          const active = lens === l.id;
          const n = l.id === "attention" ? attentionCount : null;
          return (
            <button
              key={l.id}
              onClick={() => setLens(l.id)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all min-h-[34px] ${
                active
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l.label}
              {n ? <span className="opacity-75"> ({n})</span> : null}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-7 h-7 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <p className="text-center py-8 text-xs text-muted-foreground">
          {lens === "attention"
            ? "Nothing needs you right now."
            : "Nothing here yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((doc) => (
            <li
              key={doc.id}
              className={`p-3 rounded-xl border bg-muted/30 ${
                doc.needs_attention ? "border-amber-500/40" : "border-border"
              }`}
            >
              {/* Stacked on a phone; the actions never share a wrapping row
                  with the identity, which is what pushed the old archive card
                  open past its own edge. */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="shrink-0 text-muted-foreground">
                      {doc.kind === "mou" ? (
                        <ClipboardDocumentCheckIcon className="w-4 h-4" />
                      ) : (
                        <DocumentTextIcon className="w-4 h-4" />
                      )}
                    </span>
                    <span className="font-bold text-xs text-foreground truncate max-w-full">
                      {doc.school_name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        STATUS_STYLES[doc.status] || STATUS_STYLES.draft
                      }`}
                    >
                      {doc.status}
                    </span>
                    {doc.expired && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500/15 text-red-400">
                        lapsed
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-muted-foreground mt-1 break-words">
                    <span className="font-mono">{doc.reference || "—"}</span>
                    {doc.terms ? ` · ${describeTerms(doc.terms)}` : ""}
                    {doc.sent_at ? ` · sent ${shortDate(doc.sent_at)}` : ""}
                    {doc.status !== "draft"
                      ? doc.open_count
                        ? ` · opened ${doc.open_count}× (${shortDate(doc.last_opened_at)})`
                        : " · never opened"
                      : ""}
                    {doc.signed_by_name ? ` · signed by ${doc.signed_by_name}` : ""}
                  </p>

                  {doc.needs_attention && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-start gap-1.5">
                      <ExclamationTriangleIcon className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span className="break-words">{doc.attention_reason}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto sm:overflow-visible -mx-1 px-1 sm:mx-0 sm:px-0">
                  <button
                    onClick={() =>
                      onOpenSchool(doc.school_id, {
                        tab: doc.attention_tab || (doc.expired ? "compose" : "document"),
                        kind: doc.kind,
                        documentId: doc.id,
                      })
                    }
                    className="shrink-0 px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 text-[11px] font-medium transition-colors min-h-[34px]"
                  >
                    Open school
                  </button>
                  {publicDocumentSharePath(doc.share_token, doc.status) && (
                    <a
                      href={publicDocumentSharePath(doc.share_token, doc.status)!}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 px-2.5 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 text-[11px] font-medium transition-colors min-h-[34px] inline-flex items-center"
                    >
                      School’s copy ↗
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {outcomes && outcomes.signed > 0 && (
        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 pt-1 border-t border-border/60">
          <CheckCircleIcon className="w-3.5 h-3.5 shrink-0 mt-px text-emerald-500" />
          <span>
            From the {outcomes.signed} signed {outcomes.signed === 1 ? "MoU" : "MoUs"}.
            These are safe numbers to quote — they are what schools really agreed to, saved at
            the moment each one signed.
          </span>
        </p>
      )}
    </div>
  );
}
