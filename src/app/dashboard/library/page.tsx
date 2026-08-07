// @refresh reset
'use client';

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { fileKind } from "@/lib/files/file-kind";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Share2, Star, FolderPlus, Copy, Check } from "lucide-react";
import {
  BookOpenIcon, MagnifyingGlassIcon, PlusIcon,
  CheckCircleIcon, XMarkIcon, SparklesIcon,
  VideoCameraIcon, DocumentIcon,
  PresentationChartBarIcon, BoltIcon, ArrowDownTrayIcon,
  AcademicCapIcon, UserIcon, GlobeAltIcon, BuildingOfficeIcon,
  ArchiveBoxIcon, StarIcon, ArrowPathIcon, ExclamationTriangleIcon,
  Bars3Icon, EyeIcon, PlayIcon,
  ChevronLeftIcon, ChevronRightIcon, ArrowsPointingOutIcon,
  ClipboardDocumentListIcon, Squares2X2Icon, ListBulletIcon,
  TrashIcon,
} from "@/lib/icons";
import VideoPlayer from '@/components/media/VideoPlayer';
import { motion, AnimatePresence } from 'framer-motion';
import PipelineStepper from '@/components/pipeline/PipelineStepper';
import MobilePageHero from '@/components/mobile/MobilePageHero';
import { MOBILE_PAGE_BOTTOM, MOBILE_TOUCH_BTN } from '@/components/mobile/mobile-styles';

type ContentItem = {
  id: string;
  title: string;
  description?: string | null;
  content_type: string;
  category?: string | null;
  tags?: string[] | null;
  subject?: string | null;
  grade_level?: string | null;
  license_type?: string | null;
  attribution?: string | null;
  is_approved: boolean;
  rating_average?: number | null;
  rating_count?: number | null;
  usage_count?: number | null;
  school_id?: string | null;
  file_id?: string | null;
  program_id?: string | null;
  created_at: string;
  files?: {
    public_url?: string | null;
    file_type?: string | null;
    thumbnail_url?: string | null;
    file_size?: number | null;
  } | null;
  programs?: {
    name: string;
  } | null;
};

type SortKey = 'newest' | 'most_used' | 'top_rated';

const CATEGORIES = ['All', 'Videos', 'Documents', 'Presentations', 'Interactive', 'Quizzes'];

const CATEGORY_TO_TYPE: Record<string, string[]> = {
  'Videos': ['video'],
  'Documents': ['document'],
  'Presentations': ['presentation'],
  'Interactive': ['interactive'],
  'Quizzes': ['quiz'],
};

// ── Star Rating Control ──────────────────────────────────────────────────────
function StarRatingWidget({
  itemId,
  currentRating = 0,
  ratingCount = 0,
  onRateSuccess,
}: {
  itemId: string;
  currentRating?: number;
  ratingCount?: number;
  onRateSuccess?: (avg: number, count: number) => void;
}) {
  const [hoverRating, setHoverRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const handleRate = async (rating: number) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/content-library/${itemId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rating failed');
      toast.success(`Rated ${rating} star${rating > 1 ? 's' : ''}! Thank you.`);
      if (onRateSuccess) {
        const newCount = ratingCount + 1;
        const newAvg = currentRating ? (currentRating * ratingCount + rating) / newCount : rating;
        onRateSuccess(Number(newAvg.toFixed(1)), newCount);
      }
    } catch (err: any) {
      toast.error(err.message || 'Could not submit rating');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5 bg-muted/50 border border-border px-3 py-1.5 rounded-xl">
      <div className="flex items-center gap-0.5" onMouseLeave={() => setHoverRating(0)}>
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = (hoverRating || Math.round(currentRating)) >= star;
          return (
            <button
              key={star}
              type="button"
              disabled={submitting}
              onMouseEnter={() => setHoverRating(star)}
              onClick={() => void handleRate(star)}
              className="p-0.5 text-amber-600 dark:text-amber-400 hover:scale-125 transition-transform cursor-pointer disabled:opacity-50"
              title={`Rate ${star} star${star > 1 ? 's' : ''}`}
            >
              <Star className={`w-3.5 h-3.5 ${isFilled ? 'fill-amber-400 text-amber-600 dark:text-amber-400' : 'text-muted-foreground/30'}`} />
            </button>
          );
        })}
      </div>
      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
        {currentRating > 0 ? `${currentRating.toFixed(1)} (${ratingCount})` : 'Rate'}
      </span>
    </div>
  );
}

// ── Deploy / Copy to Course Modal ────────────────────────────────────────────
function DeployToCourseModal({
  item,
  courses,
  onClose,
  onSuccess,
}: {
  item: ContentItem;
  courses: Array<{ id: string; title: string; subject?: string }>;
  onClose: () => void;
  onSuccess: (targetCourseTitle: string) => void;
}) {
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id || '');
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId) {
      setError('Please select a course to deploy into.');
      return;
    }
    setDeploying(true);
    setError(null);
    try {
      const res = await fetch(`/api/content-library/${item.id}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: selectedCourseId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Deployment failed');
      const targetCourse = courses.find((c) => c.id === selectedCourseId);
      onSuccess(targetCourse?.title || 'selected course');
    } catch (err: any) {
      setError(err.message || 'Deployment to course failed');
    } finally {
      setDeploying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 15 }}
        className="bg-card border border-border rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-5"
      >
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-foreground">Deploy to Course</h3>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest truncate max-w-xs">{item.title}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleDeploy} className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1.5">Select Target Course *</label>
            {courses.length === 0 ? (
              <p className="text-xs text-muted-foreground italic bg-muted/40 p-3 rounded-xl border border-border">
                No courses found. Ensure you have active courses configured in the Curriculum section.
              </p>
            ) : (
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="w-full bg-background text-foreground border border-input rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} {c.subject ? `(${c.subject})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && (
            <p className="text-xs font-bold text-destructive bg-destructive/10 border border-destructive/20 rounded-xl p-3">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-muted text-foreground border border-border rounded-xl text-xs font-black uppercase tracking-widest hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={deploying || courses.length === 0}
              className="flex-[2] py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
            >
              {deploying ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : 'Deploy Asset'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// In-App Canvas Viewer Component
function InAppViewer({
  item,
  onClose,
  onDelete,
  courses = [],
  canMutateLibrary = false,
  onDeployClick,
  onItemUpdate,
}: {
  item: ContentItem;
  onClose: () => void;
  onDelete?: (e: React.MouseEvent, id: string) => void;
  courses?: Array<{ id: string; title: string; subject?: string }>;
  canMutateLibrary?: boolean;
  onDeployClick?: (item: ContentItem) => void;
  onItemUpdate?: (avg: number, count: number) => void;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const remoteUrl = item.tags?.find(t => t.startsWith('url:'))?.replace('url:', '');
  const fileUrl = item.files?.public_url || remoteUrl;
  const isRemote = !!remoteUrl && !item.files?.public_url;
  const fileType = item.files?.file_type || item.content_type;

  // One shared answer — see src/lib/files/file-kind.ts. The hand-rolled checks
  // here tested MIME prefixes against a file_type that stores a bare extension,
  // so they were never true, and the URL fallback matched extensions as
  // substrings ("gif" inside "gift").
  const kind = fileKind({ url: fileUrl, fileType, contentType: item.content_type });
  const isVideo = kind === 'video';
  const isImage = kind === 'image';
  const isPDF = kind === 'pdf';
  const isPresentation = kind === 'presentation';
  const isDocument = kind === 'doc' || isPDF;

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const copyShareLink = () => {
    const shareUrl = `${window.location.origin}/dashboard/library?item=${item.id}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success("Resource link copied to clipboard!");
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (isFullscreen) setIsFullscreen(false);
      else onClose();
    }
    if (e.key === 'ArrowLeft' && currentPage > 1) setCurrentPage(prev => prev - 1);
    if (e.key === 'ArrowRight' && currentPage < totalPages) setCurrentPage(prev => prev + 1);
  }, [currentPage, totalPages, isFullscreen, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1200);

    let cancelled = false;
    if (isPDF && fileUrl) {
      (async () => {
        try {
          const res = await fetch(fileUrl);
          if (!res.ok) return;
          const buf = await res.arrayBuffer();
          const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
          const doc = await pdfjs.getDocument({ data: buf }).promise;
          if (cancelled) {
            doc.destroy();
            return;
          }
          setTotalPages(doc.numPages);
          doc.destroy();
        } catch (e) {
          console.error("Failed to load PDF pages count", e);
        }
      })();
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      cancelled = true;
    };
  }, [handleKeyDown, isPDF, fileUrl]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`fixed inset-0 z-50 flex items-center justify-center ${isFullscreen ? 'p-0' : 'p-4 md:p-12'}`}
    >
      <div className="absolute inset-0 bg-black/85 dark:bg-black/95 backdrop-blur-xl" onClick={onClose} />

      <div className={`relative w-full h-full bg-card border border-border shadow-[0_40px_100px_-20px_rgba(0,0,0,0.3)] dark:shadow-[0_40px_100px_-20px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col ${isFullscreen ? 'rounded-none' : 'rounded-[32px]'}`}>

        {/* Canvas Header */}
        <div className="shrink-0 h-20 bg-muted/40 backdrop-blur-xl border-b border-border px-6 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
              <ChevronLeftIcon className="w-6 h-6 text-foreground" />
            </button>
            <div>
              <h3 className="font-black text-foreground tracking-tight">{item.title}</h3>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">{item.content_type} • {item.subject || 'General resource'}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Interactive Rating */}
            <StarRatingWidget
              itemId={item.id}
              currentRating={item.rating_average || 0}
              ratingCount={item.rating_count || 0}
              onRateSuccess={onItemUpdate}
            />

            {isPDF && (
              <div className="flex items-center gap-4 px-4 py-2 bg-muted/85 border border-border rounded-2xl">
                <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} className="text-foreground hover:text-primary disabled:opacity-30">
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>
                <span className="text-xs font-black text-foreground tabular-nums tracking-widest">{currentPage} / {totalPages}</span>
                <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages} className="text-foreground hover:text-primary disabled:opacity-30">
                  <ChevronRightIcon className="w-5 h-5" />
                </button>
              </div>
            )}

            {canMutateLibrary && onDeployClick && (
              <button
                type="button"
                onClick={() => onDeployClick(item)}
                className="px-3.5 py-2.5 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                title="Deploy asset into course"
              >
                <FolderPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Deploy</span>
              </button>
            )}

            <div className="flex items-center bg-muted/80 border border-border rounded-2xl p-1">
              <button onClick={copyShareLink} className="p-2.5 text-foreground hover:bg-muted rounded-xl transition-all" title="Copy Share Link">
                <Share2 className="w-5 h-5" />
              </button>
              <button onClick={toggleFullscreen} className="p-2.5 text-foreground hover:bg-muted rounded-xl transition-all" title="Toggle Fullscreen">
                <ArrowsPointingOutIcon className="w-5 h-5" />
              </button>
              {fileUrl && (
                <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="p-2.5 text-foreground hover:bg-muted rounded-xl transition-all" title="Download">
                  <ArrowDownTrayIcon className="w-5 h-5" />
                </a>
              )}
              {onDelete && (
                <button onClick={(e) => { onDelete(e, item.id); onClose(); }} className="p-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all" title="Delete">
                  <TrashIcon className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Immersive Viewport */}
        <div className="flex-1 relative bg-background overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-20 bg-background/80">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(234,88,12,0.3)]" />
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Synthesizing Viewport...</p>
              </div>
            </div>
          )}

          <div className="w-full h-full overflow-auto flex items-center justify-center p-8 custom-scrollbar">
            {isRemote ? (
              <div className="text-center space-y-6 max-w-md mx-auto">
                <div className="w-24 h-24 rounded-[32px] bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto shadow-inner">
                  <GlobeAltIcon className="w-10 h-10 text-primary" />
                </div>
                <div>
                  <h4 className="text-2xl font-black text-foreground tracking-tight">External Resource</h4>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                    This educational asset is deployed on an external cloud network. Click below to launch the resource in a secure workspace.
                  </p>
                </div>
                <a href={remoteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 px-10 py-4 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-[0.2em] rounded-3xl shadow-xl hover:-translate-y-1 hover:brightness-110 active:scale-95 transition-all">
                  <GlobeAltIcon className="w-4 h-4" /> Launch Resource
                </a>
              </div>
            ) : isVideo && fileUrl ? (
              <div className="w-full max-w-5xl aspect-video rounded-3xl overflow-hidden shadow-2xl border border-border">
                <VideoPlayer url={fileUrl} title={item.title} cinemaMode />
              </div>
            ) : isPresentation && fileUrl ? (
              <div className="text-center space-y-6 max-w-md mx-auto bg-card p-10 border border-border rounded-[32px] shadow-2xl">
                <div className="w-24 h-24 rounded-[32px] bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto shadow-inner">
                  <PresentationChartBarIcon className="w-10 h-10 text-primary" />
                </div>
                <div>
                  <h4 className="text-2xl font-black text-foreground tracking-tight">PowerPoint Presentation</h4>
                  <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                    PowerPoint files (<code className="text-primary font-bold">.pptx</code> / <code className="text-primary font-bold">.ppt</code>) cannot be previewed directly.
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-2 leading-relaxed">
                    You can download this presentation to view it, or upload it as a view-only slide deck (PDF format) for in-platform viewing.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <a href={fileUrl} download target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-3 px-10 py-4 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-[0.2em] rounded-3xl shadow-xl hover:-translate-y-1 transition-all">
                    <ArrowDownTrayIcon className="w-4 h-4" /> Download Presentation
                  </a>
                </div>
              </div>
            ) : isImage && fileUrl ? (
              <motion.img
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                src={fileUrl} alt={item.title}
                className="max-w-full max-h-full object-contain shadow-2xl rounded-xl"
                onLoad={() => setLoading(false)}
              />
            ) : isPDF && fileUrl ? (
              <div className="w-full h-full max-w-5xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
                <iframe src={`${fileUrl}#page=${currentPage}&toolbar=0&navpanes=0`} className="w-full h-full border-0" onLoad={() => setLoading(false)} title={item.title} />
              </div>
            ) : isDocument && fileUrl ? (
              <div className="w-full h-full max-w-5xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
                <iframe src={fileUrl} className="w-full h-full border-0" onLoad={() => setLoading(false)} title={item.title} />
              </div>
            ) : (
              <div className="text-center space-y-6">
                <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mx-auto border border-border">
                  <DocumentIcon className="w-10 h-10 text-muted-foreground/30" />
                </div>
                <div>
                  <h4 className="text-xl font-black text-foreground tracking-tight">Format Unsupported</h4>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">This asset requires external processing or download for full resolution.</p>
                </div>
                {fileUrl && (
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 px-8 py-3 bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest rounded-2xl shadow-xl hover:-translate-y-1 transition-all">
                    <ArrowDownTrayIcon className="w-4 h-4" /> Download
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function UploadModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (item: ContentItem) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contentType, setContentType] = useState('document');
  const [subject, setSubject] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [tags, setTags] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activePrograms, setActivePrograms] = useState<{ id: string; name: string }[]>([]);
  const [programId, setProgramId] = useState<string>('');

  useEffect(() => {
    createClient().from('programs').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => { if (data) setActivePrograms(data); });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setErr('Title is required'); return; }
    setSubmitting(true); setErr(null);
    try {
      const typeMap: Record<string, string> = {
        document: 'document',
        video: 'video', interactive: 'interactive',
        presentation: 'presentation', quiz: 'quiz',
      };
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      if (url.trim()) tagList.push(`url:${url.trim()}`);
      let uploadedFile: any = null;
      if (file) {
        setUploadingFile(true);
        const fd = new FormData();
        fd.append('file', file);
        const uploadRes = await fetch('/api/content-library/upload', {
          method: 'POST',
          body: fd,
        });
        const uploadJson = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) throw new Error(uploadJson?.error ?? 'File upload failed');
        uploadedFile = uploadJson.data;
      }
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        contentType: typeMap[contentType] ?? 'document',
        fileId: uploadedFile?.id,
        subject: subject.trim() || undefined,
        gradeLevel: gradeLevel.trim() || undefined,
        tags: tagList,
        programId: programId || undefined,
      };
      const res = await fetch('/api/content-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Upload failed');
      const created = {
        ...json.data,
        files: uploadedFile
          ? {
            public_url: uploadedFile.public_url,
            file_type: uploadedFile.file_type || uploadedFile.mime_type,
            thumbnail_url: uploadedFile.thumbnail_url,
            file_size: uploadedFile.file_size,
          }
          : json.data?.files,
      } as ContentItem;
      onCreated(created);
    } catch (e: any) {
      setErr(e.message || 'Upload failed');
    } finally {
      setUploadingFile(false);
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 md:p-12"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-card border border-border rounded-[40px] w-full max-w-2xl overflow-hidden shadow-[0_40px_120px_-20px_rgba(0,0,0,0.3)] flex flex-col"
      >
        <div className="relative p-8 border-b border-border bg-gradient-to-br from-primary/10 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-3xl bg-primary flex items-center justify-center shadow-lg text-primary-foreground">
                <PlusIcon className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-foreground tracking-tight">New Resource</h2>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Library catalog</p>
              </div>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
              <XMarkIcon className="w-6 h-6 text-muted-foreground" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto custom-scrollbar max-h-[60vh]">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Resource Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="w-full bg-background text-foreground border border-input focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-3xl px-6 py-4 text-sm font-bold transition-all outline-none"
              placeholder="e.g. Master the Physics of Motion"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-background text-foreground border border-input focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-3xl px-6 py-4 text-sm font-medium transition-all outline-none resize-none"
              placeholder="Describe the learning outcomes and how this resource should be used..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Content Type</label>
              <select
                value={contentType}
                onChange={e => setContentType(e.target.value)}
                className="w-full bg-background text-foreground border border-input focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-3xl px-6 py-4 text-sm font-bold transition-all outline-none appearance-none cursor-pointer"
              >
                <option value="document">Document</option>
                <option value="video">Video</option>
                <option value="interactive">Simulation</option>
                <option value="presentation">Presentation</option>
                <option value="quiz">Quiz</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Grade Target</label>
              <input
                value={gradeLevel}
                onChange={e => setGradeLevel(e.target.value)}
                className="w-full bg-background text-foreground border border-input focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-3xl px-6 py-4 text-sm font-bold transition-all outline-none"
                placeholder="e.g. JSS1 - JSS3"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Syllabus Subject</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full bg-background text-foreground border border-input focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-3xl px-6 py-4 text-sm font-bold transition-all outline-none"
                placeholder="e.g. Computer Science"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Metadata Tags</label>
              <input
                value={tags}
                onChange={e => setTags(e.target.value)}
                className="w-full bg-background text-foreground border border-input focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-3xl px-6 py-4 text-sm font-bold transition-all outline-none"
                placeholder="tag1, tag2..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Resource URL</label>
            <div className="relative">
              <GlobeAltIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                type="url"
                className="w-full bg-background text-foreground border border-input focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-3xl pl-14 pr-6 py-4 text-sm font-bold transition-all outline-none"
                placeholder="https://cloud.rillcod.com/..."
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Upload File</label>
            <label className="block border-2 border-dashed border-border hover:border-primary/40 bg-muted/30 rounded-3xl p-6 cursor-pointer transition-all">
              <input
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,.mp3,.jpg,.jpeg,.png,.webp,.zip,.txt,.csv,application/pdf,image/*,video/mp4,audio/mpeg,text/plain,text/csv"
                onChange={(e) => {
                  const selected = e.target.files?.[0] ?? null;
                  setFile(selected);
                  if (selected?.type.startsWith('video/')) setContentType('video');
                  else if (selected?.name.toLowerCase().match(/\.(ppt|pptx)$/)) setContentType('presentation');
                  else if (selected?.name.toLowerCase().match(/\.(pdf|doc|docx)$/)) setContentType('document');
                }}
              />
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <ArrowDownTrayIcon className="w-5 h-5 text-primary rotate-180" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-foreground truncate">
                    {file ? file.name : 'Choose a file from your device'}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">
                    PDF, Word, PowerPoint, video, audio, image, or ZIP
                    {file ? ` • ${(file.size / 1024 / 1024).toFixed(1)} MB` : ''}
                  </p>
                </div>
              </div>
            </label>
            {file && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-[10px] font-black uppercase tracking-widest text-destructive hover:underline transition-colors"
              >
                Remove selected file
              </button>
            )}
          </div>

          {activePrograms.length > 0 && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Target Program</label>
              <select
                value={programId}
                onChange={e => setProgramId(e.target.value)}
                className="w-full bg-background text-foreground border border-input focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-3xl px-6 py-4 text-sm font-bold transition-all outline-none appearance-none cursor-pointer"
              >
                <option value="">All Programs (Global)</option>
                {activePrograms.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {err && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-6 bg-destructive/10 border border-destructive/20 rounded-3xl flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
                <ExclamationTriangleIcon className="w-5 h-5 text-destructive" />
              </div>
              <p className="text-sm font-bold text-destructive">{err}</p>
            </motion.div>
          )}
        </form>

        <div className="p-8 border-t border-border bg-muted/30 flex gap-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-5 bg-background text-foreground border border-border text-xs font-black uppercase tracking-[0.3em] rounded-3xl hover:bg-muted transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            onClick={handleSubmit as any}
            className="flex-[2] py-5 bg-primary text-primary-foreground text-xs font-black uppercase tracking-[0.3em] rounded-3xl hover:opacity-90 transition-all flex items-center justify-center gap-3 disabled:opacity-40 shadow-md"
          >
            {submitting ? (
              <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> {uploadingFile ? 'Uploading file...' : 'Finalizing...'}</>
            ) : (<><PlusIcon className="w-4 h-4" /> Add Resource</>)}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function ContentLibraryPage() {

  const { profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string; subject?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<'all' | 'school' | 'global'>('all');
  const [activeCategory, setActiveCategory] = useState('All');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [programFilter, setProgramFilter] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [viewerItem, setViewerItem] = useState<ContentItem | null>(null);
  const [deployTargetItem, setDeployTargetItem] = useState<ContentItem | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<{ id: string; title: string; subject?: string } | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const isStaff = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');
  const isLearner = profile?.role === 'student';
  const canAccess = isStaff || isLearner;
  const canMutateLibrary = profile?.role === "admin" || profile?.role === "teacher";
  const canUpload = canMutateLibrary;

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: '100' });
      if (search.trim()) params.set('query', search.trim());
      if (activeCategory !== 'All') {
        const type = CATEGORY_TO_TYPE[activeCategory]?.[0];
        if (type) params.set('type', type);
      }
      if (subjectFilter !== 'All') params.set('subject', subjectFilter);
      if (sortKey === 'most_used') params.set('sort', 'usage_count');
      if (sortKey === 'top_rated') params.set('sort', 'rating_average');
      if (sortKey !== 'newest') params.set('order', 'desc');

      const res = await fetch(`/api/content-library?${params.toString()}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load library");
      setItems(payload.data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, activeCategory, subjectFilter, sortKey]);

  const deleteItem = async (e: React.MouseEvent, id: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm("Are you sure you want to permanently delete this resource?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/content-library/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Delete failed");
      setItems(prev => prev.filter(i => i.id !== id));
      setNotice("Asset removed from library");
      setTimeout(() => setNotice(null), 3000);
    } catch (e: any) {
      setError(e.message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const copyShareLink = (item: ContentItem) => {
    const shareUrl = `${window.location.origin}/dashboard/library?item=${item.id}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success("Resource link copied to clipboard!");
  };

  useEffect(() => {
    if (authLoading || !profile || !canAccess) return;
    loadItems();
  }, [authLoading, profile?.id, canAccess, loadItems]);

  useEffect(() => {
    if (authLoading || !profile || !canAccess) return;
    const courseId = searchParams.get('course_id');
    if (courseId) {
      createClient().from("courses").select("id, title, metadata").eq("id", courseId).single()
        .then(({ data }) => {
          if (data) {
            const meta = data.metadata as Record<string, any> | null;
            const subject = meta?.subject;
            setSelectedCourse({
              id: data.id,
              title: data.title,
              subject: typeof subject === 'string' ? subject : undefined
            });
            if (typeof subject === 'string' && subject) {
              setSubjectFilter(subject);
            } else {
              setSearch(data.title);
            }
          }
        });
    }
    if (canMutateLibrary) {
      createClient().from("courses").select("id, title, metadata").order("title")
        .then(({ data }) => {
          if (data) {
            setCourses(data.map(item => {
              const meta = item.metadata as Record<string, any> | null;
              const subject = meta?.subject;
              return {
                id: item.id,
                title: item.title,
                subject: typeof subject === 'string' ? subject : undefined
              };
            }));
          }
        });
    }
  }, [profile?.id, authLoading, canAccess, canMutateLibrary, searchParams]);

  // URL search parameter auto-open for direct item sharing
  useEffect(() => {
    const itemIdParam = searchParams.get('item');
    if (itemIdParam && items.length > 0) {
      const target = items.find(i => i.id === itemIdParam);
      if (target) setViewerItem(target);
    }
  }, [searchParams, items]);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => { if (i.subject) set.add(i.subject); });
    return ['All', ...Array.from(set).sort()];
  }, [items]);

  const categoryCounts = useMemo(() => {
    const base = items.filter(item => {
      const matchTab = activeTab === 'all' ? true : activeTab === 'school' ? item.school_id === profile?.school_id : !item.school_id;
      const matchSubject = subjectFilter === 'All' ? true : item.subject === subjectFilter;
      return matchTab && matchSubject;
    });
    const counts: Record<string, number> = { All: base.length };
    CATEGORIES.slice(1).forEach(cat => {
      const types = CATEGORY_TO_TYPE[cat] ?? [];
      counts[cat] = base.filter(i => types.includes(i.content_type.toLowerCase()) || i.category === cat).length;
    });
    return counts;
  }, [items, activeTab, subjectFilter, profile?.school_id]);

  const filtered = useMemo(() => {
    let result = items.filter(item => {
      const matchSearch = !search || item.title.toLowerCase().includes(search.toLowerCase()) || item.subject?.toLowerCase().includes(search.toLowerCase()) || item.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()));
      const matchTab = activeTab === 'all' ? true : activeTab === 'school' ? item.school_id === profile?.school_id : !item.school_id;
      const matchCat = activeCategory === 'All' ? true : (CATEGORY_TO_TYPE[activeCategory] ?? []).includes(item.content_type.toLowerCase()) || item.category === activeCategory;
      const matchSubject = subjectFilter === 'All' ? true : item.subject === subjectFilter;
      const matchProgram = programFilter === 'All' ? true
        : programFilter === 'General' ? !item.program_id
        : item.programs?.name === programFilter;
      return matchSearch && matchTab && matchCat && matchSubject && matchProgram;
    });
    if (sortKey === 'most_used') result = [...result].sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0));
    else if (sortKey === 'top_rated') result = [...result].sort((a, b) => (b.rating_average ?? 0) - (a.rating_average ?? 0));
    else result = [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return result;
  }, [items, search, activeTab, activeCategory, subjectFilter, programFilter, sortKey, profile?.school_id]);

  const programOptions = useMemo(() => {
    const names = new Set<string>();
    let hasGeneral = false;
    for (const it of items) {
      if (it.programs?.name) names.add(it.programs.name);
      else hasGeneral = true;
    }
    return ['All', ...(hasGeneral ? ['General'] : []), ...Array.from(names).sort()];
  }, [items]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video': return <VideoCameraIcon className="w-5 h-5" />;
      case 'document': return <DocumentIcon className="w-5 h-5" />;
      case 'interactive': return <BoltIcon className="w-5 h-5" />;
      case 'presentation': return <PresentationChartBarIcon className="w-5 h-5" />;
      default: return <ArchiveBoxIcon className="w-5 h-5" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'video': return 'from-rose-500 to-orange-500';
      case 'document': return 'from-blue-500 to-indigo-600';
      case 'interactive': return 'from-violet-500 to-fuchsia-500';
      case 'presentation': return 'from-emerald-500 to-teal-600';
      default: return 'from-slate-600 to-slate-800';
    }
  };

  const updateItemRatingInState = (itemId: string, avg: number, count: number) => {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, rating_average: avg, rating_count: count } : i));
    if (viewerItem?.id === itemId) {
      setViewerItem(prev => prev ? { ...prev, rating_average: avg, rating_count: count } : null);
    }
  };

  if (authLoading) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 mobile-page-root">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
        <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
      <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em] animate-pulse">Loading content library...</p>
    </div>
  );

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 mobile-page-root">
        <div className="max-w-md text-center bg-card border border-border rounded-3xl p-8 shadow-xl">
          <ExclamationTriangleIcon className="w-10 h-10 text-amber-600 dark:text-amber-400 mx-auto mb-4" />
          <h1 className="text-xl font-black text-foreground mb-2">Library Unavailable</h1>
          <p className="text-sm text-muted-foreground">
            This content library is available to students, teachers, schools, and admins.
          </p>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 mobile-page-root">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
        <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
      <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em] animate-pulse">Loading content library...</p>
    </div>
  );

  return (
    <div className={`min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground ${MOBILE_PAGE_BOTTOM}`}>
      {/* Pipeline Stepper */}
      {isStaff && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <PipelineStepper current="library" courseId={searchParams.get('course_id')} />
        </div>
      )}

      {/* Mobile hero */}
      <div className="md:hidden max-w-7xl mx-auto px-4 sm:px-6 pt-4">
        <MobilePageHero
          badge={selectedCourse ? `Course · ${selectedCourse.title}` : 'Resources · Library'}
          title={selectedCourse ? 'Course library' : 'Content library'}
          description={
            selectedCourse
              ? `Resources for ${selectedCourse.title}.`
              : 'Browse, preview, and share teaching resources.'
          }
          icon={BookOpenIcon}
          stats={[{ label: 'Items', value: items.length, tone: 'primary' }]}
          actions={
            canUpload ? (
              <button
                type="button"
                onClick={() => setShowUpload(true)}
                className={`${MOBILE_TOUCH_BTN} bg-primary text-primary-foreground w-full`}
              >
                <PlusIcon className="w-4 h-4" /> Add resource
              </button>
            ) : undefined
          }
        />
      </div>

      {/* Desktop header */}
      <div className="hidden md:block bg-card border-b border-border relative overflow-hidden py-12 lg:py-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(26,58,143,0.1),transparent_50%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(59,111,232,0.15),transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-10" style={{ backgroundImage: 'radial-gradient(var(--foreground) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center lg:text-left">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
            <div className="max-w-3xl">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-center lg:justify-start gap-3 mb-4">
                <div className="p-2.5 bg-primary/10 rounded-2xl border border-primary/20">
                  <BookOpenIcon className="w-5 h-5 text-primary" />
                </div>
                <span className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">
                  {selectedCourse ? `Course resources: ${selectedCourse.title}` : 'Content Library'}
                </span>
              </motion.div>
              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-4xl sm:text-5xl lg:text-6xl font-black text-foreground tracking-tight mb-4">
                {selectedCourse ? 'Course Library' : 'Content Library'}
              </motion.h1>
              <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto lg:mx-0">
                {selectedCourse
                  ? `Precision-engineered assets for ${selectedCourse.title}. Accelerate your curriculum with high-fidelity digital resources.`
                  : 'A sophisticated ecosystem of pedagogical intelligence. Manage, preview, rate, and deploy high-impact educational content.'}
              </motion.p>
            </div>

            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="flex flex-col sm:flex-row items-center gap-4 justify-center">
              {selectedCourse && (
                <button onClick={() => { setSelectedCourse(null); setSearch(''); setSubjectFilter('All'); }} className="w-full sm:w-auto px-8 py-4 bg-muted hover:bg-secondary text-foreground text-[10px] font-black uppercase tracking-[0.25em] rounded-2xl border border-border transition-all">
                  Clear Context
                </button>
              )}
              {canUpload && (
                <button onClick={() => setShowUpload(true)} className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-primary hover:opacity-90 text-primary-foreground text-[10px] font-black uppercase tracking-[0.25em] rounded-2xl transition-all shadow-lg shadow-primary/20">
                  <PlusIcon className="w-4 h-4" /> Add Resource
                </button>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-16 space-y-8">
        {/* Recommendations */}
        {selectedCourse && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-6 bg-card border border-border rounded-3xl relative overflow-hidden group shadow-sm">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-3xl group-hover:bg-primary/20 transition-all duration-700" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <SparklesIcon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-foreground tracking-tight">Recommended for You</h3>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Course Scope: {selectedCourse.title}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.filter(i => (selectedCourse.subject && i.subject === selectedCourse.subject) || i.title.toLowerCase().includes(selectedCourse.title.toLowerCase())).slice(0, 3).map(rec => (
                  <div key={rec.id} onClick={() => setViewerItem(rec)} className="p-4 bg-muted/30 border border-border hover:border-primary/40 rounded-2xl transition-all cursor-pointer group/card flex gap-3.5">
                    <div className={`w-12 h-12 shrink-0 bg-gradient-to-br ${getTypeColor(rec.content_type)} flex items-center justify-center rounded-xl shadow-md group-hover/card:scale-105 transition-transform text-white`}>
                      {getTypeIcon(rec.content_type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-0.5">{rec.content_type}</p>
                      <p className="text-sm font-black text-foreground truncate">{rec.title}</p>
                      <p className="text-[10px] text-muted-foreground italic truncate uppercase tracking-widest mt-0.5">Subject: {rec.subject || 'General'}</p>
                    </div>
                  </div>
                ))}
                {items.filter(i => (selectedCourse.subject && i.subject === selectedCourse.subject) || i.title.toLowerCase().includes(selectedCourse.title.toLowerCase())).length === 0 && (
                  <div className="col-span-full py-8 text-center text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.3em] border-2 border-dashed border-border rounded-2xl">
                    No recommended resources for this course scope.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Discovery Toolbar */}
        <div className="flex flex-col lg:flex-row gap-4 items-center bg-card border border-border p-3 rounded-3xl shadow-lg relative z-20">
          <div className="flex-1 w-full relative">
            <MagnifyingGlassIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input aria-label="Search library"
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by title, subject, tags, or topic..."
              className="w-full pl-14 pr-5 py-4 bg-background text-foreground border border-input rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all text-sm font-bold placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto px-1">
            <div className="flex-1 lg:flex-none">
              <select
                value={subjectFilter}
                onChange={e => setSubjectFilter(e.target.value)}
                className="w-full lg:w-44 bg-background text-foreground border border-input rounded-2xl px-4 py-3.5 text-xs font-bold uppercase tracking-widest cursor-pointer hover:border-primary/40 transition-colors"
              >
                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {programOptions.length > 1 && (
              <div className="flex-1 lg:flex-none">
                <select
                  value={programFilter}
                  onChange={e => setProgramFilter(e.target.value)}
                  className="w-full lg:w-44 bg-background text-foreground border border-input rounded-2xl px-4 py-3.5 text-xs font-bold uppercase tracking-widest cursor-pointer hover:border-primary/40 transition-colors"
                >
                  {programOptions.map(p => <option key={p} value={p}>{p === 'All' ? 'All Programmes' : p}</option>)}
                </select>
              </div>
            )}
            <div className="flex-1 lg:flex-none">
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                className="w-full lg:w-44 bg-background text-foreground border border-input rounded-2xl px-4 py-3.5 text-xs font-bold uppercase tracking-widest cursor-pointer hover:border-primary/40 transition-colors"
              >
                <option value="newest">Newest First</option>
                <option value="most_used">Most Popular</option>
                <option value="top_rated">Top Rated</option>
              </select>
            </div>

            <div className="flex bg-muted/60 p-1 rounded-2xl border border-border">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                title="Grid view"
              >
                <Squares2X2Icon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                title="List view"
              >
                <ListBulletIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Global Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {isStaff ? (
            <div className="flex flex-wrap items-center gap-2">
              {[
                { key: 'all', label: 'Global Pool', icon: ArchiveBoxIcon },
                { key: 'school', label: 'Local School', icon: BuildingOfficeIcon },
                { key: 'global', label: 'Public Assets', icon: GlobeAltIcon },
              ].map(t => {
                const Icon = t.icon; const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key as any)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <BookOpenIcon className="w-4 h-4 text-primary" />
              <span>Learner Library Scoped to Enrolled Programmes</span>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(cat => {
              const active = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  {cat} <span className="opacity-70 ml-1 font-mono">({categoryCounts[cat] ?? 0})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Status Messages */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl flex items-center gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-destructive shrink-0" />
              <p className="text-xs font-bold text-destructive">{error}</p>
            </motion.div>
          )}
          {notice && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3">
              <CheckCircleIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{notice}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content Grid / List */}
        <div className="relative min-h-[400px]">
          {saving && (
            <div className="absolute inset-0 z-30 bg-background/60 backdrop-blur-sm rounded-3xl flex items-center justify-center">
              <div className="bg-card border border-border p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-foreground">Processing...</p>
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="text-center py-24 bg-card/60 backdrop-blur-sm border-2 border-dashed border-border rounded-3xl max-w-3xl mx-auto p-8">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6 border border-border">
                <BookOpenIcon className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-2xl font-black text-foreground mb-2 tracking-tight">No Resources Found</h3>
              <p className="text-muted-foreground text-xs sm:text-sm mb-8 max-w-md mx-auto leading-relaxed">
                {search ? 'No resources match your current search and filters.' : 'This library is currently empty. Add the first resource to get started.'}
              </p>
              {canUpload && !search && (
                <button onClick={() => setShowUpload(true)} className="px-8 py-3.5 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-md hover:opacity-90 transition-all">
                  Deploy First Resource
                </button>
              )}
            </div>
          ) : viewMode === 'list' ? (
            <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm divide-y divide-border">
              {filtered.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => setViewerItem(item)}
                  className="w-full text-left group flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 hover:bg-muted/40 transition-all cursor-pointer"
                >
                  <div className={`shrink-0 w-14 h-14 bg-gradient-to-br ${getTypeColor(item.content_type)} flex items-center justify-center rounded-2xl shadow-sm text-white`}>
                    {item.files?.thumbnail_url ? <img src={item.files.thumbnail_url} alt="" className="w-full h-full object-cover rounded-2xl mix-blend-overlay" /> : getTypeIcon(item.content_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-black text-base text-foreground truncate tracking-tight">{item.title}</h3>
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">{item.content_type}</span>
                      {item.programs?.name && <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{item.programs.name}</span>}
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex-wrap">
                      <span>Subject: {item.subject || 'General'}</span>
                      <span>•</span>
                      <span>Target: {item.grade_level || 'All Levels'}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1"><StarIcon className="w-3 h-3 text-amber-600 dark:text-amber-400 fill-amber-400" /> {item.rating_average?.toFixed(1) || '0.0'} ({item.rating_count || 0})</span>
                      <span>•</span>
                      <span>{item.usage_count ?? 0} Deployments</span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); copyShareLink(item); }}
                      className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
                      title="Copy Share Link"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    {canMutateLibrary && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeployTargetItem(item); }}
                        className="px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground text-[9px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-1"
                        title="Deploy to Course"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                        <span>Deploy</span>
                      </button>
                    )}
                    {canMutateLibrary && (profile?.role === 'admin' || item.school_id === profile?.school_id) && (
                      <button
                        type="button"
                        onClick={(e) => deleteItem(e, item.id)}
                        className="p-2 text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
                        title="Delete asset"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className="group relative bg-card border border-border rounded-3xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                  onClick={() => setViewerItem(item)}
                >
                  <div>
                    <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                      <div className={`absolute inset-0 bg-gradient-to-br ${getTypeColor(item.content_type)} opacity-90 group-hover:scale-105 transition-transform duration-500`} />
                      {item.files?.thumbnail_url ? (
                        <img src={item.files.thumbnail_url} alt={item.title} className="absolute inset-0 w-full h-full object-cover mix-blend-overlay group-hover:scale-105 transition-transform duration-500" />
                      ) : item.content_type === 'video' ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-16 h-16 rounded-full bg-black/30 backdrop-blur-md border border-white/20 flex items-center justify-center text-foreground group-hover:scale-110 transition-transform">
                            <PlayIcon className="w-7 h-7" />
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground group-hover:scale-110 transition-transform">
                          {getTypeIcon(item.content_type)}
                        </div>
                      )}

                      <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                        <div className="px-3 py-1 bg-black/40 backdrop-blur-md border border-white/20 rounded-xl text-[9px] font-black text-foreground uppercase tracking-widest">
                          {item.content_type}
                        </div>
                        <div className="flex items-center gap-1 px-2.5 py-1 bg-black/40 backdrop-blur-md border border-white/20 rounded-xl text-[10px] font-black text-foreground">
                          <StarIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 fill-amber-400" />
                          <span>{item.rating_average?.toFixed(1) || '0.0'}</span>
                        </div>
                      </div>

                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        <button
                          type="button"
                          className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                          title="View Canvas"
                        >
                          <EyeIcon className="w-5 h-5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); copyShareLink(item); }}
                          className="w-12 h-12 rounded-full bg-card text-foreground flex items-center justify-center shadow-lg hover:scale-110 transition-transform border border-border"
                          title="Share link"
                        >
                          <Share2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="p-6 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{item.subject || 'General'}</span>
                        {item.programs?.name && (
                          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                            {item.programs.name}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-black text-foreground leading-tight line-clamp-2 tracking-tight group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed font-medium">
                        {item.description || 'No description provided.'}
                      </p>
                    </div>
                  </div>

                  <div className="px-6 pb-6 pt-2 border-t border-border/50 flex items-center justify-between">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                      {item.grade_level || 'K-12'}
                    </span>

                    <div className="flex items-center gap-2">
                      {canMutateLibrary && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDeployTargetItem(item); }}
                          className="px-2.5 py-1 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground text-[9px] font-black uppercase tracking-widest rounded-xl transition-colors flex items-center gap-1"
                          title="Deploy to Course"
                        >
                          <FolderPlus className="w-3 h-3" />
                          <span>Deploy</span>
                        </button>
                      )}
                      <span className="text-[9px] font-black text-primary uppercase tracking-widest bg-primary/10 px-2 py-1 rounded-lg">
                        {item.usage_count ?? 0} Used
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* In-App Viewer Modal */}
      <AnimatePresence>
        {viewerItem && (
          <InAppViewer
            item={viewerItem}
            onClose={() => setViewerItem(null)}
            onDelete={canMutateLibrary && (profile?.role === 'admin' || viewerItem.school_id === profile?.school_id) ? deleteItem : undefined}
            courses={courses}
            canMutateLibrary={canMutateLibrary}
            onDeployClick={(it) => setDeployTargetItem(it)}
            onItemUpdate={(avg, count) => updateItemRatingInState(viewerItem.id, avg, count)}
          />
        )}
      </AnimatePresence>

      {/* Deploy to Course Modal */}
      <AnimatePresence>
        {deployTargetItem && (
          <DeployToCourseModal
            item={deployTargetItem}
            courses={courses}
            onClose={() => setDeployTargetItem(null)}
            onSuccess={(courseTitle) => {
              setDeployTargetItem(null);
              setNotice(`Resource "${deployTargetItem.title}" deployed to course "${courseTitle}".`);
              setItems(prev => prev.map(i => i.id === deployTargetItem.id ? { ...i, usage_count: (i.usage_count || 0) + 1 } : i));
              setTimeout(() => setNotice(null), 4000);
            }}
          />
        )}
      </AnimatePresence>

      {/* Upload modal */}
      <AnimatePresence>
        {showUpload && canUpload && (
          <UploadModal
            onClose={() => setShowUpload(false)}
            onCreated={(item) => {
              setItems(prev => [item, ...prev]);
              setNotice('Resource deployed to library');
              setShowUpload(false);
              setTimeout(() => setNotice(null), 3500);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
