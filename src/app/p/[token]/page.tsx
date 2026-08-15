"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  PrinterIcon,
  SparklesIcon,
} from "@/lib/icons";
import { downloadDocumentPdf, documentFilename } from "@/lib/partnerships/proposal-pdf";
import { SignatureModal } from "@/components/partnerships/SignatureModal";
import { brandContact } from "@/config/brand";

type DocData = {
  id: string;
  reference: string;
  kind: "proposal" | "mou";
  status: "draft" | "sent" | "signed" | "declined" | "void";
  html: string;
  signedAt?: string | null;
  signedByName?: string | null;
  signedByRole?: string | null;
  school?: {
    id: string;
    name: string;
    city?: string | null;
    state?: string | null;
  } | null;
};

export default function PublicDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // The link carries the secret token, not the printed reference: references are
  // sequential, so keying the public page on one let anybody walk the range.
  const { token } = use(params);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const [doc, setDoc] = useState<DocData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState<"fit" | "75" | "100">("fit");
  const [savingPdf, setSavingPdf] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);

  const loadDoc = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/p/${encodeURIComponent(token)}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Document not found.");
        setDoc(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load document.");
      } finally {
        if (!opts?.quiet) setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    loadDoc();
  }, [loadDoc]);

  /**
   * Grow the frame to fit the document.
   *
   * A fixed 900px box shows about half of one page of a nine-page proposal and
   * puts the rest behind a scrollbar inside a scrollbar — unusable on the phone
   * this link is opened on. Sizing the frame to its content lets the page scroll
   * normally, the way any long document should.
   */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !doc?.html) return;

    const fit = () => {
      const inner = frame.contentDocument;
      if (!inner?.body) return;
      const height = Math.max(
        inner.body.scrollHeight,
        inner.documentElement?.scrollHeight ?? 0,
      );
      if (height > 0) frame.style.height = `${height}px`;
    };

    frame.addEventListener("load", fit);
    fit();
    // Images and fonts land after first paint and change the height, and the
    // zoom control changes the width the document reflows into.
    const timers = [150, 600, 1500].map((ms) => window.setTimeout(fit, ms));
    window.addEventListener("resize", fit);

    return () => {
      frame.removeEventListener("load", fit);
      window.removeEventListener("resize", fit);
      timers.forEach(window.clearTimeout);
    };
  }, [doc?.html, zoom]);

  async function handleDownloadPdf() {
    const iframeDoc = frameRef.current?.contentDocument;
    if (!iframeDoc || !doc) return;
    setSavingPdf(true);
    try {
      await downloadDocumentPdf(iframeDoc, documentFilename(doc.kind, doc.reference));
    } catch {
      alert("Could not build PDF. Try using the Print button instead.");
    } finally {
      setSavingPdf(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <ArrowPathIcon className="w-8 h-8 text-violet-400 animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-400">Loading document…</p>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-4">
          !
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Document Not Found</h1>
        <p className="text-sm text-slate-400 max-w-md mb-6">{error || "The requested reference does not exist or has expired."}</p>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition-colors"
        >
          Return to {brandContact.displayName}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Executive Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 border-b border-violet-500/20 backdrop-blur-md px-4 md:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-violet-950/50">
            R
          </div>
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-2">
              {doc.kind === "mou" ? "Memorandum of Understanding" : "Partnership Proposal"}
              <span className="px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-200 font-mono text-xs border border-violet-500/30">
                {doc.reference}
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">
              {doc.school?.name ? `${doc.school.name} · ` : ""}
              Official Document View
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/10 text-xs font-semibold text-white/70">
            <button
              onClick={() => setZoom("fit")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                zoom === "fit" ? "bg-violet-600 text-white shadow-sm" : "hover:text-white"
              }`}
            >
              Fit
            </button>
            <button
              onClick={() => setZoom("75")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                zoom === "75" ? "bg-violet-600 text-white shadow-sm" : "hover:text-white"
              }`}
            >
              75%
            </button>
            <button
              onClick={() => setZoom("100")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                zoom === "100" ? "bg-violet-600 text-white shadow-sm" : "hover:text-white"
              }`}
            >
              100%
            </button>
          </div>

          <button
            onClick={handleDownloadPdf}
            disabled={savingPdf}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-md shadow-violet-950/40 transition-all hover:scale-[1.02]"
          >
            {savingPdf ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownTrayIcon className="w-3.5 h-3.5" />}
            {savingPdf ? "Building PDF…" : "Download PDF"}
          </button>

          <button
            onClick={() => frameRef.current?.contentWindow?.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/15 bg-white/5 text-white/80 hover:text-white hover:bg-white/10 text-xs font-semibold transition-all"
          >
            <PrinterIcon className="w-3.5 h-3.5" /> Print
          </button>

          {doc.kind === "mou" && doc.status !== "signed" && (
            <button
              onClick={() => setShowSignModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/50 transition-all hover:scale-[1.03]"
            >
              <CheckCircleIcon className="w-4 h-4" /> Accept &amp; Sign MoU
            </button>
          )}

          {doc.status === "signed" && (
            <span className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
              <CheckCircleIcon className="w-4 h-4 text-emerald-400" /> Signed by {doc.signedByName}
            </span>
          )}
        </div>
      </header>

      {/*
        Where the reader is, and what happens next.
        The page used to open on a row of tools with nothing saying what this
        document is for or what to do with it — and once signed, nothing
        confirmed it beyond a chip in a header the reader had scrolled past.
      */}
      <div className="border-b border-white/10 bg-slate-900/60 px-4 md:px-8 py-4">
        <div className="mx-auto max-w-[850px]">
          {doc.status === "signed" ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <CheckCircleIcon className="h-6 w-6 shrink-0 text-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-emerald-200">
                  Signed and officially sealed{doc.signedByName ? ` by ${doc.signedByName}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-emerald-200/70">
                  {doc.signedByRole ? `${doc.signedByRole} · ` : ""}
                  {doc.signedAt
                    ? new Date(doc.signedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : ""}
                  {" · "}Official digital agreement record.
                </p>
              </div>
              <button
                onClick={handleDownloadPdf}
                disabled={savingPdf}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60 shadow-lg shadow-emerald-950/40"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                {savingPdf ? "Building PDF…" : "Download signed copy"}
              </button>
            </div>
          ) : doc.kind === "mou" ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-violet-500/30 bg-slate-900/90 p-4 shadow-xl">
              <SparklesIcon className="h-6 w-6 shrink-0 text-violet-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">
                  Memorandum of Understanding · Ready for Execution
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Signing is binding and records your name, title, date, and digital seal.
                  Zero CapEx — nothing is charged until termly enrolment begins.
                </p>
              </div>
              <button
                onClick={() => setShowSignModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-950/50 transition-all hover:bg-emerald-500 hover:scale-[1.02]"
              >
                <CheckCircleIcon className="h-4 w-4" /> Accept &amp; Sign MoU
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/90 p-4 shadow-xl">
                <EnvelopeIcon className="h-6 w-6 shrink-0 text-violet-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">
                    Official Partnership Proposal
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Review our turnkey STEM &amp; AI ecosystem. When you are ready, we issue the formal MoU for digital signing.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${brandContact.phone}`}
                    className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/10 transition-colors"
                  >
                    Call Rillcod
                  </a>
                  <a
                    href={`${brandContact.whatsapp}?text=${encodeURIComponent(
                      `Hello Rillcod — we have reviewed proposal ${doc.reference}${
                        doc.school?.name ? ` for ${doc.school.name}` : ""
                      } and would like to proceed.`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-emerald-500 shadow-md shadow-emerald-950/40"
                  >
                    Chat on WhatsApp
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Document Viewer Canvas */}
      <main className="flex-1 bg-slate-950 p-4 md:p-8 flex justify-center items-start overflow-auto pb-24 md:pb-8">
        <div
          className={`transition-all duration-200 bg-white shadow-2xl shadow-black/90 rounded-sm overflow-hidden ${
            zoom === "100"
              ? "w-[850px] shrink-0"
              : zoom === "75"
              ? "w-[640px] shrink-0"
              : "w-full max-w-[850px]"
          }`}
        >
          <iframe
            ref={frameRef}
            srcDoc={doc.html}
            title={`${doc.kind === "mou" ? "MoU" : "Proposal"} ${doc.reference}`}
            sandbox="allow-same-origin allow-modals"
            className="w-full bg-white block"
            scrolling="no"
            style={{ border: "none", height: "900px" }}
          />
        </div>
      </main>

      {/* Mobile Sticky Bottom Floating Action Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 border-t border-white/10 backdrop-blur-lg px-4 py-3 flex items-center justify-between gap-2 shadow-2xl">
        <a
          href={`${brandContact.whatsapp}?text=${encodeURIComponent(
            `Hello Rillcod — regarding ${doc.kind === "mou" ? "MoU" : "proposal"} ${doc.reference} for ${doc.school?.name || "our school"}.`,
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold"
        >
          WhatsApp
        </a>
        <a
          href={`tel:${brandContact.phone}`}
          className="flex items-center justify-center px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-xs font-bold text-slate-300"
        >
          Call
        </a>
        {doc.kind === "mou" && doc.status !== "signed" ? (
          <button
            onClick={() => setShowSignModal(true)}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-lg shadow-emerald-950/50"
          >
            <CheckCircleIcon className="w-4 h-4" /> Sign MoU
          </button>
        ) : (
          <button
            onClick={handleDownloadPdf}
            disabled={savingPdf}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl bg-violet-600 text-white text-xs font-bold shadow-lg shadow-violet-950/50"
          >
            <ArrowDownTrayIcon className="w-3.5 h-3.5" /> {savingPdf ? "PDF…" : "Download"}
          </button>
        )}
      </div>

      {/* Signature Modal */}
      {showSignModal && (
        <SignatureModal
          reference={doc.reference}
          token={token}
          schoolName={doc.school?.name}
          onSigned={() => {
            setShowSignModal(false);
            void loadDoc({ quiet: true });
          }}
          onClose={() => setShowSignModal(false)}
        />
      )}
    </div>
  );
}
