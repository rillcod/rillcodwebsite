"use client";

/**
 * The document, as it will print.
 *
 * The templates are print-ready A4 with their own @page rules, so the browser's
 * own print path produces the PDF and there is no headless renderer to keep
 * alive. Printing the iframe rather than the page means the dashboard's dark
 * chrome is not in the output.
 *
 * The frame is sandboxed without `allow-scripts`: a stored document is HTML we
 * rendered, but it is also the one string on this page long enough to hide
 * something in, and nothing in a proposal needs to execute. `allow-same-origin`
 * is what lets the parent reach `contentWindow` to print, and `allow-modals` is
 * what lets the print dialog open at all.
 */

import { useRef, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  PrinterIcon,
  SparklesIcon,
  XMarkIcon,
} from "@/lib/icons";
import {
  documentFilename,
  documentPdfBase64,
  downloadDocumentPdf,
} from "@/lib/partnerships/proposal-pdf";

export function IssuedDocumentPreview({
  html,
  reference,
  kind,
  schoolName,
  narrativeSource,
  curriculumEdition,
  loading,
  documentId,
  canSend,
  onSent,
  onClose,
}: {
  html: string;
  reference: string;
  kind: "proposal" | "mou";
  schoolName?: string | null;
  narrativeSource?: "authored" | "ai" | null;
  curriculumEdition?: number | null;
  loading?: boolean;
  /** Set when the preview is showing a stored document that can be emailed. */
  documentId?: string | null;
  canSend?: boolean;
  onSent?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  /**
   * Email it, with the PDF built here from the very frame on screen.
   *
   * Sending from the preview rather than the archive list is deliberate: the PDF
   * can only be produced from a rendered document, so the sender always sees
   * exactly what is about to leave.
   */
  async function send() {
    if (!documentId) return;
    const to = prompt(
      `Email ${reference} to the school.\n\nLeave blank to use the address on the school record.`,
      "",
    );
    if (to === null) return;

    setSending(true);
    setError("");
    setNotice("");
    try {
      let pdf_base64: string | undefined;
      try {
        const doc = frameRef.current?.contentDocument;
        if (doc) pdf_base64 = await documentPdfBase64(doc);
      } catch {
        // The route falls back to the stored HTML, so a browser that cannot
        // build the PDF still gets the document delivered.
        pdf_base64 = undefined;
      }

      const res = await fetch("/api/partnerships/documents/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: documentId, to: to.trim() || undefined, pdf_base64 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not send that document.");
      setNotice(
        `Sent to ${json.to} as ${json.format === "pdf" ? "a PDF" : "HTML"} — ${json.attachment}`,
      );
      await onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that document.");
    } finally {
      setSending(false);
    }
  }

  async function download() {
    const doc = frameRef.current?.contentDocument;
    if (!doc) {
      setError("The preview is still loading.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await downloadDocumentPdf(doc, documentFilename(kind, reference));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the PDF.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-white/5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-violet-500/10 border-b border-violet-500/20">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white flex flex-wrap items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 text-emerald-400 shrink-0" />
            {kind === "mou" ? "Memorandum of Understanding" : "Proposal"} issued
            <span className="font-mono text-xs text-violet-200">{reference}</span>
          </p>
          <p className="text-[11px] text-white/45 mt-0.5">
            {schoolName ? `${schoolName} · ` : ""}
            saved as a draft — nothing has been sent
            {curriculumEdition ? ` · curriculum edition ${curriculumEdition}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {narrativeSource === "ai" && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-500/20 text-violet-200 text-[10px] font-semibold uppercase tracking-wider">
              <SparklesIcon className="w-3 h-3" /> AI pitch — read it
            </span>
          )}
          {canSend && documentId && (
            <button
              onClick={send}
              disabled={sending || saving}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
            >
              {sending ? (
                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <EnvelopeIcon className="w-3.5 h-3.5" />
              )}
              {sending ? "Sending…" : "Email PDF to school"}
            </button>
          )}
          <button
            onClick={download}
            disabled={saving}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
          >
            {saving ? (
              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />
            )}
            {saving ? "Building PDF…" : "Download PDF"}
          </button>
          <button
            onClick={() => frameRef.current?.contentWindow?.print()}
            title="Prints through the browser, which keeps the text selectable"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/15 text-white/70 hover:text-white text-xs font-semibold transition-colors"
          >
            <PrinterIcon className="w-3.5 h-3.5" /> Print
          </button>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="p-2 rounded-xl border border-white/10 text-white/40 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <p className="px-5 py-2 text-xs text-red-400 bg-red-500/5 border-b border-red-500/20">
          {error}
        </p>
      )}
      {notice && (
        <p className="px-5 py-2 text-xs text-emerald-300 bg-emerald-500/5 border-b border-emerald-500/20">
          {notice}
        </p>
      )}

      {loading ? (
        <div className="h-[300px] flex items-center justify-center">
          <ArrowPathIcon className="w-6 h-6 text-violet-400 animate-spin" />
        </div>
      ) : (
        <iframe
          ref={frameRef}
          srcDoc={html}
          title={`${kind === "mou" ? "MoU" : "Proposal"} ${reference}`}
          sandbox="allow-same-origin allow-modals"
          className="w-full bg-white"
          style={{ height: "720px", border: "none" }}
        />
      )}
    </div>
  );
}
