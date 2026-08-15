"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowPathIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  QrCodeIcon,
  SparklesIcon,
} from "@/lib/icons";
import { brandContact } from "@/config/brand";

export default function DocumentAccessPortalPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = code.trim();
    if (!clean) {
      setError("Please enter the code or reference from your document.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/p/lookup?code=${encodeURIComponent(clean)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Document not found. Please verify your code.");

      if (json.token) {
        router.push(`/p/${json.token}`);
      } else {
        throw new Error("Invalid document link.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not find document.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between selection:bg-violet-500 selection:text-white">
      {/* Header */}
      <header className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-900/60 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center font-bold text-white shadow-lg shadow-violet-950/50">
            R
          </div>
          <span className="text-sm font-bold tracking-tight text-white">
            {brandContact.displayName}
          </span>
        </Link>
        <span className="text-xs font-medium text-slate-400">
          Official Partnership Portal
        </span>
      </header>

      {/* Main Form Container */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900/90 border border-violet-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-violet-950/40 relative overflow-hidden backdrop-blur-xl">
          {/* Subtle glow background */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-violet-600/20 text-violet-300 border border-violet-500/30 mb-1">
                <DocumentTextIcon className="w-6 h-6" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Access Partnership Document
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">
                Enter the six-digit access code printed on your proposal or agreement.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-xs font-semibold text-red-300">
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="access-code-input"
                  className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2"
                >
                  6-Digit Code or Reference
                </label>
                <div className="relative">
                  <input
                    id="access-code-input"
                    type="text"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase());
                      if (error) setError("");
                    }}
                    placeholder="e.g. 849201"
                    autoFocus
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck="false"
                    className="w-full px-4 py-3.5 bg-slate-950/80 border border-white/15 focus:border-violet-500 rounded-2xl text-base font-mono font-bold text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 tracking-wider text-center uppercase transition-all shadow-inner"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !code.trim()}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-violet-950/50 transition-all hover:scale-[1.01]"
              >
                {loading ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    Finding Document…
                  </>
                ) : (
                  <>
                    Open &amp; Review Agreement
                    <ArrowRightIcon className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-4 border-t border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <CheckCircleIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Zero login or portal account required.</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <QrCodeIcon className="w-4 h-4 text-violet-400 shrink-0" />
                <span>Or scan the QR code printed on your document.</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-white/10 text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} {brandContact.legalName} &middot; All Rights Reserved.
      </footer>
    </div>
  );
}
