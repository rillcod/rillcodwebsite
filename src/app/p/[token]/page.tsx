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
  ShieldCheckIcon,
  BanknotesIcon,
  BuildingOffice2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  DevicePhoneMobileIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
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

const PROPRIETOR_FAQS = [
  {
    q: "What if our school doesn't have an equipped computer laboratory?",
    a: "Rillcod provides turnkey delivery. Our certified facilitators bring standalone robotics kits, micro-controllers, and practical learning hardware directly to your timetable sessions. No upfront lab buildout required.",
  },
  {
    q: "Will our existing school teachers be burdened with extra work?",
    a: "None at all. Rillcod facilitators handle 100% of syllabus delivery, CBT practical grading, and term assessments. Your teachers can observe and co-learn without adding a single hour to their workload.",
  },
  {
    q: "How does the revenue share settlement work?",
    a: "For every student enrolled in the STEM & Coding programme, the agreed revenue share (e.g. 30% or custom percentage) is retained by / settled directly to your school account at the end of each academic term.",
  },
  {
    q: "What tangible proof do parents receive at the end of each term?",
    a: "Every learner completes a hands-on capstone build. Parents receive an official progress report with a Scan-to-Watch QR code linking directly to a video of their child demonstrating their working coding/robotics project.",
  },
  {
    q: "How quickly can teaching commence once signed?",
    a: "Teaching begins immediately upon term resumption on the agreed timetable slot. Facilitator deployment and hardware allocation are finalized within 48 hours of MoU execution.",
  },
];

export default function PublicDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [doc, setDoc] = useState<DocData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState<"fit" | "75" | "100" | "125">("fit");
  const [savingPdf, setSavingPdf] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(850);

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

  // Track outer container width for responsive scaling on mobile screens
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Robust iframe auto-height and image loading listener
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !doc?.html) return;

    const updateHeight = () => {
      try {
        const inner = frame.contentDocument || frame.contentWindow?.document;
        if (!inner?.body) return;
        const h = Math.max(
          inner.body.scrollHeight,
          inner.body.offsetHeight,
          inner.documentElement?.scrollHeight ?? 0,
          inner.documentElement?.offsetHeight ?? 0,
        );
        if (h > 100) {
          frame.style.height = `${h + 30}px`;
        }
      } catch {
        // Suppress cross-origin if any
      }
    };

    frame.addEventListener("load", () => {
      updateHeight();
      const images = frame.contentDocument?.images;
      if (images) {
        for (let i = 0; i < images.length; i++) {
          images[i].addEventListener("load", updateHeight);
          images[i].addEventListener("error", updateHeight);
        }
      }
    });

    updateHeight();
    const timers = [150, 400, 900, 1800, 3000].map((ms) =>
      window.setTimeout(updateHeight, ms),
    );
    window.addEventListener("resize", updateHeight);

    return () => {
      window.removeEventListener("resize", updateHeight);
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
      alert("Could not build PDF automatically. Try using the Print button instead.");
    } finally {
      setSavingPdf(false);
    }
  }

  // Calculate scale factor for mobile screens (A4 base width is approx 794px ~ 850px)
  const baseDocWidth = 850;
  const isSmallScreen = containerWidth < baseDocWidth && containerWidth > 0;
  const responsiveScale =
    zoom === "fit" && isSmallScreen ? Math.max(0.4, (containerWidth - 24) / baseDocWidth) : 1;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <ArrowPathIcon className="w-9 h-9 text-cyan-400 animate-spin mb-3.5" />
        <p className="text-sm font-semibold text-slate-300">Loading partnership dossier…</p>
        <p className="text-xs text-slate-500 mt-1">Preparing verified institutional documents</p>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4 text-center">
        <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-4 font-black text-2xl shadow-xl">
          !
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Document Not Found</h1>
        <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
          {error || "The requested reference does not exist or has expired."}
        </p>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs transition-colors shadow-lg"
        >
          Return to {brandContact.displayName}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans selection:bg-cyan-500/30">
      {/* ── Top Executive Sticky Header ── */}
      <header className="sticky top-0 z-40 bg-slate-900/95 border-b border-white/10 backdrop-blur-md px-4 md:px-8 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-primary flex items-center justify-center text-white font-black text-base shadow-md shadow-primary/20">
            R
          </div>
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-2">
              {doc.kind === "mou" ? "Memorandum of Understanding" : "Partnership Proposal"}
              <span className="px-2 py-0.5 rounded-md bg-white/10 text-cyan-300 font-mono text-xs border border-cyan-500/30">
                {doc.reference}
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">
              {doc.school?.name ? `${doc.school.name} · ` : ""}
              Official Verified Dossier
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Zoom Controls */}
          <div className="hidden sm:flex items-center bg-white/5 p-1 rounded-xl border border-white/10 text-xs font-semibold text-white/70">
            <button
              onClick={() => setZoom("fit")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                zoom === "fit" ? "bg-primary text-white shadow-sm" : "hover:text-white"
              }`}
            >
              Fit
            </button>
            <button
              onClick={() => setZoom("75")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                zoom === "75" ? "bg-primary text-white shadow-sm" : "hover:text-white"
              }`}
            >
              75%
            </button>
            <button
              onClick={() => setZoom("100")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                zoom === "100" ? "bg-primary text-white shadow-sm" : "hover:text-white"
              }`}
            >
              100%
            </button>
            <button
              onClick={() => setZoom("125")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                zoom === "125" ? "bg-primary text-white shadow-sm" : "hover:text-white"
              }`}
            >
              125%
            </button>
          </div>

          <button
            onClick={handleDownloadPdf}
            disabled={savingPdf}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold shadow-md transition-all hover:scale-[1.02] disabled:opacity-50"
          >
            {savingPdf ? (
              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />
            )}
            <span>{savingPdf ? "Building PDF…" : "Download PDF"}</span>
          </button>

          <button
            onClick={() => frameRef.current?.contentWindow?.print()}
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/15 bg-white/5 text-white/80 hover:text-white hover:bg-white/10 text-xs font-semibold transition-all"
          >
            <PrinterIcon className="w-3.5 h-3.5" /> Print
          </button>

          {doc.kind === "mou" && doc.status !== "signed" && (
            <button
              onClick={() => setShowSignModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-950/50 transition-all hover:scale-[1.03]"
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

      {/* ── Status Banner / Fast-Track Actions ── */}
      <div className="border-b border-white/10 bg-slate-900/60 px-4 md:px-8 py-3.5">
        <div className="mx-auto max-w-[880px]">
          {doc.status === "signed" ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <CheckCircleIcon className="h-6 w-6 shrink-0 text-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-emerald-200">
                  Signed and officially executed{doc.signedByName ? ` by ${doc.signedByName}` : ""}
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
                  {" · "}Permanent digital legal record.
                </p>
              </div>
              <button
                onClick={handleDownloadPdf}
                disabled={savingPdf}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60 shadow-md"
              >
                <ArrowDownTrayIcon className="h-3.5 h-3.5" />
                <span>Download Executed Copy</span>
              </button>
            </div>
          ) : doc.kind === "mou" ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-cyan-500/30 bg-slate-900/90 p-4 shadow-xl">
              <SparklesIcon className="h-6 w-6 shrink-0 text-cyan-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">
                  Memorandum of Understanding · Ready for Execution
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Signing records your name, title, timestamp, and digital signature. Turnkey delivery with all robotics hardware supplied.
                </p>
              </div>
              <button
                onClick={() => setShowSignModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-950/50 transition-all hover:bg-emerald-500 hover:scale-[1.02]"
              >
                <CheckCircleIcon className="w-4 h-4" /> Accept &amp; Sign MoU
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/90 p-4 shadow-xl">
              <EnvelopeIcon className="h-6 w-6 shrink-0 text-cyan-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">
                  Official Partnership Proposal for {doc.school?.name || "Your School"}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Review the turnkey STEM curriculum, fee models, and profit share. When ready to proceed, we issue the formal MoU.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`tel:${brandContact.phone}`}
                  className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/10 transition-colors"
                >
                  Call Desk
                </a>
                <a
                  href={`${brandContact.whatsapp}?text=${encodeURIComponent(
                    `Hello Rillcod — we have reviewed proposal ${doc.reference}${
                      doc.school?.name ? ` for ${doc.school.name}` : ""
                    } and would like to proceed.`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-emerald-500 shadow-md"
                >
                  WhatsApp Lead
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Main Document Canvas & Executive Viewer ── */}
      <main
        ref={containerRef}
        className="flex-1 bg-slate-950 p-3 sm:p-6 md:p-8 flex flex-col items-center overflow-auto pb-28 md:pb-16 space-y-8"
      >
        {/* Document Wrapper with Responsive Scaling for Mobile */}
        <div
          className="flex justify-center transition-all duration-200"
          style={{
            width: isSmallScreen && zoom === "fit" ? `${baseDocWidth * responsiveScale}px` : "100%",
            maxWidth: zoom === "125" ? "1060px" : zoom === "100" ? "850px" : zoom === "75" ? "640px" : "850px",
          }}
        >
          <div
            className="bg-white shadow-2xl shadow-black/90 rounded-sm overflow-hidden"
            style={{
              width: `${baseDocWidth}px`,
              transform: isSmallScreen && zoom === "fit" ? `scale(${responsiveScale})` : "none",
              transformOrigin: "top center",
              marginBottom: isSmallScreen && zoom === "fit" ? `-${(1 - responsiveScale) * 100}%` : "0",
            }}
          >
            <iframe
              ref={frameRef}
              srcDoc={doc.html}
              title={`${doc.kind === "mou" ? "MoU" : "Proposal"} ${doc.reference}`}
              sandbox="allow-same-origin allow-modals"
              className="w-full bg-white block"
              scrolling="no"
              style={{ border: "none", minHeight: "1400px", height: "auto" }}
            />
          </div>
        </div>

        {/* ── Interactive Value Pillars & Proprietor Advantage Box ── */}
        <section className="w-full max-w-[850px] rounded-3xl bg-slate-900 border border-white/10 p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-1.5 max-w-xl mx-auto">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-cyan-400 text-[10px] font-black uppercase tracking-wider">
              <ShieldCheckIcon className="w-3.5 h-3.5" />
              Institutional Guarantee
            </span>
            <h3 className="text-lg sm:text-xl font-black text-white">Why Forward-Thinking Schools Partner with Rillcod</h3>
            <p className="text-xs text-slate-400">
              Everything needed to run an elite computing, robotics and AI department without upfront capital outlay.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
              <BanknotesIcon className="w-6 h-6 text-amber-400" />
              <p className="text-xs font-black text-white">₦0 Upfront CapEx</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Robotics kits, circuits, and learning hardware arrive with our certified facilitators.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
              <BuildingOffice2Icon className="w-6 h-6 text-emerald-400" />
              <p className="text-xs font-black text-white">Negotiable Revenue Share</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Direct profit-sharing settled to your school account at the end of each academic term as agreed.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
              <SparklesIcon className="w-6 h-6 text-cyan-400" />
              <p className="text-xs font-black text-white">12-Year STEM Matrix</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Accredited ladder from Basic 1 block coding to SS3 full-stack AI, Python &amp; IoT builds.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
              <DevicePhoneMobileIcon className="w-6 h-6 text-violet-400" />
              <p className="text-xs font-black text-white">Parent Progress Cards</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Scan-to-Watch QR codes so parents can see their child demonstrating working code.
              </p>
            </div>
          </div>

          {/* FAQ Accordion */}
          <div className="pt-4 border-t border-white/10 space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 mb-3 text-center sm:text-left">
              Frequently Asked Questions by School Proprietors
            </h4>
            {PROPRIETOR_FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className="rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full p-3.5 sm:p-4 text-left flex items-center justify-between gap-3 text-xs font-bold text-white hover:bg-white/5 transition-colors"
                  >
                    <span>{faq.q}</span>
                    {isOpen ? (
                      <ChevronUpIcon className="w-4 h-4 text-cyan-400 shrink-0" />
                    ) : (
                      <ChevronDownIcon className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 text-xs text-slate-300 leading-relaxed border-t border-white/5 pt-2.5">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Direct CTA Box */}
          <div className="rounded-2xl bg-gradient-to-r from-cyan-950/40 via-slate-800 to-cyan-950/40 border border-cyan-500/30 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div>
              <p className="text-xs font-black text-white">Ready to inspect hardware or schedule a live demo?</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Our academic team is available to visit your school or host an online briefing.
              </p>
            </div>
            <a
              href={`${brandContact.whatsapp}?text=${encodeURIComponent(
                `Hello Rillcod — regarding ${doc.kind === "mou" ? "MoU" : "proposal"} ${doc.reference} for ${doc.school?.name || "our school"}. Let's discuss next steps.`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs transition-all shadow-md flex items-center gap-2"
            >
              <CheckCircleIcon className="w-4 h-4" />
              <span>Connect on WhatsApp</span>
            </a>
          </div>
        </section>
      </main>

      {/* ── Mobile Sticky Bottom Floating Action Bar ── */}
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
            className="flex-1 flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-lg"
          >
            <ArrowDownTrayIcon className="w-3.5 h-3.5" /> {savingPdf ? "PDF…" : "Download"}
          </button>
        )}
      </div>

      {/* ── Digital Signature Modal ── */}
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
