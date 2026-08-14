"use client";

/**
 * Composing the document before it is issued.
 *
 * Two kinds, and the difference is not cosmetic. A proposal is what you send to
 * get to a rate, so it issues with or without agreed terms and its pitch may be
 * tailored by the AI engine. An MoU is the agreement itself: it requires agreed
 * terms, and no part of it is ever generated — a contract states what was signed,
 * not what a model thought would read well.
 *
 * Issuing renders and stores in one step, so the preview shown here is the
 * document that was archived, under the reference the database assigned.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  ClipboardDocumentCheckIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from "@/lib/icons";
import { PARTNERSHIP_OFFERS, offerPriceLabel } from "@/lib/partnerships/offers";
import { termDisplay, useAcademicTerms } from "./useAcademicTerms";
import type { DocumentKind, IssuedDocument, SchoolRow, TermsRow } from "./types";

const INPUT =
  "w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/60 transition-colors";
const LABEL = "block text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-2";

export function PartnershipDocumentComposer({
  school,
  agreed,
  canWrite,
  onIssued,
}: {
  school: SchoolRow;
  agreed: TermsRow | null;
  canWrite: boolean;
  onIssued: (doc: IssuedDocument) => void | Promise<void>;
}) {
  const [kind, setKind] = useState<DocumentKind>("proposal");
  const [offerCode, setOfferCode] = useState<string>("");
  const [stage, setStage] = useState<"primary" | "secondary" | "both">("both");
  const [useAI, setUseAI] = useState(false);
  const [validityDays, setValidityDays] = useState("90");
  const [notes, setNotes] = useState("");
  const [commencementTermId, setCommencementTermId] = useState("");
  const [commencement, setCommencement] = useState("");
  const [durationLabel, setDurationLabel] = useState("");
  const [students, setStudents] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState("");
  const { terms: academicTerms, current: currentTerm } = useAcademicTerms();

  // A new school resets the composer — a commencement date typed for one school
  // has no business riding along to the next.
  useEffect(() => {
    setKind("proposal");
    setOfferCode("");
    setStage("both");
    setUseAI(false);
    setValidityDays("90");
    setNotes("");
    setCommencementTermId("");
    setCommencement("");
    setDurationLabel("");
    setStudents(school.student_count ? String(school.student_count) : "");
    setError("");
  }, [school.id, school.student_count]);

  const selectedOffer = useMemo(
    () => PARTNERSHIP_OFFERS.find((o) => o.code === offerCode) ?? null,
    [offerCode],
  );

  // An MoU without agreed terms has no fee to state. The API refuses it with a
  // 409; the button refuses it here so nobody has to read a failure to find out.
  const mouBlocked = kind === "mou" && !agreed;

  async function issue() {
    setIssuing(true);
    setError("");
    try {
      const res = await fetch("/api/partnerships/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_id: school.id,
          kind,
          // Generation is for the pitch of a proposal and nothing else.
          use_ai: kind === "proposal" && useAI,
          // The curriculum is trimmed by the years an offer covers, so the scope
          // sentence is what the renderer needs — not the option's code.
          scope_to_offer: kind === "proposal" ? (selectedOffer?.scope ?? null) : null,
          stage,
          notes: kind === "proposal" ? notes.trim() || null : null,
          validity_days: kind === "proposal" ? Number(validityDays) : null,
          commencement: kind === "mou" ? commencement.trim() || null : null,
          duration_label: kind === "mou" ? durationLabel.trim() || null : null,
          illustrative_students: kind === "mou" ? Number(students) || undefined : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not issue the document.");
      await onIssued(json as IssuedDocument);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue the document.");
    } finally {
      setIssuing(false);
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-white">Issue a document</h2>
        <p className="text-xs text-white/50 mt-1">
          Rendered and archived in one step, under a reference the database assigns.
        </p>
      </div>

      {/* Applies to both kinds: a primary school should not read the SS years,
          and an MoU must not annex years we are not contracting to teach. */}
      <div>
        <span className={LABEL}>Which years does this school run?</span>
        <div className="grid sm:grid-cols-3 gap-2">
          {(
            [
              { v: "both", name: "Primary & secondary", hint: "All twelve years" },
              { v: "primary", name: "Primary only", hint: "Basic 1 to Basic 6" },
              { v: "secondary", name: "Secondary only", hint: "JSS 1 to SS 3" },
            ] as const
          ).map((s) => (
            <button
              key={s.v}
              type="button"
              onClick={() => setStage(s.v)}
              className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                stage === s.v
                  ? "border-violet-500/60 bg-violet-500/10 text-white"
                  : "border-white/10 bg-white/5 text-white/60 hover:border-white/20"
              }`}
            >
              {s.name}
              <span className="block text-[11px] text-white/40 mt-0.5">{s.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setKind("proposal")}
          className={`text-left p-4 rounded-xl border transition-colors ${
            kind === "proposal"
              ? "border-violet-500/60 bg-violet-500/10"
              : "border-white/10 bg-white/5 hover:border-white/20"
          }`}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <DocumentTextIcon className="w-4 h-4" /> Proposal
          </span>
          <span className="block text-[11px] text-white/45 mt-1.5 leading-snug">
            The pitch and the standard options. Send this to get to a rate — no agreed terms
            needed.
          </span>
        </button>
        <button
          type="button"
          onClick={() => setKind("mou")}
          className={`text-left p-4 rounded-xl border transition-colors ${
            kind === "mou"
              ? "border-violet-500/60 bg-violet-500/10"
              : "border-white/10 bg-white/5 hover:border-white/20"
          }`}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardDocumentCheckIcon className="w-4 h-4" /> Memorandum of Understanding
          </span>
          <span className="block text-[11px] text-white/45 mt-1.5 leading-snug">
            The agreement itself, stating the agreed fee. Requires terms on record.
          </span>
        </button>
      </div>

      {kind === "proposal" ? (
        <div className="space-y-4">
          <div>
            <span className={LABEL}>Scope the quote to an option</span>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setOfferCode("")}
                className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                  offerCode === ""
                    ? "border-violet-500/60 bg-violet-500/10 text-white"
                    : "border-white/10 bg-white/5 text-white/60 hover:border-white/20"
                }`}
              >
                All twelve years
                <span className="block text-[11px] text-white/40 mt-0.5">
                  Present the full ladder, Basic 1 to SS 3, with every option priced.
                </span>
              </button>
              {PARTNERSHIP_OFFERS.map((offer) => (
                <button
                  key={offer.code}
                  type="button"
                  onClick={() => setOfferCode(offer.code)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                    offerCode === offer.code
                      ? "border-violet-500/60 bg-violet-500/10 text-white"
                      : "border-white/10 bg-white/5 text-white/60 hover:border-white/20"
                  }`}
                >
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">Option {offer.code}</span>
                    <span>{offer.name}</span>
                  </span>
                  <span className="block text-[11px] text-white/40 mt-0.5">
                    {offer.scope} · {offerPriceLabel(offer)}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/35 mt-2">
              Scoping trims the printed years to what the option actually sells, so a quote does
              not promise a year it stops short of.
            </p>
          </div>

          <div className="sm:w-1/2">
            <label className={LABEL} htmlFor="validity-days">
              Fees stand for
            </label>
            <select
              id="validity-days"
              className={INPUT}
              value={validityDays}
              onChange={(e) => setValidityDays(e.target.value)}
            >
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="0">No expiry stated</option>
            </select>
            <p className="text-[11px] text-white/35 mt-2">
              Printed as a date on the cover. A quote with no expiry is a quote forever, and these
              are the fees the MoU and then the invoice inherit.
            </p>
          </div>

          <div>
            <label className={LABEL} htmlFor="proposal-notes">
              Context for the pitch (optional)
            </label>
            <textarea
              id="proposal-notes"
              rows={2}
              className={INPUT}
              placeholder="Anything you know that the database does not — who you met, what they worried about."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-white/10 bg-white/5 p-4">
            <input
              type="checkbox"
              checked={useAI}
              onChange={(e) => setUseAI(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-violet-600"
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-white">
                <SparklesIcon className="w-3.5 h-3.5 text-violet-400" />
                Tailor the pitch with AI
              </span>
              <span className="block text-[11px] text-white/45 mt-1 leading-relaxed">
                Rewrites the opening and benefits for this school only. Fees, the split and the
                curriculum always come from the record — generated text stating a price is
                discarded, and any failure falls back to the authored copy.
              </span>
            </span>
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL} htmlFor="commencement-term">
                Takes effect from
              </label>
              <select
                id="commencement-term"
                className={INPUT}
                value={commencementTermId}
                onChange={(e) => {
                  const id = e.target.value;
                  setCommencementTermId(id);
                  // Dating the agreement off the academic calendar, not off
                  // whatever somebody remembers the next term is called.
                  const picked = academicTerms.find((t) => t.id === id);
                  setCommencement(picked ? termDisplay(picked) : "");
                }}
              >
                <option value="">The next academic term</option>
                {academicTerms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {termDisplay(t)}
                    {t.is_current ? " — current" : ""}
                  </option>
                ))}
              </select>
              {!commencementTermId && (
                <p className="text-[11px] text-white/35 mt-2">
                  {currentTerm
                    ? `Currently ${termDisplay(currentTerm)}. Pick a session to name it exactly.`
                    : "Leave as is to word it generally."}
                </p>
              )}
            </div>
            <div>
              <label className={LABEL} htmlFor="duration">
                For a period of
              </label>
              <input
                id="duration"
                className={INPUT}
                placeholder="one academic session"
                value={durationLabel}
                onChange={(e) => setDurationLabel(e.target.value)}
              />
            </div>
          </div>
          <div className="sm:w-1/2">
            <label className={LABEL} htmlFor="illustrative-students">
              Worked example at
            </label>
            <input
              id="illustrative-students"
              className={INPUT}
              inputMode="numeric"
              placeholder="students enrolled"
              value={students}
              onChange={(e) => setStudents(e.target.value)}
            />
            <p className="text-[11px] text-white/35 mt-2">
              Used only to work the agreed fee through to a figure both sides can check. Defaults
              to the school’s roll.
            </p>
          </div>

          <p className="text-[11px] text-white/40 leading-relaxed border-l-2 border-white/10 pl-3">
            No part of an MoU is generated. It states the terms on record and nothing else.
          </p>
        </div>
      )}

      {mouBlocked && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-white/70 leading-relaxed">
            {school.name} has no agreed terms, so there is no fee for an MoU to state. Record the
            terms above, or issue a proposal instead.
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 flex items-start gap-2">
          <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-px" />
          {error}
        </p>
      )}

      {canWrite ? (
        <button
          onClick={issue}
          disabled={issuing || mouBlocked}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex items-center gap-2"
        >
          {issuing ? (
            <ArrowPathIcon className="w-4 h-4 animate-spin" />
          ) : (
            <DocumentTextIcon className="w-4 h-4" />
          )}
          {issuing
            ? "Issuing…"
            : `Issue ${kind === "mou" ? "MoU" : "proposal"} for ${school.name}`}
        </button>
      ) : (
        <p className="text-xs text-white/40">
          Issuing a document is an admin action. You are viewing this in read-only.
        </p>
      )}
    </div>
  );
}
