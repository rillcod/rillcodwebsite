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

import { useEffect, useImperativeHandle, useMemo, useState, forwardRef } from "react";
import {
  ArrowPathIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  CheckCircleIcon,
} from "@/lib/icons";
import { PARTNERSHIP_OFFERS, offerPriceLabel, recommendOffer } from "@/lib/partnerships/offers";
import { describeTerms } from "@/lib/partnerships/terms";
import { OFFERABLE_SCHOOL_SHARES, STANDARD_SCHOOL_SHARE_PERCENT } from "@/lib/partnerships/split";
import { liveDocumentOfKind } from "@/lib/partnerships/next-action";
import { termDisplay, useAcademicTerms } from "./useAcademicTerms";
import type { DocumentKind, IssuedDocument, IssuedDocumentRow, SchoolRow, TermsRow } from "./types";
import type { ProposalStudioConfig } from "@/lib/partnerships/studio-config";
import type { ProposalNarrative } from "@/lib/partnerships/proposal-narrative";
import { canDeletePartnershipDocument } from "@/lib/partnerships/document-discard";
import { removePartnershipDocument } from "./PartnershipDocumentArchive";
import { PartnershipConfirm } from "./PartnershipConfirm";

const INPUT =
  "w-full px-4 py-2.5 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors";
const LABEL = "block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2";

export type ComposerRedrawPayload = {
  use_ai: boolean;
  scope_to_offer: string | null;
  stage: "primary" | "secondary" | "both" | null;
  notes: string | null;
  validity_days: number | null;
  proposed_school_share_percent: number | null;
  commencement: string | null;
  duration_label: string | null;
  illustrative_students: number | undefined;
  studio: ProposalStudioConfig | null;
  narrative: ProposalNarrative | null;
};

export type ComposerHandle = {
  getRedrawPayload: () => ComposerRedrawPayload;
};

type ComposerProps = {
  school: SchoolRow;
  agreed: TermsRow | null;
  canWrite: boolean;
  onIssued: (doc: IssuedDocument) => void | Promise<void>;
  onPreview: (doc: IssuedDocument) => void | Promise<void>;
  onRecordTerms: () => void;
  studio?: ProposalStudioConfig | null;
  kind: DocumentKind;
  documents?: IssuedDocumentRow[];
  /** Open the live draft/sent copy instead of writing a second one. */
  onOpenLive?: (doc: IssuedDocumentRow) => void;
  /** After discarding the live copy from this panel. */
  onLiveDiscarded?: () => void | Promise<void>;
};

export const PartnershipDocumentComposer = forwardRef<ComposerHandle, ComposerProps>(
  function PartnershipDocumentComposer(
    {
      school,
      agreed,
      canWrite,
      onIssued,
      onPreview,
      onRecordTerms,
      studio,
      kind,
      documents = [],
      onOpenLive,
      onLiveDiscarded,
    },
    ref,
  ) {
  const [offerCode, setOfferCode] = useState<string>("");
  const [offerTouched, setOfferTouched] = useState(false);
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
  const [recipientEmail, setRecipientEmail] = useState(school.email || "");
  const [issuing, setIssuing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
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
    const rec = recommendOffer({ studentCount: school.student_count, stage: "both" });
    setOfferCode(rec.offer.code);
    setOfferTouched(false);
    setStage("both");
    setUseAI(false);
    setValidityDays("90");
    setNotes("");
    setCommencementTermId("");
    setCommencement("");
    setDurationLabel("");
    setStudents(school.student_count ? String(school.student_count) : "");
    setRecipientEmail(school.email || "");
    setError("");
  }, [school.id]);

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

  const recommendation = useMemo(
    () =>
      recommendOffer({
        studentCount: Number(students) || school.student_count,
        stage,
      }),
    [students, school.student_count, stage],
  );

  useEffect(() => {
    if (offerTouched) return;
    setOfferCode(recommendation.offer.code);
  }, [recommendation.offer.code, offerTouched]);

  const liveQuote = useMemo(
    () => liveDocumentOfKind(documents, kind),
    [documents, kind],
  );

  const liveRow = useMemo(
    () =>
      documents.find(
        (d) =>
          d.document_kind === kind &&
          (d.id === liveQuote?.id || d.reference === liveQuote?.reference),
      ) ?? null,
    [documents, kind, liveQuote],
  );

  async function discardLive() {
    if (!liveRow || !canDeletePartnershipDocument(liveRow)) return;
    setDiscarding(true);
    setError("");
    try {
      await removePartnershipDocument(liveRow);
      setAskDiscard(false);
      await onLiveDiscarded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not discard that copy.");
    } finally {
      setDiscarding(false);
    }
  }

  /**
   * What this proposal cannot say yet, and what each omission costs it.
   *
   * Every one of these silently thins the money page — the sheet a head
   * teacher rereads — and none of them raised anything anywhere before now.
   */
  const gaps = useMemo(() => {
    if (kind !== 'proposal') return [];
    const missing: string[] = [];
    if (!Number(students) && !school.student_count) {
      missing.push('No enrolment for this school, so the uptake table shows illustrative sizes instead of theirs.');
    }
    if (stage === 'primary' && offerCode === 'B2') {
      missing.push('Option B2 assumes SS capstone years, and this school is scoped to primary only.');
    }
    if (offerCode === 'A' && (stage === 'both' || !stage)) {
      missing.push('Option A stops at SS 2, so this quote will not include SS 3.');
    }
    return missing;
  }, [kind, students, school.student_count, stage, offerCode]);

  // An MoU without agreed terms has no fee to state. The API refuses it with a
  // 409; the button refuses it here so nobody has to read a failure to find out.
  const mouBlocked = kind === "mou" && !agreed;

  function payload(preview: boolean, send = false) {
    return {
      school_id: school.id,
      kind,
      preview,
      use_ai: kind === 'proposal' && useAI,
      // The code, not the scope line. B1 and B2 share a scope word for word, so
      // sending it identified two options at once — and the proposal emphasised
      // both, which is the same as emphasising neither.
      scope_to_offer: kind === 'proposal' ? (selectedOffer?.code ?? '') : null,
      stage,
      notes: kind === 'proposal' ? notes.trim() || null : null,
      validity_days: kind === 'proposal' ? Number(validityDays) : null,
      proposed_school_share_percent: kind === 'proposal' ? Number(proposedSchoolShare) : null,
      commencement: kind === 'mou' ? commencement.trim() || null : null,
      duration_label: kind === 'mou' ? durationLabel.trim() || null : null,
      // A proposal uses it for the uptake scenarios on the money page; an MoU
      // uses it to work the agreed fee through to a checkable figure.
      illustrative_students: Number(students) || undefined,
      send_email: !preview && send,
      recipient_email: !preview && send ? recipientEmail.trim() : null,
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

  useImperativeHandle(ref, () => ({
    getRedrawPayload: () => {
      const p = payload(false);
      return {
        use_ai: p.use_ai,
        scope_to_offer: p.scope_to_offer,
        stage: p.stage,
        notes: p.notes,
        validity_days: p.validity_days,
        proposed_school_share_percent: p.proposed_school_share_percent,
        commencement: p.commencement,
        duration_label: p.duration_label,
        illustrative_students: p.illustrative_students,
        studio: p.studio ?? null,
        narrative: p.narrative,
      };
    },
  }));

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

  async function issue(send: boolean) {
    setIssuing(true);
    setError("");
    try {
      const res = await fetch("/api/partnerships/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(false, send)),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save the document.");
      await onIssued(json as IssuedDocument);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the document.");
    } finally {
      setIssuing(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          {kind === "mou" ? "Write the MoU" : "Write a proposal"}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {kind === "mou"
            ? "The agreement they sign. It states the rate already on record."
            : "Send this first. Record the deal only after they have read it and picked an option."}
        </p>
      </div>

      {liveQuote && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {liveQuote.reference ?? "A document"} is already here
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {kind === "proposal"
                  ? liveQuote.status === "draft"
                    ? "It is a draft — discard it and write another, or send this copy."
                    : "A proposal is not a contract. Discard it and issue another, or the new send will replace this one."
                  : liveQuote.status === "draft"
                    ? "It is a draft — the school cannot open it. Send that copy, or discard it and write another."
                    : "An unsigned MoU can be discarded and reissued. Sending a new one replaces this copy."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {onOpenLive && liveRow && (
                  <button
                    type="button"
                    onClick={() => onOpenLive(liveRow)}
                    className="inline-flex min-h-[44px] items-center px-4 rounded-xl bg-foreground text-background text-xs font-bold"
                  >
                    Open {liveQuote.reference ?? "it"}
                  </button>
                )}
                {canWrite && liveRow && canDeletePartnershipDocument(liveRow) && (
                  <button
                    type="button"
                    onClick={() => setAskDiscard(true)}
                    disabled={discarding}
                    className="inline-flex min-h-[44px] items-center px-4 rounded-xl border border-destructive/50 text-destructive bg-destructive/5 text-xs font-bold disabled:opacity-40"
                  >
                    Discard this {kind === "mou" ? "MoU" : "quote"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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

      {kind === "proposal" ? (
        <div className="space-y-4">
          <div className="sm:w-1/2">
            <label className={LABEL} htmlFor="proposal-roll">
              Their enrolment
            </label>
            <input
              id="proposal-roll"
              className={INPUT}
              inputMode="numeric"
              placeholder={school.student_count ? String(school.student_count) : "e.g. 420"}
              value={students}
              onChange={(e) => setStudents(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground mt-2">
              {school.student_count
                ? "Defaults to the roll on the school's record."
                : "This school has no roll on record — add it so the money page uses their numbers."}
            </p>
          </div>

          <div>
            <span className={LABEL}>Which option to put in front</span>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                setOfferTouched(true);
                setOfferCode("");
              }}
                className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                  offerCode === ""
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-muted/40 text-muted-foreground hover:border-foreground/30"
                }`}
              >
                Show every option equally
                <span className="block text-[11px] text-muted-foreground mt-0.5">
                  Price A, B1 and B2 without putting one in front.
                </span>
              </button>
              {PARTNERSHIP_OFFERS.map((offer) => (
                <button
                  key={offer.code}
                  type="button"
                  onClick={() => {
                    setOfferTouched(true);
                    setOfferCode(offer.code);
                  }}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                    offerCode === offer.code
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">Option {offer.code}</span>
                    <span>{offer.name}</span>
                    {recommendation.offer.code === offer.code && (
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-500">
                        Recommended
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    {offer.scope} · {offerPriceLabel(offer)}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              {recommendation.reason}
              {offerTouched && offerCode !== recommendation.offer.code
                ? " You have overridden that — the document will quote the option you picked."
                : " Override it if you know something the roll does not."}
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
            <label className="mt-3 flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-border"
                checked={useAI}
                onChange={(e) => setUseAI(e.target.checked)}
              />
              <span>
                <span className="text-sm font-semibold text-foreground">Tailor the pitch with AI</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  Preview first — the words you read are the words that issue. Notes above go into
                  the brief. Photographs and which pages print sit in the panel under this form.
                </span>
              </span>
            </label>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active Agreed Terms Banner for MoU */}
          {agreed && (
            <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                  Agreed deal on record
                </span>
                <button
                  type="button"
                  onClick={onRecordTerms}
                  className="px-2.5 py-1 rounded-lg border border-border hover:bg-muted text-foreground text-[11px] font-bold"
                >
                  Change
                </button>
              </div>
              <p className="text-xs text-foreground font-semibold">
                {describeTerms(agreed)}
              </p>
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground pt-1 border-t border-border/60">
                <span>
                  Split:{" "}
                  <strong className="text-foreground">
                    {agreed.rillcod_share_percent ? `${agreed.rillcod_share_percent}% Rillcod` : "100% Flat"}
                  </strong>
                  {" / "}
                  <strong className="text-foreground">
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

      {kind === "proposal" && gaps.length > 0 && (
        <details className="rounded-xl border border-border bg-muted/20 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            This quote can be fuller ({gaps.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {gaps.map((g) => (
              <li key={g} className="text-xs text-muted-foreground leading-relaxed">
                · {g}
              </li>
            ))}
          </ul>
        </details>
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
              <p className="text-[11px] text-muted-foreground mt-2">
                When this is saved you can send the MoU.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Who receives it, always in view — sending is the default path. */}
      <div>
        <label className={LABEL} htmlFor="composer-recipient-email">
          Send to
        </label>
        <input
          id="composer-recipient-email"
          type="email"
          className={INPUT}
          placeholder="principal@school.edu.ng"
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground mt-2">
          Send emails the link and marks it live. Save draft if you are not ready for them to open it.
        </p>
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

          Mobile only. The document itself opens as a full-screen overlay, so
          this bar never has to share the column with the pages.

          It clears the dashboard's own bottom bar, and the negative margins
          let it span the panel's padding so the blur reaches both edges.
        */
        <div className="space-y-2.5 sticky md:static bottom-[var(--app-bottom-nav-height)] z-30 -mx-6 -mb-6 md:mx-0 md:mb-0 px-6 md:px-0 pt-3 pb-4 md:pb-0 border-t border-border/60 bg-card/95 md:bg-transparent backdrop-blur-xl md:backdrop-blur-none rounded-b-2xl md:rounded-none">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Read it first. Issuing consumes a reference and writes a row, and
                both are meant to be permanent — so the preview comes first and
                the commitment second. */}
            <button
              onClick={preview}
              disabled={previewing || issuing || mouBlocked || discarding}
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
              onClick={() => void issue(true)}
              disabled={issuing || previewing || mouBlocked || discarding}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl text-xs sm:text-sm font-black bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-lg transition-all flex items-center justify-center gap-2 min-h-[44px] cursor-pointer"
            >
              {issuing ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <EnvelopeIcon className="w-4 h-4" />
              )}
              <span>
                {issuing
                  ? "Sending…"
                  : liveQuote
                    ? `Send (replaces ${liveQuote.reference ?? "the live copy"})`
                    : `Send ${kind === "mou" ? "MoU" : "proposal"}`}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => void issue(false)}
            disabled={issuing || previewing || mouBlocked || discarding}
            className="text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Save draft without sending
          </button>

          <p className="text-[11px] text-muted-foreground">
            Preview does not save. Send stores the copy and emails the link so the school can open it.
            {liveQuote
              ? kind === "proposal"
                ? " A new send discards the previous quote."
                : " A new send discards the previous unsigned MoU."
              : ""}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-xl">
          Sending a document is an admin action. You are viewing this in read-only mode.
        </p>
      )}

      <PartnershipConfirm
        open={askDiscard}
        title={`Discard ${liveQuote?.reference ?? "this copy"}?`}
        body={
          kind === "proposal"
            ? "A proposal is not a contract. Discard it and write another whenever you need."
            : "This MoU is not signed. Discard it and issue another if you need to."
        }
        confirmLabel="Discard"
        busy={discarding}
        onCancel={() => {
          if (!discarding) setAskDiscard(false);
        }}
        onConfirm={() => void discardLive()}
      />
    </div>
  );
});
