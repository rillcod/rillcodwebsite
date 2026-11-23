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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  school_phone?: string | null;
  school_contact?: string | null;
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

type Lens = "attention" | "hot" | "cold" | "open" | "signed" | "all";

const LENSES: ReadonlyArray<{ id: Lens; label: string }> = [
  { id: "attention", label: "Needs You" },
  { id: "hot", label: "Hot Leads" },
  { id: "cold", label: "Going Cold" },
  { id: "open", label: "Waiting" },
  { id: "signed", label: "Signed" },
  { id: "all", label: "All" },
];

function isHotDeal(d: PipelineDoc): boolean {
  return d.status === "sent" && !d.expired && (d.open_count ?? 0) >= 2;
}

function isColdDeal(d: PipelineDoc): boolean {
  if (d.status !== "sent" || d.expired) return false;
  if ((d.open_count ?? 0) > 0) return false;
  const refTime = new Date(d.sent_at ?? d.created_at).getTime();
  if (Number.isNaN(refTime)) return false;
  return Date.now() - refTime >= 4 * 24 * 60 * 60 * 1000;
}

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
  onAttentionCount,
}: {
  /** Jump to the school's own workspace, where the document can be acted on. */
  onOpenSchool: (
    schoolId: string,
    hint?: { tab?: "compose" | "terms" | "document"; kind?: "proposal" | "mou"; documentId?: string },
  ) => void;
  /**
   * How many documents are waiting, reported every time this list is loaded.
   *
   * The page badges its own toggle with this number and counted it once, on
   * mount. Sending the draft it was counting left the badge claiming the work
   * was still outstanding until somebody reloaded the page — a count that is
   * wrong is worse than no count, because it is the thing telling you whether
   * to look. This list already knows the answer whenever it refreshes; saying
   * so is cheaper and more honest than a second fetch of the same endpoint.
   */
  onAttentionCount?: (waiting: number) => void;
}) {
  const [docs, setDocs] = useState<PipelineDoc[]>([]);
  const [outcomes, setOutcomes] = useState<Outcomes | null>(null);
  const [lens, setLens] = useState<Lens>("attention");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /*
    Held in a ref, so a caller cannot make this list fetch itself forever.

    `load` runs from an effect keyed on its own identity. With the callback in
    its dependency list, a parent passing an inline arrow — the ordinary thing
    to write — would hand `load` a new identity on every render, and every run
    sets state, which renders again. One `() => …` at a call site would have
    been an endless loop against the pipeline endpoint.
  */
  const report = useRef(onAttentionCount);
  report.current = onAttentionCount;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/partnerships/pipeline", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load the pipeline.");
      const rows: PipelineDoc[] = json.documents ?? [];
      setDocs(rows);
      setOutcomes(json.outcomes ?? null);
      report.current?.(rows.filter((d) => d.needs_attention).length);
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
    const q = search.trim().toLowerCase();
    const byLens = docs.filter((d) => {
      if (lens === "attention" && !d.needs_attention) return false;
      if (lens === "hot" && !isHotDeal(d)) return false;
      if (lens === "cold" && !isColdDeal(d)) return false;
      if (lens === "open" && d.status !== "draft" && d.status !== "sent") return false;
      if (lens === "signed" && d.status !== "signed") return false;
      if (q && !`${d.school_name} ${d.school_city ?? ""} ${d.reference ?? ""} ${d.attention_reason}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    return [...byLens].sort((a, b) => {
      if (a.needs_attention !== b.needs_attention) return a.needs_attention ? -1 : 1;
      return (a.sent_at ?? a.created_at) < (b.sent_at ?? b.created_at) ? -1 : 1;
    });
  }, [docs, lens, search]);

  const attentionCount = docs.filter((d) => d.needs_attention).length;
  const hotCount = docs.filter(isHotDeal).length;
  const coldCount = docs.filter(isColdDeal).length;

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

      {/* Conversion Funnel Intelligence Bar */}
      {outcomes && outcomes.issued > 0 && (
        <div className="rounded-2xl border border-border bg-muted/25 p-3.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="font-black uppercase tracking-wider text-muted-foreground">Conversion Funnel</span>
            <div className="flex flex-wrap items-center gap-3 font-bold">
              {hotCount > 0 && (
                <button type="button" onClick={() => setLens("hot")} className="text-emerald-700 dark:text-emerald-400 hover:underline">
                  {hotCount} hot deal{hotCount === 1 ? "" : "s"} (2+ opens)
                </button>
              )}
              {coldCount > 0 && (
                <button type="button" onClick={() => setLens("cold")} className="text-amber-700 dark:text-amber-400 hover:underline">
                  {coldCount} going cold (4d+ unopened)
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "Issued", value: outcomes.issued, pct: 100 },
              { label: "Sent", value: outcomes.sent, pct: Math.round((outcomes.sent / Math.max(outcomes.issued, 1)) * 100) },
              { label: "Opened", value: outcomes.opened, pct: Math.round((outcomes.opened / Math.max(outcomes.sent, 1)) * 100) },
              { label: "Signed", value: outcomes.signed, pct: outcomes.signedRate ?? 0 },
            ].map((stage) => (
              <div key={stage.label} className="rounded-xl bg-card border border-border px-2 py-2">
                <div className="text-base font-black tabular-nums text-foreground">{stage.value}</div>
                <div className="text-[10px] font-bold text-muted-foreground">{stage.label} · {stage.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border overflow-x-auto flex-1">
          {LENSES.map((l) => {
            const active = lens === l.id;
            const n = l.id === "attention" ? attentionCount : l.id === "hot" ? hotCount : l.id === "cold" ? coldCount : null;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setLens(l.id)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all min-h-[34px] ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.label}
                {n ? <span className="opacity-80"> ({n})</span> : null}
              </button>
            );
          })}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search school or reference…"
          aria-label="Search partnership pipeline"
          className="w-full sm:w-56 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
        />
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
                  {doc.school_phone && doc.status !== "signed" && (
                    <a
                      href={(() => {
                        const digits = String(doc.school_phone).replace(/\D/g, "");
                        const target = digits.length >= 10 ? (digits.startsWith("0") ? `234${digits.slice(1)}` : digits) : "";
                        const sharePath = publicDocumentSharePath(doc.share_token, doc.status);
                        const shareUrl = sharePath && typeof window !== "undefined" ? `${window.location.origin}${sharePath}` : "";
                        const msg = `Hello ${doc.school_contact || doc.school_name}, following up from Rillcod Technologies on your ${doc.kind === "mou" ? "MoU" : "partnership proposal"}${doc.reference ? ` (${doc.reference})` : ""}${shareUrl ? `:\n${shareUrl}` : ""}. Happy to answer any questions!`;
                        return target ? `https://wa.me/${target}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                      })()}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 text-[11px] font-bold transition-colors min-h-[34px] inline-flex items-center"
                    >
                      WhatsApp
                    </a>
                  )}
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
