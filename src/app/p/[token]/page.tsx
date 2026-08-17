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
  ExclamationTriangleIcon,
} from "@/lib/icons";
import { downloadDocumentPdf, documentFilename } from "@/lib/partnerships/proposal-pdf";
import { SignatureModal } from "@/components/partnerships/SignatureModal";
import { brandContact } from "@/config/brand";
// One list, shared with the printed document. Two copies of an answer is how
// this page ended up promising a video no report card has ever carried.
import { PROPRIETOR_FAQS } from "@/lib/partnerships/faqs";

type DocData = {
  id: string;
  reference: string;
  kind: "proposal" | "mou";
  status: "draft" | "sent" | "signed" | "declined" | "void";
  html: string;
  signedAt?: string | null;
  signedByName?: string | null;
  signedByRole?: string | null;
  /**
   * The six digits printed on this document, echoed back by the API.
   *
   * Shown here so a school that reaches the page once has the code in front of
   * them: the link can be lost in a WhatsApp thread, and without the code
   * there is no second way back to their own agreement.
   */
  accessCode?: string | null;
  validUntil?: string | null;
  expired?: boolean;
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
  const { token } = use(params);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [doc, setDoc] = useState<DocData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [withdrawn, setWithdrawn] = useState(false);
  const [zoom, setZoom] = useState<"fit" | "75" | "100" | "125">("fit");
  /** The document's own height, measured from inside the iframe. */
  const [docHeight, setDocHeight] = useState(0);
  /** Where each A4 sheet begins inside the document, and which one is being read. */
  const [pageTops, setPageTops] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [savingPdf, setSavingPdf] = useState(false);
  const [showSignModal, setShowSignModal] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(850);

  const loadDoc = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setLoading(true);
      setError("");
      setWithdrawn(false);
      try {
        const res = await fetch(`/api/p/${encodeURIComponent(token)}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) {
          if (json.withdrawn || res.status === 410) setWithdrawn(true);
          throw new Error(json.error || "Document not found.");
        }
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

    /*
      Measure the document, and put the number in state.

      It used to be written straight onto the iframe's style. That works for the
      iframe and tells the rest of the layout nothing — so the wrapper that has
      to reserve the scaled height had no idea how tall the document was, and
      the centring and the height correction were computed from two different
      ideas of the same document.

      Only set when it actually changes: this runs on load, on resize and on
      five timers, and writing identical state on every one of them re-renders
      the page repeatedly while somebody is trying to scroll it.
    */
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
          setDocHeight((prev) => (Math.abs(prev - h) > 2 ? h : prev));
        }

        /*
          Where each sheet starts, so the viewer can move a sheet at a time.

          The document is not a wall of text — it is ten A4 pages with headings
          on them, and it already says so in its own markup. Reading those
          offsets is the difference between "scroll eleven thousand pixels and
          hope" and "take me to the money page".
        */
        const sheets = Array.from(inner.querySelectorAll<HTMLElement>('.page'));
        if (sheets.length) {
          const tops = sheets.map((el) => el.offsetTop);
          setPageTops((prev) =>
            prev.length === tops.length && prev.every((v, i) => Math.abs(v - tops[i]) < 2)
              ? prev
              : tops,
          );
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
  /*
    The two numbers the layout actually needs.

    `isScaled` is the only condition under which the document is painted at a
    size different from the room it occupies, and `scaledHeight` is that room.
    Both were previously recomputed inline in three places with slightly
    different conditions, which is how the height correction and the transform
    ended up disagreeing about whether scaling was happening at all.
  */
  const isScaled = isSmallScreen && zoom === "fit" && responsiveScale < 1;
  const scaledHeight = docHeight ? Math.round(docHeight * responsiveScale) : 0;

  /**
   * Move the window to the top of a given sheet.
   *
   * The document lives in an iframe the page scrolls past, so a sheet's own
   * offset has to be scaled by however much the document is shrunk and then
   * added to where the viewer starts on the page. Getting either wrong sends
   * the reader to roughly the right area, which on a ten-page contract is the
   * same as not moving them at all.
   */
  const goToPage = useCallback(
    (index: number) => {
      const top = pageTops[index];
      const host = containerRef.current;
      if (top == null || !host) return;
      const hostTop = host.getBoundingClientRect().top + window.scrollY;
      // A little air above the sheet, so it does not sit flush under the header.
      window.scrollTo({ top: Math.max(0, hostTop + top * responsiveScale - 12), behavior: 'smooth' });
    },
    [pageTops, responsiveScale],
  );

  /*
    Which sheet is being read, tracked from the window's own scroll.

    Passive, because this fires on every scroll frame and a listener that can
    call preventDefault forces the browser to wait for it before painting —
    which is exactly the stutter this viewer was reported for.
  */
  useEffect(() => {
    if (!pageTops.length) return;
    const onScroll = () => {
      const host = containerRef.current;
      if (!host) return;
      const hostTop = host.getBoundingClientRect().top + window.scrollY;
      const eye = window.scrollY + window.innerHeight * 0.3;
      let current = 0;
      for (let i = 0; i < pageTops.length; i += 1) {
        if (hostTop + pageTops[i] * responsiveScale <= eye) current = i;
      }
      setCurrentPage((prev) => (prev === current + 1 ? prev : current + 1));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pageTops, responsiveScale]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-white">
        <ArrowPathIcon className="w-9 h-9 text-cyan-400 animate-spin mb-3.5" />
        <p className="text-sm font-semibold text-muted-foreground">Loading partnership dossier…</p>
        <p className="text-xs text-muted-foreground mt-1">Preparing verified institutional documents</p>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-white p-4 text-center">
        <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-4 font-black text-2xl shadow-xl">
          !
        </div>
        <h1 className="text-xl font-bold text-white mb-2">
          {withdrawn ? "Document withdrawn" : "Document Not Found"}
        </h1>
        <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
          {error ||
            (withdrawn
              ? "This document is no longer current. Please contact us for an up-to-date copy."
              : "The requested document does not exist or the link is not valid.")}
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
    <div className="min-h-screen bg-background text-white flex flex-col font-sans selection:bg-cyan-500/30">
      {/* ── Top Executive Sticky Header ── */}
      <header className="sticky top-0 z-40 bg-card/95 border-b border-border backdrop-blur-md px-4 md:px-8 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xl">
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
            <p className="text-[11px] text-muted-foreground">
              {doc.school?.name ? `${doc.school.name} · ` : ""}
              Official Verified Dossier
            </p>
            {/*
              The way back in, printed where they will see it.

              Reaching this page means the reader already holds a secret for
              this document, so showing the code discloses nothing new — but
              links get buried in WhatsApp threads and forwarded mail, and
              without the code a school has no second route to its own
              agreement. Six digits typed at /p is that route.
            */}
            {doc.accessCode && (
              <p className="mt-1 text-[10px] text-muted-foreground flex flex-wrap items-center gap-1.5">
                <span className="uppercase tracking-wider font-bold text-muted-foreground">
                  Your access code
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-[11px] font-black border border-amber-500/30 tracking-widest">
                  {doc.accessCode}
                </span>
                <span className="hidden sm:inline text-muted-foreground">
                  — enter it at /p if you lose this link
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/*
            Zoom, in two sizes.

            The four-step picker below needs more room than a phone header has,
            so it has always been hidden under `sm` — which left a phone with no
            zoom at all, on the one screen where an A4 page is scaled furthest
            down and reading it matters most. This is the same control with the
            two settings that are worth having on a phone: the whole width, or
            actual size to read the small print.
          */}
          <button
            type="button"
            onClick={() => setZoom((z) => (z === "fit" ? "100" : "fit"))}
            aria-label={zoom === "fit" ? "Zoom to actual size" : "Fit document to screen"}
            className="sm:hidden flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-border bg-muted/40 text-foreground/90 text-xs font-bold active:scale-95 transition-all"
          >
            {zoom === "fit" ? (
              <MagnifyingGlassPlusIcon className="w-3.5 h-3.5" />
            ) : (
              <MagnifyingGlassMinusIcon className="w-3.5 h-3.5" />
            )}
            {zoom === "fit" ? "Actual size" : "Fit to screen"}
          </button>

          {/* Zoom Controls */}
          <div className="hidden sm:flex items-center bg-muted/40 p-1 rounded-xl border border-border text-xs font-semibold text-muted-foreground">
            <button
              onClick={() => setZoom("fit")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                zoom === "fit" ? "bg-primary text-white shadow-sm" : "hover:text-foreground"
              }`}
            >
              Fit
            </button>
            <button
              onClick={() => setZoom("75")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                zoom === "75" ? "bg-primary text-white shadow-sm" : "hover:text-foreground"
              }`}
            >
              75%
            </button>
            <button
              onClick={() => setZoom("100")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                zoom === "100" ? "bg-primary text-white shadow-sm" : "hover:text-foreground"
              }`}
            >
              100%
            </button>
            <button
              onClick={() => setZoom("125")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                zoom === "125" ? "bg-primary text-white shadow-sm" : "hover:text-foreground"
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
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-muted/40 text-foreground/80 hover:text-foreground hover:bg-white/10 text-xs font-semibold transition-all"
          >
            <PrinterIcon className="w-3.5 h-3.5" /> Print
          </button>

          {doc.kind === "mou" && doc.status !== "signed" && !doc.expired && (
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
      <div className="border-b border-border bg-card/60 px-4 md:px-8 py-3.5">
        <div className="mx-auto max-w-[880px]">
          {doc.expired && doc.status !== "signed" ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-amber-100">
                  These fees have lapsed
                  {doc.validUntil
                    ? ` — they stood until ${new Date(`${doc.validUntil}T00:00:00`).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}`
                    : ""}
                </p>
                <p className="mt-0.5 text-xs text-amber-200/70">
                  This is no longer a current offer. Contact us and we will re-issue at current rates.
                </p>
              </div>
            </div>
          ) : doc.status === "signed" ? (
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
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-cyan-500/30 bg-card/90 p-4 shadow-xl">
              <SparklesIcon className="h-6 w-6 shrink-0 text-cyan-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">
                  Memorandum of Understanding · Ready for Execution
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
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
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/90 p-4 shadow-xl">
              <EnvelopeIcon className="h-6 w-6 shrink-0 text-cyan-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">
                  Official Partnership Proposal for {doc.school?.name || "Your School"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Review the turnkey STEM curriculum, fee models, and profit share. When ready to proceed, we issue the formal MoU.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`tel:${brandContact.phone}`}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/10 transition-colors"
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
      {/*
        Centred while it fits, left-aligned once it does not.

        `items-center` and `overflow-auto` disagree when the child is wider than
        the box: centring pushes the overflow out of both sides equally, and the
        half that goes past the start edge cannot be scrolled back to — there is
        no negative scroll. At "Fit" this never arises, but the new mobile zoom
        makes an 850px document sit in a 390px column, and centred it would have
        put the left margin of the page permanently out of reach.
      */}
      <main
        ref={containerRef}
        className={`flex-1 bg-background p-3 sm:p-6 md:p-8 flex flex-col overflow-auto pb-28 md:pb-16 space-y-8 ${
          isSmallScreen && zoom !== "fit" ? "items-start" : "items-center"
        }`}
      >
        {/* Document Wrapper with Responsive Scaling for Mobile */}
        <div
          className="flex justify-center transition-all duration-200"
          style={{
            width: isSmallScreen && zoom === "fit" ? `${baseDocWidth * responsiveScale}px` : "100%",
            maxWidth: zoom === "125" ? "1060px" : zoom === "100" ? "850px" : zoom === "75" ? "640px" : "850px",
          }}
        >
          {/*
            Scaling changes what a page looks like, not how much room it takes.

            A transform is painted, not laid out: the browser still reserves the
            document's full unscaled height underneath it. The old fix was a
            negative percentage bottom margin — but percentage margins resolve
            against the container's WIDTH, never its height. On a phone that is
            about 221px of correction for roughly 6,500px of removed height, so
            a reader reached the end of a ten-page proposal and then scrolled
            through six thousand pixels of empty black. It reads as the page
            having frozen.

            The wrapper is now simply told how tall the scaled document is, and
            the document is centred by translating it rather than by relying on
            a 794mm-wide box behaving inside a 375px one.
          */}
          <div
            className="relative w-full"
            style={{
              height: isScaled && scaledHeight ? `${scaledHeight}px` : undefined,
            }}
          >
            <div
              className="bg-white shadow-2xl shadow-black/90 rounded-sm overflow-hidden"
              style={{
                width: `${baseDocWidth}px`,
                position: isScaled ? "absolute" : "relative",
                top: 0,
                left: isScaled ? "50%" : undefined,
                transform: isScaled
                  ? `translateX(-50%) scale(${responsiveScale})`
                  : undefined,
                transformOrigin: "top center",
              }}
            >
              <iframe
                ref={frameRef}
                srcDoc={doc.html}
                title={`${doc.kind === "mou" ? "MoU" : "Proposal"} ${doc.reference}`}
                sandbox="allow-same-origin allow-modals"
                className="w-full bg-white block"
                scrolling="no"
                // No minimum height once the real one is known. A floor of
                // 1400px on a document measured at 1100 is 300px of white the
                // reader has to scroll past to reach the buttons.
                style={{
                  border: "none",
                  height: docHeight ? `${docHeight}px` : "1400px",
                }}
              />
            </div>
          </div>
        </div>

        {/*
          The sheet-at-a-time navigator, for the screen that needs it most.

          A ten-page contract on a phone is eleven thousand pixels of scrolling,
          and the two things a reader wants — find the fees, then sign — are
          both a long way from wherever they are. This puts the page count, a
          way to move a sheet at a time, and the signing button in permanent
          reach at the bottom of the screen.

          Phone only. On a laptop the whole document is on screen at a readable
          size and the header controls are already visible, so a floating bar
          would be covering the document to solve a problem that screen does
          not have.
        */}
        {pageTops.length > 1 && (
          <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-border bg-card/95 backdrop-blur p-1.5 shadow-2xl shadow-black/60">
              <button
                type="button"
                onClick={() => goToPage(Math.max(0, currentPage - 2))}
                disabled={currentPage <= 1}
                aria-label="Previous page"
                className="shrink-0 w-11 h-11 rounded-xl border border-border bg-muted/40 text-foreground/90 disabled:opacity-30 active:scale-95 transition-all flex items-center justify-center"
              >
                <ChevronUpIcon className="w-4 h-4" />
              </button>

              <div className="flex-1 min-w-0 text-center">
                <div className="text-[11px] font-black text-white tabular-nums">
                  Page {currentPage} of {pageTops.length}
                </div>
                <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${(currentPage / pageTops.length) * 100}%` }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => goToPage(Math.min(pageTops.length - 1, currentPage))}
                disabled={currentPage >= pageTops.length}
                aria-label="Next page"
                className="shrink-0 w-11 h-11 rounded-xl border border-border bg-muted/40 text-foreground/90 disabled:opacity-30 active:scale-95 transition-all flex items-center justify-center"
              >
                <ChevronDownIcon className="w-4 h-4" />
              </button>

              {/* The action the whole page exists for, never more than a thumb away. */}
              {doc.kind === "mou" && doc.status !== "signed" && !doc.expired ? (
                <button
                  type="button"
                  onClick={() => setShowSignModal(true)}
                  className="shrink-0 h-11 px-4 rounded-xl bg-emerald-600 text-white text-xs font-black active:scale-95 transition-all flex items-center gap-1.5"
                >
                  <CheckCircleIcon className="w-4 h-4" /> Sign
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={savingPdf}
                  aria-label="Download PDF"
                  className="shrink-0 w-11 h-11 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center"
                >
                  {savingPdf ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowDownTrayIcon className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* The bar floats over the page, so the last section needs room under it. */}
        {pageTops.length > 1 && <div className="sm:hidden h-20 shrink-0" aria-hidden="true" />}

        {/* ── Interactive Value Pillars & Proprietor Advantage Box ── */}
        <section className="w-full max-w-[850px] rounded-3xl bg-card border border-border p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-1.5 max-w-xl mx-auto">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-cyan-400 text-[10px] font-black uppercase tracking-wider">
              <ShieldCheckIcon className="w-3.5 h-3.5" />
              Institutional Guarantee
            </span>
            <h3 className="text-lg sm:text-xl font-black text-white">Why schools partner with us</h3>
            <p className="text-xs text-muted-foreground">
              Everything needed to run coding and applied AI on your own timetable, without capital outlay.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-muted/40 border border-border space-y-1.5">
              <BanknotesIcon className="w-6 h-6 text-amber-400" />
              <p className="text-xs font-black text-white">₦0 Upfront CapEx</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Robotics kits, circuits, and learning hardware arrive with our certified facilitators.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-muted/40 border border-border space-y-1.5">
              <BuildingOffice2Icon className="w-6 h-6 text-emerald-400" />
              <p className="text-xs font-black text-white">Negotiable Revenue Share</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Direct profit-sharing settled to your school account at the end of each academic term as agreed.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-muted/40 border border-border space-y-1.5">
              <SparklesIcon className="w-6 h-6 text-cyan-400" />
              <p className="text-xs font-black text-white">12-Year STEM Matrix</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Accredited ladder from Basic 1 block coding to SS3 full-stack AI, Python &amp; IoT builds.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-muted/40 border border-border space-y-1.5">
              <DevicePhoneMobileIcon className="w-6 h-6 text-violet-400" />
              <p className="text-xs font-black text-white">Parent Progress Cards</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Scan-to-Watch QR codes so parents can see their child demonstrating working code.
              </p>
            </div>
          </div>

          {/* FAQ Accordion */}
          <div className="pt-4 border-t border-border space-y-2 overscroll-contain">
            <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3 text-center sm:text-left">
              Frequently Asked Questions by School Proprietors
            </h4>
            {PROPRIETOR_FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className="rounded-2xl bg-white/[0.03] border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full p-3.5 sm:p-4 text-left flex items-center justify-between gap-3 text-xs font-bold text-white hover:bg-muted/40 transition-colors"
                  >
                    <span>{faq.q}</span>
                    {isOpen ? (
                      <ChevronUpIcon className="w-4 h-4 text-cyan-400 shrink-0" />
                    ) : (
                      <ChevronDownIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 text-xs text-muted-foreground leading-relaxed border-t border-white/5 pt-2.5">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Direct CTA Box */}
          <div className="rounded-2xl bg-gradient-to-r from-cyan-500/10 via-muted to-cyan-500/10 border border-cyan-500/30 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div>
              <p className="text-xs font-black text-white">Ready to inspect hardware or schedule a live demo?</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
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
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 border-t border-border backdrop-blur-lg px-4 py-3 flex items-center justify-between gap-2 shadow-2xl">
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
          className="flex items-center justify-center px-3 py-2.5 rounded-xl border border-border bg-muted/40 text-xs font-bold text-muted-foreground"
        >
          Call
        </a>
        {doc.kind === "mou" && doc.status !== "signed" && !doc.expired ? (
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
