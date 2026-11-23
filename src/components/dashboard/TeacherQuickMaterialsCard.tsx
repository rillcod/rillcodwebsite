'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  SparklesIcon,
  PlusIcon,
  ArrowPathIcon,
  LockClosedIcon,
  TrashIcon,
  XMarkIcon,
  BookOpenIcon,
  UserGroupIcon,
  ArrowTopRightOnSquareIcon,
} from '@/lib/icons';
import {
  isPriorityMaterial,
  isProtectedMaterial,
  cleanMaterialTitle,
  formatMaterialStoredTitle,
} from '@/components/lessons/PriorityMaterialsPanel';
import { compressStudentImage } from '@/lib/files/compress-student-image';
import { toast } from 'sonner';

type ProgramOption = {
  id: string;
  name: string;
};

type CourseOption = {
  id: string;
  title: string;
  program_id: string | null;
};

type ClassAudienceOption = {
  id: string;
  name: string;
  current_course_id: string | null;
  program_id: string | null;
  school_name: string | null;
};

type MaterialRow = {
  id: string;
  title: string;
  file_url: string;
  file_type?: string | null;
};

type TeacherLessonOption = {
  id: string;
  title: string;
  course_id: string | null;
  session_number?: number | null;
  lesson_materials?: MaterialRow[];
};

/**
 * Structured Study Materials Publishing Console for Teacher & Admin Overviews.
 * Channels uploads cleanly through Program -> Course -> Lesson with a live
 * target-class audience preview so staff always know exactly where each file goes.
 */
export default function TeacherQuickMaterialsCard() {
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [lessons, setLessons] = useState<TeacherLessonOption[]>([]);
  const [classes, setClasses] = useState<ClassAudienceOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedProgramId, setSelectedProgramId] = useState<string>('all');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [targetLessonId, setTargetLessonId] = useState<string>('');
  const [customTitle, setCustomTitle] = useState<string>('');
  const [pushToOverview, setPushToOverview] = useState(true);
  const [protectScreen, setProtectScreen] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const db = createClient();

    Promise.all([
      db.from('programs').select('id, name').order('name', { ascending: true }).limit(60),
      db.from('courses').select('id, title, program_id').order('title', { ascending: true }).limit(150),
      db
        .from('lessons')
        .select('id, title, course_id, session_number, lesson_materials(id, title, file_url, file_type)')
        .order('session_number', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(200),
      db
        .from('classes')
        .select('id, name, current_course_id, program_id, schools(name)')
        .eq('status', 'active')
        .order('name', { ascending: true })
        .limit(150),
    ])
      .then(([progRes, courseRes, lessonRes, classRes]) => {
        if (cancelled) return;
        const progList = (progRes.data ?? []) as ProgramOption[];
        const courseList = (courseRes.data ?? []) as CourseOption[];
        const lessonList = (lessonRes.data ?? []) as TeacherLessonOption[];
        const classList: ClassAudienceOption[] = (classRes.data ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          current_course_id: c.current_course_id ?? null,
          program_id: c.program_id ?? null,
          school_name: Array.isArray(c.schools) ? c.schools[0]?.name ?? null : c.schools?.name ?? null,
        }));

        setPrograms(progList);
        setCourses(courseList);
        setLessons(lessonList);
        setClasses(classList);

        // Auto-select the first course that actually has lessons
        const courseWithLessons = courseList.find((c) => lessonList.some((l) => l.course_id === c.id));
        if (courseWithLessons) {
          if (courseWithLessons.program_id) setSelectedProgramId(courseWithLessons.program_id);
          setSelectedCourseId(courseWithLessons.id);
          const firstLesson = lessonList.find((l) => l.course_id === courseWithLessons.id);
          if (firstLesson) setTargetLessonId(firstLesson.id);
        } else if (lessonList.length > 0) {
          setTargetLessonId(lessonList[0].id);
        }

        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredCourses = useMemo(() => {
    if (selectedProgramId === 'all') return courses;
    return courses.filter((c) => c.program_id === selectedProgramId);
  }, [courses, selectedProgramId]);

  const filteredLessons = useMemo(() => {
    if (selectedCourseId) {
      return lessons.filter((l) => l.course_id === selectedCourseId);
    }
    if (selectedProgramId !== 'all') {
      const cIds = new Set(filteredCourses.map((c) => c.id));
      return lessons.filter((l) => l.course_id && cIds.has(l.course_id));
    }
    return lessons;
  }, [lessons, selectedCourseId, selectedProgramId, filteredCourses]);

  // Keep course & lesson selections valid when parent filter changes
  const handleProgramChange = (nextProgramId: string) => {
    setSelectedProgramId(nextProgramId);
    const nextCourses = nextProgramId === 'all'
      ? courses
      : courses.filter((c) => c.program_id === nextProgramId);
    const bestCourse = nextCourses.find((c) => lessons.some((l) => l.course_id === c.id)) ?? nextCourses[0];
    const nextCourseId = bestCourse?.id ?? '';
    setSelectedCourseId(nextCourseId);
    const nextLesson = nextCourseId
      ? lessons.find((l) => l.course_id === nextCourseId)
      : lessons[0];
    setTargetLessonId(nextLesson?.id ?? '');
  };

  const handleCourseChange = (nextCourseId: string) => {
    setSelectedCourseId(nextCourseId);
    const nextLesson = nextCourseId
      ? lessons.find((l) => l.course_id === nextCourseId)
      : lessons[0];
    setTargetLessonId(nextLesson?.id ?? '');
  };

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  const selectedProgram = useMemo(
    () => programs.find((p) => p.id === (selectedCourse?.program_id || selectedProgramId)) ?? null,
    [programs, selectedCourse, selectedProgramId],
  );

  const selectedLesson = useMemo(
    () => lessons.find((l) => l.id === targetLessonId) ?? null,
    [lessons, targetLessonId],
  );

  const targetClasses = useMemo(() => {
    if (!selectedCourseId) return [];
    return classes.filter((c) => c.current_course_id === selectedCourseId);
  }, [classes, selectedCourseId]);

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
    const lessonId = targetLessonId;
    if (!lessonId) {
      const msg = 'Select a destination Program, Course, and Lesson first.';
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
      const newlyAdded: MaterialRow[] = [];
      for (let i = 0; i < Math.min(files.length, 5); i += 1) {
        const rawFile = files[i];
        const fallbackName = rawFile.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || rawFile.name;
        const cleanName = customTitle.trim()
          ? (files.length === 1 ? customTitle.trim() : `${customTitle.trim()} (${i + 1})`)
          : fallbackName;

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
        setCustomTitle('');
      }

      if (addedCount > 0) {
        const destLabel = [selectedCourse?.title, lesson?.title].filter(Boolean).join(' › ');
        const msg = `Published ${addedCount} material${addedCount === 1 ? '' : 's'} to ${destLabel || 'lesson'}${pushToOverview ? ' (Pinned to Student Overview)' : ''}${skippedCount > 0 ? ` · ${skippedCount} duplicate skipped` : ''}.`;
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
      const msg = `Removed "${cleanMaterialTitle(item.title)}".`;
      setNotice({ type: 'info', text: msg });
      toast.success(msg);
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  const destinationMaterials = useMemo(() => {
    if (!selectedLesson) return [];
    return (selectedLesson.lesson_materials ?? [])
      .filter((m) => m.file_type !== 'slide-deck')
      .map((m) => ({ ...m, lessonId: selectedLesson.id, lessonTitle: selectedLesson.title }));
  }, [selectedLesson]);

  if (loading || lessons.length === 0) return null;

  return (
    <section
      aria-label="Study Materials Publishing Console"
      className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 sm:px-5 py-3.5 bg-muted/30 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-sm">
            <SparklesIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-foreground">
              Publish Exam &amp; Lesson Study Materials
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Channel PDFs, PPTX slides, DOCX notes, or images directly to a Program, Course &amp; Lesson — auto-locks during live exams.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {selectedLesson && (
            <Link
              href={`/dashboard/lessons/${selectedLesson.id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-bold text-foreground hover:bg-muted transition-colors"
            >
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 text-primary" />
              Open Lesson
            </Link>
          )}
          <Link
            href="/dashboard/cbt/new"
            className="inline-flex items-center gap-1 rounded-lg bg-primary/10 border border-primary/25 px-2.5 py-1.5 text-[11px] font-black text-primary hover:bg-primary/20 transition-colors"
          >
            Create Exam →
          </Link>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Step 1: Structured Destination Selectors */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
            1. Choose Destination (Program → Course → Lesson)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">Program</span>
              <select
                aria-label="Select destination program"
                value={selectedProgramId}
                onChange={(e) => handleProgramChange(e.target.value)}
                className="w-full min-h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:border-primary focus:outline-none"
              >
                <option value="all">All Programs ({programs.length})</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">Course</span>
              <select
                aria-label="Select destination course"
                value={selectedCourseId}
                onChange={(e) => handleCourseChange(e.target.value)}
                className="w-full min-h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">All Courses ({filteredCourses.length})</option>
                {filteredCourses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-muted-foreground">Lesson</span>
              <select
                aria-label="Select destination lesson"
                value={targetLessonId}
                onChange={(e) => setTargetLessonId(e.target.value)}
                className="w-full min-h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:border-primary focus:outline-none"
              >
                {filteredLessons.length === 0 ? (
                  <option value="">No lessons in this course yet</option>
                ) : (
                  filteredLessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.session_number ? `Lesson ${l.session_number}: ` : ''}{l.title}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
        </div>

        {/* Live Destination & Audience Preview */}
        <div className="rounded-xl border border-border bg-muted/25 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-start gap-2 min-w-0">
            <BookOpenIcon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-bold text-foreground truncate">
                Destination:{' '}
                <span className="text-primary">
                  {[selectedProgram?.name, selectedCourse?.title, selectedLesson?.title].filter(Boolean).join(' › ') || 'Select a lesson'}
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                <UserGroupIcon className="w-3.5 h-3.5 shrink-0" />
                {targetClasses.length > 0 ? (
                  <span>
                    Reaches <strong className="text-foreground">{targetClasses.length} active class{targetClasses.length === 1 ? '' : 'es'}</strong>:{' '}
                    {targetClasses.slice(0, 3).map((c) => c.school_name ? `${c.name} (${c.school_name})` : c.name).join(', ')}
                    {targetClasses.length > 3 ? ` +${targetClasses.length - 3} more` : ''}
                  </span>
                ) : (
                  <span>
                    No active class is currently mapped to this course yet.{' '}
                    <Link href="/dashboard/classes" className="text-primary font-bold hover:underline">
                      Map a class →
                    </Link>
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Step 2: Material Title, Visibility & Upload */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
            2. Label, Protection &amp; Upload (PDF, PPTX, DOCX, Images)
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Optional title (e.g. First Term Exam Revision Guide)"
              aria-label="Optional study material title"
              className="min-h-10 flex-1 min-w-[200px] rounded-xl border border-border bg-background px-3 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />

            <label className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-[11px] font-bold text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pushToOverview}
                onChange={(e) => setPushToOverview(e.target.checked)}
                className="rounded accent-emerald-700"
              />
              Pin to Student Overview
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
              accept=".pdf,.pptx,.ppt,.docx,.doc,image/jpeg,image/png,image/webp"
              className="hidden"
              aria-label="Upload exam study material"
              onChange={(e) => {
                if (e.target.files?.length) void handleUpload(e.target.files);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              disabled={uploading || !targetLessonId}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-4 text-xs font-black uppercase tracking-wider text-white shadow-sm disabled:opacity-50 transition-colors shrink-0"
            >
              {uploading ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <PlusIcon className="w-3.5 h-3.5" />}
              {uploading ? 'Publishing…' : 'Upload & Publish'}
            </button>
          </div>
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

        {/* Step 3: Materials Currently Live in Selected Lesson */}
        {destinationMaterials.length > 0 && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
              Live in Selected Lesson ({destinationMaterials.length})
            </p>
            <div className="divide-y divide-border rounded-xl border border-border bg-background/60">
              {destinationMaterials.slice(0, 6).map((item) => {
                const shielded = isProtectedMaterial(item.title);
                const pinned = isPriorityMaterial(item.title);
                const busy = busyId === item.id;
                const ext = (item.file_type || 'file').toUpperCase();
                return (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-black uppercase text-muted-foreground">
                          {ext}
                        </span>
                        <span className="font-bold text-foreground truncate">{cleanMaterialTitle(item.title)}</span>
                        {pinned && (
                          <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-black text-emerald-700 dark:text-emerald-300">
                            Overview
                          </span>
                        )}
                        {shielded && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 border border-primary/25 px-1.5 py-0.5 text-[9px] font-black text-primary">
                            <LockClosedIcon className="w-2.5 h-2.5" /> Shielded
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleToggleShield(item.lessonId, item)}
                        className="rounded-lg border border-border bg-card px-2.5 py-1 text-[10px] font-bold text-foreground hover:bg-muted disabled:opacity-50"
                      >
                        {shielded ? 'Disable Shield' : 'Enable Shield'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDelete(item.lessonId, item)}
                        aria-label={`Remove ${cleanMaterialTitle(item.title)}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                      >
                        <TrashIcon className="w-3 h-3" />
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
