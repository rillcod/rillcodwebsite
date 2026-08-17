"use client";

/**
 * The partnership desk: what a school agreed to pay, and the documents that say so.
 *
 * Everything on this page reads one record. `partnership_terms` holds the deal,
 * the proposal and the MoU render from it, and the invoice bills on it — which
 * is the whole reason the terms editor and the document composer sit on one
 * screen rather than in two places that can disagree.
 *
 * Reading is open to admins and teachers, because teachers answer school
 * questions about what was agreed. Writing is admin-only, and the API enforces
 * that independently: nothing here is the only thing standing between a school
 * and its own rate.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import {
  BuildingOffice2Icon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  PhoneIcon,
  EnvelopeIcon,
  UserIcon,
  ChevronDownIcon,
} from "@/lib/icons";
import { IssuedDocumentPreview } from "@/components/partnerships/IssuedDocumentPreview";
import { PartnershipDocumentArchive, canDeleteDocument, removePartnershipDocument } from "@/components/partnerships/PartnershipDocumentArchive";
import { PartnershipDocumentComposer, type ComposerHandle } from "@/components/partnerships/PartnershipDocumentComposer";
import { PartnershipTermsEditor } from "@/components/partnerships/PartnershipTermsEditor";
import { AddProspectForm } from "@/components/partnerships/AddProspectForm";
import { ProposalStudio, loadStudioConfig } from "@/components/partnerships/ProposalStudio";
import { PartnershipPipeline } from "@/components/partnerships/PartnershipPipeline";
import { defaultStudioConfig, type ProposalStudioConfig } from "@/lib/partnerships/studio-config";
import type {
  IssuedDocument,
  IssuedDocumentRow,
  SchoolRow,
  TermsRow,
} from "@/components/partnerships/types";
import { describeTerms } from "@/lib/partnerships/terms";
import { buildDocumentShareUrl, isValidShareToken } from "@/lib/partnerships/signing";
import { partnershipNextAction } from "@/lib/partnerships/next-action";

type Preview = {
  /** The stored row, so the document on screen is the one that gets emailed. */
  id: string;
  html: string;
  reference: string;
  kind: "proposal" | "mou";
  schoolName: string | null;
  narrativeSource: "authored" | "ai" | null;
  curriculumEdition: number | null;
  /** Secret behind the public link. Null for a preview: nothing is stored yet. */
  shareToken: string | null;
  accessCode?: string | null;
  status?: string | null;
  openCount?: number;
};

// No "studio": it is part of composing now, not a place you navigate to.
type WorkspaceTab = "compose" | "terms" | "gallery" | "archive";

/*
  Which of the two jobs this page is doing.

  "school" is the workspace: one school, its terms, its documents. "pipeline" is
  the business: every document across every school, and what the signed ones
  have in common. They were never separable before because the archive only
  existed per school, so anything spanning schools — what is going cold, what
  actually converts — could not be seen at all.
*/
type PageView = "school" | "pipeline";

/**
 * A wa.me link with the message already written.
 *
 * Nigerian numbers are stored the way people write them — 0803…, with spaces
 * and dashes — and wa.me wants digits in international form. Both follow-up
 * buttons did this conversion inline, identically, which is the sort of
 * duplication that lets two copies drift apart.
 *
 * A number too short to be real is dropped rather than guessed at: WhatsApp
 * then opens its contact picker with the message intact, which is a better
 * outcome than sending a school's proposal to whatever 234xxx happens to
 * resolve.
 */
function buildWhatsAppUrl(rawPhone: string | null | undefined, message: string): string {
  const digits = String(rawPhone || "").replace(/[^0-9]/g, "");
  const target =
    digits.length >= 10 ? (digits.startsWith("0") ? `234${digits.slice(1)}` : digits) : "";
  const text = encodeURIComponent(message);
  return target ? `https://wa.me/${target}?text=${text}` : `https://wa.me/?text=${text}`;
}

export default function PartnershipsPage() {
  const { profile, loading: authLoading } = useAuth();

  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [withTerms, setWithTerms] = useState<Set<string>>(new Set());
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [lens, setLens] = useState<"all" | "partners" | "prospects">("all");
  const [selectedId, setSelectedId] = useState("");
  const [mobileShowSidebar, setMobileShowSidebar] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("compose");
  const [pageView, setPageView] = useState<PageView>("school");
  /**
   * How much is waiting on somebody, across every school.
   *
   * Null until it is known, so the page never claims "nothing needs you" before
   * it has looked. The number badges the toggle, and on a first visit it also
   * decides which of the two views opens.
   */
  const [needsAttention, setNeedsAttention] = useState<number | null>(null);

  const [terms, setTerms] = useState<TermsRow[]>([]);
  const [agreed, setAgreed] = useState<TermsRow | null>(null);
  /*
    Proposal or MoU — driven by the next action, not a toggle.

    The composer used to let you pick either kind at any time, which is how
    people issued an MoU before a proposal had gone out.
  */
  const [composeKind, setComposeKind] = useState<"proposal" | "mou">("proposal");
  const [documents, setDocuments] = useState<IssuedDocumentRow[]>([]);
  const [loadingSchool, setLoadingSchool] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  // Bumped when a blocked MoU sends the user to record terms.
  const [openTerms, setOpenTerms] = useState(0);
  // What the studio decided.
  const [studio, setStudio] = useState<ProposalStudioConfig>(() => defaultStudioConfig());
  const composerRef = useRef<ComposerHandle>(null);
  const [focusDocumentId, setFocusDocumentId] = useState<string | null>(null);
  /** After picking a school, land on the next step once its documents are in. */
  const routeOnLoad = useRef(false);
  /** Leave the terms editor for the real next step, but only after a save. */
  const [termsJustSaved, setTermsJustSaved] = useState(false);

  const canView = profile?.role === "admin" || profile?.role === "teacher";
  const canWrite = profile?.role === "admin";

  const loadSchools = useCallback(async () => {
    setLoadError("");
    try {
      const db = createClient();
      const [schoolRes, termsRes] = await Promise.all([
        db
          .from("schools")
          .select("id, name, city, state, student_count, status, contact_person, email, phone, address")
          .neq("is_deleted", true)
          .order("name"),
        db.from("partnership_terms").select("school_id").eq("status", "agreed"),
      ]);
      if (schoolRes.error) throw new Error(schoolRes.error.message);
      if (termsRes.error) throw new Error(termsRes.error.message);

      setSchools((schoolRes.data ?? []) as SchoolRow[]);
      setWithTerms(
        new Set((termsRes.data ?? []).map((r: { school_id: string }) => String(r.school_id))),
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load schools.");
    } finally {
      setLoadingSchools(false);
    }
  }, []);

  useEffect(() => {
    if (canView) void loadSchools();
    else setLoadingSchools(false);
  }, [canView, loadSchools]);

  /** Terms history and issued documents for the school in hand. */
  const loadSchoolDetail = useCallback(async (schoolId: string) => {
    if (!schoolId) return;
    setLoadingSchool(true);
    try {
      const [termsRes, docsRes] = await Promise.all([
        fetch(`/api/partnerships/terms?school_id=${encodeURIComponent(schoolId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/partnerships/documents?school_id=${encodeURIComponent(schoolId)}`, {
          cache: "no-store",
        }),
      ]);
      const termsJson = await termsRes.json();
      const docsJson = await docsRes.json();
      if (!termsRes.ok) throw new Error(termsJson.error || "Could not load terms.");
      if (!docsRes.ok) throw new Error(docsJson.error || "Could not load documents.");

      setTerms((termsJson.terms ?? []) as TermsRow[]);
      setAgreed((termsJson.agreed ?? null) as TermsRow | null);
      setDocuments((docsJson.documents ?? []) as IssuedDocumentRow[]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load this school.");
    } finally {
      setLoadingSchool(false);
    }
  }, []);

  function selectSchool(
    id: string,
    opts?: { tab?: WorkspaceTab; kind?: "proposal" | "mou"; focusDocumentId?: string | null },
  ) {
    setSelectedId(id);
    setMobileShowSidebar(false);
    setPreview(null);
    setTerms([]);
    setAgreed(null);
    setDocuments([]);
    setLoadingSchool(true);
    setActiveTab(opts?.tab ?? "compose");
    setComposeKind(opts?.kind ?? "proposal");
    setFocusDocumentId(opts?.focusDocumentId ?? null);
    setStudio(loadStudioConfig(id));
    setTermsJustSaved(false);
    routeOnLoad.current = !opts?.tab;
    void loadSchoolDetail(id);
  }

  const selected = useMemo(
    () => schools.find((s) => s.id === selectedId) ?? null,
    [schools, selectedId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byLens =
      lens === "all"
        ? schools
        : lens === "partners"
          ? schools.filter((s) => s.status === "approved")
          : schools.filter((s) => s.status !== "approved");
    if (!q) return byLens;
    return byLens.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.city ?? "").toLowerCase().includes(q) ||
        (s.state ?? "").toLowerCase().includes(q),
    );
  }, [schools, search, lens]);

  const partners = useMemo(() => schools.filter((s) => s.status === "approved"), [schools]);
  const prospects = schools.length - partners.length;
  const awaiting = partners.length - partners.filter((s) => withTerms.has(s.id)).length;

  /*
    The two documents the follow-up buttons act on, and whether either can
    actually be linked to.

    Both buttons used to appear on a weaker condition than they needed. "Nudge
    MoU Signature" showed whenever terms were agreed, but agreeing terms does
    not issue an MoU — so on a school with terms and no MoU the button opened
    WhatsApp with an empty URL and the word "PROP" where a reference belonged.
    Nothing failed loudly; a message simply went to a school with a dead link
    in it. Requiring a shareable document is what makes the button honest.
  */
  const shareableMou = useMemo(
    () =>
      documents.find(
        (d) =>
          d.document_kind === "mou" &&
          isValidShareToken(d.share_token) &&
          (d.status === "sent" || d.status === "signed"),
      ) || null,
    [documents],
  );
  const shareableProposal = useMemo(
    () =>
      documents.find(
        (d) =>
          d.document_kind === "proposal" &&
          isValidShareToken(d.share_token) &&
          (d.status === "sent" || d.status === "signed"),
      ) || null,
    [documents],
  );

  /*
    Open on the work, when there is work.

    The workspace opened on whichever school happened to be selected, which is
    the right screen once you know which school you are dealing with and the
    wrong one first thing in the morning — the questions that matter then span
    schools: what went out and was never opened, what is going cold, what has
    lapsed. Those had nowhere to be asked until the pipeline existed, and it
    was behind a toggle nobody had a reason to press.

    Only on the first load, and only when something is actually waiting. A
    quiet pipeline should not take you away from the school you came here for.
  */
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/partnerships/pipeline');
        if (!res.ok) return;
        const json = await res.json();
        if (!live) return;
        const waiting = (json.documents ?? []).filter((d: { needs_attention?: boolean }) => d.needs_attention).length;
        setNeedsAttention(waiting);
      } catch {
        // A pipeline that cannot be counted is not a reason to block the page.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const dealState = useMemo(() => {
    if (!selected) return null;
    return partnershipNextAction({ agreed, documents });
  }, [selected, agreed, documents]);

  useEffect(() => {
    if (!preview?.id || loadingSchool) return;
    if (!documents.some((d) => d.id === preview.id)) setPreview(null);
  }, [documents, preview?.id, loadingSchool]);

  function documentForNextStep(): IssuedDocumentRow | null {
    const kind = dealState?.action?.kind;
    if (!kind) return null;
    return (
      documents.find((d) => d.document_kind === kind && d.status === "draft") ??
      documents.find((d) => d.document_kind === kind && d.status === "sent") ??
      null
    );
  }

  async function openStoredDocument(doc: IssuedDocumentRow) {
    try {
      const { data, error } = await createClient()
        .from("partnership_agreements")
        .select("document_html")
        .eq("id", doc.id)
        .maybeSingle();
      if (error) throw error;
      if (!data?.document_html) throw new Error("This document has no stored copy.");
      setPreview({
        id: doc.id,
        html: data.document_html,
        reference: doc.reference || "—",
        kind: doc.document_kind,
        schoolName: selected?.name ?? null,
        narrativeSource: null,
        curriculumEdition: null,
        shareToken: doc.share_token,
        accessCode: doc.access_code,
        status: doc.status,
        openCount: Number(doc.open_count) || 0,
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not open that document.");
    }
  }

  function goToNextStep() {
    const action = dealState?.action;
    if (!action) return;
    if (action.kind) setComposeKind(action.kind);
    if (action.tab === "archive") {
      setActiveTab("archive");
      const doc = documentForNextStep();
      if (doc) {
        setFocusDocumentId(doc.id);
        void openStoredDocument(doc);
      }
      return;
    }
    if (action.tab === "terms") {
      setOpenTerms((n) => n + 1);
    }
    setActiveTab(action.tab);
  }

  useEffect(() => {
    if (!selected || loadingSchool || !dealState || !routeOnLoad.current) return;
    routeOnLoad.current = false;
    const action = dealState.action;
    if (action?.kind) setComposeKind(action.kind);
    if (action?.tab === "archive") {
      setActiveTab("archive");
      const doc = documentForNextStep();
      if (doc) setFocusDocumentId(doc.id);
    } else if (action?.tab === "terms") {
      setOpenTerms((n) => n + 1);
      setActiveTab("terms");
    }
  }, [selected, loadingSchool, dealState]);

  useEffect(() => {
    if (!termsJustSaved || loadingSchool || !dealState) return;
    setTermsJustSaved(false);
    const action = dealState.action;
    if (action?.kind) setComposeKind(action.kind);
    setActiveTab(action?.tab ?? "compose");
  }, [termsJustSaved, loadingSchool, dealState]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="max-w-md mx-auto mt-24 bg-card border border-border rounded-3xl p-8 text-center shadow-xl">
        <ShieldCheckIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <h1 className="text-lg font-bold text-foreground">Restricted Desk</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Partnership commercial terms, proposals and agreements are reserved for authorised team members.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto px-2 sm:px-4">
      {/* Top Header & Metrics Banner */}
      <div className="rounded-3xl bg-card border border-border p-5 shadow-sm">
        <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
          Partnerships
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Write a proposal, send it, record the deal, then send the MoU.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="rounded-xl border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground">
            {partners.length} partners
          </span>
          <span className="rounded-xl border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground">
            {prospects} prospects
          </span>
          {awaiting > 0 && (
            <span className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
              {awaiting} partners without terms
            </span>
          )}
        </div>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
          <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/*
        The two jobs this page does, chosen at the top.

        Everything below used to be per-school only, so the questions that span
        schools — what is going cold, what has never been opened, what schools
        actually sign — had nowhere to be asked.
      */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-muted/50 border border-border w-full sm:w-auto sm:inline-flex">
        {(
          [
            { v: "school" as const, label: "This school" },
            { v: "pipeline" as const, label: "Waiting" },
          ]
        ).map((v) => (
          <button
            key={v.v}
            onClick={() => setPageView(v.v)}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all min-h-[40px] ${
              pageView === v.v
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {v.label}
            {v.v === 'pipeline' && needsAttention ? (
              <span
                className={`ml-2 px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                  pageView === v.v ? 'bg-white/20' : 'bg-amber-500/20 text-amber-500'
                }`}
              >
                {needsAttention}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {pageView === "pipeline" && (
        <PartnershipPipeline
          onOpenSchool={(id, hint) => {
            setPageView("school");
            selectSchool(id, {
              tab: hint?.tab ?? "archive",
              kind: hint?.kind,
              focusDocumentId: hint?.documentId ?? null,
            });
          }}
        />
      )}

      {pageView === "school" && (
        <>
      {/* Mobile School Switcher Bar (Visible on phones & small screens) */}
      {selected && (
        /*
          The whole banner is the control, not just the button beside it.

          The school name and the switcher were separate elements in one card,
          which on a phone reads as one thing but only responds on the small
          button at the end. Making the card itself the button gives the tap a
          target the width of the screen, and the chevron says which way it
          goes.
        */
        <button
          type="button"
          onClick={() => setMobileShowSidebar(!mobileShowSidebar)}
          aria-expanded={mobileShowSidebar}
          className="lg:hidden w-full min-h-[56px] bg-card border border-border rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-md text-left active:scale-[0.99] hover:bg-muted/40 transition-all"
        >
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Active Workspace</span>
            <span className="text-xs font-black text-foreground truncate block">{selected.name}</span>
          </div>
          <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted text-xs font-bold border border-border text-foreground shrink-0">
            {mobileShowSidebar ? "Hide list" : "Switch"}
            <ChevronDownIcon
              className={`w-3.5 h-3.5 transition-transform ${mobileShowSidebar ? "rotate-180" : ""}`}
            />
          </span>
        </button>
      )}

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Left School Selection Sidebar */}
        <aside
          className={`lg:col-span-4 bg-card/90 border border-border rounded-3xl p-4 lg:sticky lg:top-4 shadow-lg space-y-3 ${
            selected && !mobileShowSidebar ? "hidden lg:block" : "block"
          }`}
        >
          {canWrite && (
            <AddProspectForm
              onAdded={async (school) => {
                await loadSchools();
                if (school.id) selectSchool(school.id);
              }}
              onSelectExisting={(id) => selectSchool(id)}
            />
          )}

          {/* Search Input */}
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              className="w-full pl-10 pr-4 py-2.5 bg-muted/40 border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="Search schools by name, city or state..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border">
            {(
              [
                { v: "all", label: "All", n: schools.length },
                { v: "prospects", label: "Prospects", n: prospects },
                { v: "partners", label: "Partners", n: partners.length },
              ] as const
            ).map((t) => (
              <button
                key={t.v}
                onClick={() => setLens(t.v)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  lens === t.v
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label} {t.n > 0 && <span className="opacity-75">({t.n})</span>}
              </button>
            ))}
          </div>

          {/* School List */}
          {loadingSchools ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-7 h-7 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              {schools.length ? "No school matches your search." : "No schools on record yet."}
            </div>
          ) : (
            <ul className="space-y-1.5 max-h-[62vh] overflow-y-auto pr-1">
              {filtered.map((school) => {
                const has = withTerms.has(school.id);
                const active = school.id === selectedId;
                const isPartner = school.status === "approved";

                return (
                  <li key={school.id}>
                    <button
                      onClick={() => selectSchool(school.id)}
                      className={`w-full text-left px-3.5 py-2.5 rounded-2xl border transition-all ${
                        active
                          ? "border-emerald-500 bg-emerald-500/10 shadow-sm"
                          : "border-transparent hover:bg-muted/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-foreground truncate">{school.name}</span>
                        <span
                          className={`shrink-0 w-2 h-2 rounded-full ${
                            has ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-amber-500"
                          }`}
                          title={has ? "Commercial terms agreed" : "Awaiting terms agreement"}
                        />
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                          isPartner ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        }`}>
                          {isPartner ? "Partner" : "Prospect"}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {[school.city, school.state].filter(Boolean).join(", ") || "Nigeria"}
                          {school.student_count ? ` · ${school.student_count} roll` : ""}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Main Workspace Area */}
        <div className="lg:col-span-8 space-y-5">
          {!selected ? (
            <div className="bg-card border border-border rounded-3xl p-16 text-center shadow-lg space-y-3">
              <BuildingOffice2Icon className="w-12 h-12 text-muted-foreground/30 mx-auto" />
              <h2 className="text-base font-bold text-foreground">Pick a school</h2>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Write a proposal, send it, record the deal, then send the MoU.
              </p>
            </div>
          ) : loadingSchool ? (
            <div className="flex items-center justify-center py-28 bg-card border border-border rounded-3xl shadow-lg">
              <div className="flex flex-col items-center gap-3">
                <div className="w-9 h-9 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-muted-foreground font-semibold">Loading school partnership dossier...</span>
              </div>
            </div>
          ) : (
            <>
              {/* Selected School Executive Banner */}
              <div className="rounded-3xl bg-card border border-border p-5 shadow-lg space-y-4">
                <div className="hidden sm:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg sm:text-xl font-black text-foreground">{selected.name}</h2>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        selected.status === "approved"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      }`}>
                        {selected.status === "approved" ? "Active Partner" : "Prospect"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[selected.city, selected.state].filter(Boolean).join(", ") || "Nigeria"}
                      {selected.student_count ? ` · ${selected.student_count} students` : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {selected.contact_person && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/60 text-muted-foreground text-[11px] font-medium">
                          <UserIcon className="h-3 w-3" />
                          {selected.contact_person}
                        </span>
                      )}
                      {selected.phone && (
                        <a
                          href={`tel:${selected.phone}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-[11px] font-medium"
                        >
                          <PhoneIcon className="h-3 w-3" />
                          {selected.phone}
                        </a>
                      )}
                      {selected.email && (
                        <a
                          href={`mailto:${selected.email}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-[11px] font-medium"
                        >
                          <EnvelopeIcon className="h-3 w-3" />
                          {selected.email}
                        </a>
                      )}
                    </div>
                  </div>

                  {agreed ? (
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs">
                      <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block">
                        Agreed deal
                      </span>
                      <span className="font-semibold text-foreground">
                        {agreed.summary || describeTerms(agreed)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground sm:text-right">
                      Proposal first — the rate is recorded after they pick an option.
                    </p>
                  )}
                </div>

                {dealState && (
                    <div
                      className={`rounded-2xl border p-3 sm:p-4 flex flex-col gap-3 ${
                        dealState.tone === "done"
                          ? "border-emerald-500/30 bg-emerald-500/10"
                          : dealState.tone === "warn"
                            ? "border-amber-500/30 bg-amber-500/10"
                            : dealState.tone === "todo"
                              ? "border-border bg-muted/40"
                              : "border-sky-500/25 bg-sky-500/10"
                      }`}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {dealState.step <= 2
                          ? "Now — proposal"
                          : dealState.step === 3
                            ? "Now — record the deal"
                            : dealState.step === 4
                              ? "Now — MoU"
                              : "Now — onboard"}
                      </p>
                      <p className="text-sm font-bold text-foreground">{dealState.headline}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {dealState.detail}
                      </p>
                      <div className="flex w-full flex-col gap-2">
                        {dealState.tone === "done" && dealState.hrefs ? (
                          dealState.hrefs.map((h) => (
                            <Link
                              key={h.href}
                              href={h.href}
                              className="flex min-h-[48px] items-center justify-center px-4 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                            >
                              {h.label}
                            </Link>
                          ))
                        ) : (
                          <>
                            {dealState.action &&
                              (dealState.action.tab === "archive" ||
                                activeTab !== dealState.action.tab) && (
                              <button
                                type="button"
                                onClick={goToNextStep}
                                className="min-h-[48px] px-4 rounded-xl bg-foreground text-background text-xs font-bold"
                              >
                                {dealState.action.label}
                              </button>
                            )}
                            {dealState.followUp === "mou" && shareableMou && (
                              <button
                                type="button"
                                onClick={() => {
                                  const shareUrl = buildDocumentShareUrl(
                                    typeof window !== "undefined" ? window.location.origin : "",
                                    shareableMou.share_token,
                                  );
                                  if (!shareUrl) return;
                                  const msg = `Dear ${selected.contact_person || selected.name} Leadership,\n\nYour Rillcod partnership MoU is ready to sign:\n${shareUrl}\n\nYou can review and sign on your phone.\n\nRillcod Technologies`;
                                  window.open(buildWhatsAppUrl(selected.phone, msg), "_blank");
                                }}
                                className="min-h-[48px] px-4 rounded-xl border border-border bg-card text-foreground text-xs font-bold"
                              >
                                WhatsApp
                              </button>
                            )}
                            {dealState.followUp === "proposal" && shareableProposal && (
                              <button
                                type="button"
                                onClick={() => {
                                  const shareUrl = buildDocumentShareUrl(
                                    typeof window !== "undefined" ? window.location.origin : "",
                                    shareableProposal.share_token,
                                  );
                                  if (!shareUrl) return;
                                  const msg = `Hello ${selected.contact_person || selected.name},\n\nFollowing up on the partnership proposal (${shareableProposal.reference}):\n${shareUrl}\n\nHappy to talk through it or bring a demo to the school.\n\nRillcod Technologies`;
                                  window.open(buildWhatsAppUrl(selected.phone, msg), "_blank");
                                }}
                                className="min-h-[48px] px-4 rounded-xl border border-border bg-card text-foreground text-xs font-bold"
                              >
                                WhatsApp
                              </button>
                            )}
                          </>
                        )}
                        {documents.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveTab(activeTab === "archive" ? (dealState.action?.tab ?? "compose") : "archive")}
                            className="text-xs font-semibold text-muted-foreground hover:text-foreground min-h-[40px]"
                          >
                            {activeTab === "archive"
                              ? "Back to this step"
                              : `Issued documents (${documents.length})`}
                          </button>
                        )}
                      </div>
                    </div>
                )}
              </div>

              {/* Composer stays mounted (hidden) on Documents so a redraw still
                  has the last offer, studio and enrolment. Unmounting it used
                  to re-issue a blank document. */}
              <div className={activeTab === "compose" || activeTab === "gallery" ? "space-y-5" : "hidden"}>
                  <PartnershipDocumentComposer
                    ref={composerRef}
                    school={selected}
                    agreed={agreed}
                    canWrite={canWrite}
                    studio={studio}
                    kind={composeKind}
                    documents={documents}
                    onOpenLive={(doc) => {
                      setActiveTab("archive");
                      setFocusDocumentId(doc.id);
                      void openStoredDocument(doc);
                    }}
                    onRecordTerms={() => {
                      setOpenTerms((n) => n + 1);
                      setActiveTab("terms");
                    }}
                    onPreview={(doc: IssuedDocument) => {
                      setPreview({
                        id: "",
                        html: doc.html,
                        reference: doc.reference,
                        kind: doc.kind,
                        schoolName: doc.school,
                        narrativeSource: doc.narrative_source,
                        curriculumEdition: doc.curriculum_edition,
                        shareToken: null,
                        accessCode: doc.access_code,
                        status: null,
                      });
                    }}
                    onIssued={async (doc: IssuedDocument) => {
                      setActiveTab("archive");
                      setFocusDocumentId(doc.id);
                      setPreview({
                        id: doc.id,
                        html: doc.html,
                        reference: doc.reference,
                        kind: doc.kind,
                        schoolName: doc.school,
                        narrativeSource: doc.narrative_source,
                        curriculumEdition: doc.curriculum_edition,
                        shareToken: doc.share_token,
                        accessCode: doc.access_code,
                        status: doc.email_sent ? "sent" : "draft",
                        openCount: 0,
                      });
                      await loadSchoolDetail(selected.id);
                    }}
                  />
                  {canWrite && composeKind === "proposal" && (
                    <ProposalStudio config={studio} onChange={setStudio} school={selected} />
                  )}
                </div>

              {/* Tab 2: Authoritative Commercial Terms */}
              {activeTab === "terms" && (
                <div id="partnership-terms" className="space-y-4">
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <p className="text-base font-semibold text-foreground">Record the deal</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      They have seen the proposal. Put down the rate they agreed — the MoU and the invoice will both use it.
                    </p>
                  </div>
                  <PartnershipTermsEditor
                    school={selected}
                    agreed={agreed}
                    history={terms}
                    canWrite={canWrite}
                    openSignal={openTerms}
                    onSaved={async () => {
                      await Promise.all([loadSchoolDetail(selected.id), loadSchools()]);
                      setTermsJustSaved(true);
                    }}
                  />
                </div>
              )}

              {activeTab === "archive" && (
                <div className="space-y-4">
                  <PartnershipDocumentArchive
                    documents={documents}
                    canWrite={canWrite}
                    focusId={focusDocumentId}
                    onChanged={() => loadSchoolDetail(selected.id)}
                    redrawPayload={() => composerRef.current?.getRedrawPayload() ?? {}}
                    onOpen={(doc, html) => {
                      setPreview({
                        id: doc.id,
                        html,
                        reference: doc.reference || "—",
                        kind: doc.document_kind,
                        schoolName: selected.name,
                        narrativeSource: null,
                        curriculumEdition: null,
                        shareToken: doc.share_token,
                        accessCode: doc.access_code,
                        status: doc.status,
                        openCount: Number(doc.open_count) || 0,
                      });
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/*
        One overlay for viewing, whether you just issued or opened the archive.

        It used to render inside the Compose tab. Opening a stored document then
        jumped you off Archive, dropped the pages under the offer form, and on a
        laptop the sheet was not even full-screen — so viewing, editing and
        deleting all looked like the same screen.
      */}
      {preview && selected && (
        <IssuedDocumentPreview
          html={preview.html}
          reference={preview.reference}
          kind={preview.kind}
          schoolName={preview.schoolName}
          narrativeSource={preview.narrativeSource}
          curriculumEdition={preview.curriculumEdition}
          documentId={preview.id || null}
          shareToken={preview.shareToken}
          accessCode={preview.accessCode}
          documentStatus={preview.status}
          canSend={canWrite}
          onSent={() => loadSchoolDetail(selected.id)}
          onDelete={
            canWrite &&
            preview.id &&
            canDeleteDocument({
              status: preview.status ?? "",
              open_count: preview.openCount,
            })
              ? async () => {
                  await removePartnershipDocument({
                    id: preview.id,
                    reference: preview.reference,
                    status: preview.status ?? "draft",
                    open_count: preview.openCount,
                  });
                  setPreview(null);
                  await loadSchoolDetail(selected.id);
                }
              : undefined
          }
          onClose={() => setPreview(null)}
        />
      )}
        </>
      )}
    </div>
  );
}

