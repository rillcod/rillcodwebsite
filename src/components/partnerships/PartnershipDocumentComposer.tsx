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
  EyeIcon,
  SparklesIcon,
  CheckCircleIcon,
} from "@/lib/icons";
import { PARTNERSHIP_OFFERS, offerPriceLabel } from "@/lib/partnerships/offers";
import { describeTerms } from "@/lib/partnerships/terms";
import { OFFERABLE_SCHOOL_SHARES, STANDARD_SCHOOL_SHARE_PERCENT } from "@/lib/partnerships/split";
import { termDisplay, useAcademicTerms } from "./useAcademicTerms";
import type { DocumentKind, IssuedDocument, SchoolRow, TermsRow } from "./types";
import type { ProposalStudioConfig } from "@/lib/partnerships/studio-config";
import type { ProposalNarrative } from "@/lib/partnerships/proposal-narrative";

const INPUT =
  "w-full px-4 py-2.5 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors";
const LABEL = "block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2";

export function PartnershipDocumentComposer({
  school,
  agreed,
  canWrite,
  onIssued,
  onPreview,
  onRecordTerms,
  studio,
  kind,
  onKindChange,
}: {
  school: SchoolRow;
  agreed: TermsRow | null;
  canWrite: boolean;
  onIssued: (doc: IssuedDocument) => void | Promise<void>;
  /** Renders without storing, so nothing is committed before it is read. */
  onPreview: (doc: IssuedDocument) => void | Promise<void>;
  /** Opens the terms editor, so a blocked MoU has somewhere to go. */
  onRecordTerms: () => void;
  /** What the studio decided prints. Sent with preview and issue alike. */
  studio?: ProposalStudioConfig | null;
  /*
    Which document is being written — owned by the workspace, not by this form.

    An MoU needs agreed terms, so the one journey this component exists to
    support is: choose MoU, discover there is no rate, go and record one, come
    back and issue it. This panel is unmounted while the terms tab is open, so
    when `kind` lived in here that round trip silently threw the choice away and
    returned the user to "Proposal" — having just recorded terms for the MoU
    they wanted. Held one level up, the choice survives the trip.
  */
  kind: DocumentKind;
  onKindChange: (kind: DocumentKind) => void;
}) {
  const setKind = onKindChange;
  const [offerCode, setOfferCode] = useState<string>("");
  const [stage, setStage] = useState<"primary" | "secondary" | "both">("both");
  const [useAI, setUseAI] = useState(false);
  /*
    The exact copy the last preview rendered, held so Issue can reuse it.

    Null means "generate at issue", which is right for a document nobody has
    previewed and right again the moment a setting changes: copy generated
    against a different school, a different stage or different notes is not the
    copy this proposal should carry, and reusing it would be a subtler version
    of the bug this exists to fix.
  */
  const [approvedNarrative, setApprovedNarrative] = useState<ProposalNarrative | null>(null);
  const [validityDays, setValidityDays] = useState("90");
  const [notes, setNotes] = useState("");
  const [proposedSchoolShare, setProposedSchoolShare] = useState(String(STANDARD_SCHOOL_SHARE_PERCENT));
  const [commencementTermId, setCommencementTermId] = useState("");
  const [commencement, setCommencement] = useState("");
  const [durationLabel, setDurationLabel] = useState("");
  const [students, setStudents] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(school.email || "");
  const [emailStatus, setEmailStatus] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");
  const { terms: academicTerms, current: currentTerm } = useAcademicTerms();

  /*
    A new school resets the composer — a commencement date typed for one school
    has no business riding along to the next.

    Keyed on the school and nothing else. `agreed` used to be in here, and it is
    a fresh object on every refetch: recording terms reloads the school, which
    handed this effect a new identity and wiped the form — the notes, the
    headcount, the commencement date — moments after the user had gone to record
    those very terms. The one field that legitimately follows the agreed rate is
    synced on its own below, off a primitive, so it cannot take the rest with it.
  */
  useEffect(() => {
    setOfferCode("");
    setStage("both");
    setUseAI(false);
    setValidityDays("90");
    setNotes("");
    setCommencementTermId("");
    setCommencement("");
    setDurationLabel("");
    setStudents(school.student_count ? String(school.student_count) : "");
    setRecipientEmail(school.email || "");
    setSendEmail(false);
    setEmailStatus("");
    setError("");
  }, [school.id, school.student_count, school.email]);

  /*
    Approved copy is thrown away the moment the brief behind it changes.

    The words were generated for one school, one stage, one set of notes. Change
    any of those and reusing them would issue a proposal arguing a case that is
    no longer the one being made — which is a quieter version of the bug the
    approved copy exists to prevent. Preview again and the new words are held.
  */
  useEffect(() => {
    setApprovedNarrative(null);
  }, [school.id, stage, notes, useAI, offerCode]);

  // The proposed split follows what was actually agreed, and only that. A
  // primitive dependency, so an unchanged rate re-fetched is not a change.
  useEffect(() => {
    setProposedSchoolShare(
      agreed?.school_share_percent != null
        ? String(agreed.school_share_percent)
        : String(STANDARD_SCHOOL_SHARE_PERCENT),
    );
  }, [agreed?.school_share_percent]);

  const selectedOffer = useMemo(
    () => PARTNERSHIP_OFFERS.find((o) => o.code === offerCode) ?? null,
    [offerCode],
  );

  // An MoU without agreed terms has no fee to state. The API refuses it with a
  // 409; the button refuses it here so nobody has to read a failure to find out.
  const mouBlocked = kind === "mou" && !agreed;

  function payload(preview: boolean) {
    return {
      school_id: school.id,
      kind,
      preview,
      use_ai: kind === 'proposal' && useAI,
      // The code, not the scope line. B1 and B2 share a scope word for word, so
      // sending it identified two options at once — and the proposal emphasised
      // both, which is the same as emphasising neither.
      scope_to_offer: kind === 'proposal' ? (selectedOffer?.code ?? null) : null,
      stage,
      notes: kind === 'proposal' ? notes.trim() || null : null,
      validity_days: kind === 'proposal' ? Number(validityDays) : null,
      proposed_school_share_percent: kind === 'proposal' ? Number(proposedSchoolShare) : null,
      commencement: kind === 'mou' ? commencement.trim() || null : null,
      duration_label: kind === 'mou' ? durationLabel.trim() || null : null,
      illustrative_students: kind === 'mou' ? Number(students) || undefined : undefined,
      send_email: !preview && sendEmail,
      recipient_email: !preview && sendEmail ? recipientEmail.trim() : null,
      // The same settings on both paths, so what was previewed is what issues.
      studio: kind === 'proposal' ? studio : null,
      /*
        The copy the last preview came back with, sent so the issue prints it.

        With "tailor with AI" ticked, preview and issue each called the model —
        two generations of the opening, the four benefits and the closing, of
        which only the first was ever read. You approved one proposal and the
        school received another, with no way to notice.

        Cleared whenever a setting that changes the pitch changes, so a stale
        generation cannot outlive the preview it belongs to.
      */
      narrative: preview ? null : approvedNarrative,
    };
  }

  /** Render it without keeping it, so the whole thing can be read first. */
  async function preview() {
    setPreviewing(true);
    setError('');
    try {
      const res = await fetch('/api/partnerships/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload(true)),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not build the preview.');
      // Hold the words that were just rendered, so Issue prints these and not a
      // second, different generation of them.
      setApprovedNarrative(json?.narrative ?? null);
      await onPreview(json as IssuedDocument);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the preview.');
    } finally {
      setPreviewing(false);
    }
  }

  async function issue() {
    setIssuing(true);
    setError("");
    try {
      const res = await fetch("/api/partnerships/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(false)),
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
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Issue a document</h2>
        <p className="text-xs text-muted-foreground mt-1">
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
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-muted/40 text-muted-foreground hover:border-foreground/30"
              }`}
            >
              {s.name}
              <span className="block text-[11px] text-muted-foreground mt-0.5">{s.hint}</span>
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
              ? "border-primary bg-primary/10"
              : "border-border bg-muted/40 hover:border-foreground/30"
          }`}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <DocumentTextIcon className="w-4 h-4" /> Proposal
          </span>
          <span className="block text-[11px] text-muted-foreground mt-1.5 leading-snug">
            The pitch and the standard options. Send this to get to a rate — no agreed terms
            needed.
          </span>
        </button>
        <button
          type="button"
          onClick={() => setKind("mou")}
          className={`text-left p-4 rounded-xl border transition-colors ${
            kind === "mou"
              ? "border-primary bg-primary/10"
              : "border-border bg-muted/40 hover:border-foreground/30"
          }`}
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ClipboardDocumentCheckIcon className="w-4 h-4" /> Memorandum of Understanding
          </span>
          <span className="block text-[11px] text-muted-foreground mt-1.5 leading-snug">
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
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-muted/40 text-muted-foreground hover:border-foreground/30"
                }`}
              >
                All twelve years
                <span className="block text-[11px] text-muted-foreground mt-0.5">
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
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">Option {offer.code}</span>
                    <span>{offer.name}</span>
                  </span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    {offer.scope} · {offerPriceLabel(offer)}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Scoping trims the printed years to what the option actually sells, so a quote does
              not promise a year it stops short of.
            </p>
          </div>

          {/* Proposed Commercial Split Selector for Proposal */}
          <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">
                Proposed Revenue Share to School
              </span>
              <span className="text-xs font-mono font-black text-cyan-400">
                School: {proposedSchoolShare}% · Rillcod: {100 - (Number(proposedSchoolShare) || 0)}%
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Quoted in the financial projections table. Nigerian schools can be offered standard 30%, or negotiated up to 40%/50% or down to 20%/25%.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
              {/* Derived from the split rule, not typed out here: a hardcoded list
                  eventually gains an option the rule forbids. */}
              {OFFERABLE_SCHOOL_SHARES.map((p) => {
                const isSelected = proposedSchoolShare === String(p.school);
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setProposedSchoolShare(String(p.school))}
                    className={`p-2 rounded-xl border text-xs font-bold text-left transition-all ${
                      isSelected
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-400"
                        : "bg-muted/30 border-border/80 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
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
            <p className="text-[11px] text-muted-foreground mt-2">
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

          <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-border bg-muted/40 p-4">
            <input
              type="checkbox"
              checked={useAI}
              onChange={(e) => setUseAI(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-primary"
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <SparklesIcon className="w-3.5 h-3.5 text-primary" />
                Tailor the pitch with AI
              </span>
              <span className="block text-[11px] text-muted-foreground mt-1 leading-relaxed">
                Rewrites the opening and benefits for this school only. Fees, the split and the
                curriculum always come from the record — generated text stating a price is
                discarded, and any failure falls back to the authored copy.
              </span>
            </span>
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active Agreed Terms Banner for MoU */}
          {agreed && (
            <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-4 space-y-2 shadow-md">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                  <CheckCircleIcon className="w-4 h-4 text-cyan-400" />
                  Agreed Commercial Deal on Record
                </span>
                <button
                  type="button"
                  onClick={onRecordTerms}
                  className="px-2.5 py-1 rounded-lg border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-[11px] font-bold transition-all"
                  title="Negotiate different split or rates for this MoU"
                >
                  ⚙️ Renegotiate / Adjust Split
                </button>
              </div>
              <p className="text-xs text-slate-200 font-semibold">
                {describeTerms(agreed)}
              </p>
              <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1 border-t border-white/5">
                <span>
                  Split:{" "}
                  <strong className="text-emerald-400">
                    {agreed.rillcod_share_percent ? `${agreed.rillcod_share_percent}% Rillcod` : "100% Flat"}
                  </strong>
                  {" / "}
                  <strong className="text-cyan-400">
                    {agreed.school_share_percent ? `${agreed.school_share_percent}% School` : "0%"}
                  </strong>
                </span>
                <span>Billing: {agreed.billing_cycle || "Termly"}</span>
              </div>
            </div>
          )}

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
                <p className="text-[11px] text-muted-foreground mt-2">
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
            <p className="text-[11px] text-muted-foreground mt-2">
              Used only to work the agreed fee through to a figure both sides can check. Defaults
              to the school’s roll.
            </p>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed border-l-2 border-border pl-3">
            No part of an MoU is generated. It states the terms on record and nothing else.
          </p>
        </div>
      )}

      {mouBlocked && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                One step first: what did {school.name} agree to pay?
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                An MoU is the agreement, so it has to state a fee — and the fee it states is the one
                the invoice will charge. Record the terms and this unlocks immediately. It takes
                about a minute.
              </p>
              {/* The guard stays; the dead end does not. Sending somebody away to
                  find another form is how a correct rule reads as an obstacle. */}
              <button
                type="button"
                onClick={onRecordTerms}
                className="mt-3 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-colors"
              >
                Record the agreed terms
              </button>
              {/* Says where they come back to, so the detour reads as one step
                  in a sequence rather than a redirect to somewhere else. */}
              <p className="text-[11px] text-muted-foreground mt-2">
                You will come straight back here to issue the MoU.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Direct Email Delivery Option */}
      <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-950/20 via-slate-900/40 to-slate-900/80 p-4 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary"
          />
          <div className="min-w-0">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span>📧 Email document directly to school contact upon issue</span>
              <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 text-[10px] font-mono font-semibold">
                Resend + SendPulse
              </span>
            </span>
            <p className="text-[11px] text-muted-foreground">
              Dispatches the executive email containing the verified review link immediately upon issuing.
            </p>
          </div>
        </label>

        {sendEmail && (
          <div className="pt-2 border-t border-border/50">
            <label className={LABEL} htmlFor="composer-recipient-email">
              Recipient Email Address
            </label>
            <input
              id="composer-recipient-email"
              type="email"
              className={INPUT}
              placeholder="e.g. principal@school.edu.ng, proprietor@gmail.com"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
            />
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive flex items-start gap-2">
          <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-px" />
          {error}
        </p>
      )}

      {canWrite ? (
        /*
          The two actions stay on screen instead of waiting at the bottom.

          This form is long — kind, offer, stage, split, headcount, commencement,
          notes, recipient — and "Preview MoU" sat under all of it. On a phone
          that is several screens of scrolling to reach the button the whole
          panel exists to serve, and after each edit you scroll down again to see
          the result. Pinned to the bottom of the panel, the document is always
          one tap away, which is what makes previewing before issuing a habit
          rather than an effort.

          Mobile only, and deliberately so. On desktop the preview renders in
          this same column directly beneath the panel, so a bar pinned to the
          viewport would sit on top of the document it just produced — the one
          thing the user is now trying to read. There it returns to normal flow,
          where a wider screen already keeps the actions in reach.

          On mobile it clears the dashboard's own bottom bar, and the negative
          margins let it span the panel's padding so the blur reaches both edges.
        */
        <div className="space-y-2.5 sticky md:static bottom-[var(--app-bottom-nav-height)] z-30 -mx-6 -mb-6 md:mx-0 md:mb-0 px-6 md:px-0 pt-3 pb-4 md:pb-0 border-t border-border/60 bg-card/95 md:bg-transparent backdrop-blur-xl md:backdrop-blur-none rounded-b-2xl md:rounded-none">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Read it first. Issuing consumes a reference and writes a row, and
                both are meant to be permanent — so the preview comes first and
                the commitment second. */}
            <button
              onClick={preview}
              disabled={previewing || issuing || mouBlocked}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl text-xs sm:text-sm font-black bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground shadow-lg shadow-violet-950/30 transition-all flex items-center justify-center gap-2 min-h-[44px] cursor-pointer"
            >
              {previewing ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <EyeIcon className="w-4 h-4" />
              )}
              <span>{previewing ? "Building Preview…" : `Preview ${kind === "mou" ? "MoU" : "Proposal"}`}</span>
            </button>

            <button
              onClick={issue}
              disabled={issuing || previewing || mouBlocked}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl text-xs sm:text-sm font-black border border-border bg-card text-foreground/90 hover:text-foreground hover:bg-muted/70 hover:border-emerald-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 min-h-[44px] cursor-pointer"
            >
              {issuing ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <DocumentTextIcon className="w-4 h-4 text-emerald-400" />
              )}
              <span>
                {issuing
                  ? "Issuing Official Record…"
                  : sendEmail
                  ? `Issue & Email to ${recipientEmail || "School"}`
                  : "Issue & Save Official Copy"}
              </span>
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            💡 Previewing generates a live document without saving. Issuing stores it permanently under a sequential reference.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-xl">
          Issuing a document is an admin action. You are viewing this in read-only mode.
        </p>
      )}
    </div>
  );
}
