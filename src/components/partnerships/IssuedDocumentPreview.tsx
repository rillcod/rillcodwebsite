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
import { buildDocumentShareUrl, documentSharePath } from "@/lib/partnerships/signing";
// The pitch buttons below read their words from here, as does the outbound
// email. They used to hold three hand-written copies of the same pitch.
import { OUTREACH_ANGLES, outreachPlainText } from "@/lib/partnerships/outreach-copy";

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
  accessCode,
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
  /** The six digits printed on the document. Absent on a preview, same reason. */
  accessCode?: string | null;
  canSend?: boolean;
  onSent?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  /*
    The public link, from the share token and nothing else.

    This was `reference || token`, and a reference is always present — so every
    link this component produced pointed at /p/RC-PROP-2026-00001. That address
    is sequential, printed on the face of the document, and no longer honoured
    by the public route, so all four pitch buttons and the WhatsApp link were
    copying a dead and guessable URL onto somebody's clipboard, ready to send
    to a school.

    Returns null when there is no token, and every caller is gated on the token
    already, so there is nothing to paste rather than something wrong.
  */
  const shareUrl = (t?: string | null) =>
    buildDocumentShareUrl(typeof window === "undefined" ? "" : window.location.origin, t);
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
  /*
    Where the recipient is typed.

    This used `prompt()`, which several mobile browsers suppress outright — on
    those, tapping "Email PDF to School" did nothing at all, with no error to
    explain it. Firefox and Chrome also let a user tick "prevent this page from
    creating additional dialogues", which disables it for the rest of the
    session. An inline field works everywhere and can be corrected without
    starting over.
  */
  const [showEmailField, setShowEmailField] = useState(false);
  const [emailTo, setEmailTo] = useState("");

  async function send(to: string) {
    if (!documentId) return;

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
      setShowEmailField(false);
      setEmailTo("");
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
    /*
      A sheet on a laptop, the whole screen on a phone.

      The document inside is a fixed 794px A4 page that does not reflow, so on a
      phone it can only be scaled down — and while the preview sat inline in the
      form's own scroll container it was competing for width with the composer
      and scrolling inside a scroll. Below `sm` it takes the viewport instead:
      the page gets every pixel there is, and there is one thing on screen doing
      one job.
    */
    <div className="fixed inset-0 z-[60] flex flex-col bg-background sm:static sm:z-auto sm:block sm:rounded-3xl sm:border sm:border-primary/40 sm:bg-card sm:overflow-hidden sm:shadow-2xl">
      {/*
        The way out, pinned where a thumb is. The inline sheet has its own close
        button in the header; a full-screen overlay needs one that cannot scroll
        away, or the document becomes a room with no door.
      */}
      <div className="sm:hidden flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card shrink-0 pt-[max(0.75rem,var(--safe-area-top))]">
        <span className="text-xs font-black uppercase tracking-wider text-muted-foreground truncate">
          {kind === "mou" ? "MoU" : "Proposal"} · {reference}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-border bg-muted/50 text-foreground text-xs font-bold shrink-0"
        >
          <XMarkIcon className="w-4 h-4" />
          Close Preview
        </button>
      </div>

      {/* Top Header */}
      <div className="p-4 sm:px-6 sm:py-4 bg-muted/60 border-b border-border/80 backdrop-blur-md space-y-3 shrink-0 overflow-y-auto max-h-[45vh] sm:max-h-none sm:overflow-visible">
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
              {/*
                Rendered only when there is a code, never as an empty "—".
                A preview has no row, so it has no code, and a dash in that slot
                reads as "this document's code is missing" rather than "this
                document does not exist yet".
              */}
              {accessCode && (
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(accessCode).catch(() => null);
                    setNotice(`Access code ${accessCode} copied — the school can type it at /p`);
                  }}
                  title="The six digits a school types at /p when the link is gone. Tap to copy."
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase tracking-wider border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
                >
                  Code {accessCode}
                </button>
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
              {/*
                One button per outreach angle, and every one of them reads its
                words from `outreach-copy` — the same file the outbound email
                renders from.

                These were three hand-written pitches sitting in JSX. They had
                drifted from both the email and the document: they led with
                robotics kits, promised a thirty-percent share the terms record
                had never been asked about, and described a "Zero CapEx"
                differently from the page they were attached to.
              */}
              <div className="flex flex-wrap items-center gap-1.5">
                {OUTREACH_ANGLES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={async () => {
                      const { body } = outreachPlainText(a.id, {
                        schoolName: schoolName || "your school",
                        reference,
                        shareUrl: shareUrl(shareToken),
                      });
                      await navigator.clipboard.writeText(body).catch(() => null);
                      setNotice(`✅ ${a.label} copied — paste it into WhatsApp or an email.`);
                    }}
                    title={a.desc}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 border border-violet-500/30 text-xs font-bold transition-all min-h-[38px]"
                  >
                    <span>
                      {a.icon} {a.label}
                    </span>
                  </button>
                ))}

                <a
                  href={`${brandContact.whatsapp}?text=${encodeURIComponent(
                    `${kind === 'mou' ? 'Memorandum of Understanding' : 'Partnership proposal'} ${reference} for ${schoolName || 'your school'} — read it here: ${shareUrl(shareToken)}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open WhatsApp with the link ready to send"
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30 text-xs font-bold transition-all min-h-[38px]"
                >
                  Open WhatsApp
                </a>

                <a
                  href={documentSharePath(shareToken) ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-muted/60 text-foreground/90 hover:bg-muted border border-border text-xs font-bold transition-all min-h-[38px]"
                >
                  Open the school’s copy ↗
                </a>
              </div>
            </>
          )}

          {canSend && documentId && (
            <button
              onClick={() => setShowEmailField((v) => !v)}
              disabled={sending || saving}
              aria-expanded={showEmailField}
              className="flex w-full sm:w-auto items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black shadow-md shadow-emerald-950/30 transition-all min-h-[44px] sm:min-h-[38px]"
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

        {showEmailField && canSend && documentId && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(emailTo.trim());
            }}
            className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border/60"
          >
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              // Blank is meaningful: the route then uses the address already on
              // the school record, which is the common case.
              placeholder="Leave blank to use the school's address on file"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              // 16px until sm, or iOS Safari zooms the page on focus and never
              // zooms back — the same trap the login inputs had.
              className="flex-1 min-w-0 min-h-[44px] px-3 py-2 rounded-xl bg-background border border-border text-base sm:text-xs text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={sending}
                className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black transition-all"
              >
                {sending ? "Sending…" : "Send"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEmailField(false);
                  setEmailTo("");
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-border bg-muted/40 text-foreground/80 hover:bg-muted text-xs font-bold transition-all"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
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
          // flex-1/min-h-0 so the pane takes the leftover height of the
          // full-screen column on a phone; the fixed cap returns from `sm`,
          // where this is a card inside the page's own scroll again.
          className="bg-slate-100 dark:bg-slate-950 p-3 md:p-8 overflow-auto overscroll-contain flex-1 min-h-0 sm:flex-none sm:max-h-[820px] border-t border-border/60"
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

