"use client";

/**
 * Where a school executes its agreement.
 *
 * This is the only unauthenticated write in the partnership desk, and what it
 * writes is a contract — so the dialogue is built to produce a record that
 * holds up rather than merely to collect a squiggle:
 *
 *   - the signature is captured as strokes, not pixels, so it can be smoothed,
 *     undone, redrawn after a rotation, and cropped to its own ink on the way
 *     out;
 *   - what is being signed, by whom, in what capacity and on what date is
 *     stated on the face of the dialogue, and the authority to bind the school
 *     is affirmed explicitly rather than implied by a button label;
 *   - the exported image is composited onto white at print resolution, because
 *     its destination is a PDF somebody may hold in their hand in court.
 *
 * It keeps its own dark palette instead of adopting the shared <Modal>: it
 * opens over a page that is always dark, and <Modal> paints from theme tokens,
 * which would turn this white for a reader whose system is in light mode. The
 * behaviours that matter — scroll lock, Escape, focus containment, a footer
 * that never scrolls away — are implemented here deliberately.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowPathIcon, CheckCircleIcon, XMarkIcon } from "@/lib/icons";
import { useOverlayScrollLock } from "@/components/ui/BodyPortal";

type Point = { x: number; y: number };
/** One continuous press-drag-release. Kept so it can be undone on its own. */
type Stroke = Point[];

/** Ink width in CSS pixels, at the size the canvas is displayed. */
const STROKE_WIDTH = 2.4;
/** Multiplier applied when exporting, so the PDF gets a sharp signature. */
const EXPORT_SCALE = 3;
/** Whitespace left around the cropped signature, in CSS pixels. */
const EXPORT_PADDING = 10;
/** Below this the "signature" is a tap or a slip of the finger, not a mark. */
const MIN_INK_POINTS = 8;

const SIGNATURE_FONT_STACK =
  "'Segoe Script', 'Bradley Hand', 'Lucida Handwriting', 'Dancing Script', cursive, serif";

/*
  The titles that actually sign for a Nigerian school.

  A free-text box on a legal document collects "Proprietor", "proprietor",
  "Prop.", "Owner/Proprietress" and "MD" for the same office, and the role is
  printed on the contract and stored on the row — so the inconsistency is
  permanent. A list also tells the signer what sort of answer is wanted: a
  title, not their name, which is the mistake a blank box invites.

  "Other" is not optional politeness. Titles vary — Administrator, Trustee,
  Group Head — and a closed list would stop a legitimate signatory from
  executing an agreement, which is a far worse failure than untidy data.
*/
const SIGNATORY_ROLES = [
  'Proprietor',
  'Proprietress',
  'Principal',
  'Head of School',
  'Vice Principal',
  'Director',
  'Board Chair',
  'School Administrator',
] as const;

const OTHER_ROLE = '__other__';

export function SignatureModal({
  reference,
  token,
  schoolName,
  onSigned,
  onClose,
}: {
  reference: string;
  /** The secret the signing endpoint is keyed on. The reference is not a secret. */
  token: string;
  schoolName?: string | null;
  onSigned: (info: { name: string; role: string; signedAt: string }) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"draw" | "type">("type");
  const [name, setName] = useState("");
  /** The chosen option, or OTHER_ROLE when the signatory is typing their own. */
  const [rolePick, setRolePick] = useState<string>("Proprietor");
  const [roleOther, setRoleOther] = useState("");
  const role = rolePick === OTHER_ROLE ? roleOther : rolePick;
  const [authorised, setAuthorised] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  /*
    The signature as geometry rather than as a bitmap.

    Holding the strokes is what makes everything else possible: undo removes the
    last one, a rotation redraws them at the new size instead of wiping them,
    and the export can measure their extent and crop to it. A canvas alone
    remembers none of that — once drawn, pixels are all there is.
  */
  const strokesRef = useRef<Stroke[]>([]);
  const activeRef = useRef<Stroke | null>(null);
  /** Mirrors the stroke count into render-land, so buttons can react to it. */
  const [strokeCount, setStrokeCount] = useState(0);

  const [executionDate, setExecutionDate] = useState("");
  useEffect(() => {
    // Set after mount, never during render: a date computed while rendering
    // differs between server and client and desynchronises hydration.
    setExecutionDate(
      new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    );
  }, []);

  useOverlayScrollLock(true);

  /* ── Canvas ─────────────────────────────────────────────────────────── */

  /** Apply the pen to a context. Resizing resets these, so it is a function. */
  const applyPen = (ctx: CanvasRenderingContext2D, width = STROKE_WIDTH) => {
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  };

  /*
    Draw a stroke through its points instead of between them.

    Joining raw pointer samples with straight lines produces visible corners at
    every sample — handwriting drawn that way looks like a seismograph. Curving
    through the midpoint of each pair, with the sample itself as the control
    point, gives a continuous line that follows the hand.
  */
  const tracePath = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.length === 0) return;
    if (stroke.length < 3) {
      // Too short to curve: a dot, drawn as one.
      const p = stroke[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, STROKE_WIDTH / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#0f172a";
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length - 1; i += 1) {
      const mid = {
        x: (stroke[i].x + stroke[i + 1].x) / 2,
        y: (stroke[i].y + stroke[i + 1].y) / 2,
      };
      ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, mid.x, mid.y);
    }
    const last = stroke[stroke.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  };

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    applyPen(ctx);
    for (const stroke of strokesRef.current) tracePath(ctx, stroke);
    if (activeRef.current) tracePath(ctx, activeRef.current);
  }, []);

  /*
    Keep the bitmap the same size as the box it is shown in.

    The bitmap used to be a fixed 440x120 while the element is `w-full h-32`,
    which are two different coordinate systems: pointer positions arrive in CSS
    pixels from getBoundingClientRect, but the context draws in bitmap pixels.
    On any width other than 440 the ink landed somewhere other than under the
    finger, further out the narrower the phone. Sizing the bitmap to the element
    and scaling by devicePixelRatio makes one CSS pixel one drawing unit.
  */
  useEffect(() => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
      // The strokes survive the resize, so a rotation mid-signature no longer
      // throws the signature away.
      redraw();
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [mode, redraw]);

  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  /*
    Pointer events, not a mouse pair plus a touch pair: one path covers finger,
    stylus and mouse. Pointer capture is what keeps a stroke attached when a
    finger slides past the edge of the canvas mid-signature — without it the
    stroke ends there and the next contact starts a new one.
  */
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (submitting) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    activeRef.current = [pointAt(e)];
    redraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeRef.current) return;
    // Coalesced events give every sample the device captured between frames,
    // not just the latest — the difference between a smooth curve and a
    // polygon when a hand moves quickly.
    const samples =
      typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : [];
    const rect = e.currentTarget.getBoundingClientRect();
    if (samples.length > 0) {
      for (const s of samples) {
        activeRef.current.push({ x: s.clientX - rect.left, y: s.clientY - rect.top });
      }
    } else {
      activeRef.current.push(pointAt(e));
    }
    redraw();
  };

  const endStroke = () => {
    const stroke = activeRef.current;
    activeRef.current = null;
    if (!stroke || stroke.length === 0) return;
    strokesRef.current = [...strokesRef.current, stroke];
    setStrokeCount(strokesRef.current.length);
    redraw();
  };

  const undoStroke = () => {
    strokesRef.current = strokesRef.current.slice(0, -1);
    setStrokeCount(strokesRef.current.length);
    redraw();
  };

  const clearCanvas = () => {
    strokesRef.current = [];
    activeRef.current = null;
    setStrokeCount(0);
    redraw();
  };

  /** Total samples across all strokes — the measure of "something was drawn". */
  const inkPoints = useMemo(
    () => strokesRef.current.reduce((n, s) => n + s.length, 0),
    // strokeCount is the render-visible proxy for strokesRef mutating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [strokeCount],
  );

  /* ── Export ─────────────────────────────────────────────────────────── */

  /*
    Crop to the ink, composite onto white, and render at print resolution.

    The old export handed over the whole canvas exactly as drawn: a transparent
    PNG the full width of the input box, so a short signature arrived in the
    contract as a small mark adrift in a wide empty field, and transparency left
    it at the mercy of whatever colour sat behind it in the PDF. Measuring the
    strokes and cropping to them means the signature fills its space the way an
    ink signature on paper does.
  */
  const exportDrawnSignature = (): string | null => {
    const strokes = strokesRef.current;
    if (strokes.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const stroke of strokes) {
      for (const p of stroke) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }
    if (!Number.isFinite(minX)) return null;

    const pad = EXPORT_PADDING + STROKE_WIDTH;
    const w = Math.max(1, maxX - minX + pad * 2);
    const h = Math.max(1, maxY - minY + pad * 2);

    const out = document.createElement("canvas");
    out.width = Math.round(w * EXPORT_SCALE);
    out.height = Math.round(h * EXPORT_SCALE);
    const ctx = out.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
    ctx.translate(-minX + pad, -minY + pad);
    applyPen(ctx);
    for (const stroke of strokes) tracePath(ctx, stroke);

    return out.toDataURL("image/png");
  };

  /** The typed alternative, rendered at the same print resolution. */
  const exportTypedSignature = (): string | null => {
    const text = name.trim();
    if (!text) return null;

    const measure = document.createElement("canvas").getContext("2d");
    if (!measure) return null;
    const fontSize = 34;
    measure.font = `italic 700 ${fontSize}px ${SIGNATURE_FONT_STACK}`;
    const width = Math.ceil(measure.measureText(text).width) + EXPORT_PADDING * 4;
    const height = Math.ceil(fontSize * 2.1);

    const out = document.createElement("canvas");
    out.width = width * EXPORT_SCALE;
    out.height = height * EXPORT_SCALE;
    const ctx = out.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
    ctx.font = `italic 700 ${fontSize}px ${SIGNATURE_FONT_STACK}`;
    ctx.fillStyle = "#0f172a";
    ctx.textBaseline = "middle";
    ctx.fillText(text, EXPORT_PADDING * 2, height / 2);

    return out.toDataURL("image/png");
  };

  /* ── Validation ─────────────────────────────────────────────────────── */

  const trimmedName = name.trim();
  const trimmedRole = role.trim();
  const hasSignature = mode === "draw" ? inkPoints >= MIN_INK_POINTS : trimmedName.length > 0;

  /*
    Why the button is disabled, in words.
    A greyed-out control with no explanation is the most common way a form
    strands somebody — particularly here, where the blocking condition may be a
    checkbox further up the scroll than the button they are looking at.
  */
  const blockedBecause = !trimmedName
    ? "Enter the signatory's full name."
    : trimmedName.length < 2
      ? "Enter the signatory's full name."
      : !trimmedRole
        ? "Enter the signatory's official title or role."
        : !hasSignature
          ? mode === "draw"
            ? "Draw your signature in the box above."
            : "Type the signatory's name to generate a signature."
          : !authorised
            ? "Confirm you are authorised to bind the school."
            : null;

  const canSubmit = !blockedBecause && !submitting;

  /* ── Submit ─────────────────────────────────────────────────────────── */

  const submit = async () => {
    if (blockedBecause) {
      setError(blockedBecause);
      return;
    }

    const signature = mode === "draw" ? exportDrawnSignature() : exportTypedSignature();
    if (!signature) {
      setError("That signature could not be captured. Please try again.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/p/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatory_name: trimmedName,
          signatory_role: trimmedRole,
          signature_data_url: signature,
          authorised: true,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not sign document.");

      onSigned({
        name: json.signatoryName,
        role: trimmedRole,
        signedAt: json.signedAt,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete signature.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Dialogue behaviour ─────────────────────────────────────────────── */

  /*
    Escape to leave, Tab kept inside, focus returned on the way out.

    A dialogue that does not contain focus lets a keyboard user tab straight
    into the document behind it and carry on there while the dialogue is still
    covering the screen — they are then editing something they cannot see.
  */
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Focus the first field rather than the panel: on a phone this is also what
    // raises the keyboard without a second tap.
    nameRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Never mid-flight: the signature may already be recorded, and closing
        // now would leave the reader believing it was not.
        if (!submitting) {
          e.preventDefault();
          onClose();
        }
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose, submitting]);

  const documentLabel = "Memorandum of Understanding";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-slate-950/85 backdrop-blur-md overscroll-contain sm:p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-title"
        aria-describedby="sign-subtitle"
        onClick={(e) => e.stopPropagation()}
        /*
          A sheet rising from the bottom on a phone, a centred panel on a
          laptop — the shape each platform already uses for "one decision, now".
          `dvh` rather than `vh` so the cap follows the browser chrome as it
          collapses instead of running underneath it.
        */
        className="w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] flex flex-col rounded-t-3xl sm:rounded-2xl border border-violet-500/30 bg-slate-900 shadow-2xl overflow-hidden text-white"
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 border-b border-white/10 bg-slate-950/60 shrink-0">
          <div className="min-w-0">
            <h3 id="sign-title" className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircleIcon className="w-5 h-5 text-emerald-400 shrink-0" />
              Execute Agreement
            </h3>
            <p id="sign-subtitle" className="text-xs text-slate-400 mt-1 leading-relaxed">
              {documentLabel}{" "}
              <span className="font-mono text-violet-300 break-all">{reference}</span>
              {schoolName ? (
                <>
                  {" "}
                  on behalf of <span className="text-slate-300 font-semibold">{schoolName}</span>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close without signing"
            className="p-2 -m-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-40 shrink-0"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 space-y-5">
          {error && (
            <p
              role="alert"
              className="px-4 py-2.5 text-xs font-medium text-red-200 bg-red-500/10 border border-red-500/25 rounded-xl"
            >
              {error}
            </p>
          )}

          <div className="space-y-4">
            <div>
              <label
                htmlFor="sign-name"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                Signatory full name <span className="text-red-400">*</span>
              </label>
              <input
                id="sign-name"
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dr. Emmanuel Okon"
                autoComplete="name"
                autoCapitalize="words"
                // 16px until sm, or iOS Safari zooms in on focus and never back.
                className="w-full min-h-[44px] px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-base sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25"
              />
            </div>

            <div>
              <label
                htmlFor="sign-role"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                Official title / role <span className="text-red-400">*</span>
              </label>
              <select
                id="sign-role"
                value={rolePick}
                onChange={(e) => setRolePick(e.target.value)}
                className="w-full min-h-[44px] px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-base sm:text-sm text-white focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25"
              >
                {SIGNATORY_ROLES.map((r) => (
                  // Dark options: on Windows a <select> renders its list with the
                  // OS palette, so white-on-white is the default failure here.
                  <option key={r} value={r} className="bg-slate-900 text-white">
                    {r}
                  </option>
                ))}
                <option value={OTHER_ROLE} className="bg-slate-900 text-white">
                  Other…
                </option>
              </select>
              {rolePick === OTHER_ROLE && (
                <input
                  type="text"
                  value={roleOther}
                  onChange={(e) => setRoleOther(e.target.value)}
                  placeholder="Enter your official title"
                  autoCapitalize="words"
                  autoFocus
                  className="mt-2 w-full min-h-[44px] px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-base sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25"
                />
              )}
            </div>
          </div>

          {/* ── Signature ── */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Signature <span className="text-red-400">*</span>
              </span>
              <div
                role="tablist"
                aria-label="Signature method"
                className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10 text-xs"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "type"}
                  onClick={() => setMode("type")}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    mode === "type"
                      ? "bg-violet-600 text-white font-semibold shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Type
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "draw"}
                  onClick={() => setMode("draw")}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    mode === "draw"
                      ? "bg-violet-600 text-white font-semibold shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Draw
                </button>
              </div>
            </div>

            {mode === "draw" ? (
              <div>
                <div className="relative">
                  <canvas
                    ref={canvasRef}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endStroke}
                    onPointerCancel={endStroke}
                    onPointerLeave={endStroke}
                    aria-label="Signature drawing area"
                    /*
                      `touch-none` is touch-action: none, and it is what stops
                      the browser reading a signature as a scroll or a
                      pull-to-refresh and taking the gesture away mid-stroke.
                    */
                    className="w-full h-36 sm:h-32 bg-white rounded-xl cursor-crosshair touch-none overscroll-contain shadow-inner"
                  />
                  {strokeCount === 0 && !activeRef.current && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400 select-none">
                      Sign here with your finger or mouse
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <span className="text-[11px] text-slate-500">
                    Drawn signatures are cropped and saved at print resolution.
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={undoStroke}
                      disabled={strokeCount === 0}
                      className="min-h-[36px] px-3 text-[11px] font-semibold bg-white/5 hover:bg-white/10 disabled:opacity-30 text-slate-300 rounded-lg border border-white/10 transition-colors"
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      onClick={clearCanvas}
                      disabled={strokeCount === 0}
                      className="min-h-[36px] px-3 text-[11px] font-semibold bg-white/5 hover:bg-white/10 disabled:opacity-30 text-slate-300 rounded-lg border border-white/10 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="h-36 sm:h-32 bg-white rounded-xl flex items-center justify-center px-4 shadow-inner overflow-hidden">
                  <span
                    className="italic text-2xl sm:text-3xl text-slate-900 font-bold text-center break-words"
                    style={{ fontFamily: SIGNATURE_FONT_STACK }}
                  >
                    {trimmedName || "Your signature appears here"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Your typed name is rendered as your signature and carries the same effect.
                </p>
              </div>
            )}
          </div>

          {/* ── Declaration ── */}
          <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 cursor-pointer hover:bg-white/[0.05] transition-colors">
            <input
              type="checkbox"
              checked={authorised}
              onChange={(e) => setAuthorised(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-white/20 bg-white/10 text-emerald-500 focus:ring-2 focus:ring-emerald-500/40 accent-emerald-600"
            />
            <span className="text-[11px] text-slate-300 leading-relaxed">
              {/*
                Affirmed, not assumed. This used to live in a sentence under the
                button — a statement the signer was told they were making rather
                than one they made. For an agreement executed by somebody we
                never meet, the authority to bind the school is the fact most
                worth having on the record.
              */}
              I confirm that I am duly authorised to enter into this {documentLabel} on behalf of{" "}
              <strong className="text-white">{schoolName || "the partner school"}</strong>, that the
              details above are correct, and that this electronic signature is
              legally binding.
              {executionDate ? (
                <span className="block mt-1 text-slate-500">Execution date: {executionDate}</span>
              ) : null}
            </span>
          </label>
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 border-t border-white/10 bg-slate-950/60 px-5 sm:px-6 py-4 pb-[max(1rem,var(--safe-area-bottom))] space-y-2">
          {blockedBecause && (
            <p className="text-[11px] text-amber-300/90 text-center sm:text-right">
              {blockedBecause}
            </p>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="min-h-[44px] px-4 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 disabled:opacity-40 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="flex items-center justify-center gap-2 min-h-[48px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white text-sm font-bold shadow-lg shadow-emerald-950/50 transition-all"
            >
              {submitting && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
              {submitting ? "Executing…" : "Confirm & Execute Agreement"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
