"use client";

/**
 * Recording what a school actually agreed to pay.
 *
 * Terms are never edited in place — saving `agreed` supersedes the current row
 * and keeps the old one, because a superseded rate is what a previously signed
 * agreement was signed against. The form reflects that: it opens prefilled with
 * the deal in force, and the button says supersede rather than save.
 *
 * The database CHECK constraints are the real authority (shares total 100,
 * Rillcod never below 50, every model carries the amount it bills on). They are
 * mirrored here only so a mistake is caught while the person can still see the
 * field that caused it — never as the only place the rule lives.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
} from "@/lib/icons";
import { termDisplay, useAcademicTerms } from "./useAcademicTerms";
import type { BillingModel, SchoolRow, TermsRow } from "./types";

const INPUT =
  "w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/60 transition-colors";
const LABEL = "block text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-2";

/** The standard deal. Stated once, here, and only as this form's starting point. */
const STANDARD_RILLCOD_SHARE = 70;

type TierDraft = { label: string; count: string; rate: string };

type Draft = {
  billing_model: BillingModel;
  currency: string;
  billing_cycle: string;
  amount_per_student: string;
  fixed_package_price: string;
  tiers: TierDraft[];
  deposit_amount: string;
  revenueShare: boolean;
  rillcod_share_percent: string;
  effective_from: string;
  effective_to: string;
  notes: string;
  status: "draft" | "proposed" | "agreed";
};

const MODELS: Array<{ value: BillingModel; name: string; blurb: string }> = [
  {
    value: "per_student",
    name: "Per student",
    blurb: "A fee for each enrolled student, every cycle. The usual shape.",
  },
  {
    value: "fixed_package",
    name: "Fixed package",
    blurb: "One price for the whole school, whatever the roll turns out to be.",
  },
  {
    value: "tiered",
    name: "Banded",
    blurb: "Different rates for different population bands, priced per band.",
  },
];

function emptyDraft(): Draft {
  return {
    billing_model: "per_student",
    currency: "NGN",
    billing_cycle: "term",
    amount_per_student: "",
    fixed_package_price: "",
    tiers: [{ label: "", count: "", rate: "" }],
    deposit_amount: "",
    revenueShare: true,
    rillcod_share_percent: String(STANDARD_RILLCOD_SHARE),
    effective_from: "",
    effective_to: "",
    notes: "",
    status: "agreed",
  };
}

/** Open on the deal in force, so recording a change starts from what it changes. */
function draftFrom(terms: TermsRow | null): Draft {
  const base = emptyDraft();
  if (!terms) return base;
  return {
    billing_model: terms.billing_model ?? "per_student",
    currency: terms.currency || "NGN",
    billing_cycle: terms.billing_cycle || "term",
    amount_per_student: terms.amount_per_student != null ? String(terms.amount_per_student) : "",
    fixed_package_price: terms.fixed_package_price != null ? String(terms.fixed_package_price) : "",
    tiers: terms.tiers?.length
      ? terms.tiers.map((t) => ({
          label: t.label ?? "",
          count: String(t.count ?? ""),
          rate: String(t.rate ?? ""),
        }))
      : base.tiers,
    deposit_amount: terms.deposit_amount != null ? String(terms.deposit_amount) : "",
    revenueShare: terms.rillcod_share_percent != null,
    rillcod_share_percent:
      terms.rillcod_share_percent != null
        ? String(terms.rillcod_share_percent)
        : String(STANDARD_RILLCOD_SHARE),
    effective_from: terms.effective_from ?? "",
    effective_to: terms.effective_to ?? "",
    notes: terms.notes ?? "",
    status: "agreed",
  };
}

const num = (v: string): number => {
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function PartnershipTermsEditor({
  school,
  agreed,
  history,
  canWrite,
  onSaved,
}: {
  school: SchoolRow;
  agreed: TermsRow | null;
  history: TermsRow[];
  canWrite: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(agreed));
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const { terms: academicTerms } = useAcademicTerms();

  // Switching school (or superseding) reopens the form on the new deal in force.
  useEffect(() => {
    setDraft(draftFrom(agreed));
    setOpen(false);
    setError("");
    setSaved("");
  }, [school.id, agreed]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const rillcodShare = num(draft.rillcod_share_percent);
  const schoolShare = 100 - rillcodShare;

  /** The same rules the CHECK constraints carry, checked while the field is visible. */
  const problem = useMemo((): string => {
    if (draft.billing_model === "per_student" && num(draft.amount_per_student) <= 0) {
      return "Per-student terms need an amount above zero.";
    }
    if (draft.billing_model === "fixed_package" && num(draft.fixed_package_price) <= 0) {
      return "A fixed package needs a price above zero.";
    }
    if (draft.billing_model === "tiered") {
      const usable = draft.tiers.filter((t) => num(t.count) > 0 && num(t.rate) > 0);
      if (!usable.length) return "Banded pricing needs at least one band with a count and a rate.";
    }
    if (draft.revenueShare) {
      if (!Number.isFinite(rillcodShare) || rillcodShare <= 0) return "Enter Rillcod's share.";
      // The floor is a constraint, not a preference: a fat-fingered 30/70 is the
      // inversion this whole record exists to make impossible.
      if (rillcodShare < 50) return "Rillcod's share cannot be below 50%. Check the split is not reversed.";
      if (rillcodShare > 100) return "A share cannot exceed 100%.";
      if (!Number.isInteger(rillcodShare)) return "Use a whole percentage.";
    }
    if (draft.effective_from && draft.effective_to && draft.effective_to < draft.effective_from) {
      return "The end date falls before the start date.";
    }
    return "";
  }, [draft, rillcodShare]);

  async function save() {
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const tiers =
        draft.billing_model === "tiered"
          ? draft.tiers
              .filter((t) => num(t.count) > 0 && num(t.rate) > 0)
              .map((t) => ({
                label: t.label.trim() || `${num(t.count)} students`,
                count: num(t.count),
                rate: num(t.rate),
              }))
          : null;

      const res = await fetch("/api/partnerships/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_id: school.id,
          billing_model: draft.billing_model,
          currency: draft.currency,
          billing_cycle: draft.billing_cycle,
          amount_per_student:
            draft.billing_model === "per_student" ? num(draft.amount_per_student) : null,
          fixed_package_price:
            draft.billing_model === "fixed_package" ? num(draft.fixed_package_price) : null,
          tiers,
          deposit_amount: draft.deposit_amount ? num(draft.deposit_amount) : null,
          // All-or-nothing, and never half a split: the invoice engine must not
          // be left inferring the remainder.
          rillcod_share_percent: draft.revenueShare ? rillcodShare : null,
          school_share_percent: draft.revenueShare ? schoolShare : null,
          status: draft.status,
          effective_from: draft.effective_from || null,
          effective_to: draft.effective_to || null,
          notes: draft.notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not record these terms.");

      setSaved(json.summary || "Terms recorded.");
      setOpen(false);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record these terms.");
    } finally {
      setSaving(false);
    }
  }

  const superseded = history.filter((t) => t.status === "superseded");
  // Never agreed, so nothing was ever billed or signed against them — these are
  // the only rows it is safe to remove.
  const unagreed = history.filter((t) => t.status === "draft" || t.status === "proposed");

  async function discard(id: string) {
    if (!confirm("Delete these unagreed terms? Nothing was billed or signed against them.")) return;
    setError("");
    try {
      const res = await fetch(`/api/partnerships/terms?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not delete those terms.");
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete those terms.");
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Commercial terms</h2>
          <p className="text-xs text-white/50 mt-1">
            What this school is charged, and how it divides. Every invoice, proposal and MoU reads
            this one record.
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors shrink-0"
          >
            {open ? "Cancel" : agreed ? "Supersede terms" : "Record terms"}
          </button>
        )}
      </div>

      {/* What is in force right now */}
      {agreed ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
          <div className="flex items-start gap-3">
            <CheckCircleIcon className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">
                {agreed.summary || "Terms agreed"}
              </p>
              <p className="text-[11px] text-white/50 mt-1">
                Version {agreed.version ?? 1}
                {agreed.agreed_at
                  ? ` · agreed ${new Date(agreed.agreed_at).toLocaleDateString("en-GB")}`
                  : ""}
                {agreed.rillcod_share_percent == null
                  ? " · flat rate, the full amount is Rillcod’s"
                  : ""}
              </p>
              {agreed.notes && <p className="text-[11px] text-white/40 mt-1.5">{agreed.notes}</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">No agreed terms yet</p>
              <p className="text-[11px] text-white/50 mt-1">
                A proposal can still be issued — that is what you send to get to a rate. An MoU
                cannot, and this school is being invoiced on a legacy figure nobody agreed.
              </p>
            </div>
          </div>
        </div>
      )}

      {saved && !open && (
        <p className="text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircleIcon className="w-4 h-4" /> {saved}
        </p>
      )}

      {/* The editor */}
      {open && canWrite && (
        <div className="space-y-5 pt-1">
          <div>
            <span className={LABEL}>How it is billed</span>
            <div className="grid sm:grid-cols-3 gap-3">
              {MODELS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => set("billing_model", m.value)}
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    draft.billing_model === m.value
                      ? "border-violet-500/60 bg-violet-500/10"
                      : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <span className="block text-sm font-semibold text-white">{m.name}</span>
                  <span className="block text-[11px] text-white/45 mt-1 leading-snug">
                    {m.blurb}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {draft.billing_model === "per_student" && (
              <div>
                <label className={LABEL} htmlFor="amount-per-student">
                  Amount per student
                </label>
                <input
                  id="amount-per-student"
                  className={INPUT}
                  inputMode="numeric"
                  placeholder="25000"
                  value={draft.amount_per_student}
                  onChange={(e) => set("amount_per_student", e.target.value)}
                />
              </div>
            )}

            {draft.billing_model === "fixed_package" && (
              <div>
                <label className={LABEL} htmlFor="fixed-price">
                  Package price
                </label>
                <input
                  id="fixed-price"
                  className={INPUT}
                  inputMode="numeric"
                  placeholder="1500000"
                  value={draft.fixed_package_price}
                  onChange={(e) => set("fixed_package_price", e.target.value)}
                />
              </div>
            )}

            <div>
              <label className={LABEL} htmlFor="billing-cycle">
                Billed every
              </label>
              <select
                id="billing-cycle"
                className={INPUT}
                value={draft.billing_cycle}
                onChange={(e) => set("billing_cycle", e.target.value)}
              >
                <option value="term">Term</option>
                <option value="session">Session</option>
                <option value="month">Month</option>
              </select>
            </div>

            <div>
              <label className={LABEL} htmlFor="deposit">
                Deposit (optional)
              </label>
              <input
                id="deposit"
                className={INPUT}
                inputMode="numeric"
                placeholder="0"
                value={draft.deposit_amount}
                onChange={(e) => set("deposit_amount", e.target.value)}
              />
            </div>

            <div>
              <label className={LABEL} htmlFor="currency">
                Currency
              </label>
              <select
                id="currency"
                className={INPUT}
                value={draft.currency}
                onChange={(e) => set("currency", e.target.value)}
              >
                <option value="NGN">NGN — Naira</option>
                <option value="USD">USD — Dollar</option>
                <option value="GBP">GBP — Pound</option>
              </select>
            </div>
          </div>

          {draft.billing_model === "tiered" && (
            <div>
              <span className={LABEL}>Bands</span>
              <div className="space-y-2">
                {draft.tiers.map((tier, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <input
                      aria-label={`Band ${i + 1} label`}
                      className={INPUT}
                      placeholder="Primary"
                      value={tier.label}
                      onChange={(e) =>
                        setDraft((d) => {
                          const tiers = [...d.tiers];
                          tiers[i] = { ...tiers[i], label: e.target.value };
                          return { ...d, tiers };
                        })
                      }
                    />
                    <input
                      aria-label={`Band ${i + 1} student count`}
                      className={`${INPUT} sm:w-32`}
                      inputMode="numeric"
                      placeholder="Students"
                      value={tier.count}
                      onChange={(e) =>
                        setDraft((d) => {
                          const tiers = [...d.tiers];
                          tiers[i] = { ...tiers[i], count: e.target.value };
                          return { ...d, tiers };
                        })
                      }
                    />
                    <input
                      aria-label={`Band ${i + 1} rate`}
                      className={`${INPUT} sm:w-32`}
                      inputMode="numeric"
                      placeholder="Rate"
                      value={tier.rate}
                      onChange={(e) =>
                        setDraft((d) => {
                          const tiers = [...d.tiers];
                          tiers[i] = { ...tiers[i], rate: e.target.value };
                          return { ...d, tiers };
                        })
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Remove band ${i + 1}`}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          tiers: d.tiers.length > 1 ? d.tiers.filter((_, j) => j !== i) : d.tiers,
                        }))
                      }
                      className="p-2.5 rounded-xl border border-white/10 text-white/40 hover:text-red-400 hover:border-red-400/30 transition-colors shrink-0"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraft((d) => ({ ...d, tiers: [...d.tiers, { label: "", count: "", rate: "" }] }))
                }
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-violet-300 hover:text-violet-200 transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" /> Add a band
              </button>
            </div>
          )}

          {/* The split. The one number this whole record exists to stop drifting. */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.revenueShare}
                onChange={(e) => set("revenueShare", e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-violet-600"
              />
              <span>
                <span className="block text-sm font-medium text-white">
                  Revenue is shared with the school
                </span>
                <span className="block text-[11px] text-white/45 mt-0.5">
                  The school collects from parents and settles Rillcod’s share. Leave this off for a
                  flat rate the school simply pays.
                </span>
              </span>
            </label>

            {draft.revenueShare ? (
              <div className="flex flex-wrap items-end gap-4">
                <div className="w-40">
                  <label className={LABEL} htmlFor="rillcod-share">
                    Rillcod’s share
                  </label>
                  <div className="relative">
                    <input
                      id="rillcod-share"
                      className={INPUT}
                      inputMode="numeric"
                      value={draft.rillcod_share_percent}
                      onChange={(e) => set("rillcod_share_percent", e.target.value)}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/40">
                      %
                    </span>
                  </div>
                </div>
                <div className="pb-2.5 text-sm text-white/60">
                  School keeps{" "}
                  <span className="font-semibold text-white">
                    {Number.isFinite(schoolShare) ? schoolShare : 0}%
                  </span>
                  <span className="block text-[11px] text-white/35 mt-0.5">
                    Standard deal is Rillcod {STANDARD_RILLCOD_SHARE} / school{" "}
                    {100 - STANDARD_RILLCOD_SHARE}. 50/50 is the floor.
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-amber-300/90 leading-relaxed">
                Flat rate: the full amount is Rillcod’s — 100%, not 0%. Nothing is settled back to
                the school.
              </p>
            )}
          </div>

          {academicTerms.length > 0 && (
            <div>
              <label className={LABEL} htmlFor="effective-session">
                Align the effective window to a session
              </label>
              <select
                id="effective-session"
                className={INPUT}
                defaultValue=""
                onChange={(e) => {
                  // The academic calendar owns these dates. Reading them across
                  // beats typing two dates that drift from the term they mean.
                  const picked = academicTerms.find((t) => t.id === e.target.value);
                  if (!picked) return;
                  setDraft((d) => ({
                    ...d,
                    effective_from: picked.start_date ?? d.effective_from,
                    effective_to: picked.end_date ?? d.effective_to,
                  }));
                }}
              >
                <option value="">Set the dates myself</option>
                {academicTerms
                  .filter((t) => t.start_date || t.end_date)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {termDisplay(t)}
                      {t.is_current ? " — current" : ""}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL} htmlFor="effective-from">
                Effective from (optional)
              </label>
              <input
                id="effective-from"
                type="date"
                className={INPUT}
                value={draft.effective_from}
                onChange={(e) => set("effective_from", e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="effective-to">
                Effective to (optional)
              </label>
              <input
                id="effective-to"
                type="date"
                className={INPUT}
                value={draft.effective_to}
                onChange={(e) => set("effective_to", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={LABEL} htmlFor="terms-notes">
              Notes (optional)
            </label>
            <textarea
              id="terms-notes"
              rows={2}
              className={INPUT}
              placeholder="Anything about this deal the numbers do not say."
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          <div>
            <span className={LABEL}>Record as</span>
            <div className="flex flex-wrap gap-2">
              {(["draft", "proposed", "agreed"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("status", s)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold capitalize border transition-colors ${
                    draft.status === s
                      ? "border-violet-500/60 bg-violet-500/15 text-white"
                      : "border-white/10 bg-white/5 text-white/60 hover:border-white/20"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/40 mt-2 leading-relaxed">
              {draft.status === "agreed"
                ? agreed
                  ? `Saving supersedes version ${agreed.version ?? 1}. The old terms are kept — a signed agreement was signed against them.`
                  : "Only agreed terms are billed against, and an MoU can only be issued once they exist."
                : "Drafts and proposals are kept as history. Neither is billed against."}
            </p>
          </div>

          {(error || problem) && (
            <p className="text-xs text-red-400 flex items-start gap-2">
              <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-px" />
              {error || problem}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving || !!problem}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-2"
            >
              {saving && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
              {draft.status === "agreed" && agreed ? "Supersede terms" : "Record terms"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2.5 rounded-xl text-sm text-white/60 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Negotiation in progress — neither billed against nor kept on principle */}
      {unagreed.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
            Not agreed
          </p>
          <ul className="space-y-2">
            {unagreed.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 text-[11px] text-white/50 border border-white/10 rounded-xl px-3 py-2"
              >
                <span className="px-2 py-0.5 rounded-md bg-white/10 text-white/50 text-[10px] font-semibold uppercase tracking-wider shrink-0">
                  {t.status}
                </span>
                <span className="flex-1 min-w-0 truncate">{t.summary || "—"}</span>
                {canWrite && (
                  <button
                    onClick={() => discard(t.id)}
                    aria-label="Delete these unagreed terms"
                    className="p-1.5 rounded-lg text-white/30 hover:text-red-400 transition-colors shrink-0"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* History — kept, because a signed agreement points at one of these */}
      {superseded.length > 0 && (
        <details className="group">
          <summary className="text-xs text-white/40 hover:text-white/60 cursor-pointer transition-colors">
            {superseded.length} superseded {superseded.length === 1 ? "version" : "versions"}
          </summary>
          <ul className="mt-3 space-y-2">
            {superseded.map((t) => (
              <li
                key={t.id}
                className="text-[11px] text-white/45 border-l-2 border-white/10 pl-3 py-1"
              >
                <span className="text-white/70">v{t.version ?? 1}</span> · {t.summary || "—"}
                {t.effective_to && <span className="text-white/30"> · ended {t.effective_to}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
