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
import {
  SPLIT_RULE_MESSAGE,
  STANDARD_RILLCOD_SHARE_PERCENT,
  isPermittedRillcodShare,
} from "@/lib/partnerships/split";
// Settlement terms live with the rate and the split, because they are terms.
// The recommendation is what this form opens on; see RECOMMENDED_SETTLEMENT.
import {
  RECOMMENDED_SETTLEMENT,
  type SettlementTrigger,
  type WithdrawalPolicy,
} from "@/lib/partnerships/terms";
import { termDisplay, useAcademicTerms } from "./useAcademicTerms";
import type { BillingModel, SchoolRow, TermsRow } from "./types";

const INPUT =
  "w-full px-4 py-2.5 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors";
const LABEL = "block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2";

/** The standard deal. Stated once, here, and only as this form's starting point. */
// The floor, the standard and the wording all come from one module, so the
// editor cannot drift from the database CHECK or from the proposal API.
const STANDARD_RILLCOD_SHARE = STANDARD_RILLCOD_SHARE_PERCENT;

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
  /** When the school's share arrives, and what moves it. */
  settlement_trigger: SettlementTrigger | "";
  settlement_days: string;
  withdrawal_policy: WithdrawalPolicy | "";
  minimum_students: string;
  status: "draft" | "proposed" | "agreed";
};

/** The two shapes a settlement takes, in the words a proprietor would use. */
const SETTLEMENT_SHAPES: Array<{ value: SettlementTrigger; name: string; blurb: string }> = [
  {
    value: "on_collection",
    name: "As fees are collected",
    blurb:
      "The school's share is released as parents pay. Neither side fronts the other's money, which is what protects cash flow in a slow term.",
  },
  {
    value: "term_end",
    name: "At the end of every term",
    blurb:
      "Paid whether or not every parent has settled. The stronger offer, and it means we carry the collection risk out of working capital.",
  },
];

const WITHDRAWAL_SHAPES: Array<{ value: WithdrawalPolicy; name: string; blurb: string }> = [
  {
    value: "pro_rata",
    name: "Charge pro rata",
    blurb: "Billed for the sessions actually taught. The answer a proprietor expects.",
  },
  {
    value: "credit_next_term",
    name: "Credit the next term",
    blurb: "The balance carries forward rather than being refunded.",
  },
  {
    value: "no_refund",
    name: "Charge the full term",
    blurb: "The slot and the facilitator were committed. Wins the term, risks the renewal.",
  },
];

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
    name: "By section",
    blurb: "Primary at one rate, secondary at another. One split across both.",
  },
];

/**
 * What a banded deal almost always is here: primary priced one way, secondary
 * another, with the same share on each. Starting from one blank row made the
 * commonest shape the most typing.
 */
const DEFAULT_BANDS: TierDraft[] = [
  { label: "Primary", count: "", rate: "" },
  { label: "Secondary", count: "", rate: "" },
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
    /*
      Settlement opens on what we recommend, not on four blank fields.

      A blank form is the same work as writing the clause from scratch, so the
      likely outcome is that it stays blank and the proposal goes on saying
      nothing about the questions its own numbers raise. The reasoning behind
      each default is in RECOMMENDED_SETTLEMENT; whoever is agreeing the deal
      changes them, and nothing prints until the terms are saved.
    */
    settlement_trigger: RECOMMENDED_SETTLEMENT.settlement_trigger,
    settlement_days: String(RECOMMENDED_SETTLEMENT.settlement_days),
    withdrawal_policy: RECOMMENDED_SETTLEMENT.withdrawal_policy,
    minimum_students: String(RECOMMENDED_SETTLEMENT.minimum_students),
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
    // What was agreed wins over what we recommend, every time.
    settlement_trigger: terms.settlement_trigger ?? base.settlement_trigger,
    settlement_days:
      terms.settlement_days != null ? String(terms.settlement_days) : base.settlement_days,
    withdrawal_policy: terms.withdrawal_policy ?? base.withdrawal_policy,
    minimum_students:
      terms.minimum_students != null ? String(terms.minimum_students) : base.minimum_students,
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
  openSignal,
}: {
  school: SchoolRow;
  agreed: TermsRow | null;
  history: TermsRow[];
  canWrite: boolean;
  onSaved: () => void | Promise<void>;
  /** Bumped from outside to open the form — e.g. a blocked MoU sending you here. */
  openSignal?: number;
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

  // Opened from elsewhere: the composer refuses an MoU without terms and points
  // here, so the form must already be open when the page scrolls to it.
  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);

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
      if (!usable.length) return "Each section needs a headcount and a rate — at least one of them.";
    }
    if (draft.revenueShare) {
      if (!Number.isFinite(rillcodShare) || rillcodShare <= 0) return "Enter Rillcod's share.";
      // The floor is a constraint, not a preference: a fat-fingered 30/70 is the
      // inversion this whole record exists to make impossible.
      if (!isPermittedRillcodShare(rillcodShare)) return SPLIT_RULE_MESSAGE;
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
          settlement_trigger: draft.settlement_trigger || null,
          settlement_days: draft.settlement_days ? num(draft.settlement_days) : null,
          withdrawal_policy: draft.withdrawal_policy || null,
          minimum_students: draft.minimum_students ? num(draft.minimum_students) : null,
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
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-foreground">Commercial terms</h2>
          <p className="text-xs text-muted-foreground mt-1">
            What this school is charged, and how it divides. Every invoice, proposal and MoU reads
            this one record.
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors shrink-0"
          >
            {open ? "Cancel" : agreed ? "Supersede terms" : "Record terms"}
          </button>
        )}
      </div>

      {/* What is in force right now */}
      {agreed ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
          <div className="flex items-start gap-3">
            <CheckCircleIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {agreed.summary || "Terms agreed"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Version {agreed.version ?? 1}
                {agreed.agreed_at
                  ? ` · agreed ${new Date(agreed.agreed_at).toLocaleDateString("en-GB")}`
                  : ""}
                {agreed.rillcod_share_percent == null
                  ? " · flat rate, the full amount is Rillcod’s"
                  : ""}
              </p>
              {agreed.notes && <p className="text-[11px] text-muted-foreground mt-1.5">{agreed.notes}</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">No agreed terms yet</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                A proposal can still be issued — that is what you send to get to a rate. An MoU
                cannot, and this school is being invoiced on a legacy figure nobody agreed.
              </p>
            </div>
          </div>
        </div>
      )}

      {saved && !open && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
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
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      billing_model: m.value,
                      // Picking "by section" lays out the two sections rather
                      // than one blank row to name yourself.
                      tiers:
                        m.value === "tiered" && d.tiers.every((t) => !t.label && !t.rate)
                          ? DEFAULT_BANDS
                          : d.tiers,
                    }))
                  }
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    draft.billing_model === m.value
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/40 hover:border-foreground/30"
                  }`}
                >
                  <span className="block text-sm font-semibold text-foreground">{m.name}</span>
                  <span className="block text-[11px] text-muted-foreground mt-1 leading-snug">
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
                  // Four controls in one row is fine on a laptop and unusable on
                  // a phone. Stacked below sm: name across the top, the two
                  // numbers side by side, then remove.
                  <div key={i} className="grid grid-cols-2 gap-2 sm:flex sm:items-start">
                    <input
                      aria-label={`Band ${i + 1} label`}
                      className={`${INPUT} col-span-2 sm:flex-1`}
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
                      className={`${INPUT} sm:w-28`}
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
                      className={`${INPUT} sm:w-28`}
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
                      className="col-span-2 sm:col-auto flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors shrink-0"
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
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" /> Add a band
              </button>
            </div>
          )}

          {/* The split: 100% flexible commercial negotiation toolkit */}
          <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-4 shadow-sm">
            {/*
              How the money moves, as a choice rather than a checkbox.

              This was a tick box in the middle of a long form, and clearing it
              writes null to both share columns. That is how the one agreed deal
              on the system ended up at ₦8,000 per student with no split at all
              — a returns page that could never compute, and nothing anywhere
              saying why. Nobody chose that; they just did not notice a box.

              Two cards instead, each stating what it means for the money and
              what the document will then be able to say. A deal with no share
              is a legitimate shape, but it should be picked on purpose.
            */}
            <div>
              <span className="block text-sm font-bold text-foreground mb-2">
                How does the money reach us?
              </span>
              <div className="grid sm:grid-cols-2 gap-2">
                {[
                  {
                    on: true,
                    name: "Shared with the school",
                    blurb:
                      "The school bills parents and keeps an agreed percentage. The proposal can then show what the partnership earns them.",
                  },
                  {
                    on: false,
                    name: "A flat fee the school pays",
                    blurb:
                      "No percentage split. The returns page cannot show what they earn, because on this shape they do not earn a share.",
                  },
                ].map((choice) => {
                  const active = draft.revenueShare === choice.on;
                  return (
                    <button
                      key={String(choice.on)}
                      type="button"
                      onClick={() => set("revenueShare", choice.on)}
                      className={`text-left p-3 rounded-xl border transition-colors ${
                        active
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-border hover:border-foreground/30"
                      }`}
                    >
                      <span className="block text-xs font-bold text-foreground">{choice.name}</span>
                      <span className="block text-[11px] text-muted-foreground mt-1 leading-snug">
                        {choice.blurb}
                      </span>
                    </button>
                  );
                })}
              </div>
              {!draft.revenueShare && (
                <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                  With no share recorded, the proposal drops the returns page workings — the sheet a
                  head teacher rereads. Choose this only if the school genuinely pays a flat fee.
                </p>
              )}
            </div>

            {draft.revenueShare ? (
              <div className="space-y-3.5 pt-1">
                {/* 1-Tap Negotiated Presets */}
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block mb-1.5">
                    Negotiation Quick Presets
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {[
                      { rillcod: 70, school: 30, label: "70 / 30 Standard", tag: "Recommended" },
                      { rillcod: 60, school: 40, label: "60 / 40 Partner Upside", tag: "High Volume" },
                      { rillcod: 65, school: 35, label: "65 / 35 Balanced", tag: "Strategic" },
                      { rillcod: 50, school: 50, label: "50 / 50 Joint Venture", tag: "Lab Partner" },
                      { rillcod: 75, school: 25, label: "75 / 25 Hardware Plus", tag: "Heavy Kit" },
                      { rillcod: 80, school: 20, label: "80 / 20 Fully Managed", tag: "Turnkey" },
                    ].map((preset) => {
                      const isSelected = num(draft.rillcod_share_percent) === preset.rillcod;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => set("rillcod_share_percent", String(preset.rillcod))}
                          className={`p-2 rounded-xl border text-left transition-all ${
                            isSelected
                              ? "bg-emerald-500/15 border-emerald-500 text-emerald-400 shadow-sm"
                              : "bg-muted/30 border-border/80 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span>{preset.label}</span>
                          </div>
                          <span className="text-[9.5px] opacity-75 block">{preset.tag}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Visual Ratio Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-emerald-400">
                      Rillcod: {Number.isFinite(rillcodShare) ? rillcodShare : 0}%
                    </span>
                    <span className="text-cyan-400">
                      School: {Number.isFinite(schoolShare) ? schoolShare : 0}%
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-800 border border-slate-700 overflow-hidden flex">
                    <div
                      className="bg-gradient-to-r from-emerald-600 to-teal-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, rillcodShare || 70))}%` }}
                    />
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-300 flex-1"
                    />
                  </div>
                </div>

                {/* Fine-Tuning Numeric Input & Slider */}
                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <div className="w-36">
                    <label className={LABEL} htmlFor="rillcod-share">
                      Rillcod %
                    </label>
                    <div className="relative">
                      <input
                        id="rillcod-share"
                        className={INPUT}
                        inputMode="numeric"
                        value={draft.rillcod_share_percent}
                        onChange={(e) => set("rillcod_share_percent", e.target.value)}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-[180px]">
                    <label className={LABEL}>Adjust Negotiated Ratio</label>
                    <input
                      type="range"
                      min={50}
                      max={100}
                      step={1}
                      value={Number.isFinite(rillcodShare) ? rillcodShare : 70}
                      onChange={(e) => set("rillcod_share_percent", e.target.value)}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[11.5px] text-amber-300/90 leading-relaxed bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
                Flat Rate Deal: 100% of the quoted tuition/package fee is retained by Rillcod Technologies. No revenue settlement is paid back to the school.
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

          {/*
            Settlement: the three questions the proposal's money page raises.

            Pre-filled with what we recommend rather than left blank, because
            four empty fields are the same work as writing the clause and would
            simply stay empty — which is how the proposal ended up silent on
            when a school actually gets paid. Whatever is set here prints on the
            proposal; nothing prints until it is saved.
          */}
          <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground">How and when the school is paid</h4>
              <p className="text-[11px] text-muted-foreground mt-1">
                Pre-filled with what we recommend. Change anything that is not what you agreed —
                these sentences print on the proposal exactly as set here.
              </p>
            </div>

            <div>
              <span className={LABEL}>When their share is released</span>
              <div className="grid sm:grid-cols-2 gap-2">
                {SETTLEMENT_SHAPES.map((shape) => {
                  const active = draft.settlement_trigger === shape.value;
                  return (
                    <button
                      key={shape.value}
                      type="button"
                      onClick={() => set("settlement_trigger", shape.value)}
                      className={`text-left p-3 rounded-xl border transition-colors ${
                        active
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-border hover:border-foreground/30"
                      }`}
                    >
                      <span className="block text-xs font-bold text-foreground">{shape.name}</span>
                      <span className="block text-[11px] text-muted-foreground mt-1 leading-snug">
                        {shape.blurb}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL} htmlFor="terms-settle-days">
                  Paid within (days)
                </label>
                <input
                  id="terms-settle-days"
                  className={INPUT}
                  inputMode="numeric"
                  placeholder="14"
                  value={draft.settlement_days}
                  onChange={(e) => set("settlement_days", e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="terms-min-students">
                  Re-scope below (students)
                </label>
                <input
                  id="terms-min-students"
                  className={INPUT}
                  inputMode="numeric"
                  placeholder="40"
                  value={draft.minimum_students}
                  onChange={(e) => set("minimum_students", e.target.value)}
                />
              </div>
            </div>

            <div>
              <span className={LABEL}>If a learner withdraws mid-term</span>
              <div className="grid sm:grid-cols-3 gap-2">
                {WITHDRAWAL_SHAPES.map((shape) => {
                  const active = draft.withdrawal_policy === shape.value;
                  return (
                    <button
                      key={shape.value}
                      type="button"
                      onClick={() => set("withdrawal_policy", shape.value)}
                      className={`text-left p-3 rounded-xl border transition-colors ${
                        active
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-border hover:border-foreground/30"
                      }`}
                    >
                      <span className="block text-xs font-bold text-foreground">{shape.name}</span>
                      <span className="block text-[11px] text-muted-foreground mt-1 leading-snug">
                        {shape.blurb}
                      </span>
                    </button>
                  );
                })}
              </div>
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
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              {draft.status === "agreed"
                ? agreed
                  ? `Saving supersedes version ${agreed.version ?? 1}. The old terms are kept — a signed agreement was signed against them.`
                  : "Only agreed terms are billed against, and an MoU can only be issued once they exist."
                : "Drafts and proposals are kept as history. Neither is billed against."}
            </p>
          </div>

          {(error || problem) && (
            <p className="text-xs text-destructive flex items-start gap-2">
              <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-px" />
              {error || problem}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving || !!problem}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground transition-colors flex items-center gap-2"
            >
              {saving && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
              {draft.status === "agreed" && agreed ? "Supersede terms" : "Record terms"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Negotiation in progress — neither billed against nor kept on principle */}
      {unagreed.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Not agreed
          </p>
          <ul className="space-y-2">
            {unagreed.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 text-[11px] text-muted-foreground border border-border rounded-xl px-3 py-2"
              >
                <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-semibold uppercase tracking-wider shrink-0">
                  {t.status}
                </span>
                <span className="flex-1 min-w-0 truncate">{t.summary || "—"}</span>
                {canWrite && (
                  <button
                    onClick={() => discard(t.id)}
                    aria-label="Delete these unagreed terms"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors shrink-0"
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
          <summary className="text-xs text-muted-foreground hover:text-muted-foreground cursor-pointer transition-colors">
            {superseded.length} superseded {superseded.length === 1 ? "version" : "versions"}
          </summary>
          <ul className="mt-3 space-y-2">
            {superseded.map((t) => (
              <li
                key={t.id}
                className="text-[11px] text-muted-foreground border-l-2 border-border pl-3 py-1"
              >
                <span className="text-foreground/80">v{t.version ?? 1}</span> · {t.summary || "—"}
                {t.effective_to && <span className="text-muted-foreground"> · ended {t.effective_to}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
