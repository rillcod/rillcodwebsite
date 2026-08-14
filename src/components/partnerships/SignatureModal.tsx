"use client";

import { useRef, useState } from "react";
import { ArrowPathIcon, CheckCircleIcon, XMarkIcon } from "@/lib/icons";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState<"draw" | "type">("type");
  const [name, setName] = useState("");
  const [role, setRole] = useState("Proprietor / Principal");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const getSignatureDataUrl = (): string => {
    if (mode === "draw" && canvasRef.current) {
      return canvasRef.current.toDataURL("image/png");
    }
    // Typed text signature canvas rendering
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 100;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 400, 100);
      ctx.font = "italic 700 28px 'Segoe Script', 'Dancing Script', cursive, serif";
      ctx.fillStyle = "#0f172a";
      ctx.fillText(name || "Authorized Signature", 20, 60);
    }
    return c.toDataURL("image/png");
  };

  const submit = async () => {
    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const sigData = getSignatureDataUrl();
      const res = await fetch(`/api/p/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatory_name: name.trim(),
          signatory_role: role.trim(),
          signature_data_url: sigData,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not sign document.");

      onSigned({
        name: json.signatoryName,
        role: role.trim(),
        signedAt: json.signedAt,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete signature.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-2xl border border-violet-500/30 bg-slate-900 shadow-2xl overflow-hidden text-white">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950/50">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
              Digital Agreement Execution
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Signing Memorandum of Understanding <span className="font-mono text-violet-300">{reference}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <p className="px-4 py-2 text-xs font-medium text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl">
              {error}
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Signatory Full Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dr. Emmanuel Okon"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Official Title / Role
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Proprietor / Executive Director"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Signature Input
              </label>
              <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setMode("type")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    mode === "type" ? "bg-violet-600 text-white font-semibold shadow" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Type Name
                </button>
                <button
                  type="button"
                  onClick={() => setMode("draw")}
                  className={`px-3 py-1 rounded-md transition-all ${
                    mode === "draw" ? "bg-violet-600 text-white font-semibold shadow" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Draw Signature
                </button>
              </div>
            </div>

            {mode === "draw" ? (
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  width={440}
                  height={120}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-32 bg-white rounded-xl cursor-crosshair touch-none shadow-inner"
                />
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="absolute bottom-2 right-2 px-2.5 py-1 text-[11px] font-medium bg-slate-900/80 hover:bg-slate-900 text-slate-300 rounded-md border border-white/10"
                >
                  Clear
                </button>
              </div>
            ) : (
              <div className="h-32 bg-white rounded-xl flex items-center justify-center p-4 shadow-inner">
                <span className="font-serif italic text-2xl text-slate-900 tracking-wide font-bold">
                  {name || "Authorized Signature"}
                </span>
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
            By clicking <strong>Confirm &amp; Execute Agreement</strong>, you state that you are an authorized representative of {schoolName || "the partner school"} and agree to the commercial terms in this Memorandum.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-950/50 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !name.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-emerald-950/50 transition-all hover:scale-[1.02]"
          >
            {submitting && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
            {submitting ? "Signing…" : "Confirm & Execute Agreement"}
          </button>
        </div>
      </div>
    </div>
  );
}
