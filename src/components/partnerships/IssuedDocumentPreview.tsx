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

  const [zoom, setZoom] = useState<"fit" | "75" | "100">("fit");

  return (
    <div className="rounded-2xl border border-primary/40 bg-card overflow-hidden shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-muted/50 border-b border-primary/20 backdrop-blur-md">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground flex flex-wrap items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            {kind === "mou" ? "Memorandum of Understanding" : "Partnership Proposal"}
            <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary font-mono text-xs border border-primary/40">
              {reference}
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
            {schoolName ? `${schoolName} · ` : ""}
            Stored draft — official document record
            {curriculumEdition ? ` · curriculum ed. ${curriculumEdition}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Zoom controls */}
          <div className="flex items-center bg-muted/40 p-1 rounded-xl border border-border text-xs font-semibold text-foreground/80 mr-1">
            <button
              type="button"
              onClick={() => setZoom("fit")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                zoom === "fit" ? "bg-primary text-primary-foreground shadow-sm" : "hover:text-primary-foreground"
              }`}
            >
              Fit
            </button>
            <button
              type="button"
              onClick={() => setZoom("75")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                zoom === "75" ? "bg-primary text-primary-foreground shadow-sm" : "hover:text-primary-foreground"
              }`}
            >
              75%
            </button>
            <button
              type="button"
              onClick={() => setZoom("100")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                zoom === "100" ? "bg-primary text-primary-foreground shadow-sm" : "hover:text-primary-foreground"
              }`}
            >
              100%
            </button>
          </div>

          {narrativeSource === "ai" && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/15 text-primary text-[10px] font-bold uppercase tracking-wider border border-primary/40">
              <SparklesIcon className="w-3 h-3 text-primary" /> AI Pitch
            </span>
          )}

          {canSend && documentId && (
            <button
              onClick={send}
              disabled={sending || saving}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 dark:bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 disabled:opacity-50 text-primary-foreground text-xs font-semibold shadow-md shadow-emerald-900/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
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
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-semibold shadow-md shadow-violet-950/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
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
            title="Prints cleanly through browser print dialog"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-muted/40 text-foreground/80 hover:text-foreground hover:bg-muted text-xs font-semibold transition-all"
          >
            <PrinterIcon className="w-3.5 h-3.5" /> Print
          </button>

          <button
            onClick={onClose}
            aria-label="Close preview"
            className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <p className="px-5 py-2 text-xs text-red-300 bg-red-500/10 border-b border-red-500/20 font-medium">
          {error}
        </p>
      )}
      {notice && (
        <p className="px-5 py-2 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-b border-emerald-500/20 font-medium">
          {notice}
        </p>
      )}

      {loading ? (
        <div className="h-[400px] flex items-center justify-center bg-slate-100 dark:bg-slate-950">
          <div className="flex flex-col items-center gap-3">
            <ArrowPathIcon className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground font-medium">Rendering document preview…</p>
          </div>
        </div>
      ) : (
        <div className="bg-slate-100 dark:bg-slate-950 p-4 md:p-8 overflow-auto max-h-[820px] flex justify-center border-t border-border/60">
          <div
            className={`transition-all duration-200 bg-white shadow-2xl shadow-black/20 dark:shadow-black/70 rounded-sm overflow-hidden ${
              zoom === "100"
                ? "w-[850px] shrink-0"
                : zoom === "75"
                ? "w-[640px] shrink-0"
                : "w-full max-w-[850px]"
            }`}
          >
            <iframe
              ref={frameRef}
              srcDoc={html}
              title={`${kind === "mou" ? "MoU" : "Proposal"} ${reference}`}
              sandbox="allow-same-origin allow-modals"
              className="w-full bg-white transition-all"
              style={{ height: zoom === "75" ? "900px" : "800px", border: "none" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

