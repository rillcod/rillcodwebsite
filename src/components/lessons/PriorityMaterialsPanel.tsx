'use client';

import { useState, useRef } from 'react';
import {
  SparklesIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  LockClosedIcon,
  ArrowPathIcon,
  DocumentTextIcon,
} from '@/lib/icons';
import { compressStudentImage } from '@/lib/files/compress-student-image';

const PRIORITY_PREFIX = '[PRIORITY] ';
const PROTECTED_PREFIX = '[PROTECTED] ';

export function isPriorityMaterial(title: string | null | undefined): boolean {
  return /\[PRIORITY\]/i.test(String(title ?? ''));
}

export function isProtectedMaterial(title: string | null | undefined): boolean {
  return /\[PROTECTED\]/i.test(String(title ?? ''));
}

export function cleanMaterialTitle(title: string | null | undefined): string {
  return String(title ?? '')
    .replace(/\[PRIORITY\]\s*/gi, '')
    .replace(/\[PROTECTED\]\s*/gi, '')
    .trim();
}

export function formatMaterialStoredTitle(clean: string, priority: boolean, screenProtected: boolean): string {
  return `${priority ? PRIORITY_PREFIX : ''}${screenProtected ? PROTECTED_PREFIX : ''}${clean.trim()}`;
}

export interface PriorityMaterialItem {
  id: string;
  title: string;
  file_url: string;
  file_type?: string | null;
  content_type?: string | null;
}

interface PriorityMaterialsPanelProps {
  lessonId: string;
  materials: PriorityMaterialItem[];
  canManage: boolean;
  onMaterialsChange: (next: PriorityMaterialItem[]) => void;
  onViewMaterial: (item: PriorityMaterialItem) => void;
}

export default function PriorityMaterialsPanel({
  lessonId,
  materials,
  canManage,
  onMaterialsChange,
  onViewMaterial,
}: PriorityMaterialsPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [markAsPriority, setMarkAsPriority] = useState(true);
  const [protectScreen, setProtectScreen] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Exclude slide-deck JSON blobs (handled by SlideDeckManager) and sort priority first
  const visibleMaterials = materials
    .filter((m) => m.file_type !== 'slide-deck')
    .sort((a, b) => Number(isPriorityMaterial(b.title)) - Number(isPriorityMaterial(a.title)));

  const priorityMaterials = visibleMaterials.filter((m) => isPriorityMaterial(m.title));

  // For students, only show this priority strip if the teacher has uploaded materials
  if (!canManage && visibleMaterials.length === 0) return null;

  const handleUploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(Boolean);
    if (files.length === 0) return;
    setUploading(true);
    setNotice(null);
    const added: PriorityMaterialItem[] = [];
    try {
      for (const rawFile of files.slice(0, 5)) {
        const compressed = await compressStudentImage(rawFile, {
          maxDimension: 1440,
          targetBytes: 240 * 1024,
        });
        const fd = new FormData();
        fd.append('file', compressed);
        const upRes = await fetch('/api/files/upload', { method: 'POST', body: fd });
        const upJson = await upRes.json().catch(() => ({}));
        if (!upRes.ok) throw new Error(upJson?.error || `Could not upload "${rawFile.name}"`);

        const fileUrl = upJson?.data?.public_url || upJson?.data?.url || upJson?.data?.receipt?.url;
        if (!fileUrl) throw new Error(`No URL returned for "${rawFile.name}"`);

        const cleanName = rawFile.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || rawFile.name;
        const storedTitle = formatMaterialStoredTitle(cleanName, markAsPriority, protectScreen);
        const ext = (rawFile.name.split('.').pop() || 'file').toLowerCase();

        const matRes = await fetch(`/api/lessons/${lessonId}/materials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: storedTitle,
            file_url: fileUrl,
            file_type: ext,
          }),
        });
        const matJson = await matRes.json().catch(() => ({}));
        if (!matRes.ok || !matJson?.data) {
          throw new Error(matJson?.error || `Could not attach "${rawFile.name}" to lesson`);
        }
        added.push(matJson.data);
      }
      if (added.length > 0) {
        onMaterialsChange([...added, ...materials]);
        setNotice({
          type: 'success',
          text: `Uploaded ${added.length} protected ${markAsPriority ? 'Priority ' : ''}study material${added.length === 1 ? '' : 's'} — students can view inline only (locked during exams).`,
        });
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Upload failed.' });
    } finally {
      setUploading(false);
    }
  };

  const handleTogglePriority = async (item: PriorityMaterialItem) => {
    setBusyId(item.id);
    setNotice(null);
    const nextTitle = formatMaterialStoredTitle(
      cleanMaterialTitle(item.title),
      !isPriorityMaterial(item.title),
      isProtectedMaterial(item.title),
    );
    try {
      const res = await fetch(`/api/lessons/${lessonId}/materials/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nextTitle }),
      });
      if (!res.ok) throw new Error('Could not update priority');
      onMaterialsChange(materials.map((m) => (m.id === item.id ? { ...m, title: nextTitle } : m)));
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Could not update material.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleScreenProtect = async (item: PriorityMaterialItem) => {
    setBusyId(item.id);
    setNotice(null);
    const nextProtected = !isProtectedMaterial(item.title);
    const nextTitle = formatMaterialStoredTitle(
      cleanMaterialTitle(item.title),
      isPriorityMaterial(item.title),
      nextProtected,
    );
    try {
      const res = await fetch(`/api/lessons/${lessonId}/materials/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nextTitle }),
      });
      if (!res.ok) throw new Error('Could not update screen protection');
      onMaterialsChange(materials.map((m) => (m.id === item.id ? { ...m, title: nextTitle } : m)));
      setNotice({
        type: 'success',
        text: nextProtected
          ? `Enabled anti-screenshot screen shield on "${cleanMaterialTitle(item.title)}".`
          : `Disabled screen shield on "${cleanMaterialTitle(item.title)}".`,
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Could not update screen protection.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveRename = async (item: PriorityMaterialItem) => {
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    setBusyId(item.id);
    const nextTitle = isPriorityMaterial(item.title) ? `${PRIORITY_PREFIX}${trimmed}` : trimmed;
    try {
      const res = await fetch(`/api/lessons/${lessonId}/materials/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nextTitle }),
      });
      if (!res.ok) throw new Error('Could not rename material');
      onMaterialsChange(materials.map((m) => (m.id === item.id ? { ...m, title: nextTitle } : m)));
      setEditingId(null);
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Rename failed.' });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: PriorityMaterialItem) => {
    if (!confirm(`Delete "${cleanMaterialTitle(item.title)}" permanently?`)) return;
    setBusyId(item.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/lessons/${lessonId}/materials/${item.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete material');
      // Also purge underlying R2 object so storage stays lean
      if (item.file_url?.includes('/api/media/')) {
        void fetch('/api/files/upload', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.file_url }),
        }).catch(() => {});
      }
      onMaterialsChange(materials.filter((m) => m.id !== item.id));
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Delete failed.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      aria-label="Priority study materials"
      onContextMenu={(e) => {
        if (!canManage) e.preventDefault();
      }}
      className="rounded-2xl border border-emerald-500/30 bg-card shadow-sm overflow-hidden"
    >
      <div className="px-4 sm:px-5 py-3.5 bg-emerald-500/[0.06] border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
            <SparklesIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-foreground">
                {canManage ? 'Teacher Priority Study Materials (Protected)' : 'Priority Study Materials'}
              </h2>
              {priorityMaterials.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-700 text-white text-[10px] font-black">
                  {priorityMaterials.length} Priority
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted border border-border text-[10px] font-bold text-muted-foreground">
                <LockClosedIcon className="w-3 h-3" /> View-Only · Exam-Locked
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {canManage
                ? 'Upload notes, PDFs, or images early — students see them pinned at the top (view-only, no downloads) and they auto-lock during live exams.'
                : 'Pinned by your teacher for this lesson. View inside Rillcod Academy — downloading and sharing are disabled.'}
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-foreground cursor-pointer select-none px-2.5 py-1.5 rounded-xl border border-border bg-background">
              <input
                type="checkbox"
                checked={markAsPriority}
                onChange={(e) => setMarkAsPriority(e.target.checked)}
                className="rounded accent-emerald-700"
              />
              Push to Overview
            </label>
            <label
              title="Apply the same anti-screenshot watermark & blur shield used on live exams when students view this material"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-foreground cursor-pointer select-none px-2.5 py-1.5 rounded-xl border border-border bg-background"
            >
              <input
                type="checkbox"
                checked={protectScreen}
                onChange={(e) => setProtectScreen(e.target.checked)}
                className="rounded accent-primary"
              />
              Protect Screen
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.pptx,.ppt,.docx,.doc,image/jpeg,image/png,image/webp"
              className="hidden"
              aria-label="Upload protected study material"
              onChange={(e) => {
                if (e.target.files?.length) void handleUploadFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-3.5 py-2 text-xs font-black uppercase tracking-wider text-white shadow-sm disabled:opacity-50 transition-colors"
            >
              {uploading ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <PlusIcon className="w-3.5 h-3.5" />}
              {uploading ? 'Uploading…' : 'Upload Material'}
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div
          className={`mx-4 mt-3 rounded-xl border px-3 py-2 text-xs font-bold flex items-center justify-between gap-2 ${
            notice.type === 'success'
              ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
              : 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300'
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {visibleMaterials.length === 0 ? (
        <div className="px-5 py-6 text-center text-xs text-muted-foreground">
          No study materials uploaded yet. Click <strong>Upload Material</strong> to pin PDFs or study images for your students.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {visibleMaterials.map((item) => {
            const isPri = isPriorityMaterial(item.title);
            const isProt = isProtectedMaterial(item.title);
            const displayTitle = cleanMaterialTitle(item.title);
            const isEditing = editingId === item.id;
            const isBusy = busyId === item.id;

            return (
              <div
                key={item.id}
                className={`px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                  isPri ? 'bg-emerald-500/[0.03]' : ''
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    isPri
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                      : 'bg-muted text-muted-foreground border border-border'
                  }`}>
                    <DocumentTextIcon className="w-4 h-4" />
                  </div>

                  {isEditing ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <input
                        type="text"
                        aria-label="Rename material"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleSaveRename(item);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="flex-1 min-w-0 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-bold text-foreground focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleSaveRename(item)}
                        aria-label="Save name"
                        className="p-1.5 rounded-lg bg-emerald-700 text-white"
                      >
                        <CheckIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel rename"
                        className="p-1.5 rounded-lg border border-border bg-card text-muted-foreground"
                      >
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isPri && (
                          <span className="px-1.5 py-0.5 rounded-md bg-emerald-700 text-white text-[9px] font-black uppercase tracking-wider">
                            Overview Priority
                          </span>
                        )}
                        {isProt && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border border-primary/35 bg-primary/10 text-primary text-[9px] font-black uppercase tracking-wider">
                            <LockClosedIcon className="w-2.5 h-2.5" /> Screen Shield
                          </span>
                        )}
                        <p className="text-xs sm:text-sm font-bold text-foreground truncate">{displayTitle}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                        {item.file_type || 'Resource'} · Protected System Resource
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onViewMaterial(item)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary/12 hover:bg-primary/20 border border-primary/25 px-3 py-1.5 text-xs font-black text-primary transition-colors"
                  >
                    <EyeIcon className="w-3.5 h-3.5" /> View
                  </button>

                  {canManage && (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleTogglePriority(item)}
                        className={`rounded-xl border px-2.5 py-1.5 text-[10px] font-black uppercase transition-colors ${
                          isPri
                            ? 'border-amber-500/35 bg-amber-500/12 text-amber-900 dark:text-amber-200'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {isPri ? 'Unpin Overview' : 'Push Overview'}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleToggleScreenProtect(item)}
                        title="Toggle exam-grade anti-screenshot screen protection when students view this material"
                        className={`rounded-xl border px-2.5 py-1.5 text-[10px] font-black uppercase transition-colors ${
                          isProt
                            ? 'border-primary/35 bg-primary/10 text-primary'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {isProt ? 'Shield ON' : 'Shield OFF'}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setEditingId(item.id);
                          setEditTitle(displayTitle);
                        }}
                        aria-label={`Rename ${displayTitle}`}
                        className="p-1.5 rounded-xl border border-border bg-background hover:bg-muted text-foreground"
                      >
                        <PencilIcon className="w-3.5 h-3.5" />
                      </button>
                      {item.file_url?.includes('/api/media/') && (
                        <a
                          href={`${item.file_url}${item.file_url.includes('?') ? '&' : '?'}download=1`}
                          aria-label={`Download ${displayTitle}`}
                          title="Download (Teacher / Admin only)"
                          className="p-1.5 rounded-xl border border-border bg-background hover:bg-muted text-foreground"
                        >
                          <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDelete(item)}
                        aria-label={`Delete ${displayTitle}`}
                        className="p-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
