"use client";

/**
 * The document, full screen, on its own.
 *
 * Viewing used to dump the pages back into the compose form: on a laptop the
 * sheet sat under the offer fields, and on a phone a 45vh toolbar of pitch
 * buttons ate the page. This is one overlay, one document, and a short bar
 * of send / print / download. Pitch copy lives behind “Copy a message”.
 *
 * The templates are print-ready A4 with their own @page rules, so the browser's
 * own print path produces the PDF. Printing the iframe rather than the page
 * means the dashboard's chrome is not in the output.
 *
 * The frame is sandboxed without `allow-scripts`: a stored document is HTML we
 * rendered, but it is also the one string on this page long enough to hide
 * something in. `allow-same-origin` lets the parent reach `contentWindow` to
 * print; `allow-modals` lets the print dialog open at all.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  EnvelopeIcon,
  LinkIcon,
  PrinterIcon,
  XMarkIcon,
  TrashIcon,
} from "@/lib/icons";
import {
  documentFilename,
  documentPdfBase64,
  downloadDocumentPdf,
} from "@/lib/partnerships/proposal-pdf";
import { brandContact } from "@/config/brand";
import { buildDocumentShareUrl, publicDocumentSharePath } from "@/lib/partnerships/signing";
import { OUTREACH_ANGLES, outreachPlainText } from "@/lib/partnerships/outreach-copy";
import BodyPortal, { useOverlayScrollLock } from "@/components/ui/BodyPortal";

/** A4 at 96dpi — the width every page in these templates lays out against. */
const PAGE_W = 794;
/** Tall enough to show a page and a half, so scrolling has somewhere to go. */
const FRAME_H = 1500;

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft — school cannot open this",
  sent: "Sent",
  signed: "Signed",
  declined: "Declined",
  void: "Withdrawn",
};

const BTN =
  "inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-border bg-muted/40 text-foreground text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-50";

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
  documentStatus,
  canSend,
  onSent,
  onDelete,
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
  /** Sent/signed only — drafts are not on the public route. */
  documentStatus?: string | null;
  canSend?: boolean;
  onSent?: () => void | Promise<void>;
  /** Drafts only — a sent copy is the record that it went out. */
  onDelete?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  /*
    The public link, from the share token and nothing else.

    This was `reference || token`, and a reference is always present — so every
    link this component produced pointed at /p/RC-PROP-2026-00001. That address
    is sequential, printed on the face of the document, and no longer honoured
    by the public route.
  */
  const shareUrl = (t?: string | null) =>
    buildDocumentShareUrl(typeof window === "undefined" ? "" : window.location.origin, t);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [becameSent, setBecameSent] = useState(false);
  const liveStatus = becameSent ? "sent" : documentStatus;
  const publicPath = publicDocumentSharePath(shareToken, liveStatus);
  const stored = Boolean(documentId);
  const title = kind === "mou" ? "Memorandum of Understanding" : "Partnership Proposal";

  const [showEmailField, setShowEmailField] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [deleting, setDeleting] = useState(false);

  useOverlayScrollLock(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      setBecameSent(true);
      await onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that document.");
    } finally {
      setSending(false);
    }
  }

  async function deleteStored() {
    if (!onDelete) return;
    const unopenedSent = liveStatus === "sent";
    if (
      !confirm(
        unopenedSent
          ? `${reference} was sent but you can still delete it if nobody opened it. Take it back and delete?`
          : `Delete draft ${reference}? Nothing has been sent, so nothing is lost.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError("");
    try {
      await onDelete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that document.");
      setDeleting(false);
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

  /**
   * The document with a base address, so its images can be found.
   *
   * An iframe fed through srcDoc has no URL of its own, so a path like
   * "/images/logo.png" has nothing to resolve against. A single <base> tag
   * makes every relative path resolve against this origin.
   */
  const framedHtml = useMemo(() => {
    if (!html || typeof window === "undefined") return html;
    if (html.includes("<base ")) return html;
    return html.replace(/<head(s[^>]*)?>/i, (m) => `${m}<base href="${window.location.origin}/">`);
  }, [html]);

  const [zoom, setZoom] = useState<"fit" | "75" | "100">("fit");
  const paneRef = useRef<HTMLDivElement>(null);
  const [paneW, setPaneW] = useState(PAGE_W);

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const measure = () => setPaneW(el.clientWidth - 24);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitScale = Math.min(1, Math.max(0.25, paneW / PAGE_W));
  const scale = zoom === "100" ? 1 : zoom === "75" ? 0.75 : fitScale;

  return (
    <BodyPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="issued-document-title"
        className="fixed inset-0 z-[80] flex flex-col bg-background"
      >
        <header className="shrink-0 border-b border-border bg-card pt-[max(0.5rem,var(--safe-area-top))]">
          <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-border bg-muted/50 text-foreground text-xs font-bold shrink-0"
            >
              <XMarkIcon className="w-4 h-4" />
              Close
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <h2 id="issued-document-title" className="text-sm font-bold text-foreground truncate">
                  {title}
                </h2>
                <span className="font-mono text-[11px] font-black text-primary">{reference}</span>
                {liveStatus && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {STATUS_LABEL[liveStatus] ?? liveStatus}
                  </span>
                )}
                {!stored && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Not stored yet
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {schoolName ?? "This school"}
                {accessCode ? ` · code ${accessCode}` : ""}
                {narrativeSource === "ai" ? " · AI pitch" : ""}
                {curriculumEdition ? ` · curriculum ${curriculumEdition}` : ""}
              </p>
            </div>

            <div className="hidden sm:flex items-center bg-muted/60 p-0.5 rounded-xl border border-border text-[11px] font-bold text-foreground/80 shrink-0">
              {(["fit", "75", "100"] as const).map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZoom(z)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    zoom === z ? "bg-primary text-primary-foreground shadow-sm" : "hover:text-foreground"
                  }`}
                >
                  {z === "fit" ? "Fit" : `${z}%`}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden sm:flex flex-wrap items-center gap-1.5 px-3 sm:px-4 pb-2.5">
            {canSend && stored && (
              <button
                type="button"
                onClick={() => setShowEmailField((v) => !v)}
                disabled={sending || saving}
                aria-expanded={showEmailField}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold"
              >
                {sending ? (
                  <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <EnvelopeIcon className="w-3.5 h-3.5" />
                )}
                {sending ? "Sending…" : "Email PDF"}
              </button>
            )}

            <button type="button" onClick={download} disabled={saving} className={BTN}>
              {saving ? (
                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowDownTrayIcon className="w-3.5 h-3.5" />
              )}
              {saving ? "Building…" : "Download"}
            </button>

            <button
              type="button"
              onClick={() => frameRef.current?.contentWindow?.print()}
              className={BTN}
            >
              <PrinterIcon className="w-3.5 h-3.5" />
              Print
            </button>

            {publicPath && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    const url = shareUrl(shareToken);
                    if (!url) return;
                    await navigator.clipboard.writeText(url).catch(() => null);
                    setNotice("Link copied — paste it to the school.");
                  }}
                  className={BTN}
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  Copy link
                </button>
                <a href={publicPath} target="_blank" rel="noreferrer" className={BTN}>
                  School’s copy ↗
                </a>
              </>
            )}

            {accessCode && (
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(accessCode).catch(() => null);
                  setNotice(`Access code ${accessCode} copied — they can type it at /p`);
                }}
                className={BTN}
              >
                Copy code
              </button>
            )}

            {onDelete && stored && (
              <button
                type="button"
                onClick={() => void deleteStored()}
                disabled={deleting || sending || saving}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-destructive/50 text-destructive bg-destructive/5 hover:bg-destructive/15 text-xs font-bold disabled:opacity-50"
              >
                {deleting ? (
                  <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <TrashIcon className="w-3.5 h-3.5" />
                )}
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>

          {publicPath && (
            <details className="group border-t border-border/60 px-3 sm:px-4">
              <summary className="cursor-pointer list-none py-2 flex items-center justify-between gap-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                <span>Copy a WhatsApp or email message</span>
                <ChevronDownIcon className="w-3.5 h-3.5 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="flex flex-wrap items-center gap-1.5 pb-2.5">
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
                      setNotice(`${a.label} copied — paste it into WhatsApp or an email.`);
                    }}
                    title={a.desc}
                    className={BTN}
                  >
                    {a.icon} {a.label}
                  </button>
                ))}
                <a
                  href={`${brandContact.whatsapp}?text=${encodeURIComponent(
                    `${title} ${reference} for ${schoolName || "your school"} — read it here: ${shareUrl(shareToken)}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={BTN}
                >
                  Open WhatsApp
                </a>
              </div>
            </details>
          )}

          {showEmailField && canSend && stored && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(emailTo.trim());
              }}
              className="flex flex-col sm:flex-row gap-2 px-3 sm:px-4 pb-3 border-t border-border/60 pt-2"
            >
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="Leave blank to use the school's address on file"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                className="flex-1 min-w-0 min-h-[44px] px-3 py-2 rounded-xl bg-background border border-border text-base sm:text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={sending}
                  className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black"
                >
                  {sending ? "Sending…" : "Send"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEmailField(false);
                    setEmailTo("");
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-border bg-muted/40 text-foreground text-xs font-bold"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </header>

        {error && (
          <p className="shrink-0 px-4 py-2 text-xs text-destructive bg-destructive/10 border-b border-destructive/20 font-medium">
            {error}
          </p>
        )}
        {notice && (
          <p className="shrink-0 px-4 py-2 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-b border-emerald-500/20 font-medium">
            {notice}
          </p>
        )}
        {loading ? (
          <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-100 dark:bg-slate-950">
            <div className="flex flex-col items-center gap-3">
              <ArrowPathIcon className="w-8 h-8 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground font-medium">Rendering document…</p>
            </div>
          </div>
        ) : (
          <div
            ref={paneRef}
            className="flex-1 min-h-0 bg-slate-100 dark:bg-slate-950 p-3 md:p-8 overflow-auto overscroll-contain"
          >
            <div
              className="mx-auto bg-white shadow-2xl shadow-black/20 dark:shadow-black/70 rounded-sm overflow-hidden"
              style={{ width: PAGE_W * scale, height: FRAME_H * scale }}
            >
              <iframe
                ref={frameRef}
                srcDoc={framedHtml}
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

        <div className="sm:hidden shrink-0 grid grid-cols-2 gap-2 p-3 border-t border-border bg-card pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {onDelete && stored ? (
            <button
              type="button"
              onClick={() => void deleteStored()}
              disabled={deleting || sending || saving}
              className="min-h-[48px] rounded-xl border border-destructive/50 text-destructive bg-destructive/5 text-xs font-bold disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] rounded-xl border border-border text-foreground text-xs font-bold"
            >
              Close
            </button>
          )}
          {canSend && stored ? (
            <button
              type="button"
              onClick={() => setShowEmailField(true)}
              disabled={sending || saving}
              className="min-h-[48px] rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"
            >
              Send
            </button>
          ) : (
            <button
              type="button"
              onClick={download}
              disabled={saving}
              className="min-h-[48px] rounded-xl bg-foreground text-background text-xs font-bold disabled:opacity-50"
            >
              Download
            </button>
          )}
        </div>
      </div>
    </BodyPortal>
  );
}
