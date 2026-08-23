"use client";

import React, { useState, useRef } from "react";
import {
  CameraIcon,
  VideoCameraIcon,
  SparklesIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  XMarkIcon,
  PhotoIcon,
} from "@/lib/icons";
import { type MediaCategory } from "@/lib/partnerships/media-library";

export interface TeacherSessionMediaNudgeProps {
  schoolId: string;
  schoolName: string;
  termId?: string;
  className?: string;
  onUploaded?: (item: any) => void;
  onDismiss?: () => void;
}

export function TeacherSessionMediaNudge({
  schoolId,
  schoolName,
  termId,
  className = "",
  onUploaded,
  onDismiss,
}: TeacherSessionMediaNudgeProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [category, setCategory] = useState<Exclude<MediaCategory, "all">>("classroom");
  const [title, setTitle] = useState("");
  const [isCapstone, setIsCapstone] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    if (!title) {
      const defaultName = file.type.startsWith("video/")
        ? "Student Capstone Demonstration"
        : "Classroom Build & Coding Session";
      setTitle(defaultName);
      if (file.type.startsWith("video/")) {
        setCategory("capstone");
        setIsCapstone(true);
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("category", category);
      formData.append("title", title || "Classroom Session Snapshot");
      if (termId) formData.append("term_id", termId);
      if (isCapstone) formData.append("is_capstone", "true");

      const res = await fetch(`/api/schools/${schoolId}/gallery`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setSuccessMsg(data.message || "Saved to School Term Gallery!");
      if (onUploaded) onUploaded(data.item);

      setTimeout(() => {
        setSuccessMsg(null);
        setSelectedFile(null);
        setPreviewUrl(null);
        setTitle("");
        setIsOpen(false);
      }, 2500);
    } catch (err: any) {
      alert(err.message || "Could not upload media. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 via-card to-teal-950/30 p-4 sm:p-5 shadow-xl backdrop-blur-xl transition-all ${className}`}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CameraIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                Sessional Routine
              </span>
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                Recommended · Optional
              </span>
            </div>
            <p className="text-xs text-foreground/80 mt-0.5 leading-snug">
              Snap today&apos;s build for <strong className="text-foreground">{schoolName}</strong>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            if (onDismiss) onDismiss();
          }}
          className="rounded-xl p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
          title="Dismiss"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Success Notification */}
      {successMsg ? (
        <div className="mt-3.5 flex items-center gap-2.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 p-3.5 text-xs font-bold text-emerald-200 shadow-inner">
          <CheckCircleIcon className="h-5 w-5 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      ) : (
        <div className="mt-3.5 space-y-3">
          {/* File Picker or Active Preview */}
          {!selectedFile ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 hover:bg-emerald-800 active:scale-95 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-950/40 transition-all min-h-[44px] cursor-pointer"
              >
                <CameraIcon className="h-4 w-4 shrink-0" />
                <span>Snap / Pick 1 Photo or Clip</span>
              </button>

              <span className="text-[11px] text-muted-foreground text-center sm:text-left leading-tight">
                Takes 5 seconds · Pools into school report vault
              </span>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl bg-muted/40 border border-border p-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {previewUrl && (
                  <div className="relative h-20 w-20 sm:h-16 sm:w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-black mx-auto sm:mx-0">
                    {selectedFile.type.startsWith("video/") ? (
                      <div className="flex h-full w-full flex-col items-center justify-center text-[10px] text-foreground/80">
                        <VideoCameraIcon className="h-6 w-6 text-violet-400" />
                        <span className="font-bold">Video</span>
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                    )}
                  </div>
                )}

                <div className="min-w-0 flex-1 space-y-1.5">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Short title (e.g. Basic 5 Arduino obstacle bot)"
                    className="w-full rounded-xl bg-card border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                    <label className="flex items-center gap-1.5 cursor-pointer text-emerald-400 font-bold">
                      <input
                        type="checkbox"
                        checked={isCapstone}
                        onChange={(e) => {
                          setIsCapstone(e.target.checked);
                          if (e.target.checked) setCategory("capstone");
                        }}
                        className="rounded border-border text-emerald-500 focus:ring-0 h-3.5 w-3.5"
                      />
                      <span>Capstone Demo (for QR)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Quick Category Chips (Touch Kinetic Scroll) */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar border-t border-border pt-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 mr-1">
                  Discipline:
                </span>
                {[
                  { key: "classroom", label: "🎓 Classroom" },
                  { key: "robotics", label: "🤖 Robotics" },
                  { key: "capstone", label: "🎥 Capstone" },
                  { key: "event", label: "🎪 School Event" },
                  { key: "award", label: "🏆 Award" },
                ].map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setCategory(cat.key as any)}
                    className={`shrink-0 rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition-all ${
                      category === cat.key
                        ? "bg-emerald-500 text-primary-foreground font-black shadow-sm"
                        : "bg-muted text-foreground/80 hover:bg-muted/80"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Action Buttons (Mobile-first wrapped) */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewUrl(null);
                  }}
                  disabled={uploading}
                  className="w-full sm:w-auto rounded-xl px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-2xl bg-emerald-700 hover:bg-emerald-800 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-950/40 transition-all disabled:opacity-50 min-h-[44px]"
                >
                  {uploading ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      <span>Saving to School Vault...</span>
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="h-4 w-4" />
                      <span>Save to {schoolName} Gallery</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
