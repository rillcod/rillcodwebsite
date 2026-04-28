// @refresh reset
'use client';

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
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
  created_at: string;
  files?: {
    public_url?: string | null;
    file_type?: string | null;
    thumbnail_url?: string | null;
  } | null;
};

type SortKey = 'newest' | 'most_used' | 'top_rated';

const CATEGORIES = ['All', 'Videos', 'Guides', 'Projects', 'Interactive', 'Assets'];

const CATEGORY_TO_TYPE: Record<string, string[]> = {
  'Videos': ['video'],
  'Guides': ['document', 'guide'],
  'Projects': ['project'],
  'Interactive': ['interactive', 'quiz'],
  'Assets': ['presentation', 'asset'],
};
// In-App Canvas Viewer Component
function InAppViewer({ item, onClose, onDelete }: {
  item: ContentItem;
  onClose: () => void;
  onDelete?: (e: React.MouseEvent, id: string) => void;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const fileUrl = item.files?.public_url;
  const fileType = item.files?.file_type || item.content_type;

  const isVideo = fileType?.startsWith('video/') || item.content_type === 'video';
  const isImage = fileType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].some(ext => fileUrl?.toLowerCase().includes(ext));
  const isPDF = fileType === 'application/pdf' || fileUrl?.toLowerCase().includes('.pdf');
  const isDocument = ['document', 'guide'].includes(item.content_type) || isPDF;

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
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
      if (isPDF && fileUrl) setTotalPages(10);
    }, 1200);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [handleKeyDown, isPDF, fileUrl]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`fixed inset-0 z-50 flex items-center justify-center ${isFullscreen ? 'p-0' : 'p-4 md:p-12'}`}
    >
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-3xl" onClick={onClose} />

      <div className={`relative w-full h-full bg-slate-900 border border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col ${isFullscreen ? 'rounded-0' : 'rounded-[32px]'}`}>

        {/* Canvas Header */}
        <div className="shrink-0 h-20 bg-slate-900/50 backdrop-blur-xl border-b border-white/10 px-6 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors">
              <ChevronLeftIcon className="w-6 h-6 text-white" />
            </button>
            <div>
              <h3 className="font-black text-white tracking-tight">{item.title}</h3>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">{item.content_type} • {item.subject || 'Syllabus Aligned'}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isPDF && (
              <div className="flex items-center gap-4 px-4 py-2 bg-white/5 border border-white/10 rounded-2xl mr-4">
                <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} className="text-white hover:text-primary disabled:opacity-30">
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>
                <span className="text-xs font-black text-white tabular-nums tracking-widest">{currentPage} / {totalPages}</span>
                <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages} className="text-white hover:text-primary disabled:opacity-30">
                  <ChevronRightIcon className="w-5 h-5" />
                </button>
              </div>
            )}

            <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl p-1">
              <button onClick={toggleFullscreen} className="p-2.5 text-white hover:bg-white/10 rounded-xl transition-all" title="Toggle Fullscreen">
                <ArrowsPointingOutIcon className="w-5 h-5" />
              </button>
              {fileUrl && (
                <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="p-2.5 text-white hover:bg-white/10 rounded-xl transition-all" title="Download">
                  <ArrowDownTrayIcon className="w-5 h-5" />
                </a>
              )}
              {onDelete && (
                <button onClick={(e) => { onDelete(e, item.id); onClose(); }} className="p-2.5 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all" title="Delete">
                  <TrashIcon className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Immersive Viewport */}
        <div className="flex-1 relative bg-slate-950 overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(234,88,12,0.5)]" />
                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Synthesizing Viewport...</p>
              </div>
            </div>
          )}

          <div className="w-full h-full overflow-auto flex items-center justify-center p-8 custom-scrollbar">
            {isVideo && fileUrl ? (
              <div className="w-full max-w-5xl aspect-video rounded-3xl overflow-hidden shadow-2xl border border-white/10">
                <VideoPlayer url={fileUrl} title={item.title} cinemaMode />
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
              <div className="w-full h-full max-w-5xl bg-white rounded-xl shadow-2xl overflow-hidden">
                <iframe src={`${fileUrl}#page=${currentPage}&toolbar=0&navpanes=0`} className="w-full h-full border-0" onLoad={() => setLoading(false)} title={item.title} />
              </div>
            ) : isDocument && fileUrl ? (
              <div className="w-full h-full max-w-5xl bg-white rounded-xl shadow-2xl overflow-hidden">
                <iframe src={fileUrl} className="w-full h-full border-0" onLoad={() => setLoading(false)} title={item.title} />
              </div>
            ) : (
              <div className="text-center space-y-6">
                <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mx-auto border border-white/10">
                  <DocumentIcon className="w-10 h-10 text-white/20" />
                </div>
                <div>
                  <h4 className="text-xl font-black text-white tracking-tight">Format Unsupported</h4>
                  <p className="text-sm text-white/40 max-w-xs mx-auto">This asset requires external processing or download for full resolution.</p>
                </div>
                {fileUrl && (
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 px-8 py-3 bg-primary text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-xl hover:-translate-y-1 transition-all">
                    <ArrowDownTrayIcon className="w-4 h-4" /> Download Intelligence
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
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setErr('Title is required'); return; }
    setSubmitting(true); setErr(null);
    try {
      const typeMap: Record<string, string> = {
        document: 'document', guide: 'document', project: 'interactive',
        video: 'video', interactive: 'interactive',
        presentation: 'presentation', quiz: 'quiz', asset: 'document',
      };
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      if (url.trim()) tagList.push(`url:${url.trim()}`);
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        contentType: typeMap[contentType] ?? 'document',
        subject: subject.trim() || undefined,
        gradeLevel: gradeLevel.trim() || undefined,
        tags: tagList,
      };
      const res = await fetch('/api/content-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Upload failed');
      onCreated(json.data as ContentItem);
    } catch (e: any) {
      setErr(e.message || 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4 md:p-12"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-card border border-white/10 rounded-[40px] w-full max-w-2xl overflow-hidden shadow-[0_40px_120px_-20px_rgba(0,0,0,0.5)] flex flex-col"
      >
        <div className="relative p-8 border-b border-border bg-gradient-to-br from-primary/10 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-3xl bg-primary flex items-center justify-center shadow-[0_15px_30px_rgba(234,88,12,0.3)]">
                <PlusIcon className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-foreground tracking-tight">New Resource</h2>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Deployment Pipeline</p>
              </div>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
              <XMarkIcon className="w-6 h-6 text-muted-foreground" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto custom-scrollbar max-h-[60vh]">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Asset Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="w-full bg-muted/50 border-2 border-transparent focus:border-primary/30 focus:bg-background rounded-3xl px-6 py-4 text-sm font-bold transition-all outline-none"
              placeholder="e.g. Master the Physics of Motion"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Knowledge Context (Description)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-muted/50 border-2 border-transparent focus:border-primary/30 focus:bg-background rounded-3xl px-6 py-4 text-sm font-medium transition-all outline-none resize-none"
              placeholder="Synthesize the key learning outcomes..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Content Type</label>
              <select
                value={contentType}
                onChange={e => setContentType(e.target.value)}
                className="w-full bg-muted/50 border-2 border-transparent focus:border-primary/30 focus:bg-background rounded-3xl px-6 py-4 text-sm font-bold transition-all outline-none appearance-none cursor-pointer"
              >
                <option value="document">Digital Document</option>
                <option value="video">Cinema Video</option>
                <option value="guide">Technical Guide</option>
                <option value="project">Interactive Project</option>
                <option value="interactive">Simulation</option>
                <option value="presentation">Presentation</option>
                <option value="asset">3D / Asset</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Grade Target</label>
              <input
                value={gradeLevel}
                onChange={e => setGradeLevel(e.target.value)}
                className="w-full bg-muted/50 border-2 border-transparent focus:border-primary/30 focus:bg-background rounded-3xl px-6 py-4 text-sm font-bold transition-all outline-none"
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
                className="w-full bg-muted/50 border-2 border-transparent focus:border-primary/30 focus:bg-background rounded-3xl px-6 py-4 text-sm font-bold transition-all outline-none"
                placeholder="e.g. Computer Science"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Metadata Tags</label>
              <input
                value={tags}
                onChange={e => setTags(e.target.value)}
                className="w-full bg-muted/50 border-2 border-transparent focus:border-primary/30 focus:bg-background rounded-3xl px-6 py-4 text-sm font-bold transition-all outline-none"
                placeholder="tag1, tag2..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-1">Deployment URL (Remote Asset)</label>
            <div className="relative">
              <GlobeAltIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                type="url"
                className="w-full bg-muted/50 border-2 border-transparent focus:border-primary/30 focus:bg-background rounded-3xl pl-14 pr-6 py-4 text-sm font-bold transition-all outline-none"
                placeholder="https://cloud.rillcod.com/..."
              />
            </div>
          </div>

          {err && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-3xl flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
                <ExclamationTriangleIcon className="w-5 h-5 text-rose-500" />
              </div>
              <p className="text-sm font-bold text-rose-500">{err}</p>
            </motion.div>
          )}
        </form>

        <div className="p-8 border-t border-border bg-muted/30 flex gap-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-5 bg-background border border-border text-xs font-black uppercase tracking-[0.3em] rounded-3xl hover:bg-muted transition-all"
          >
            Abort
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            onClick={handleSubmit as any}
            className="flex-[2] py-5 bg-primary text-white text-xs font-black uppercase tracking-[0.3em] rounded-3xl shadow-[0_20px_40px_rgba(234,88,12,0.3)] hover:-translate-y-1 transition-all flex items-center justify-center gap-3 disabled:opacity-40"
          >
            {submitting ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Finalizing...</>
            ) : (<><PlusIcon className="w-4 h-4" /> Deploy Resource</>)}
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
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<'all' | 'school' | 'global'>('all');
  const [activeCategory, setActiveCategory] = useState('All');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [viewerItem, setViewerItem] = useState<ContentItem | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<{ id: string; title: string; subject?: string } | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const isStaff = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');
  const isLearner = ['student', 'parent'].includes(profile?.role ?? '');
  const canAccess = isStaff || isLearner;
  const canMutateLibrary = profile?.role === "admin" || profile?.role === "teacher";
  const canUpload = canMutateLibrary;

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/content-library`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load library");
      setItems(payload.data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (e: React.MouseEvent, id: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm("Are you sure you want to permanently delete this resource?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/content-library/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Delete failed");
      setItems(prev => prev.filter(i => i.id !== id));
      setNotice("Asset removed from deployment");
      setTimeout(() => setNotice(null), 3000);
    } catch (e: any) {
      setError(e.message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    loadItems();
    const courseId = searchParams.get('course_id');
    if (courseId) {
      createClient().from("courses").select("id, title").eq("id", courseId).single()
        .then(({ data }) => {
          if (data) {
            setSelectedCourse(data as any);
            setSearch(data.title);
          }
        });
    }
    if (canMutateLibrary) {
      createClient().from("courses").select("id, title").order("title")
        .then(({ data }) => setCourses((data ?? []) as any));
    }
  }, [profile?.id, authLoading, canMutateLibrary, searchParams]);

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
      return matchSearch && matchTab && matchCat && matchSubject;
    });
    if (sortKey === 'most_used') result = [...result].sort((a, b) => (b.usage_count ?? 0) - (a.usage_count ?? 0));
    else if (sortKey === 'top_rated') result = [...result].sort((a, b) => (b.rating_average ?? 0) - (a.rating_average ?? 0));
    else result = [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return result;
  }, [items, search, activeTab, activeCategory, subjectFilter, sortKey, profile?.school_id]);

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

  if (authLoading || loading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
        <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(234,88,12,0.5)]" />
      </div>
      <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em] animate-pulse">Initializing Knowledge Base...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900/50 text-foreground selection:bg-primary selection:text-white">
      {/* Pipeline Stepper */}
      {isStaff && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <PipelineStepper current="library" courseId={searchParams.get('course_id')} />
        </div>
      )}

      {/* Header */}
      <div className="bg-slate-950 border-b border-white/5 relative overflow-hidden py-12 lg:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(234,88,12,0.2),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(79,70,229,0.1),transparent_50%)]" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center lg:text-left">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-12">
            <div className="max-w-3xl">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-center lg:justify-start gap-3 mb-6">
                <div className="p-3 bg-primary/20 rounded-2xl backdrop-blur-md border border-primary/20">
                  <BookOpenIcon className="w-6 h-6 text-primary" />
                </div>
                <span className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">
                  {selectedCourse ? `Intelligence Stream: ${selectedCourse.title}` : 'Knowledge Repository'}
                </span>
              </motion.div>
              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-5xl lg:text-7xl font-black text-white tracking-tight mb-8">
                {selectedCourse ? 'Course Library' : 'Content Library'}
              </motion.h1>
              <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-xl text-slate-400 leading-relaxed max-w-2xl mx-auto lg:mx-0">
                {selectedCourse
                  ? `Precision-engineered assets for ${selectedCourse.title}. Accelerate your curriculum with high-fidelity digital resources.`
                  : 'A sophisticated ecosystem of pedagogical intelligence. Manage, preview, and deploy high-impact educational content.'}
              </motion.p>
            </div>

            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="flex flex-col sm:flex-row items-center gap-6 justify-center">
              {selectedCourse && (
                <button onClick={() => { setSelectedCourse(null); setSearch(''); setSubjectFilter('All'); }} className="w-full sm:w-auto px-10 py-5 bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-3xl border border-white/10 transition-all backdrop-blur-md">
                  Clear Context
                </button>
              )}
              {canUpload && (
                <button onClick={() => setShowUpload(true)} className="w-full sm:w-auto flex items-center justify-center gap-4 px-12 py-5 bg-primary hover:brightness-110 text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-3xl transition-all shadow-[0_20px_60px_rgba(234,88,12,0.4)] hover:-translate-y-2">
                  <PlusIcon className="w-5 h-5" /> Deploy Asset
                </button>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-24">
        {/* Recommendations */}
        {selectedCourse && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-16 p-8 bg-slate-950 border border-white/10 rounded-[40px] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-3xl group-hover:bg-primary/20 transition-all duration-700" />
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/20">
                  <SparklesIcon className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white tracking-tight">Recommended for You</h3>
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Neural Matching: {selectedCourse.title}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.filter(i => i.subject === selectedCourse.subject || i.title.toLowerCase().includes(selectedCourse.title.toLowerCase())).slice(0, 3).map(rec => (
                  <div key={rec.id} onClick={() => setViewerItem(rec)} className="p-6 bg-white/5 border border-white/5 hover:border-primary/40 rounded-3xl transition-all cursor-pointer group/card flex gap-4">
                    <div className={`w-14 h-14 shrink-0 bg-gradient-to-br ${getTypeColor(rec.content_type)} flex items-center justify-center rounded-2xl shadow-lg group-hover/card:scale-110 transition-transform duration-500 text-white`}>
                      {getTypeIcon(rec.content_type)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-1">{rec.content_type}</p>
                      <p className="text-base font-black text-white truncate mb-1">{rec.title}</p>
                      <p className="text-[10px] text-white/40 italic truncate uppercase tracking-widest">Subject: {rec.subject}</p>
                    </div>
                  </div>
                ))}
                {items.filter(i => i.subject === selectedCourse.subject || i.title.toLowerCase().includes(selectedCourse.title.toLowerCase())).length === 0 && (
                  <div className="col-span-full py-12 text-center text-[10px] font-black text-white/20 uppercase tracking-[0.4em] border-2 border-dashed border-white/5 rounded-3xl">
                    Seeking Neural Matches...
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Discovery Toolbar */}
        <div className="flex flex-col lg:flex-row gap-6 items-center bg-white dark:bg-slate-900 border border-border p-3 rounded-[32px] shadow-2xl mb-12 relative z-20">
          <div className="flex-1 w-full relative">
            <MagnifyingGlassIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search intelligence pool..."
              className="w-full pl-16 pr-6 py-5 bg-slate-50 dark:bg-white/5 border-0 rounded-[24px] focus:outline-none focus:bg-white dark:focus:bg-white/10 transition-all text-sm font-bold placeholder:text-muted-foreground/50 tracking-tight"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto px-2">
            <div className="flex-1 lg:flex-none relative">
              <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} className="w-full lg:w-48 bg-slate-50 dark:bg-white/5 border-0 rounded-2xl px-6 py-4 text-[10px] font-black uppercase tracking-widest appearance-none cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex-1 lg:flex-none relative">
              <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} className="w-full lg:w-48 bg-slate-50 dark:bg-white/5 border-0 rounded-2xl px-6 py-4 text-[10px] font-black uppercase tracking-widest appearance-none cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                <option value="newest">Newest First</option>
                <option value="most_used">Most Popular</option>
                <option value="top_rated">Top Rated</option>
              </select>
            </div>

            <div className="flex bg-slate-50 dark:bg-white/5 p-1.5 rounded-2xl border border-border/50">
              <button onClick={() => setViewMode('grid')} className={`p-3 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-white/10 text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                <Squares2X2Icon className="w-5 h-5" />
              </button>
              <button onClick={() => setViewMode('list')} className={`p-3 rounded-xl transition-all ${viewMode === 'list' ? 'bg-white dark:bg-white/10 text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                <ListBulletIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Global Filter Pills */}
        {isStaff && (
          <div className="flex flex-wrap items-center gap-3 mb-12">
            {[
              { key: 'all', label: 'Global Pool', icon: ArchiveBoxIcon },
              { key: 'school', label: 'Local School', icon: BuildingOfficeIcon },
              { key: 'global', label: 'Public Assets', icon: GlobeAltIcon },
            ].map(t => {
              const Icon = t.icon; const active = activeTab === t.key;
              return (
                <button key={t.key} onClick={() => setActiveTab(t.key as any)} className={`inline-flex items-center gap-3 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border shadow-sm ${active ? 'bg-primary border-primary text-white scale-105 shadow-primary/20' : 'bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-primary'}`}>
                  <Icon className="w-4 h-4" /> {t.label}
                </button>
              );
            })}

            <div className="h-6 w-px bg-border mx-2 hidden sm:block" />

            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => {
                const active = activeCategory === cat;
                return (
                  <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] border transition-all ${active ? 'bg-slate-950 text-white border-slate-950 shadow-lg' : 'bg-white dark:bg-white/5 border-border text-muted-foreground hover:border-primary/30'}`}>
                    {cat} <span className="opacity-40 ml-1.5">{categoryCounts[cat] ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Status Messages */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-3xl flex items-center gap-4 mb-12">
              <ExclamationTriangleIcon className="w-6 h-6 text-rose-500 shrink-0" />
              <p className="text-sm font-bold text-rose-500">{error}</p>
            </motion.div>
          )}
          {notice && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl flex items-center gap-4 mb-12">
              <CheckCircleIcon className="w-6 h-6 text-emerald-500 shrink-0" />
              <p className="text-sm font-bold text-emerald-500">{notice}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content Node */}
        <div className="relative min-h-[400px]">
          {saving && (
            <div className="absolute inset-0 z-30 bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm rounded-[40px] flex items-center justify-center">
              <div className="bg-card border border-border p-10 rounded-[32px] shadow-2xl flex flex-col items-center gap-6">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-foreground">Synchronizing Node...</p>
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="text-center py-32 bg-card/50 backdrop-blur-sm border-2 border-dashed border-border rounded-[40px] max-w-4xl mx-auto">
              <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mx-auto mb-8 border border-border">
                <BookOpenIcon className="w-12 h-12 text-muted-foreground/30" />
              </div>
              <h3 className="text-3xl font-black text-foreground mb-4 tracking-tight">Intelligence Void Detected</h3>
              <p className="text-slate-500 text-base mb-10 max-w-md mx-auto leading-relaxed">
                {search ? 'Your parameters returned zero neural matches. Try recalibrating your filters.' : 'This node is currently empty. Initialize your first asset deployment.'}
              </p>
              {canUpload && !search && (
                <button onClick={() => setShowUpload(true)} className="px-10 py-5 bg-primary text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-[24px] shadow-2xl hover:-translate-y-1 transition-all">
                  Deploy First Resource
                </button>
              )}
            </div>
          ) : viewMode === 'list' ? (
            <div className="bg-white dark:bg-slate-900 border border-border rounded-[40px] overflow-hidden shadow-xl">
              {filtered.map((item, index) => (
                <motion.button key={item.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.03 }} onClick={() => setViewerItem(item)} className="w-full text-left group flex items-center gap-8 p-8 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-all relative border-b border-border last:border-0">
                  <div className={`shrink-0 w-20 h-20 bg-gradient-to-br ${getTypeColor(item.content_type)} flex items-center justify-center rounded-2xl shadow-xl group-hover:scale-110 transition-transform duration-500 text-white`}>
                    {item.files?.thumbnail_url ? <img src={item.files.thumbnail_url} alt="" className="w-full h-full object-cover rounded-2xl mix-blend-overlay" /> : getTypeIcon(item.content_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-4 mb-2">
                      <h3 className="font-black text-xl text-foreground truncate tracking-tight">{item.title}</h3>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-lg bg-muted text-muted-foreground border border-border">{item.content_type}</span>
                      {item.is_approved && <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-500"><CheckCircleIcon className="w-4 h-4" /> Validated</div>}
                    </div>
                    <div className="flex items-center gap-6 text-[10px] font-black text-muted-foreground/60 uppercase tracking-[0.2em]">
                      <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary" /> {item.subject || 'Syllabus Aligned'}</span>
                      <span className="opacity-20">•</span>
                      <span>Target: {item.grade_level || 'All Levels'}</span>
                      <span className="opacity-20">•</span>
                      <span className="flex items-center gap-1"><StarIcon className="w-3.5 h-3.5 text-amber-400" /> {item.rating_average?.toFixed(1) || '0.0'}</span>
                      <span className="opacity-20">•</span>
                      <span>{item.usage_count ?? 0} Deployments</span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                    <div className="px-6 py-3 bg-primary text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl shadow-xl shadow-primary/20">Access Canvas</div>
                    {canMutateLibrary && (profile?.role === 'admin' || item.school_id === profile?.school_id) && (
                      <button onClick={(e) => deleteItem(e, item.id)} className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-all shadow-sm">
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {filtered.map((item, index) => (
                <motion.div key={item.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="group relative bg-white dark:bg-slate-900 border border-border rounded-[40px] overflow-hidden hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.2)] transition-all duration-700 hover:-translate-y-4 cursor-pointer" onClick={() => setViewerItem(item)}>
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <div className={`absolute inset-0 bg-gradient-to-br ${getTypeColor(item.content_type)} opacity-90 group-hover:scale-110 transition-transform duration-1000`} />
                    {item.files?.thumbnail_url ? <img src={item.files.thumbnail_url} alt={item.title} className="absolute inset-0 w-full h-full object-cover mix-blend-overlay group-hover:scale-110 transition-transform duration-1000" /> : item.content_type === 'video' ? <div className="absolute inset-0 flex items-center justify-center"><div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-xl border border-white/30 flex items-center justify-center group-hover:scale-125 transition-all duration-700"><PlayIcon className="w-8 h-8 text-white" /></div></div> : <div className="absolute inset-0 flex items-center justify-center opacity-20 group-hover:scale-125 transition-transform duration-1000 text-white">{getTypeIcon(item.content_type)}</div>}
                    <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
                      <div className="px-4 py-2 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl text-[10px] font-black text-white uppercase tracking-[0.2em]">{item.content_type}</div>
                      {item.rating_count && <div className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl text-[10px] font-black text-white"><StarIcon className="w-4 h-4 text-amber-400" /> {item.rating_average?.toFixed(1)}</div>}
                    </div>
                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-center justify-center gap-6">
                      <div className="w-16 h-16 rounded-full bg-white text-slate-950 flex items-center justify-center shadow-2xl scale-50 group-hover:scale-100 transition-all duration-500 delay-75"><EyeIcon className="w-6 h-6" /></div>
                      {canMutateLibrary && (profile?.role === 'admin' || item.school_id === profile?.school_id) && (
                        <button onClick={(e) => deleteItem(e, item.id)} className="w-16 h-16 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-2xl scale-50 group-hover:scale-100 transition-all duration-500 delay-150 hover:bg-rose-600"><TrashIcon className="w-6 h-6" /></button>
                      )}
                    </div>
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-primary" /><span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">{item.subject || 'Syllabus Aligned'}</span></div>
                      <h3 className="text-xl font-black text-foreground leading-tight line-clamp-2 tracking-tight group-hover:text-primary transition-colors">{item.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground/70 line-clamp-2 leading-relaxed font-medium">{item.description || 'No supplementary intelligence provided for this asset deployment.'}</p>
                    <div className="pt-6 border-t border-border flex items-center justify-between">
                      <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-2xl bg-muted flex items-center justify-center"><UserIcon className="w-5 h-5 text-muted-foreground" /></div><span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{item.grade_level || 'K-12'}</span></div>
                      <div className="text-[10px] font-black text-primary uppercase tracking-widest bg-primary/10 px-3 py-1.5 rounded-xl">{item.usage_count ?? 0} DEPLOYMENTS</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* In-App Viewer */}
      <AnimatePresence>
        {viewerItem && (
          <InAppViewer item={viewerItem} onClose={() => setViewerItem(null)} onDelete={canMutateLibrary && (profile?.role === 'admin' || viewerItem.school_id === profile?.school_id) ? deleteItem : undefined} />
        )}
      </AnimatePresence>

      {/* Upload modal */}
      <AnimatePresence>
        {showUpload && canUpload && (
          <UploadModal onClose={() => setShowUpload(false)} onCreated={(item) => { setItems(prev => [item, ...prev]); setNotice('Resource deployed to library'); setShowUpload(false); setTimeout(() => setNotice(null), 3500); }} />
        )}
      </AnimatePresence>
    </div>
  );
}
