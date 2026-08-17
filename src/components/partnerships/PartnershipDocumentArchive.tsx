"use client";

/**
 * Everything already issued to this school, and where each one got to.
 *
 * The point of storing documents was to end the seventeen-MoUs-on-a-Desktop
 * problem, where the only record of what a school was offered was a filename.
 * So the archive shows the terms each document was rendered against — frozen at
 * issue, not looked up now — and reopening one shows the bytes that were sent,
 * not a fresh render of today's rate.
 *
 * A document moves draft → sent → signed, and can be declined or voided from
 * anywhere. Only a draft can be deleted: once something has left the building,
 * the row is the record that it did, and voiding says so without erasing it.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  TrashIcon,
} from "@/lib/icons";
// The same sentence the document itself printed, from the same numbers. A second
// describer here would be a second interpretation of the deal.
import { describeTerms } from "@/lib/partnerships/terms";
// One rule for what a public document link looks like, shared with the preview
// pane and the outbound email. Three hand-built URLs is how one of them ended up
// pointing at the reference.
import { publicDocumentSharePath } from "@/lib/partnerships/signing";
// The same expiry rule the public signing route enforces, so the badge here
// cannot say a quote stands while the sign button refuses it.
import { isQuoteExpired } from "@/lib/partnerships/issue-document";
import type { IssuedDocumentRow } from "./types";

/** Where the public can read this document, or null when there is no safe link. */
function portalUrl(doc: IssuedDocumentRow): string | null {
  return publicDocumentSharePath(doc.share_token ?? null, doc.status);
}

/** How many times the recipient has opened the link. */
function opens(doc: IssuedDocumentRow): number {
  return Number(doc.open_count) || 0;
}

/** Have the quoted fees lapsed? Same rule the signing route enforces. */
function lapsed(doc: IssuedDocumentRow): boolean {
  return isQuoteExpired(doc.valid_until ?? null);
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  signed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  declined: "bg-red-500/15 text-red-300",
  void: "bg-muted/40 text-muted-foreground",
};

const ACTION =
  "shrink-0 px-3 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 text-[11px] font-medium transition-colors disabled:opacity-40 min-h-[44px] inline-flex items-center justify-center";

export function canDeleteDocument(doc: { status: string; open_count?: number | null }): boolean {
  return doc.status === "draft" || (doc.status === "sent" && !(Number(doc.open_count) || 0));
}

/** Drafts delete outright. A send nobody opened is recalled, then deleted. */
export async function removePartnershipDocument(doc: {
  id: string;
  reference?: string | null;
  status: string;
  open_count?: number | null;
}): Promise<void> {
  if (!canDeleteDocument(doc)) {
    throw new Error("This copy has been opened or signed. Withdraw it — deleting would erase the record.");
  }
  if (doc.status === "sent") {
    const patch = await fetch("/api/partnerships/documents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: doc.id, status: "draft" }),
    });
    const patchJson = await patch.json();
    if (!patch.ok) throw new Error(patchJson.error || "Could not take that copy back.");
  }
  const res = await fetch(`/api/partnerships/documents?id=${encodeURIComponent(doc.id)}`, {
    method: "DELETE",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Could not delete that document.");
}

/** What may follow the state a document is in. */
function primaryStates(
  status: string,
  opts: { kind: string; expired: boolean },
): Array<{ to: string; label: string }> {
  switch (status) {
    case "draft":
      return [{ to: "sent", label: "Mark as sent" }];
    case "sent":
      return opts.kind === "mou" && !opts.expired
        ? [{ to: "signed", label: "Record signature" }]
        : [];
    default:
      return [];
  }
}

export function PartnershipDocumentArchive({
  documents,
  canWrite,
  onOpen,
  onChanged,
  redrawPayload,
  focusId,
}: {
  documents: IssuedDocumentRow[];
  canWrite: boolean;
  onOpen: (doc: IssuedDocumentRow, html: string) => void;
  onChanged: () => void | Promise<void>;
  /** Composer settings so a redraw is not a blank-slate re-issue. */
  redrawPayload?: () => Record<string, unknown>;
  /** Highlight the row the pipeline sent you here to act on. */
  focusId?: string | null;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signing, setSigning] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerRole, setSignerRole] = useState("");

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`partnership-doc-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId]);

  async function open(doc: IssuedDocumentRow) {
    setBusy(doc.id);
    setError("");
    try {
      // The list route deliberately omits document_html — it is large, and most
      // of the time nobody wants it. Fetch the one that was asked for.
      const { data, error: loadError } = await createClient()
        .from("partnership_agreements")
        .select("document_html")
        .eq("id", doc.id)
        .maybeSingle();
      if (loadError) throw new Error(loadError.message);
      if (!data?.document_html) throw new Error("This document has no stored copy.");
      onOpen(doc, data.document_html);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open that document.");
    } finally {
      setBusy("");
    }
  }

  async function move(doc: IssuedDocumentRow, to: string) {
    if (to === "signed" && signing !== doc.id) {
      // A signature needs a name against it, so ask before sending.
      setSigning(doc.id);
      setSignerName("");
      setSignerRole("");
      return;
    }
    if (
      to === "void" &&
      !confirm(
        `Withdraw ${doc.reference}? It stays on record, and the link stops working for the school.`,
      )
    ) {
      return;
    }
    /*
      Recall warns when the school has already read it.

      The read receipt is exactly what makes this decision answerable: pulling
      back something nobody opened is housekeeping, pulling back something a
      proprietor has read three times is a conversation you should have with
      them first. The button still allows it — whoever is sending knows things
      the counter does not.
    */
    if (to === "draft") {
      const opens = Number(doc.open_count) || 0;
      const warning = opens
        ? `${doc.reference} has already been opened ${opens} time${opens === 1 ? "" : "s"} by the school. `
        : "";
      if (
        !confirm(
          `${warning}Recall ${doc.reference} to draft? The public link will stop working until you send it again. You can then redraw or delete it.`,
        )
      ) {
        return;
      }
    }

    setBusy(doc.id);
    setError("");
    try {
      const res = await fetch("/api/partnerships/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: doc.id,
          status: to,
          signed_by_name: to === "signed" ? signerName.trim() : undefined,
          signed_by_role: to === "signed" ? signerRole.trim() || undefined : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update that document.");
      setSigning("");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update that document.");
    } finally {
      setBusy("");
    }
  }

  /**
   * Re-render a draft in place.
   *
   * The document that is stored is the document that gets sent, so a draft cut
   * before a template change carries the old design forever unless it is
   * redrawn. Doing it here rather than delete-and-reissue keeps the reference,
   * the share link and the six digits — all of which may already be written
   * down somewhere.
   */
  async function redraw(doc: IssuedDocumentRow) {
    setBusy(doc.id);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/partnerships/documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: doc.id, ...(redrawPayload?.() ?? {}) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not redraw that draft.");
      setNotice(`${doc.reference} redrawn — same reference, same link, current design.`);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not redraw that draft.");
    } finally {
      setBusy("");
    }
  }

  async function remove(doc: IssuedDocumentRow) {
    const unopened = doc.status === "sent" && opens(doc) === 0;
    const msg =
      doc.status === "draft"
        ? `Delete draft ${doc.reference}? Nothing has been sent, so nothing is lost.`
        : unopened
          ? `${doc.reference} was sent but nobody opened it. Take it back and delete it?`
          : "";
    if (!msg || !confirm(msg)) return;
    setBusy(doc.id);
    setError("");
    try {
      await removePartnershipDocument(doc);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that document.");
    } finally {
      setBusy("");
    }
  }

  if (!documents.length) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6">
        <h2 className="text-base font-semibold text-foreground">Issued documents</h2>
        <p className="text-xs text-muted-foreground mt-2">
          Nothing issued to this school yet. Anything you issue is kept here under its reference.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Issued documents</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {documents.length} on record. View the pages, or delete a draft — and a send nobody opened.
        </p>
        {documents.some((d) => d.status === "draft") && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
            Drafts are not live. The school cannot open the public link until you send or mark sent.
          </p>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive flex items-start gap-2">
          <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-px" />
          {error}
        </p>
      )}
      {notice && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-2">
          <CheckCircleIcon className="w-4 h-4 shrink-0 mt-px" />
          {notice}
        </p>
      )}

      <ul className="space-y-2">
        {documents.map((doc) => (
          <li
            key={doc.id}
            id={`partnership-doc-${doc.id}`}
            className={`p-3 rounded-xl border bg-muted/40 space-y-2.5 ${
              focusId === doc.id ? "border-amber-500/60 ring-1 ring-amber-500/30" : "border-border"
            }`}
          >
            {/* Identity on the left, one row of actions on the right. */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              <span className="hidden sm:block shrink-0 text-muted-foreground mt-0.5">
                {doc.document_kind === "mou" ? (
                  <ClipboardDocumentCheckIcon className="w-4 h-4" />
                ) : (
                  <DocumentTextIcon className="w-4 h-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-primary">{doc.reference || "—"}</span>
                  <span className="text-foreground/80 font-bold text-xs">
                    {doc.document_kind === "mou" ? "MoU Agreement" : "Partnership Proposal"}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      STATUS_STYLES[doc.status] || STATUS_STYLES.draft
                    }`}
                  >
                    {doc.status}
                  </span>

                  {/* 6-Digit Access Code Pill */}
                  {doc.access_code && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(doc.access_code!);
                          setNotice(`Copied 6-digit code ${doc.access_code} to clipboard!`);
                        } catch {
                          setNotice(`Code: ${doc.access_code}`);
                        }
                      }}
                      title="Click to copy 6-digit quick verification code"
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono font-black text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                    >
                      <span>🔑 {doc.access_code}</span>
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground mt-1 break-words">
                  {doc.created_at
                    ? new Date(doc.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                  {doc.terms ? ` · ${describeTerms(doc.terms)}` : ""}
                  {doc.signed_by_name ? ` · ✍️ Signed by ${doc.signed_by_name}` : ""}
                </p>

                {/*
                  Has the school read it, and does the quote still stand?

                  The two questions anyone chasing a proposal actually has, and
                  neither was answerable before: a document sent and never
                  opened needs a different conversation from one opened four
                  times and unsigned, and a quote whose fees have lapsed cannot
                  be signed at all — it now refuses at the point of signature,
                  so it had better say so here first.
                */}
                <p className="text-[11px] mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {doc.status !== "draft" && (
                    <span className={opens(doc) ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"}>
                      {opens(doc)
                        ? `👁 Opened ${opens(doc)}×${
                            doc.last_opened_at
                              ? `, last ${new Date(doc.last_opened_at).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                })}`
                              : ""
                          }`
                        : "👁 Not opened yet"}
                    </span>
                  )}
                  {doc.valid_until && doc.status !== "signed" && (
                    <span
                      className={
                        lapsed(doc)
                          ? "text-destructive font-semibold"
                          : "text-muted-foreground"
                      }
                    >
                      {lapsed(doc) ? "⚠ Fees lapsed " : "Fees stand until "}
                      {new Date(`${doc.valid_until}T00:00:00`).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </p>
              </div>

                <div className="flex flex-col gap-2 w-full sm:w-auto sm:shrink-0">
                  <div className={`gap-2 ${canWrite ? "grid grid-cols-2" : ""}`}>
                    <button
                      onClick={() => open(doc)}
                      disabled={busy === doc.id}
                      className="w-full inline-flex items-center justify-center gap-1.5 min-h-[48px] px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-40"
                    >
                      <EyeIcon className="w-4 h-4" />
                      View
                    </button>
                    {canWrite && canDeleteDocument(doc) && (
                      <button
                        onClick={() => remove(doc)}
                        disabled={busy === doc.id}
                        aria-label={`Delete ${doc.reference ?? "this document"}`}
                        className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-4 rounded-xl border border-destructive/50 text-destructive bg-destructive/5 hover:bg-destructive/15 text-xs font-bold disabled:opacity-40"
                      >
                        <TrashIcon className="w-4 h-4" />
                        Delete
                      </button>
                    )}
                    {canWrite && !canDeleteDocument(doc) && (
                      <button
                        onClick={() => move(doc, "void")}
                        disabled={busy === doc.id}
                        className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-4 rounded-xl border border-destructive/50 text-destructive bg-destructive/5 hover:bg-destructive/15 text-xs font-bold disabled:opacity-40"
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex flex-wrap gap-1.5">
                      {doc.status === "draft" && (
                        <>
                          <button
                            onClick={() => move(doc, "sent")}
                            disabled={busy === doc.id}
                            className={ACTION}
                          >
                            Mark sent
                          </button>
                          <button
                            onClick={() => redraw(doc)}
                            disabled={busy === doc.id}
                            className={ACTION}
                          >
                            <span className="flex items-center gap-1.5">
                              <ArrowPathIcon className="w-3.5 h-3.5" /> Redraw
                            </span>
                          </button>
                        </>
                      )}
                      {primaryStates(doc.status, {
                        kind: doc.document_kind,
                        expired: lapsed(doc),
                      })
                        .filter((n) => n.to !== "sent")
                        .map((n) => (
                          <button
                            key={n.to}
                            onClick={() => move(doc, n.to)}
                            disabled={busy === doc.id}
                            className={ACTION}
                          >
                            {n.label}
                          </button>
                        ))}
                      {doc.status === "sent" && (
                        <button
                          onClick={() => move(doc, "declined")}
                          disabled={busy === doc.id}
                          className={ACTION}
                        >
                          Mark declined
                        </button>
                      )}
                      {portalUrl(doc) && (
                        <a
                          href={portalUrl(doc)!}
                          target="_blank"
                          rel="noreferrer"
                          className={`${ACTION} text-emerald-600 dark:text-emerald-400 border-emerald-500/30`}
                        >
                          School’s copy
                        </a>
                      )}
                    </div>
                  )}
                </div>
            </div>

            {/* A signature is a name and a date, not a checkbox. */}
            {signing === doc.id && (
              <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-border/60">
                <div className="flex-1 min-w-[160px]">
                  <label
                    className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 mt-2"
                    htmlFor={`signer-${doc.id}`}
                  >
                    Signed by
                  </label>
                  <input
                    id={`signer-${doc.id}`}
                    className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    placeholder="Full name"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label
                    className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5"
                    htmlFor={`signer-role-${doc.id}`}
                  >
                    Their role (optional)
                  </label>
                  <input
                    id={`signer-role-${doc.id}`}
                    className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    placeholder="Proprietor"
                    value={signerRole}
                    onChange={(e) => setSignerRole(e.target.value)}
                  />
                </div>
                <button
                  onClick={() => move(doc, "signed")}
                  disabled={!signerName.trim() || busy === doc.id}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-xs font-semibold transition-colors"
                >
                  Record
                </button>
                <button
                  onClick={() => setSigning("")}
                  className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="text-[10px] text-muted-foreground border-t border-border/60 pt-3">
        A sent or signed document is never deleted — voiding keeps the record that it existed.
      </p>
    </div>
  );
}
