"use client";

/**
 * The proposal studio: what this school sees, and in whose words.
 *
 * The document renders itself from stored data; this decides which of it goes
 * out. Every control here changes the next preview, and the preview is the same
 * render the issue path performs — so nothing is styled one way in the studio
 * and another on the page.
 *
 * Settings persist in the browser, the way the card studio's do. They are a
 * working preference rather than a company record: two people preparing two
 * proposals should not fight over one stored layout, and anything that must
 * outlive the browser is already in the database.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  PhotoIcon,
  SparklesIcon,
} from "@/lib/icons";
import {
  ALL_SECTIONS,
  SECTION_LABELS,
  defaultStudioConfig,
  normaliseStudioConfig,
  type ProposalStudioConfig,
} from "@/lib/partnerships/studio-config";
// The placeholder shows the copy that actually prints when this is left blank,
// so it cannot drift from the house headline the way a typed-out string did.
import { AUTHORED_NARRATIVE } from "@/lib/partnerships/proposal-narrative";

import {
  MEDIA_CATEGORIES,
  type MediaCategory,
  type MediaAsset,
} from "@/lib/partnerships/media-library";

const STORAGE_KEY = (schoolId?: string | null) =>
  schoolId ? `rillcod.proposalStudio.v1:${schoolId}` : "rillcod.proposalStudio.v1";

const INPUT =
  "w-full px-3.5 py-2.5 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors";
const LABEL = "block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5";

export type StudioSchool = {
  id?: string;
  name: string;
  city?: string | null;
  state?: string | null;
  student_count?: number | null;
};

export function ProposalStudio({
  config,
  onChange,
  disabled,
  school,
}: {
  config: ProposalStudioConfig;
  onChange: (next: ProposalStudioConfig) => void;
  disabled?: boolean;
  school?: StudioSchool | null;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      setOpen(true);
    }
  }, []);
  const [photos, setPhotos] = useState<MediaAsset[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<MediaCategory>("all");
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);

  // AI Copilot Studio State
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiAngle, setAiAngle] = useState<"executive" | "robotics" | "admissions" | "zero_capex">("executive");
  const [aiNotes, setAiNotes] = useState("");
  const [aiSuccess, setAiSuccess] = useState("");
  const [aiError, setAiError] = useState("");

  // Photographs and videos are read off the media library API.
  useEffect(() => {
    if (!open || photos.length || loadingPhotos) return;
    setLoadingPhotos(true);
    fetch("/api/partnerships/photos", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setPhotos((j.photos ?? []) as MediaAsset[]))
      .catch(() => setPhotos([]))
      .finally(() => setLoadingPhotos(false));
  }, [open, photos.length, loadingPhotos]);

  const filteredPhotos = useMemo(() => {
    if (selectedCategory === "all") return photos;
    return photos.filter((p) => p.category === selectedCategory);
  }, [photos, selectedCategory]);

  const set = useCallback(
    (next: ProposalStudioConfig) => {
      onChange(next);
      try {
        window.localStorage.setItem(STORAGE_KEY(school?.id), JSON.stringify(next));
      } catch {
        // A browser refusing storage is not a reason to stop working.
      }
    },
    [onChange, school?.id],
  );

  const toggleSection = (key: (typeof ALL_SECTIONS)[number]) =>
    set({ ...config, sections: { ...config.sections, [key]: !config.sections[key] } });

  const setCopy = (field: "headline" | "opening" | "closing", value: string) =>
    set({ ...config, copy: { ...config.copy, [field]: value || null } });

  const togglePhoto = (src: string) => {
    const has = config.photos.includes(src);
    // Six is what the document prints; beyond that a selection would silently
    // do nothing, which is worse than refusing it.
    if (!has && config.photos.length >= 6) return;
    set({
      ...config,
      photos: has ? config.photos.filter((p) => p !== src) : [...config.photos, src],
    });
  };

  const grouped = useMemo(() => {
    const byPage = new Map<string, typeof SECTION_LABELS>();
    for (const s of SECTION_LABELS) {
      byPage.set(s.page, [...(byPage.get(s.page) ?? []), s]);
    }
    return [...byPage.entries()];
  }, []);

  async function handleAIGenerate() {
    setAiGenerating(true);
    setAiSuccess("");
    setAiError("");
    try {
      const res = await fetch("/api/partnerships/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_name: school?.name || "Prospective School",
          city: school?.city,
          state: school?.state,
          student_count: school?.student_count,
          angle: aiAngle,
          notes: aiNotes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to generate AI pitch");
      if (json.narrative) {
        set({
          ...config,
          copy: {
            headline: json.narrative.headline || null,
            opening: json.narrative.opening || null,
            closing: json.narrative.closing || null,
          },
        });
        setAiSuccess(`Tailored AI pitch generated for ${school?.name || "the school"}!`);
      }
    } catch (err: any) {
      setAiError(err.message || "Failed to generate AI pitch");
    } finally {
      setAiGenerating(false);
    }
  }

  const offCount = ALL_SECTIONS.filter((k) => config.sections[k] === false).length;
  const edited = Object.values(config.copy).filter(Boolean).length;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-5 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-primary" />
            Proposal studio
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {offCount === 0 && edited === 0
              ? "The complete document, in the house words."
              : [
                  offCount ? `${offCount} section${offCount === 1 ? "" : "s"} hidden` : "",
                  edited ? `${edited} passage${edited === 1 ? "" : "s"} rewritten` : "",
                  `${config.photos.length} photograph${config.photos.length === 1 ? "" : "s"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        </div>
        <ChevronDownIcon
          className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-border p-5 space-y-6">
          {/* ── What prints ─────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className={LABEL + " mb-0"}>What prints</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => set({ ...config, sections: defaultStudioConfig().sections })}
                  disabled={disabled}
                  className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-40"
                >
                  Everything
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  onClick={() =>
                    set({
                      ...config,
                      // The spine of a quote: who, what it costs, what it is worth,
                      // and where to sign. Everything else is elaboration.
                      sections: Object.fromEntries(
                        ALL_SECTIONS.map((k) => [
                          k,
                          ['intro', 'pitch', 'offers', 'split', 'upside', 'contact'].includes(k),
                        ]),
                      ) as ProposalStudioConfig["sections"],
                    })
                  }
                  disabled={disabled}
                  className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-40"
                >
                  Short version
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {grouped.map(([page, items]) => (
                <div key={page}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                    {page}
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {items.map((s) => {
                      const isOn = config.sections[s.key] !== false;
                      return (
                        <button
                          key={s.key}
                          onClick={() => toggleSection(s.key)}
                          disabled={disabled}
                          className={`text-left px-3 py-2.5 rounded-xl border transition-colors disabled:opacity-40 ${
                            isOn
                              ? "border-primary/50 bg-primary/10"
                              : "border-border bg-muted/30"
                          }`}
                        >
                          <span className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 w-4 h-4 rounded-md border shrink-0 flex items-center justify-center ${
                                isOn ? "bg-primary border-primary" : "border-border"
                              }`}
                            >
                              {isOn && (
                                <CheckCircleIcon className="w-3 h-3 text-primary-foreground" />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span
                                className={`block text-sm ${isOn ? "text-foreground" : "text-muted-foreground line-through"}`}
                              >
                                {s.label}
                              </span>
                              <span className="block text-[11px] text-muted-foreground mt-0.5 leading-snug">
                                {s.hint}
                              </span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── In whose words (AI Copilot & Copy Customizer) ─────────── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={LABEL + " mb-0"}>In whose words (AI Pitch Studio)</span>
              {edited > 0 && (
                <button
                  onClick={() => set({ ...config, copy: {} })}
                  disabled={disabled}
                  className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-40"
                >
                  Back to the house copy
                </button>
              )}
            </div>

            {/* AI Pitch Studio Copilot Box */}
            <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/20 via-slate-900/60 to-slate-900/90 p-4 space-y-3.5 shadow-md">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-violet-600/30 border border-violet-500/40 flex items-center justify-center text-violet-300">
                    <SparklesIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">
                      AI Proposal Copilot {school?.name ? `for ${school.name}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Generate high-converting headlines and openings tailored to Nigerian school proprietors.
                    </p>
                  </div>
                </div>
              </div>

              {/* Pitch Angle Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                {[
                  { key: "executive", label: "🌟 Executive Prestige", tag: "Accreditation" },
                  { key: "robotics", label: "🤖 Robotics Mastery", tag: "Hardware & Competitions" },
                  { key: "admissions", label: "📈 Admissions & PTA", tag: "Expos & Growth" },
                  { key: "zero_capex", label: "₦0 CapEx Turnkey", tag: "Profit & Zero Risk" },
                ].map((a) => {
                  const isSelected = aiAngle === a.key;
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => setAiAngle(a.key as any)}
                      className={`p-2 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "bg-violet-600/20 border-violet-500 text-violet-300 shadow-sm"
                          : "bg-muted/30 border-border/80 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      }`}
                    >
                      <span className="block text-xs font-bold">{a.label}</span>
                      <span className="text-[9.5px] opacity-75 block">{a.tag}</span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Notes / Specific Proprietor Context */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  placeholder="Optional context (e.g., Met Mr. Adebayo, interested in SS3 Python & robotics expo)"
                  value={aiNotes}
                  onChange={(e) => setAiNotes(e.target.value)}
                  className="flex-1 px-3 py-2 bg-muted/60 border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-violet-500"
                />
                <button
                  type="button"
                  onClick={handleAIGenerate}
                  disabled={aiGenerating || disabled}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 shrink-0"
                >
                  {aiGenerating ? (
                    <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <SparklesIcon className="w-3.5 h-3.5" />
                  )}
                  <span>{aiGenerating ? "Generating Copy…" : "✨ AI Generate Pitch"}</span>
                </button>
              </div>

              {aiSuccess && (
                <p className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                  <CheckCircleIcon className="w-3.5 h-3.5" />
                  {aiSuccess}
                </p>
              )}
              {aiError && (
                <p className="text-xs text-rose-400 font-medium">{aiError}</p>
              )}
            </div>

            <div>
              <label className={LABEL} htmlFor="studio-headline">
                Cover headline
              </label>
              <input
                id="studio-headline"
                className={INPUT}
                placeholder={AUTHORED_NARRATIVE.headline}
                value={config.copy.headline ?? ""}
                onChange={(e) => setCopy("headline", e.target.value)}
                disabled={disabled}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="studio-opening">
                Opening paragraph
              </label>
              <textarea
                id="studio-opening"
                rows={3}
                className={INPUT}
                placeholder="Leave blank for the house pitch."
                value={config.copy.opening ?? ""}
                onChange={(e) => setCopy("opening", e.target.value)}
                disabled={disabled}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="studio-closing">
                Closing line
              </label>
              <textarea
                id="studio-closing"
                rows={2}
                className={INPUT}
                placeholder="Leave blank for the house close."
                value={config.copy.closing ?? ""}
                onChange={(e) => setCopy("closing", e.target.value)}
                disabled={disabled}
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Fees, the split and the curriculum are never editable here — they come from the
              agreed record, so a document cannot quote a number nobody agreed.
            </p>
          </div>

          {/* ── Media & Event Assets (Photos & Videos) ────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={LABEL + " mb-0"}>
                Classroom &amp; Event Media — {config.photos.length} of 6 selected
              </span>
              {config.photos.length > 0 && (
                <button
                  onClick={() => set({ ...config, photos: [] })}
                  disabled={disabled}
                  className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-40"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              {MEDIA_CATEGORIES.map((cat) => {
                const active = selectedCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setSelectedCategory(cat.key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            {loadingPhotos ? (
              <div className="flex items-center justify-center py-8">
                <ArrowPathIcon className="w-5 h-5 text-primary animate-spin" />
              </div>
            ) : filteredPhotos.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 flex items-center gap-2">
                <PhotoIcon className="w-4 h-4" />
                No media found for this category.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
                {filteredPhotos.map((p) => {
                  const isVideo = p.mediaType === "video" || /\.(mp4|webm|mov)$/i.test(p.src);
                  const index = config.photos.indexOf(p.src);
                  const chosen = index > -1;
                  const full = !chosen && config.photos.length >= 6;

                  return (
                    <div
                      key={p.src}
                      className={`group relative aspect-[4/3] rounded-xl overflow-hidden border-2 bg-slate-900 transition-all ${
                        chosen ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"
                      }`}
                    >
                      {isVideo ? (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-2 text-center relative">
                          <span className="text-2xl mb-1">🎥</span>
                          <span className="text-[10px] font-bold text-slate-200 line-clamp-2 leading-tight">
                            {p.title || p.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPreviewVideo(p.src)}
                            className="mt-1.5 px-2 py-0.5 rounded bg-violet-600/30 text-violet-300 hover:bg-violet-600 hover:text-white text-[9px] font-bold transition-colors"
                          >
                            ▶ Play Demo
                          </button>
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.src}
                          alt={p.title || p.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      )}

                      {/* Top Badges */}
                      <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                        {chosen && (
                          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-black flex items-center justify-center shadow-md">
                            {index + 1}
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[8px] font-bold uppercase tracking-wider text-white">
                          {p.category || (isVideo ? "Video" : "Photo")}
                        </span>
                      </div>

                      {/* Select Toggle Button */}
                      {!isVideo && (
                        <button
                          type="button"
                          onClick={() => togglePhoto(p.src)}
                          disabled={disabled || full}
                          title={full ? "Six is all the document prints" : chosen ? "Remove from proposal" : "Add to proposal"}
                          className={`absolute bottom-1.5 right-1.5 px-2 py-1 rounded-lg text-[10px] font-bold transition-all shadow-md ${
                            chosen
                              ? "bg-emerald-600 text-white"
                              : "bg-black/75 hover:bg-primary text-white"
                          }`}
                        >
                          {chosen ? "✓ Selected" : "+ Pick"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground mt-2.5">
              Selected photos print above the signature. Videos are available for Scan-to-Watch capstones.
            </p>
          </div>

          {/* Video Lightbox Preview Modal */}
          {previewVideo && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
              <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-white/10 p-4 shadow-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    🎥 Student Capstone Video Demo
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewVideo(null)}
                    className="text-slate-400 hover:text-white text-xs font-bold p-1"
                  >
                    ✕ Close
                  </button>
                </div>
                <video
                  src={previewVideo}
                  controls
                  autoPlay
                  className="w-full rounded-xl bg-black max-h-[340px] object-contain"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** What this school’s browser remembered, or the complete document. */
export function loadStudioConfig(schoolId?: string | null): ProposalStudioConfig {
  if (typeof window === "undefined") return defaultStudioConfig();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY(schoolId));
    if (!raw) return defaultStudioConfig();
    return normaliseStudioConfig(JSON.parse(raw));
  } catch {
    return defaultStudioConfig();
  }
}
