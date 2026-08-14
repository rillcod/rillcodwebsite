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

const STORAGE_KEY = "rillcod.proposalStudio.v1";

const INPUT =
  "w-full px-3.5 py-2.5 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors";
const LABEL = "block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5";

type PhotoOption = { src: string; name: string };

export function ProposalStudio({
  config,
  onChange,
  disabled,
}: {
  config: ProposalStudioConfig;
  onChange: (next: ProposalStudioConfig) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<PhotoOption[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  // Photographs are read off the filesystem, so a newly dropped one appears
  // without anybody editing a list.
  useEffect(() => {
    if (!open || photos.length || loadingPhotos) return;
    setLoadingPhotos(true);
    fetch("/api/partnerships/photos", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setPhotos((j.photos ?? []) as PhotoOption[]))
      .catch(() => setPhotos([]))
      .finally(() => setLoadingPhotos(false));
  }, [open, photos.length, loadingPhotos]);

  const set = useCallback(
    (next: ProposalStudioConfig) => {
      onChange(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // A browser refusing storage is not a reason to stop working.
      }
    },
    [onChange],
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

          {/* ── In whose words ──────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={LABEL + " mb-0"}>In whose words</span>
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
            <div>
              <label className={LABEL} htmlFor="studio-headline">
                Cover headline
              </label>
              <input
                id="studio-headline"
                className={INPUT}
                placeholder="Coding, Robotics &amp; AI for every year group"
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

          {/* ── Photographs ─────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={LABEL + " mb-0"}>
                Photographs — {config.photos.length} of 6
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

            {loadingPhotos ? (
              <div className="flex items-center justify-center py-8">
                <ArrowPathIcon className="w-5 h-5 text-primary animate-spin" />
              </div>
            ) : photos.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 flex items-center gap-2">
                <PhotoIcon className="w-4 h-4" />
                No photographs found in the events folder.
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {photos.map((p) => {
                  const index = config.photos.indexOf(p.src);
                  const chosen = index > -1;
                  const full = !chosen && config.photos.length >= 6;
                  return (
                    <button
                      key={p.src}
                      onClick={() => togglePhoto(p.src)}
                      disabled={disabled || full}
                      title={full ? "Six is all the document prints" : p.name}
                      className={`relative aspect-[4/3] rounded-xl overflow-hidden border-2 transition-all disabled:opacity-30 ${
                        chosen ? "border-primary" : "border-transparent hover:border-border"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.src} alt="" className="w-full h-full object-cover" />
                      {chosen && (
                        <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-2">
              They print above the signature, in the order picked. Drop more into{" "}
              <span className="font-mono">public/images/EVENTS/</span> and they appear here.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** What the browser remembered, or the complete document. */
export function loadStudioConfig(): ProposalStudioConfig {
  if (typeof window === "undefined") return defaultStudioConfig();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStudioConfig();
    return normaliseStudioConfig(JSON.parse(raw));
  } catch {
    return defaultStudioConfig();
  }
}
