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

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  DocumentTextIcon,
  EnvelopeIcon,
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
import { documentSharePath } from "@/lib/partnerships/signing";
// The same expiry rule the public signing route enforces, so the badge here
// cannot say a quote stands while the sign button refuses it.
import { isQuoteExpired } from "@/lib/partnerships/issue-document";
import type { IssuedDocumentRow } from "./types";

/** Where the public can read this document, or null when there is no safe link. */
function portalUrl(doc: IssuedDocumentRow): string | null {
  return documentSharePath(doc.share_token ?? null);
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
  "shrink-0 px-3 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 text-[11px] font-medium transition-colors disabled:opacity-40 min-h-[44px] inline-flex items-center";

/** What may follow the state a document is in. */
function nextStates(status: string): Array<{ to: string; label: string }> {
  switch (status) {
    case "draft":
      return [
        { to: "sent", label: "Mark sent" },
        { to: "signed", label: "Record signature" },
        { to: "void", label: "Withdraw" },
      ];
    case "sent":
      return [
        { to: "signed", label: "Record signature" },
        // Back to draft, so a document issued with a mistake can be redrawn or
        // deleted rather than leaving the school holding two copies of one
        // offer under two different references.
        { to: "draft", label: "Recall to draft" },
        { to: "declined", label: "Declined" },
        { to: "void", label: "Withdraw" },
      ];
    case "signed":
      return [{ to: "void", label: "Withdraw" }];
    default:
      return [];
  }
}

export function PartnershipDocumentArchive({
  documents,
  canWrite,
  onOpen,
  onChanged,
}: {
  documents: IssuedDocumentRow[];
  canWrite: boolean;
  /** Hands the stored document back up so it shows in the same preview pane. */
  onOpen: (doc: IssuedDocumentRow, html: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signing, setSigning] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerRole, setSignerRole] = useState("");

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
          `${warning}Recall ${doc.reference} to draft? The link keeps working, and you can then redraw or delete it.`,
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
        body: JSON.stringify({ id: doc.id }),
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

  async function discard(doc: IssuedDocumentRow) {
    if (!confirm(`Delete draft ${doc.reference}? Nothing has been sent, so nothing is lost.`)) return;
    setBusy(doc.id);
    setError("");
    try {
      const res = await fetch(`/api/partnerships/documents?id=${encodeURIComponent(doc.id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not delete that draft.");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that draft.");
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
          {documents.length} on record. Each keeps the terms it was written against.
        </p>
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
          <li key={doc.id} className="p-3 rounded-xl border border-border bg-muted/40 space-y-2.5">
            {/*
              Stacked on a phone, side by side from sm up.

              This was one flex row holding the reference, the kind, a status
              pill, a code pill, a date line and seven buttons. On a narrow
              screen the buttons had nowhere to wrap to and ran out past the
              card's edge. Now the identity block and the action block are
              separate rows below sm, and the actions scroll inside their own
              track rather than pushing the card open.
            */}
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

              {/*
                The actions get their own scroll track.

                Seven buttons cannot wrap inside a row that is already holding
                the reference and the status pills, so on a narrow screen they
                simply ran past the edge of the card. Scrolling them is honest:
                the buttons stay full size and reachable, and the card keeps its
                shape. `overflow-x-auto` with non-shrinking children, never
                `flex-wrap`, which is what pushed the card open.
              */}
              <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto sm:overflow-visible sm:flex-wrap sm:justify-end -mx-1 px-1 pb-1 sm:mx-0 sm:px-0 sm:pb-0">
                <button onClick={() => open(doc)} disabled={busy === doc.id} className={ACTION}>
                  <span className="flex items-center gap-1.5">
                    <EyeIcon className="w-3.5 h-3.5" /> View
                  </span>
                </button>

                {/*
                  The link is built from the share token and nothing else.

                  This read `doc.reference || doc.share_token`, and a reference
                  is always present — so every Portal button opened
                  /p/RC-PROP-2026-00042, which the public route does not accept
                  by design (a reference is sequential and printed on the face
                  of the document, so honouring it would unlock every other
                  school's fees). The button therefore 404'd every time.

                  No token means no safe link, so no button — rather than one
                  that leads nowhere.
                */}
                {portalUrl(doc) && (
                  <a
                    href={portalUrl(doc)!}
                    target="_blank"
                    rel="noreferrer"
                    className={`${ACTION} text-emerald-400 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-500/10`}
                    title="Open public signature portal"
                  >
                    Portal ↗
                  </a>
                )}

                {canWrite && doc.status === "draft" && (
                  <button
                    onClick={() => redraw(doc)}
                    disabled={busy === doc.id}
                    className={ACTION}
                    title="Re-render this draft against the current template and the terms agreed now. Keeps its reference, link and access code."
                  >
                    <span className="flex items-center gap-1.5">
                      <ArrowPathIcon className="w-3.5 h-3.5" /> Redraw
                    </span>
                  </button>
                )}

                {canWrite && (doc.status === "draft" || doc.status === "sent") && (
                  <button
                    onClick={() => {
                      setNotice(`Opening ${doc.reference} — use “Email PDF to school” above it.`);
                      void open(doc);
                    }}
                    disabled={busy === doc.id}
                    className={`${ACTION} border-primary/50 text-primary hover:border-violet-400`}
                  >
                    <span className="flex items-center gap-1.5">
                      <EnvelopeIcon className="w-3.5 h-3.5" />
                      {doc.status === "sent" ? "Resend" : "Email"}
                    </span>
                  </button>
                )}
                {canWrite &&
                  nextStates(doc.status).map((n) => (
                    <button
                      key={n.to}
                      onClick={() => move(doc, n.to)}
                      disabled={busy === doc.id}
                      className={ACTION}
                    >
                      {n.label}
                    </button>
                  ))}
                {/*
                  Delete, big enough to hit with a thumb and labelled.

                  This was a 14px icon in a 22px box — under half the 44px a
                  finger needs, unlabelled, at the end of a row that scrolls
                  sideways on a phone. Clearing out test documents was
                  effectively a desktop-only task, which is not where anyone
                  actually does this.

                  Still drafts only. A sent document is the record that it was
                  sent; recall it to draft first, which is one button along.
                */}
                {canWrite && doc.status === "draft" && (
                  <button
                    onClick={() => discard(doc)}
                    disabled={busy === doc.id}
                    aria-label={`Delete draft ${doc.reference ?? ""}`}
                    className="shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 text-[11px] font-semibold transition-colors disabled:opacity-40"
                  >
                    <TrashIcon className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
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
