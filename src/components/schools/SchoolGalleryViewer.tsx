"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  PhotoIcon,
  VideoCameraIcon,
  SparklesIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  QrCodeIcon,
  PlusIcon,
  XMarkIcon,
  ArrowUpTrayIcon,
} from "@/lib/icons";
import {
  MEDIA_CATEGORIES,
  type MediaCategory,
} from "@/lib/partnerships/media-library";
import type { SchoolGalleryItem } from '@/lib/schools/gallery-types';
import { qrDataUrl } from "@/lib/cards/qr";

export interface SchoolGalleryViewerProps {
  schoolId: string;
  schoolName: string;
  termId?: string;
  className?: string;
}

export function SchoolGalleryViewer({
  schoolId,
  schoolName,
  termId,
  className = "",
}: SchoolGalleryViewerProps) {
  const [items, setItems] = useState<SchoolGalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<MediaCategory>("all");
  const [activeMedia, setActiveMedia] = useState<SchoolGalleryItem | null>(null);
  const [activeQrUrl, setActiveQrUrl] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Upload Form State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadCategory, setUploadCategory] = useState<Exclude<MediaCategory, "all">>("classroom");
  const [uploadTitle, setUploadTitle] = useState("");
  const [isCapstone, setIsCapstone] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchGallery = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}/gallery`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setItems(data.items || []);
      }
    } catch (err) {
      console.warn("Could not load school gallery:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGallery();
  }, [schoolId]);

  const filteredItems = items.filter((item) => {
    if (selectedCategory === "all") return true;
    return item.category === selectedCategory;
  });

  const handleOpenMedia = async (item: SchoolGalleryItem) => {
    setActiveMedia(item);
    if (item.url) {
      try {
        const fullUrl = item.url.startsWith("http")
          ? item.url
          : `${typeof window !== "undefined" ? window.location.origin : ""}${item.url}`;
        const qr = await qrDataUrl(fullUrl);
        setActiveQrUrl(qr);
      } catch {
        setActiveQrUrl(null);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
    if (!uploadTitle) {
      const defaultName = file.type.startsWith("video/")
        ? "Student Capstone Demonstration"
        : "Classroom Build & Coding Session";
      setUploadTitle(defaultName);
      if (file.type.startsWith("video/")) {
        setUploadCategory("capstone");
        setIsCapstone(true);
      }
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("category", uploadCategory);
      formData.append("title", uploadTitle || "Classroom Snapshot");
      if (termId) formData.append("term_id", termId);
      if (isCapstone) formData.append("is_capstone", "true");

      const res = await fetch(`/api/schools/${schoolId}/gallery`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setUploadSuccess(data.message || "Saved to School Gallery!");
      fetchGallery();

      setTimeout(() => {
        setUploadSuccess(null);
        setUploadFile(null);
        setUploadPreview(null);
        setUploadTitle("");
        setShowUploadModal(false);
      }, 1800);
    } catch (err: any) {
      alert(err.message || "Could not upload media. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={`space-y-4 rounded-3xl bg-slate-900/80 border border-slate-800/80 p-4 sm:p-6 shadow-xl backdrop-blur-xl ${className}`}>
      {/* Header Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
              <span>🏛️ {schoolName} Gallery</span>
            </h3>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400">
              {items.length} items
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Pooled classroom photos &amp; student video builds for term performance reports.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-black text-white shadow-md transition-all active:scale-95"
          >
            <PlusIcon className="h-4 w-4" />
            <span>Add Photo / Video</span>
          </button>

          <button
            type="button"
            onClick={fetchGallery}
            disabled={loading}
            className="flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 p-2 text-slate-300 hover:text-white transition-colors"
            title="Refresh Gallery"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin text-emerald-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filter Tabs (Kinetic touch scroll on mobile) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar touch-pan-x">
        {MEDIA_CATEGORIES.map((cat) => {
          const active = selectedCategory === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setSelectedCategory(cat.key)}
              className={`shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                active
                  ? "bg-emerald-500 text-slate-950 font-black shadow-md"
                  : "bg-slate-800/70 text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Media Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-xs text-slate-400">
          <ArrowPathIcon className="h-7 w-7 animate-spin text-emerald-400 mb-2" />
          <span>Loading school gallery vault...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-800 py-14 px-4 text-center text-xs text-slate-400">
          <PhotoIcon className="mx-auto h-10 w-10 text-slate-600 mb-2" />
          <p className="font-bold text-white text-sm">No media recorded yet for this category</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Facilitators upload snapshots during regular sessions to populate this school&apos;s term report.
          </p>
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-bold text-white transition-all"
          >
            <PlusIcon className="h-3.5 w-3.5 text-emerald-400" />
            <span>Upload First Media Item</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {filteredItems.map((item) => {
            const isVideo = item.media_type === "video";

            return (
              <div
                key={item.id}
                onClick={() => handleOpenMedia(item)}
                className="group relative aspect-[4/3] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 transition-all hover:border-emerald-500/80 hover:shadow-xl hover:shadow-emerald-950/20 cursor-pointer"
              >
                {isVideo ? (
                  <div className="flex h-full w-full flex-col items-center justify-center p-3 text-center bg-slate-950 group-hover:bg-slate-900 transition-colors">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600/30 text-violet-300 group-hover:scale-110 transition-transform mb-1.5">
                      <VideoCameraIcon className="h-5 w-5" />
                    </div>
                    <span className="text-[11px] font-bold text-white line-clamp-2 leading-tight px-1">
                      {item.title}
                    </span>
                    <span className="mt-1.5 rounded-md bg-violet-600/20 px-2 py-0.5 text-[9px] font-bold text-violet-300">
                      ▶ Play Clip
                    </span>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={item.title}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                )}

                {/* Top Badges */}
                <div className="absolute top-2 left-2 flex flex-wrap items-center gap-1">
                  <span className="rounded-lg bg-black/75 backdrop-blur-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white">
                    {item.category}
                  </span>
                  {item.is_capstone_demo && (
                    <span className="rounded-lg bg-amber-500 px-1.5 py-0.5 text-[8px] font-black uppercase text-slate-950 flex items-center gap-0.5 shadow-sm">
                      <QrCodeIcon className="h-2.5 w-2.5" />
                      QR Capstone
                    </span>
                  )}
                </div>

                {/* Bottom Title Bar */}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2.5 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-[11px] font-bold truncate">{item.title}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Media Detail & QR Lightbox Modal */}
      {activeMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-700/80 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="min-w-0 pr-2">
                <h4 className="text-sm sm:text-base font-black text-white truncate">{activeMedia.title}</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Category: <span className="text-emerald-400 capitalize font-bold">{activeMedia.category}</span>
                  {activeMedia.uploaded_by && ` · Uploaded by ${activeMedia.uploaded_by}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveMedia(null)}
                className="rounded-xl bg-slate-800 p-2 text-slate-400 hover:text-white transition-colors shrink-0"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Media Player / Image */}
            <div className="relative rounded-2xl overflow-hidden bg-black flex items-center justify-center min-h-[220px]">
              {activeMedia.media_type === "video" ? (
                <video
                  src={activeMedia.url}
                  controls
                  autoPlay
                  className="w-full max-h-[380px] object-contain"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeMedia.url}
                  alt={activeMedia.title}
                  className="w-full max-h-[380px] object-contain"
                />
              )}
            </div>

            {/* QR Code Bar (For Scan-to-Watch verification) */}
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-950/80 border border-slate-800 p-3.5">
              <div className="flex items-center gap-3">
                {activeQrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activeQrUrl} alt="Scan QR" className="h-14 w-14 rounded-lg bg-white p-1 shrink-0" />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                    <QrCodeIcon className="h-7 w-7 text-slate-500" />
                  </div>
                )}
                <div>
                  <p className="text-xs font-bold text-white">Scan-to-Watch Capstone QR</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Scan with phone camera to test live mobile video playback.
                  </p>
                </div>
              </div>

              <a
                href={activeMedia.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-emerald-600/30 border border-emerald-500/40 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-600 hover:text-white transition-colors shrink-0 text-center"
              >
                Open Full Asset ↗
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-700/80 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                <ArrowUpTrayIcon className="h-5 w-5 text-emerald-400" />
                <span>Upload to {schoolName} Gallery</span>
              </h4>
              <button
                type="button"
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFile(null);
                  setUploadPreview(null);
                }}
                className="rounded-xl bg-slate-800 p-2 text-slate-400 hover:text-white transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {uploadSuccess ? (
              <div className="rounded-2xl bg-emerald-950/40 border border-emerald-500/40 p-4 text-center space-y-2">
                <CheckCircleIcon className="h-8 w-8 text-emerald-400 mx-auto" />
                <p className="text-sm font-bold text-emerald-200">{uploadSuccess}</p>
              </div>
            ) : (
              <form onSubmit={handleUploadSubmit} className="space-y-3.5">
                {/* File Dropzone / Camera Trigger */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-2xl border-2 border-dashed border-slate-700 hover:border-emerald-500/80 p-5 text-center cursor-pointer transition-colors bg-slate-950/60"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                    capture="environment"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {uploadPreview ? (
                    <div className="flex flex-col items-center gap-2">
                      {uploadFile?.type.startsWith("video/") ? (
                        <div className="flex h-20 w-32 items-center justify-center rounded-xl bg-violet-950/60 border border-violet-500/40 text-violet-300">
                          <VideoCameraIcon className="h-8 w-8" />
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={uploadPreview} alt="Preview" className="h-24 max-w-full rounded-xl object-contain" />
                      )}
                      <span className="text-xs font-bold text-emerald-400">✓ {uploadFile?.name}</span>
                      <span className="text-[10px] text-slate-400">Click to change file</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 mx-auto">
                        <PhotoIcon className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-bold text-white">Snap a Photo or Select Clip</p>
                      <p className="text-[10px] text-slate-400">JPEG, PNG, WebP, MP4, WebM, MOV (Max 60MB)</p>
                    </div>
                  )}
                </div>

                {/* Title & Caption */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Title / Caption
                  </label>
                  <input
                    type="text"
                    required
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="e.g. Basic 5 Arduino Obstacle Bot Demo"
                    className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Category Selection */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Category
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {[
                      { key: "classroom", label: "🎓 Classroom" },
                      { key: "robotics", label: "🤖 Robotics" },
                      { key: "capstone", label: "🎥 Capstone" },
                      { key: "event", label: "🎪 School Event" },
                      { key: "award", label: "🏆 Exhibition" },
                    ].map((cat) => (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => {
                          setUploadCategory(cat.key as any);
                          if (cat.key === "capstone") setIsCapstone(true);
                        }}
                        className={`rounded-xl px-2.5 py-2 text-xs font-bold transition-all text-left flex items-center gap-1.5 ${
                          uploadCategory === cat.key
                            ? "bg-emerald-500 text-slate-950 font-black"
                            : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        }`}
                      >
                        <span>{cat.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Capstone Toggle */}
                <label className="flex items-center gap-2 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={isCapstone}
                    onChange={(e) => setIsCapstone(e.target.checked)}
                    className="rounded border-slate-700 text-emerald-500 focus:ring-0 h-4 w-4"
                  />
                  <div>
                    <span className="text-xs font-bold text-white">Mark as Capstone Demo Video</span>
                    <p className="text-[10px] text-slate-400">Generates Scan-to-Watch QR code on school term reports.</p>
                  </div>
                </label>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    disabled={isUploading}
                    className="rounded-xl px-3 py-2 text-xs font-bold text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!uploadFile || isUploading}
                    className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-xs font-black text-white shadow-md transition-all disabled:opacity-50"
                  >
                    {isUploading ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        <span>Uploading to Vault...</span>
                      </>
                    ) : (
                      <>
                        <SparklesIcon className="h-4 w-4" />
                        <span>Upload to School Vault</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

