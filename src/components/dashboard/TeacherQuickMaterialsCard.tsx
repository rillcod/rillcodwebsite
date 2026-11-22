'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  SparklesIcon,
  PlusIcon,
  ArrowPathIcon,
  LockClosedIcon,
  TrashIcon,
  XMarkIcon,
} from '@/lib/icons';
import {
  isPriorityMaterial,
  isProtectedMaterial,
  cleanMaterialTitle,
  formatMaterialStoredTitle,
} from '@/components/lessons/PriorityMaterialsPanel';
import { compressStudentImage } from '@/lib/files/compress-student-image';
import { toast } from 'sonner';

type TeacherLessonOption = {
  id: string;
  title: string;
  session_number?: number | null;
  lesson_materials?: Array<{
    id: string;
    title: string;
    file_url: string;
    file_type?: string | null;
  }>;
};

/**
 * Teacher Overview quick-push card for Exam & Lesson Study Materials.
 * Reuses the exact existing lesson_materials APIs so teachers can upload,
 * push to Student Overview, toggle Screen Protection, or Unshare/Delete
 * directly from their Dashboard Overview without extra navigation.
 */
export default function TeacherQuickMaterialsCard() {
  const [lessons, setLessons] = useState<TeacherLessonOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetLessonId, setTargetLessonId] = useState('');
  const [pushToOverview, setPushToOverview] = useState(true);
  const [protectScreen, setProtectScreen] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const db = createClient();
    db.from('lessons')
      .select('id, title, session_number, lesson_materials(id, title, file_url, file_type)')
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (cancelled) return;
        const list = (data ?? []) as TeacherLessonOption[];
        setLessons(list);
        if (list.length > 0) setTargetLessonId((prev) => prev || list[0].id);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const normalizeKey = (raw: string) =>
    cleanMaterialTitle(raw)
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const handleUpload = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(Boolean);
    if (files.length === 0) return;
    const lessonId = targetLessonId || lessons[0]?.id;
    if (!lessonId) {
      const msg = 'Create a lesson first before pushing study materials.';
      setNotice({ type: 'error', text: msg });
      toast.error(msg);
      return;
    }

    const lesson = lessons.find((l) => l.id === lessonId);
    setUploading(true);
    setNotice(null);
    let addedCount = 0;
    let skippedCount = 0;

    try {
      const newlyAdded: Array<{ id: string; title: string; file_url: string; file_type?: string | null }> = [];
      for (const rawFile of files.slice(0, 5)) {
        const cleanName = rawFile.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || rawFile.name;
        const alreadyExists = (lesson?.lesson_materials ?? []).some(
          (m) => normalizeKey(m.title) === normalizeKey(cleanName),
        );
        if (alreadyExists) {
          skippedCount += 1;
          continue;
        }
        const uploadable = await compressStudentImage(rawFile, {
          maxDimension: 1440,
          targetBytes: 240 * 1024,
        });
        const fd = new FormData();
        fd.append('file', uploadable);
        const upRes = await fetch('/api/files/upload', { method: 'POST', body: fd });
        const upJson = await upRes.json().catch(() => ({}));
        if (!upRes.ok) throw new Error(upJson?.error || `Upload failed for "${rawFile.name}"`);
        const fileUrl = upJson?.data?.public_url || upJson?.data?.url || upJson?.data?.receipt?.url;
        if (!fileUrl) throw new Error(`No URL returned for "${rawFile.name}"`);

        const storedTitle = formatMaterialStoredTitle(cleanName, pushToOverview, protectScreen);
        const ext = (rawFile.name.split('.').pop() || 'file').toLowerCase();
        const matRes = await fetch(`/api/lessons/${lessonId}/materials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: storedTitle, file_url: fileUrl, file_type: ext }),
        });
        const matJson = await matRes.json().catch(() => ({}));
        if (!matRes.ok || !matJson?.data) {
          throw new Error(matJson?.error || `Could not attach "${rawFile.name}"`);
        }
        newlyAdded.push(matJson.data);
        addedCount += 1;
      }

      if (newlyAdded.length > 0) {
        setLessons((prev) =>
          prev.map((l) =>
            l.id === lessonId
              ? { ...l, lesson_materials: [...newlyAdded, ...(l.lesson_materials ?? [])] }
              : l,
          ),
        );
      }

      if (addedCount > 0) {
        const msg = `Pushed ${addedCount} study material${addedCount === 1 ? '' : 's'} to "${lesson?.title || 'lesson'}"${pushToOverview ? ' (live in Student Overview)' : ''}${skippedCount > 0 ? ` · ${skippedCount} duplicate skipped` : ''}.`;
        setNotice({ type: 'success', text: msg });
        toast.success(msg);
      } else if (skippedCount > 0) {
        const msg = `Skipped ${skippedCount} duplicate file${skippedCount === 1 ? '' : 's'} already in "${lesson?.title || 'lesson'}".`;
        setNotice({ type: 'info', text: msg });
        toast.info(msg);
      }
    } catch (err: any) {
      const msg = err?.message || 'Upload failed.';
      setNotice({ type: 'error', text: msg });
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleToggleShield = async (lessonId: string, item: { id: string; title: string }) => {
    setBusyId(item.id);
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
      if (!res.ok) throw new Error('Could not update shield');
      setLessons((prev) =>
        prev.map((l) =>
          l.id === lessonId
            ? {
                ...l,
                lesson_materials: (l.lesson_materials ?? []).map((m) =>
                  m.id === item.id ? { ...m, title: nextTitle } : m,
                ),
              }
            : l,
        ),
      );
      toast.success(nextProtected ? 'Screen Shield enabled' : 'Screen Shield disabled');
    } catch (err: any) {
      toast.error(err?.message || 'Could not update material');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (lessonId: string, item: { id: string; title: string }) => {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/lessons/${lessonId}/materials/${item.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete material');
      setLessons((prev) =>
        prev.map((l) =>
          l.id === lessonId
            ? { ...l, lesson_materials: (l.lesson_materials ?? []).filter((m) => m.id !== item.id) }
            : l,
        ),
      );
      const msg = `Unshared & deleted "${cleanMaterialTitle(item.title)}".`;
      setNotice({ type: 'info', text: msg });
      toast.success(msg);
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  const recentPushed = lessons
    .flatMap((l) =>
      (l.lesson_materials ?? [])
        .filter((m) => m.file_type !== 'slide-deck' && isPriorityMaterial(m.title))
        .map((m) => ({ ...m, lessonId: l.id, lessonTitle: l.title })),
    )
    .slice(0, 5);

  if (loading || lessons.length === 0) return null;

  return (
    <section
      aria-label="Quick push exam study materials"
      className="rounded-2xl border border-emerald-500/30 bg-card shadow-sm overflow-hidden"
    >
      <div className="px-4 sm:px-5 py-3.5 bg-emerald-500/[0.06] border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
            <SparklesIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-foreground">
              Push Exam Study Materials to Student Overview
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Upload PDFs or study notes directly from here — students see them immediately in their Overview and they auto-lock during live exams.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/cbt/new"
          className="text-xs font-black text-primary hover:underline shrink-0"
        >
          New Exam →
        </Link>
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
          <select
            aria-label="Select lesson for study material"
            value={targetLessonId}
            onChange={(e) => setTargetLessonId(e.target.value)}
            className="min-h-10 flex-1 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:border-primary focus:outline-none"
          >
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.session_number ? `L${l.session_number}: ` : ''}{l.title}
              </option>
            ))}
          </select>

          <label className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-[11px] font-bold text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pushToOverview}
              onChange={(e) => setPushToOverview(e.target.checked)}
              className="rounded accent-emerald-700"
            />
            Student Overview
          </label>

          <label className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-[11px] font-bold text-foreground cursor-pointer select-none">
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
            accept=".pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            aria-label="Upload exam study material"
            onChange={(e) => {
              if (e.target.files?.length) void handleUpload(e.target.files);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-4 text-xs font-black uppercase tracking-wider text-white shadow-sm disabled:opacity-50 transition-colors shrink-0"
          >
            {uploading ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <PlusIcon className="w-3.5 h-3.5" />}
            {uploading ? 'Pushing…' : 'Upload & Push'}
          </button>
        </div>

        {notice && (
          <div
            role="status"
            className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${
              notice.type === 'success'
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                : notice.type === 'error'
                  ? 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                  : 'border-primary/35 bg-primary/10 text-primary'
            }`}
          >
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {recentPushed.length > 0 && (
          <div className="divide-y divide-border rounded-xl border border-border bg-background/60">
            {recentPushed.map((item) => {
              const shielded = isProtectedMaterial(item.title);
              const busy = busyId === item.id;
              return (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-foreground truncate">{cleanMaterialTitle(item.title)}</span>
                      {shielded && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 border border-primary/25 px-1.5 py-0.5 text-[9px] font-black text-primary">
                          <LockClosedIcon className="w-2.5 h-2.5" /> Shielded
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">Lesson: {item.lessonTitle}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleToggleShield(item.lessonId, item)}
                      className={`rounded-lg border px-2 py-1 text-[10px] font-black uppercase transition-colors ${
                        shielded
                          ? 'border-primary/35 bg-primary/10 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {shielded ? 'Shield ON' : 'Shield OFF'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDelete(item.lessonId, item)}
                      aria-label={`Unshare ${cleanMaterialTitle(item.title)}`}
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 p-1.5 text-rose-700 dark:text-rose-300"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
