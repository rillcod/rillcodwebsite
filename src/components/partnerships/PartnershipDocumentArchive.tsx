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
import type { IssuedDocumentRow } from "./types";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  signed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  declined: "bg-red-500/15 text-red-300",
  void: "bg-muted/40 text-muted-foreground",
};

const ACTION =
  "px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 text-[11px] font-medium transition-colors disabled:opacity-40";

/** What may follow the state a document is in. */
function nextStates(status: string): Array<{ to: string; label: string }> {
  switch (status) {
    case "draft":
      return [
        { to: "sent", label: "Mark sent" },
        { to: "signed", label: "Record signature" },
        { to: "void", label: "Void" },
      ];
    case "sent":
      return [
        { to: "signed", label: "Record signature" },
        { to: "declined", label: "Declined" },
        { to: "void", label: "Void" },
      ];
    case "signed":
      return [{ to: "void", label: "Void" }];
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
    if (to === "void" && !confirm(`Void ${doc.reference}? It stays on record, marked void.`)) return;

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
            <div className="flex flex-wrap items-center gap-3">
              <span className="shrink-0 text-muted-foreground">
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

                <p className="text-[11px] text-muted-foreground mt-1">
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
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button onClick={() => open(doc)} disabled={busy === doc.id} className={ACTION}>
                  <span className="flex items-center gap-1.5">
                    <EyeIcon className="w-3.5 h-3.5" /> View
                  </span>
                </button>

                {(doc.reference || doc.share_token) && (
                  <a
                    href={`/p/${doc.reference || doc.share_token}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`${ACTION} text-emerald-400 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-500/10`}
                    title="Open public signature portal"
                  >
                    Portal ↗
                  </a>
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
                {canWrite && doc.status === "draft" && (
                  <button
                    onClick={() => discard(doc)}
                    disabled={busy === doc.id}
                    aria-label={`Delete draft ${doc.reference ?? ""}`}
                    className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors disabled:opacity-40"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
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
