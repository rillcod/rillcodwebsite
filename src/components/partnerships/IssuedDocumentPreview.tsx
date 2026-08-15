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

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  LinkIcon,
  PrinterIcon,
  SparklesIcon,
  XMarkIcon,
} from "@/lib/icons";
import {
  documentFilename,
  documentPdfBase64,
  downloadDocumentPdf,
} from "@/lib/partnerships/proposal-pdf";
import { brandContact } from "@/config/brand";

/** A4 at 96dpi — the width every page in these templates lays out against. */
const PAGE_W = 794;
/** Tall enough to show a page and a half, so scrolling has somewhere to go. */
const FRAME_H = 1500;

export function IssuedDocumentPreview({
  html,
  reference,
  kind,
  schoolName,
  narrativeSource,
  curriculumEdition,
  loading,
  documentId,
  shareToken,
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
  /** Secret behind the public link. Absent on a preview, which has no row yet. */
  shareToken?: string | null;
  canSend?: boolean;
  onSent?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const label = kind === "mou" ? "Memorandum of Understanding" : "Partnership Proposal";
  /** The public link. Built from the token, never the printed reference. */
  const shareUrl = (t: string) =>
    typeof window === "undefined" ? `/p/${t}` : `${window.location.origin}/p/${t}`;
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
  const paneRef = useRef<HTMLDivElement>(null);
  const [paneW, setPaneW] = useState(PAGE_W);

  // The pane is the constraint, so it is what gets measured. ResizeObserver
  // rather than a window listener: the sidebar and the preview both move.
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const measure = () => setPaneW(el.clientWidth - 24);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit never enlarges past 1: a document blown up beyond its own size is
  // blurry, not bigger.
  const fitScale = Math.min(1, Math.max(0.25, paneW / PAGE_W));
  const scale = zoom === "100" ? 1 : zoom === "75" ? 0.75 : fitScale;

  return (
    <div className="rounded-3xl border border-primary/40 bg-card overflow-hidden shadow-2xl">
      {/* Top Header */}
      <div className="p-4 sm:px-6 sm:py-4 bg-muted/60 border-b border-border/80 backdrop-blur-md space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircleIcon className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="font-bold text-foreground text-sm sm:text-base">
                {kind === "mou" ? "Memorandum of Understanding" : "Partnership Proposal"}
              </span>
              <span className="px-2.5 py-0.5 rounded-lg bg-primary/15 text-primary font-mono text-xs font-black border border-primary/30">
                {reference}
              </span>
              {narrativeSource === "ai" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-400 text-[10px] font-black uppercase tracking-wider border border-violet-500/30">
                  <SparklesIcon className="w-3 h-3 text-violet-400" /> AI Pitch
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {schoolName ? `${schoolName} · ` : ""}
              {documentId ? "Official Stored Record" : "Preview Draft (Unsaved)"}
              {curriculumEdition ? ` · Curriculum Edition ${curriculumEdition}` : ""}
            </p>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
            {/* Zoom Controls */}
            <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border text-xs font-bold text-foreground/80">
              <button
                type="button"
                onClick={() => setZoom("fit")}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  zoom === "fit" ? "bg-primary text-primary-foreground shadow-sm" : "hover:text-foreground"
                }`}
              >
                Fit
              </button>
              <button
                type="button"
                onClick={() => setZoom("75")}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  zoom === "75" ? "bg-primary text-primary-foreground shadow-sm" : "hover:text-foreground"
                }`}
              >
                75%
              </button>
              <button
                type="button"
                onClick={() => setZoom("100")}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  zoom === "100" ? "bg-primary text-primary-foreground shadow-sm" : "hover:text-foreground"
                }`}
              >
                100%
              </button>
            </div>

            <button
              onClick={onClose}
              aria-label="Close preview"
              className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action CTAs (Mobile First Responsive Wrap) */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
          {shareToken && (
            <>
              <button
                onClick={async () => {
                  const url = shareUrl(shareToken);
                  const pitchText = `🌟 *Executive Technology Partnership ${kind === 'mou' ? 'Agreement' : 'Proposal'} for ${schoolName || 'Your School'}*\n\nDear School Leadership / Proprietor,\n\nWe are pleased to present our official STEM, Coding & AI Education Partnership ${kind === 'mou' ? 'Memorandum of Understanding' : 'Proposal'} (*${reference}*).\n\n🔑 *Key Highlights:*\n• *Turnkey Delivery:* Dedicated certified STEM facilitators and robotics kits deployed to your school.\n• *Zero CapEx:* ₦0 upfront equipment expenditure required from the school.\n• *Revenue Share:* 30% direct profit share settled each term.\n• *Tangible Outcomes:* Real robotics builds, coding portfolios & parent progress reports.\n\n📄 *Review & Execute Agreement Online:*\n👉 ${url}\n\nWarm regards,\n*${brandContact.displayName} Partnership Desk*\n📞 ${brandContact.phone}`;
                  
                  try {
                    await navigator.clipboard.writeText(pitchText);
                    setNotice(`Formatted WhatsApp pitch copied to clipboard! Ready to paste and send.`);
                  } catch {
                    setNotice(`Share link: ${url}`);
                  }
                }}
                title="Copy formatted WhatsApp pitch with link"
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 border border-violet-500/30 text-xs font-bold transition-all min-h-[38px]"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span>Copy WhatsApp Pitch</span>
              </button>

              <a
                href={`${brandContact.whatsapp}?text=${encodeURIComponent(
                  `🌟 *Executive Technology Partnership ${kind === 'mou' ? 'Agreement' : 'Proposal'} for ${schoolName || 'Your School'}*\n\nReview our proposal *${reference}*: ${shareUrl(shareToken)}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Open WhatsApp with the link ready to send"
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30 text-xs font-bold transition-all min-h-[38px]"
              >
                Open WhatsApp
              </a>

              <a
                href={`/p/${shareToken}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-muted/60 text-foreground/90 hover:bg-muted border border-border text-xs font-bold transition-all min-h-[38px]"
              >
                Public Portal ↗
              </a>
            </>
          )}

          {canSend && documentId && (
            <button
              onClick={send}
              disabled={sending || saving}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black shadow-md shadow-emerald-950/30 transition-all min-h-[38px]"
            >
              {sending ? (
                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <EnvelopeIcon className="w-3.5 h-3.5" />
              )}
              <span>{sending ? "Sending…" : "Email PDF to School"}</span>
            </button>
          )}

          <button
            onClick={download}
            disabled={saving}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-black shadow-md shadow-violet-950/40 transition-all min-h-[38px]"
          >
            {saving ? (
              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />
            )}
            <span>{saving ? "Building PDF…" : "Download PDF"}</span>
          </button>

          <button
            onClick={() => frameRef.current?.contentWindow?.print()}
            title="Prints cleanly through browser print dialog"
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-muted/40 text-foreground/80 hover:text-foreground hover:bg-muted text-xs font-bold transition-all min-h-[38px]"
          >
            <PrinterIcon className="w-3.5 h-3.5" /> Print
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
        <div
          ref={paneRef}
          className="bg-slate-100 dark:bg-slate-950 p-3 md:p-8 overflow-auto max-h-[820px] border-t border-border/60"
        >
          {/*
            The document is a fixed 794px A4 page. Squeezing the iframe to a
            phone's width does not reflow it — the page just gets cut off — so
            the frame keeps its true width and the whole thing is scaled down to
            whatever room there is. On a laptop the scale lands at 1 and nothing
            has been done to it.
          */}
          <div
            className="mx-auto bg-white shadow-2xl shadow-black/20 dark:shadow-black/70 rounded-sm overflow-hidden"
            style={{ width: PAGE_W * scale, height: FRAME_H * scale }}
          >
            <iframe
              ref={frameRef}
              srcDoc={html}
              title={`${kind === "mou" ? "MoU" : "Proposal"} ${reference}`}
              sandbox="allow-same-origin allow-modals"
              className="bg-white"
              style={{
                width: PAGE_W,
                height: FRAME_H,
                border: "none",
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

