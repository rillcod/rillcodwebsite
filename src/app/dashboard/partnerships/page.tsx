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

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import {
  BuildingOffice2Icon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  BanknotesIcon,
  SparklesIcon,
  PhotoIcon,
  ArchiveBoxIcon,
  LinkIcon,
  QrCodeIcon,
  CheckBadgeIcon,
  BookOpenIcon,
  PhoneIcon,
  EnvelopeIcon,
  UserIcon,
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  ChevronDownIcon,
} from "@/lib/icons";
import { brandContact } from "@/config/brand";
import { IssuedDocumentPreview } from "@/components/partnerships/IssuedDocumentPreview";
import { PartnershipDocumentArchive } from "@/components/partnerships/PartnershipDocumentArchive";
import { PartnershipDocumentComposer } from "@/components/partnerships/PartnershipDocumentComposer";
import { PartnershipTermsEditor } from "@/components/partnerships/PartnershipTermsEditor";
import { AddProspectForm } from "@/components/partnerships/AddProspectForm";
import { ProposalStudio, loadStudioConfig } from "@/components/partnerships/ProposalStudio";
import { SchoolGalleryViewer } from "@/components/schools/SchoolGalleryViewer";
import { PartnershipOutreachModal } from "@/components/partnerships/PartnershipOutreachModal";
import { defaultStudioConfig, type ProposalStudioConfig } from "@/lib/partnerships/studio-config";
import type {
  IssuedDocument,
  IssuedDocumentRow,
  SchoolRow,
  TermsRow,
} from "@/components/partnerships/types";
import { describeTerms } from "@/lib/partnerships/terms";
import { buildDocumentShareUrl, isValidShareToken } from "@/lib/partnerships/signing";

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
};

type WorkspaceTab = "compose" | "terms" | "studio" | "gallery" | "archive";

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

  const [terms, setTerms] = useState<TermsRow[]>([]);
  const [agreed, setAgreed] = useState<TermsRow | null>(null);
  const [documents, setDocuments] = useState<IssuedDocumentRow[]>([]);
  const [loadingSchool, setLoadingSchool] = useState(false);
  const [showOutreachModal, setShowOutreachModal] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  // Bumped when a blocked MoU sends the user to record terms.
  const [openTerms, setOpenTerms] = useState(0);
  // What the studio decided.
  const [studio, setStudio] = useState<ProposalStudioConfig>(() => defaultStudioConfig());
  useEffect(() => setStudio(loadStudioConfig()), []);

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

  function selectSchool(id: string) {
    setSelectedId(id);
    setMobileShowSidebar(false);
    setPreview(null);
    setTerms([]);
    setAgreed(null);
    setDocuments([]);
    setActiveTab("compose");
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
  const signedAgreements = useMemo(
    () => documents.filter((d) => d.status === "signed"),
    [documents],
  );

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
    () => documents.find((d) => d.document_kind === "mou" && isValidShareToken(d.share_token)) || null,
    [documents],
  );
  const shareableProposal = useMemo(
    () =>
      documents.find((d) => d.document_kind === "proposal" && isValidShareToken(d.share_token)) ||
      null,
    [documents],
  );

  // Latest active document for quick header link
  const latestDoc = documents[0] || null;

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
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-teal-950/40 to-slate-900 border border-border p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🤝</span>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Partnerships &amp; Legal Desk
              </h1>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Authoritative commercial agreements, AI proposals, revenue sharing, and school sign-offs.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl bg-slate-800/80 border border-slate-700/80 px-3.5 py-2">
              <BuildingOffice2Icon className="h-4 w-4 text-emerald-400" />
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400">Approved Partners</p>
                <p className="text-xs font-black text-white">{partners.length}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-2xl bg-slate-800/80 border border-slate-700/80 px-3.5 py-2">
              <SparklesIcon className="h-4 w-4 text-amber-400" />
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400">Prospect Pipeline</p>
                <p className="text-xs font-black text-white">{prospects}</p>
              </div>
            </div>

            <div className={`flex items-center gap-2 rounded-2xl border px-3.5 py-2 ${
              awaiting > 0 ? "bg-amber-500/10 border-amber-500/30 text-amber-300" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
            }`}>
              {awaiting > 0 ? (
                <ExclamationTriangleIcon className="h-4 w-4 text-amber-400" />
              ) : (
                <CheckCircleIcon className="h-4 w-4 text-emerald-400" />
              )}
              <div>
                <p className="text-[10px] uppercase font-bold">Terms In Force</p>
                <p className="text-xs font-black">{partners.length - awaiting} of {partners.length}</p>
              </div>
            </div>

            <Link
              href="/dashboard/academic/build"
              className="flex items-center gap-2 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 hover:bg-cyan-900/50 px-3.5 py-2 transition-all group"
              title="Open Curriculum Builder"
            >
              <BookOpenIcon className="h-4 w-4 text-cyan-400 group-hover:scale-110 transition-transform" />
              <div>
                <p className="text-[10px] uppercase font-bold text-cyan-400">Master Syllabus</p>
                <p className="text-xs font-black text-white flex items-center gap-1">
                  Curriculum Builder <span className="text-cyan-400">→</span>
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
          <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

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
              <h2 className="text-base font-bold text-foreground">Select a School to Manage</h2>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Review commercial terms, compose tailored AI proposals, manage revenue splits, and issue legally binding MoUs.
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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
                      {selected.student_count ? ` · Enrolled Roll: ${selected.student_count} students` : ""}
                    </p>
                  </div>

                  {/* Deal Snippet Pill */}
                  {agreed ? (
                    <div className="rounded-2xl bg-emerald-950/20 border border-emerald-500/30 px-3.5 py-2 text-xs">
                      <span className="text-[10px] uppercase font-bold text-emerald-400 block">Agreed Deal</span>
                      <span className="font-semibold text-emerald-200">{agreed.summary || describeTerms(agreed)}</span>
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-amber-950/20 border border-amber-500/30 px-3.5 py-2 text-xs text-amber-300">
                      <span className="text-[10px] uppercase font-bold text-amber-400 block">Status</span>
                      <span>Awaiting agreed terms</span>
                    </div>
                  )}
                </div>

                {/*
                  Pipeline stepper — two up on a phone, four across from `sm`.

                  Four columns inside a phone's width left each step about 70px
                  to hold "4. MoU Sign-Off" over "✓ Executed", so the labels
                  broke onto three or four lines of two or three characters and
                  the row of stages stopped reading as a sequence at all.
                */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-border/80 text-center">
                  <div className="rounded-xl bg-muted/60 p-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">1. Stage</span>
                    <span>{selected.status === "approved" ? "Partner" : "Prospect"}</span>
                  </div>
                  <div className={`rounded-xl p-2 text-xs font-bold border ${
                    documents.some((d) => d.document_kind === "proposal")
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-muted/30 border-border text-muted-foreground"
                  }`}>
                    <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">2. Proposal</span>
                    <span>{documents.some((d) => d.document_kind === "proposal") ? "✓ Issued" : "Pending"}</span>
                  </div>
                  <div className={`rounded-xl p-2 text-xs font-bold border ${
                    agreed
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-muted/30 border-border text-muted-foreground"
                  }`}>
                    <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">3. Terms</span>
                    <span>{agreed ? "✓ Agreed" : "Pending"}</span>
                  </div>
                  <div className={`rounded-xl p-2 text-xs font-bold border ${
                    signedAgreements.length > 0
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-muted/30 border-border text-muted-foreground"
                  }`}>
                    <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">4. MoU Sign-Off</span>
                    <span>{signedAgreements.length > 0 ? "✓ Executed" : "Awaiting"}</span>
                  </div>
                </div>

                {/* ⚡ Smart Automated Follow-Up & Conversion Engine */}
                <div className="rounded-2xl bg-gradient-to-br from-card via-card to-emerald-950/20 border border-emerald-500/30 p-4 shadow-md space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-b border-border/70 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                        <SparklesIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-xs sm:text-sm font-black text-foreground flex items-center gap-1.5">
                          <span>Automated Follow-Up &amp; Conversion Assistant</span>
                        </h3>
                        <p className="text-[10px] text-muted-foreground">
                          Multi-channel client acquisition toolkit for teachers &amp; desk admins.
                        </p>
                      </div>
                    </div>

                    {/* Direct Contact Bar */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {selected.phone && (
                        <a
                          href={`tel:${selected.phone}`}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-[11px] font-bold transition-colors"
                          title="Call school directly"
                        >
                          <PhoneIcon className="h-3 w-3 text-cyan-400" />
                          <span>{selected.phone}</span>
                        </a>
                      )}
                      {selected.email && (
                        <a
                          href={`mailto:${selected.email}?subject=${encodeURIComponent(`STEM & Robotics Partnership for ${selected.name}`)}`}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-[11px] font-bold transition-colors"
                          title="Email school directly"
                        >
                          <EnvelopeIcon className="h-3 w-3 text-violet-400" />
                          <span>{selected.email}</span>
                        </a>
                      )}
                      {selected.contact_person && (
                        <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/60 text-muted-foreground text-[11px] font-bold">
                          <UserIcon className="h-3 w-3 text-emerald-400" />
                          <span>{selected.contact_person}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Dynamic Action Trigger based on Stage */}
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pt-0.5">
                    <div className="space-y-0.5 max-w-xl">
                      <p className="text-xs font-bold text-foreground">
                        {signedAgreements.length > 0
                          ? "🎉 Step 5: MoU Executed — Onboard Classes & Issue Invoice"
                          : agreed
                          ? "✍️ Step 4: Agreed Commercial Terms — Push MoU Digital Signature"
                          : documents.some((d) => d.document_kind === "proposal")
                          ? "💬 Step 3: Proposal Sent — 48h Follow-up & Live Demo Check"
                          : "🚀 Step 2: New Prospect — Issue Customized STEM Proposal"}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {signedAgreements.length > 0
                          ? "School is officially activated! Assign your STEM facilitator, add student classes, and dispatch the first-term invoice."
                          : agreed
                          ? `Terms agreed at ₦${agreed.amount_per_student?.toLocaleString() || "15,000"}/student. Nudge the proprietor to digitally sign the MoU online.`
                          : documents.some((d) => d.document_kind === "proposal")
                          ? `Proposal (${documents.find((d) => d.document_kind === "proposal")?.reference || "PROP"}) delivered. Send a polite check-in offering a 30-min live robotics demo.`
                          : "Create an executive STEM proposal with 12-Year Curriculum Ladder and zero upfront hardware cost guarantee."}
                      </p>
                    </div>

                    {/*
                      Stage-specific 1-click actions.

                      Full-width rows on a phone: these carry sentences, not
                      words ("Send 48h AI Check-In"), and wrapping them into a
                      flex row left ragged half-width buttons with text spilling
                      over two lines. Stacking is both readable and easier to hit.
                    */}
                    <div className="flex w-full sm:w-auto flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:shrink-0">
                      {signedAgreements.length > 0 ? (
                        <>
                          <Link
                            href="/dashboard/classes"
                            className="flex w-full sm:w-auto min-h-[44px] items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition-all"
                          >
                            <BookOpenIcon className="h-3.5 w-3.5 shrink-0" />
                            <span>Setup Classes</span>
                          </Link>
                          <Link
                            href="/dashboard/school-billing"
                            className="flex w-full sm:w-auto min-h-[44px] items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-bold transition-all"
                          >
                            <BanknotesIcon className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            <span>Issue Invoice</span>
                          </Link>
                        </>
                      ) : agreed && shareableMou ? (
                        <button
                          type="button"
                          onClick={() => {
                            const shareUrl = buildDocumentShareUrl(
                              typeof window !== "undefined" ? window.location.origin : "",
                              shareableMou.share_token,
                            );
                            if (!shareUrl) return;
                            const msg = `Dear ${selected.contact_person || selected.name} Leadership,\n\nYour official Rillcod AI & Robotics Partnership Memorandum of Understanding is ready for digital execution:\n👉 ${shareUrl}\n\nYou can review and digitally sign on your phone in 60 seconds. This immediately secures your certified AI instructor and dedicated robotics kit allocations for resumption.\n\n*Rillcod Technologies*`;
                            window.open(buildWhatsAppUrl(selected.phone, msg), "_blank");
                          }}
                          className="flex w-full sm:w-auto min-h-[44px] items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition-all"
                        >
                          <ChatBubbleLeftRightIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="sm:hidden">Nudge MoU Signature</span>
                          <span className="hidden sm:inline">Nudge MoU Signature (WhatsApp)</span>
                        </button>
                      ) : shareableProposal ? (
                        <button
                          type="button"
                          onClick={() => {
                            const shareUrl = buildDocumentShareUrl(
                              typeof window !== "undefined" ? window.location.origin : "",
                              shareableProposal.share_token,
                            );
                            if (!shareUrl) return;
                            const msg = `Hello ${selected.contact_person || selected.name},\n\nFollowing up on the 12-Year AI, Coding & Robotics Partnership Proposal (${shareableProposal.reference}) prepared for your school.\n\n👉 Review Proposal Online: ${shareUrl}\n\nKey Highlights: ₦0 Equipment CapEx, certified AI facilitators, termly Scan-to-Watch QR progress cards, and 30% profit share.\n\nWe'd love to schedule a brief 20-minute chat or bring live robotics kits to your school for a free student demonstration trial. Does that work for you?\n\n*Rillcod Technologies*`;
                            window.open(buildWhatsAppUrl(selected.phone, msg), "_blank");
                          }}
                          className="flex w-full sm:w-auto min-h-[44px] items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-black shadow-md transition-all"
                        >
                          <ChatBubbleLeftRightIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="sm:hidden">48h Check-In</span>
                          <span className="hidden sm:inline">Send 48h AI Check-In (WhatsApp)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActiveTab("compose")}
                          className="flex w-full sm:w-auto min-h-[44px] items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition-all"
                        >
                          <SparklesIcon className="h-3.5 w-3.5 shrink-0" />
                          <span>Draft Proposal Now</span>
                        </button>
                      )}

                      {/* Additional Outreach & Cold Pitch Email Trigger */}
                      <button
                        type="button"
                        onClick={() => setShowOutreachModal(true)}
                        className="flex w-full sm:w-auto min-h-[44px] items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-bold transition-all shadow-sm"
                        title="Send customized cold pitch, demo invite, or follow-up email"
                      >
                        <EnvelopeIcon className="h-3.5 w-3.5 text-violet-400" />
                        <span>Outreach &amp; Cold Email</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/*
                Workspace tabs.

                Five tabs with labels this long do not fit a phone, and the bar
                scrolled with nothing to say so — it simply looked like a row
                that had been cut off. The mask fades the last few pixels at
                whichever end has more to show, which is the usual signal that a
                strip continues; snapping means a swipe settles on a tab rather
                than halfway across one.

                The mask is applied inline because it needs two properties that
                have to agree, and `mask-image` still wants the -webkit- prefix
                on the iOS Safari versions this has to work on.
              */}
              <div
                className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar snap-x snap-mandatory scroll-px-4 overscroll-x-contain"
                style={{
                  maskImage:
                    "linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 24px), transparent 100%)",
                  WebkitMaskImage:
                    "linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 24px), transparent 100%)",
                }}
              >
                {[
                  { key: "compose", label: "📑 Agreements & Proposals", count: documents.length },
                  { key: "terms", label: "💰 Commercial Terms", count: terms.length },
                  { key: "studio", label: "🎨 Proposal Studio" },
                  { key: "gallery", label: "🏛️ School Gallery" },
                  { key: "archive", label: "📜 Document Archive", count: documents.length },
                ].map((tab) => {
                  const active = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key as WorkspaceTab)}
                      className={`shrink-0 snap-start min-h-[44px] flex items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-black transition-all ${
                        active
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/30"
                          : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      }`}
                    >
                      <span>{tab.label}</span>
                      {tab.count !== undefined && (
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                          active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Tab 1: Compose Proposals & MoUs */}
              {activeTab === "compose" && (
                <div className="space-y-5">
                  <PartnershipDocumentComposer
                    school={selected}
                    agreed={agreed}
                    canWrite={canWrite}
                    studio={studio}
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
                      });
                    }}
                    onIssued={async (doc: IssuedDocument) => {
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
                      });
                      await loadSchoolDetail(selected.id);
                    }}
                  />

                  {preview && (
                    <IssuedDocumentPreview
                      html={preview.html}
                      reference={preview.reference}
                      kind={preview.kind}
                      schoolName={preview.schoolName}
                      narrativeSource={preview.narrativeSource}
                      curriculumEdition={preview.curriculumEdition}
                      documentId={preview.id || null}
                      shareToken={preview.shareToken}
                      // Carried in state since the preview was built, but never
                      // handed down — which is why the access-code pill was
                      // always empty on an issued document.
                      accessCode={preview.accessCode}
                      canSend={canWrite}
                      onSent={() => loadSchoolDetail(selected.id)}
                      onClose={() => setPreview(null)}
                    />
                  )}
                </div>
              )}

              {/* Tab 2: Authoritative Commercial Terms */}
              {activeTab === "terms" && (
                <div id="partnership-terms" className="space-y-4">
                  <PartnershipTermsEditor
                    school={selected}
                    agreed={agreed}
                    history={terms}
                    canWrite={canWrite}
                    openSignal={openTerms}
                    onSaved={async () => {
                      await Promise.all([loadSchoolDetail(selected.id), loadSchools()]);
                    }}
                  />
                </div>
              )}

              {/* Tab 3: Proposal Studio Customizer */}
              {activeTab === "studio" && (
                <div className="space-y-4">
                  {canWrite ? (
                    <ProposalStudio config={studio} onChange={setStudio} school={selected} />
                  ) : (
                    <p className="text-xs text-muted-foreground p-6 bg-card border border-border rounded-2xl">
                      Read-only mode. Studio configurations are managed by administrators.
                    </p>
                  )}
                </div>
              )}

              {/* Tab 4: School Media Vault (Centralized Gallery) */}
              {activeTab === "gallery" && (
                <div className="space-y-4">
                  <SchoolGalleryViewer
                    schoolId={selected.id}
                    schoolName={selected.name}
                  />
                </div>
              )}

              {/* Tab 5: Document Archive & Audits */}
              {activeTab === "archive" && (
                <div className="space-y-4">
                  <PartnershipDocumentArchive
                    documents={documents}
                    canWrite={canWrite}
                    onChanged={() => loadSchoolDetail(selected.id)}
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
                      });
                      setActiveTab("compose");
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Outreach & Cold Pitch Email Campaign Modal */}
      {selected && (
        <PartnershipOutreachModal
          school={selected}
          latestDoc={latestDoc}
          isOpen={showOutreachModal}
          onClose={() => setShowOutreachModal(false)}
        />
      )}
    </div>
  );
}

