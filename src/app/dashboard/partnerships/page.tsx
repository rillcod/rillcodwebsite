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
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import {
  BuildingOffice2Icon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
} from "@/lib/icons";
import { IssuedDocumentPreview } from "@/components/partnerships/IssuedDocumentPreview";
import { PartnershipDocumentArchive } from "@/components/partnerships/PartnershipDocumentArchive";
import { PartnershipDocumentComposer } from "@/components/partnerships/PartnershipDocumentComposer";
import { PartnershipTermsEditor } from "@/components/partnerships/PartnershipTermsEditor";
import { AddProspectForm } from "@/components/partnerships/AddProspectForm";
import type {
  IssuedDocument,
  IssuedDocumentRow,
  SchoolRow,
  TermsRow,
} from "@/components/partnerships/types";

type Preview = {
  /** The stored row, so the document on screen is the one that gets emailed. */
  id: string;
  html: string;
  reference: string;
  kind: "proposal" | "mou";
  schoolName: string | null;
  narrativeSource: "authored" | "ai" | null;
  curriculumEdition: number | null;
};

export default function PartnershipsPage() {
  const { profile, loading: authLoading } = useAuth();

  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [withTerms, setWithTerms] = useState<Set<string>>(new Set());
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [lens, setLens] = useState<"all" | "partners" | "prospects">("all");
  const [selectedId, setSelectedId] = useState("");

  const [terms, setTerms] = useState<TermsRow[]>([]);
  const [agreed, setAgreed] = useState<TermsRow | null>(null);
  const [documents, setDocuments] = useState<IssuedDocumentRow[]>([]);
  const [loadingSchool, setLoadingSchool] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  // Bumped when a blocked MoU sends the user to record terms.
  const [openTerms, setOpenTerms] = useState(0);

  const canView = profile?.role === "admin" || profile?.role === "teacher";
  const canWrite = profile?.role === "admin";

  /**
   * Schools, and which of them have a rate on record.
   *
   * The same two reads `countSchoolsAwaitingTerms` does, including its
   * `is_deleted` filter, so the gap shown here is the number that closes the
   * grace period — not a second, nearly-equal count.
   */
  const loadSchools = useCallback(async () => {
    setLoadError("");
    try {
      const db = createClient();
      const [schoolRes, termsRes] = await Promise.all([
        db
          .from("schools")
          .select("id, name, city, state, student_count, status")
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
    setPreview(null);
    setTerms([]);
    setAgreed(null);
    setDocuments([]);
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

  // Only partners can meaningfully "await terms" — a prospect has not agreed to
  // anything yet, so counting them would make the grace-period number grow every
  // time somebody is added to the pipeline.
  const partners = useMemo(() => schools.filter((s) => s.status === "approved"), [schools]);
  const prospects = schools.length - partners.length;
  const awaiting = partners.length - partners.filter((s) => withTerms.has(s.id)).length;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="max-w-md mx-auto mt-24 bg-card border border-border rounded-2xl p-6 text-center">
        <ShieldCheckIcon className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <h1 className="text-lg font-semibold text-foreground">Not your desk</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Partnership terms and agreements are visible to staff only.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Partnerships</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The agreed deal per school, and the proposals and MoUs that state it.
          </p>
        </div>
        {!loadingSchools && schools.length > 0 && (
          <div
            className={`rounded-xl border px-4 py-3 ${
              awaiting > 0
                ? "border-amber-500/25 bg-amber-500/10"
                : "border-emerald-500/25 bg-emerald-500/10"
            }`}
          >
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              {awaiting > 0 ? (
                <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              ) : (
                <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              )}
              {awaiting} of {partners.length} partners awaiting terms
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xs">
              {prospects > 0
                ? `${prospects} prospect${prospects === 1 ? "" : "s"} in the pipeline.`
                : "Add a school to start pitching."}
            </p>
          </div>
        )}
      </div>

      {loadError && (
        <p className="text-xs text-destructive flex items-center gap-2">
          <ExclamationTriangleIcon className="w-4 h-4" /> {loadError}
        </p>
      )}

      {!canWrite && (
        <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">
          Read-only. Recording terms and issuing documents are admin actions.
        </p>
      )}

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* School picker */}
        <aside className="lg:col-span-4 bg-card border border-border rounded-2xl p-4 lg:sticky lg:top-4">
          {/* First thing in the panel, and a solid button. Pitching a school we
              have not won is the primary job here, not a footnote under the
              search box for the ones we already have. */}
          {canWrite && (
            <div className="mb-3">
              <AddProspectForm
                onAdded={async (school) => {
                  await loadSchools();
                  if (school.id) selectSchool(school.id);
                }}
                onSelectExisting={(id) => selectSchool(id)}
              />
            </div>
          )}

          <div className="relative mb-3">
            <MagnifyingGlassIcon className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              className="w-full pl-10 pr-4 py-2.5 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
              placeholder="Find a school"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Find a school"
            />
          </div>

          {/* The pipeline and the book of business are different jobs. */}
          <div className="flex items-center gap-1 mb-3 p-1 rounded-xl bg-muted/50 border border-border">
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
                className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                  lens === t.v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label} {t.n > 0 && <span className="opacity-70">{t.n}</span>}
              </button>
            ))}
          </div>

          {loadingSchools ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">
              {schools.length ? "No school matches that." : "No schools on record."}
            </p>
          ) : (
            <ul className="space-y-1 max-h-[70vh] overflow-y-auto -mr-1 pr-1">
              {filtered.map((school) => {
                const has = withTerms.has(school.id);
                const active = school.id === selectedId;
                return (
                  <li key={school.id}>
                    <button
                      onClick={() => selectSchool(school.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                        active
                          ? "border-primary bg-primary/10"
                          : "border-transparent hover:bg-muted"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm text-foreground truncate">{school.name}</span>
                        <span
                          className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                            has ? "bg-emerald-500" : "bg-amber-500"
                          }`}
                          title={has ? "Terms agreed" : "Awaiting terms"}
                        />
                      </span>
                      <span className="flex items-center gap-1.5 mt-0.5">
                        {school.status !== "approved" && (
                          <span className="shrink-0 px-1.5 py-px rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[9px] font-bold uppercase tracking-wider">
                            Prospect
                          </span>
                        )}
                        <span className="block text-[11px] text-muted-foreground truncate">
                          {[school.city, school.state].filter(Boolean).join(", ") || "—"}
                          {school.student_count ? ` · ${school.student_count} students` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-[10px] text-muted-foreground mt-3 flex items-center gap-3 border-t border-border/60 pt-3">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> terms agreed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> awaiting
            </span>
          </p>
        </aside>

        {/* Workspace */}
        <div className="lg:col-span-8 space-y-6">
          {!selected ? (
            <div className="bg-card border border-border rounded-2xl p-12 text-center">
              <BuildingOffice2Icon className="w-10 h-10 text-foreground/20 mx-auto mb-4" />
              <h2 className="text-base font-semibold text-foreground">Pick a school</h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                Record what was agreed, then issue the proposal or the MoU that states it.
              </p>
            </div>
          ) : loadingSchool ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-3 flex-wrap">
                <h2 className="text-lg font-semibold text-foreground">{selected.name}</h2>
                <span className="text-xs text-muted-foreground">
                  {[selected.city, selected.state].filter(Boolean).join(", ")}
                </span>
              </div>

              <div id="partnership-terms">
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

              <PartnershipDocumentComposer
                school={selected}
                agreed={agreed}
                canWrite={canWrite}
                onRecordTerms={() => {
                  setOpenTerms((n) => n + 1);
                  document.getElementById("partnership-terms")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                onPreview={(doc: IssuedDocument) => {
                  // No id: nothing was stored, so the preview offers no email
                  // or lifecycle action until it is actually issued.
                  setPreview({
                    id: '',
                    html: doc.html,
                    reference: doc.reference,
                    kind: doc.kind,
                    schoolName: doc.school,
                    narrativeSource: doc.narrative_source,
                    curriculumEdition: doc.curriculum_edition,
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
                  canSend={canWrite}
                  onSent={() => loadSchoolDetail(selected.id)}
                  onClose={() => setPreview(null)}
                />
              )}

              <PartnershipDocumentArchive
                documents={documents}
                canWrite={canWrite}
                onChanged={() => loadSchoolDetail(selected.id)}
                onOpen={(doc, html) =>
                  setPreview({
                    id: doc.id,
                    html,
                    reference: doc.reference || "—",
                    kind: doc.document_kind,
                    schoolName: selected.name,
                    narrativeSource: null,
                    curriculumEdition: null,
                  })
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
