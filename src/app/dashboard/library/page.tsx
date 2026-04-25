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
  'Videos':      ['video'],
  'Guides':      ['document', 'guide'],
  'Projects':    ['project'],
  'Interactive': ['interactive', 'quiz'],
  'Assets':      ['presentation', 'asset'],
};
// In-App Canvas Viewer Component
function InAppViewer({ item, onClose }: { item: ContentItem; onClose: () => void }) {
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
      if (isFullscreen) {
        setIsFullscreen(false);
      } else {
        onClose();
      }
    }
    if (e.key === 'ArrowLeft' && currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
    if (e.key === 'ArrowRight' && currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  }, [currentPage, totalPages, isFullscreen, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    // Set loading to false after component mounts with error handling
    const timer = setTimeout(() => {
      setLoading(false);
      // Auto-detect total pages for PDFs
      if (isPDF && fileUrl) {
        // This is a simplified approach - in production you'd want proper PDF parsing
        setTotalPages(10); // Default assumption, could be enhanced with PDF.js
      }
    }, 1000);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [handleKeyDown, isPDF, fileUrl]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`fixed inset-0 z-50 bg-black/95 backdrop-blur-xl ${isFullscreen ? 'p-0' : 'p-4 md:p-8'}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`relative w-full h-full bg-background border border-border overflow-hidden ${isFullscreen ? 'rounded-none' : 'rounded-lg'}`}>
        
        {/* Header Controls */}
        <div className="absolute top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-md border-b border-border p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
            <div>
              <h3 className="font-bold text-foreground">{item.title}</h3>
              <p className="text-xs text-muted-foreground">{item.content_type} • {item.subject || 'General'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isPDF && (
              <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-lg">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  className="p-1 hover:bg-background rounded disabled:opacity-50"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono">{currentPage} / {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-1 hover:bg-background rounded disabled:opacity-50"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            )}
            
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              {isFullscreen ? (
                <ArrowsPointingOutIcon className="w-5 h-5" />
              ) : (
                <ArrowsPointingOutIcon className="w-5 h-5" />
              )}
            </button>
            
            {fileUrl && (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <ArrowDownTrayIcon className="w-5 h-5" />
              </a>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="pt-20 h-full overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Loading content...</p>
              </div>
            </div>
          )}

          {isVideo && fileUrl ? (
            <div className="w-full h-full flex items-center justify-center p-4">
              <VideoPlayer
                url={fileUrl}
                title={item.title}
                cinemaMode
              />
            </div>
          ) : isImage && fileUrl ? (
            <div className="w-full h-full flex items-center justify-center p-4">
              <img
                src={fileUrl}
                alt={item.title}
                className="max-w-full max-h-full object-contain"
                onLoad={() => setLoading(false)}
                onError={() => setLoading(false)}
              />
            </div>
          ) : isPDF && fileUrl ? (
            <div className="w-full h-full">
              <iframe
                src={`${fileUrl}#page=${currentPage}&toolbar=0&navpanes=0&scrollbar=0`}
                className="w-full h-full border-0"
                onLoad={() => setLoading(false)}
                title={item.title}
              />
            </div>
          ) : isDocument && fileUrl ? (
            <div className="w-full h-full">
              <iframe
                src={fileUrl}
                className="w-full h-full border-0"
                onLoad={() => setLoading(false)}
                title={item.title}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4">
                <DocumentIcon className="w-16 h-16 text-muted-foreground mx-auto" />
                <div>
                  <p className="text-muted-foreground font-medium">Preview not available</p>
                  <p className="text-xs text-muted-foreground">This file type cannot be previewed in the browser</p>
                </div>
                {fileUrl && (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                    Download File
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mobile-friendly navigation overlay */}
        {isPDF && (
          <div className="md:hidden absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur-md border border-border rounded-full px-4 py-2 flex items-center gap-3">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="p-2 hover:bg-muted rounded-full disabled:opacity-50"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <span className="text-sm font-mono min-w-[60px] text-center">{currentPage}/{totalPages}</span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
              className="p-2 hover:bg-muted rounded-full disabled:opacity-50"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
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
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [viewerItem, setViewerItem] = useState<ContentItem | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<{ id: string; title: string; subject?: string } | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const isStaff  = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');
  const isLearner = ['student', 'parent'].includes(profile?.role ?? '');
  const canAccess = isStaff || isLearner;
  const canMutateLibrary = profile?.role === "admin" || profile?.role === "teacher";
  const canApprove = profile?.role === "admin";
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

  useEffect(() => {
    if (authLoading || !profile) return;
    loadItems();
    
    const courseId = searchParams.get('course_id');
    if (courseId) {
      createClient().from("courses").select("id, title").eq("id", courseId).single()
        .then(({ data }) => {
          if (data) {
            setSelectedCourse(data as any);
            // Try searching by course title
            setSearch(data.title);
          }
        });
    }

    if (canMutateLibrary) {
      createClient().from("courses").select("id, title").order("title")
        .then(({ data }) => setCourses((data ?? []) as any));
    }
  }, [profile?.id, authLoading, canMutateLibrary, searchParams]);

  // Unique subjects derived from loaded data
  const subjects = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => { if (i.subject) set.add(i.subject); });
    return ['All', ...Array.from(set).sort()];
  }, [items]);

  // Count per category (respects the current tab & subject filter so
  // the pills update as the user narrows down).
  const categoryCounts = useMemo(() => {
    const base = items.filter(item => {
      const matchTab = activeTab === 'all' ? true
        : activeTab === 'school' ? item.school_id === profile?.school_id
        : !item.school_id;
      const matchSubject = subjectFilter === 'All' ? true : item.subject === subjectFilter;
      return matchTab && matchSubject;
    });
    const counts: Record<string, number> = { All: base.length };
    CATEGORIES.slice(1).forEach(cat => {
      const types = CATEGORY_TO_TYPE[cat] ?? [];
      counts[cat] = base.filter(i =>
        types.includes(i.content_type.toLowerCase()) || i.category === cat
      ).length;
    });
    return counts;
  }, [items, activeTab, subjectFilter, profile?.school_id]);

  const filtered = useMemo(() => {
    let result = items.filter(item => {
      const matchSearch = !search ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.subject?.toLowerCase().includes(search.toLowerCase()) ||
        item.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()));
      const matchTab = activeTab === 'all' ? true
        : activeTab === 'school' ? item.school_id === profile?.school_id
        : !item.school_id;
      const matchCat = activeCategory === 'All' ? true
        : (CATEGORY_TO_TYPE[activeCategory] ?? []).includes(item.content_type.toLowerCase())
          || item.category === activeCategory;
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
      case 'video':        return <VideoCameraIcon className="w-5 h-5" />;
      case 'document':     return <DocumentIcon className="w-5 h-5" />;
      case 'interactive':  return <BoltIcon className="w-5 h-5" />;
      case 'presentation': return <PresentationChartBarIcon className="w-5 h-5" />;
      default:             return <ArchiveBoxIcon className="w-5 h-5" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'video':        return 'from-red-600/30 to-primary/20';
      case 'document':     return 'from-blue-600/30 to-indigo-600/20';
      case 'interactive':  return 'from-violet-600/30 to-purple-600/20';
      case 'presentation': return 'from-emerald-600/30 to-teal-600/20';
      default:             return 'from-primary/20 to-amber-600/10';
    }
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Content Pipeline Stepper (staff only) ── */}
      {(profile?.role === 'admin' || profile?.role === 'teacher') && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          {isStaff && (
            <PipelineStepper 
              current="library" 
              courseId={searchParams.get('course_id')}
              curriculumId={searchParams.get('curriculum_id')}
              programId={searchParams.get('program_id')}
            />
          )}
        </div>
      )}

      {/* Enhanced Header */}
      <div className="bg-card border-b border-border relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-violet-500/5 blur-3xl pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BookOpenIcon className="w-5 h-5 text-primary" />
                <span className="text-xs font-black text-primary uppercase tracking-widest">
                  {selectedCourse ? `Resources for ${selectedCourse.title}` : 'Digital Resources'}
                </span>
              </div>
              <h1 className="text-3xl lg:text-4xl font-black text-foreground tracking-tight">
                {selectedCourse ? 'Course Library' : 'Content Library'}
              </h1>
              <p className="text-muted-foreground mt-2 max-w-2xl">
                {selectedCourse 
                  ? `Showing relevant materials for ${selectedCourse.title}. Explore videos, guides, and projects to enhance your curriculum.`
                  : 'Discover, preview, and access educational resources with our enhanced in-app viewer.'}
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {selectedCourse && (
                <button 
                  onClick={() => {
                    setSelectedCourse(null);
                    setSearch('');
                    setSubjectFilter('All');
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-muted hover:bg-muted/80 text-foreground text-xs font-black uppercase tracking-widest border border-border transition-colors"
                >
                  Clear Context
                </button>
              )}
              {canUpload && (
                <button 
                  onClick={() => setShowUpload(true)} 
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary text-white text-xs font-black uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(234,88,12,0.3)] hover:shadow-[0_0_25px_rgba(234,88,12,0.4)]"
                >
                  <PlusIcon className="w-4 h-4" /> Upload Resource
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        
        {/* Smart Recommendations - CONTEXT AWARE */}
        {selectedCourse && (
          <div className="mb-8 p-6 bg-gradient-to-r from-primary/10 via-card to-violet-600/5 border border-primary/30 rounded-none relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-all" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <SparklesIcon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight italic">Smart Recommendations</h3>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Neural Match for {selectedCourse.title}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {items.filter(i => i.subject === selectedCourse.subject || i.title.toLowerCase().includes(selectedCourse.title.toLowerCase())).slice(0, 3).map(rec => (
                   <div key={rec.id} onClick={() => setViewerItem(rec)} className="p-4 bg-background border border-border hover:border-primary/30 transition-all cursor-pointer flex gap-3">
                      <div className={`w-12 h-12 shrink-0 bg-gradient-to-br ${getTypeColor(rec.content_type)} flex items-center justify-center`}>
                        {getTypeIcon(rec.content_type)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-1">{rec.content_type}</p>
                        <p className="text-sm font-black truncate">{rec.title}</p>
                        <p className="text-[10px] text-muted-foreground italic truncate">Matching Subject: {rec.subject}</p>
                      </div>
                   </div>
                 ))}
                 {items.filter(i => i.subject === selectedCourse.subject || i.title.toLowerCase().includes(selectedCourse.title.toLowerCase())).length === 0 && (
                   <div className="col-span-3 py-6 text-center text-xs font-black text-muted-foreground uppercase tracking-widest border border-dashed border-border">
                      Seeking neural matches for this module...
                   </div>
                 )}
              </div>
            </div>
          </div>
        )}
        {/* Scope tabs (All / My School / Global) — only meaningful for
            school & teacher roles; admins see everything via All. */}
        {(isStaff) && (
          <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 mb-4 w-fit overflow-x-auto">
            {[
              { key: 'all',    label: 'All',       icon: ArchiveBoxIcon },
              { key: 'school', label: 'My School', icon: BuildingOfficeIcon },
              { key: 'global', label: 'Global',    icon: GlobeAltIcon },
            ].map(t => {
              const Icon = t.icon;
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key as any)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                    active
                      ? 'bg-violet-600 text-white'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Category pills with counts — click to drill in */}
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto [-webkit-overflow-scrolling:touch] pb-1">
          {CATEGORIES.map(cat => {
            const count = categoryCounts[cat] ?? 0;
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  active
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
                }`}
              >
                <span>{cat}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black tracking-tighter ${active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Enhanced Search and Filters */}
        <div className="bg-card border border-border p-4 sm:p-6 mb-6 space-y-4 sm:space-y-6 rounded-none">
          {/* Search Bar */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search resources by title, subject, or tags..."
              className="w-full bg-background border border-border pl-12 pr-4 py-3 sm:py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors min-h-[44px]"
            />
          </div>

          {/* Filter Controls */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {/* Subject */}
            <div>
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Subject</label>
              <select
                value={subjectFilter}
                onChange={e => setSubjectFilter(e.target.value)}
                className="select-premium w-full px-3 py-2.5 text-sm focus:border-primary transition-colors min-h-[40px]"
              >
                {subjects.map(subject => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Sort By</label>
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                className="select-premium w-full px-3 py-2.5 text-sm focus:border-primary transition-colors min-h-[40px]"
              >
                <option value="newest">Newest First</option>
                <option value="most_used">Most Used</option>
                <option value="top_rated">Top Rated</option>
              </select>
            </div>

            {/* Reset */}
            <div className="col-span-2 md:col-span-1">
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Reset</label>
              <button
                onClick={() => { setSearch(''); setActiveCategory('All'); setSubjectFilter('All'); setSortKey('newest'); }}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-bold bg-background border border-border hover:bg-muted transition-colors min-h-[40px]"
              >
                <ArrowPathIcon className="w-3.5 h-3.5" /> Clear filters
              </button>
            </div>

            {/* View Toggle */}
            <div className="col-span-2 md:col-span-1">
              <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">View</label>
              <div className="flex border border-border min-h-[40px]" role="group" aria-label="Layout">
                <button
                  onClick={() => setViewMode('grid')}
                  aria-pressed={viewMode === 'grid' ? 'true' : 'false'}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 text-xs font-black uppercase tracking-widest transition-colors ${
                    viewMode === 'grid' ? 'bg-primary text-white' : 'bg-background hover:bg-muted text-muted-foreground'
                  }`}
                >
                  <Squares2X2Icon className="w-4 h-4" /> Grid
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  aria-pressed={viewMode === 'list' ? 'true' : 'false'}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 text-xs font-black uppercase tracking-widest transition-colors ${
                    viewMode === 'list' ? 'bg-primary text-white' : 'bg-background hover:bg-muted text-muted-foreground'
                  }`}
                >
                  <ListBulletIcon className="w-4 h-4" /> List
                </button>
              </div>
            </div>
          </div>

          {/* Result meta */}
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground font-bold uppercase tracking-widest">
            <span>{filtered.length} resource{filtered.length === 1 ? '' : 's'}</span>
            {(search || activeCategory !== 'All' || subjectFilter !== 'All') && (
              <span className="text-primary">Filtered</span>
            )}
          </div>
        </div>

        {/* Results */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-6 flex items-center gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-destructive flex-shrink-0" />
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}

        {notice && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mb-6 flex items-center gap-3">
            <CheckCircleIcon className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <p className="text-emerald-400 text-sm">{notice}</p>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-20 bg-card border border-border">
            <BookOpenIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">No Resources Found</h3>
            <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
              {search ? 'Try adjusting your search terms or filters.' : 'No resources are available yet.'}
            </p>
            {canUpload && !search && (
              <button 
                onClick={() => setShowUpload(true)}
                className="px-6 py-3 bg-primary hover:bg-primary text-white font-bold rounded-none transition-colors"
              >
                Upload First Resource
              </button>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <div className="bg-card border border-border divide-y divide-border rounded-none">
            {filtered.map((item, index) => (
              <motion.button
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.02, 0.4) }}
                onClick={() => setViewerItem(item)}
                className="w-full text-left flex items-center gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-muted/30 transition-colors min-h-[72px]"
              >
                <div className={`shrink-0 w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br ${getTypeColor(item.content_type)} flex items-center justify-center text-white/80 rounded-none`}>
                  {item.files?.thumbnail_url ? (
                    <img src={item.files.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    getTypeIcon(item.content_type)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm text-foreground truncate">{item.title}</h3>
                    <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 border border-border bg-muted text-muted-foreground">
                      {item.content_type}
                    </span>
                    {item.is_approved && (
                      <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Approved
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                    <span>{item.subject || 'General'}</span>
                    {item.grade_level && <span>• {item.grade_level}</span>}
                    <span>• {item.usage_count ?? 0} uses</span>
                    {item.rating_count ? (
                      <span className="inline-flex items-center gap-0.5">
                        • <StarIcon className="w-3 h-3 text-amber-400" /> {item.rating_average?.toFixed(1)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <EyeIcon className="w-4 h-4 text-muted-foreground shrink-0 hidden sm:block" />
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filtered.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-card border border-border overflow-hidden hover:border-primary/30 transition-all duration-200 group cursor-pointer"
                onClick={() => setViewerItem(item)}
              >
                {/* Thumbnail/Preview */}
                <div className={`relative h-48 bg-gradient-to-br ${getTypeColor(item.content_type)} flex items-center justify-center overflow-hidden`}>
                  {item.files?.thumbnail_url ? (
                    <img 
                      src={item.files.thumbnail_url} 
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : item.content_type === 'video' && item.files?.public_url ? (
                    <div className="relative w-full h-full bg-background flex items-center justify-center">
                      <PlayIcon className="w-12 h-12 text-white/80" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    </div>
                  ) : (
                    <div className="text-white/20">
                      {getTypeIcon(item.content_type)}
                    </div>
                  )}
                  
                  {/* Type Badge */}
                  <div className="absolute top-3 left-3 px-2 py-1 bg-black/60 text-white text-xs font-bold uppercase tracking-wider">
                    {item.content_type}
                  </div>
                  
                  {/* Rating */}
                  {item.rating_count && item.rating_count > 0 && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 bg-black/60 text-white text-xs">
                      <StarIcon className="w-3 h-3 text-amber-400" />
                      {item.rating_average?.toFixed(1)}
                    </div>
                  )}
                  
                  {/* Preview Overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-200 flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <EyeIcon className="w-8 h-8 text-white" />
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="font-bold text-foreground text-sm leading-tight group-hover:text-primary transition-colors line-clamp-2">
                      {item.title}
                    </h3>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Meta Info */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{item.subject || 'General'}</span>
                    <span>{item.usage_count ?? 0} uses</span>
                  </div>

                  {/* Tags */}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-medium">
                          {tag}
                        </span>
                      ))}
                      {item.tags.length > 3 && (
                        <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-medium">
                          +{item.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* In-App Viewer */}
      <AnimatePresence>
        {viewerItem && (
          <InAppViewer 
            item={viewerItem} 
            onClose={() => setViewerItem(null)} 
          />
        )}
      </AnimatePresence>

      {/* Upload modal — mobile-first */}
      <AnimatePresence>
        {showUpload && canUpload && (
          <UploadModal
            onClose={() => setShowUpload(false)}
            onCreated={(item) => {
              setItems(prev => [item, ...prev]);
              setNotice('Resource added to library');
              setShowUpload(false);
              setTimeout(() => setNotice(null), 3500);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---- Upload modal ---------------------------------------------------- */

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
      // API schema accepts a narrower enum — normalise legacy labels
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
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className="bg-card border border-border rounded-t-2xl sm:rounded-none w-full sm:max-w-lg max-h-[92vh] overflow-hidden flex flex-col pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <ArchiveBoxIcon className="w-5 h-5 text-primary" />
            <h2 className="font-black uppercase tracking-widest text-sm text-foreground">Add Resource</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg" aria-label="Close">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5 text-muted-foreground">Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="w-full bg-background border border-border px-3 py-2.5 text-sm min-h-[44px]"
              placeholder="e.g. Intro to Scratch — PDF workbook"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5 text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-background border border-border px-3 py-2.5 text-sm"
              placeholder="What will learners gain from this resource?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5 text-muted-foreground">Type</label>
              <select
                value={contentType}
                onChange={e => setContentType(e.target.value)}
                className="select-premium w-full px-3 py-2.5 text-sm min-h-[44px]"
              >
                <option value="document">Document</option>
                <option value="video">Video</option>
                <option value="guide">Guide</option>
                <option value="project">Project</option>
                <option value="interactive">Interactive</option>
                <option value="presentation">Presentation</option>
                <option value="asset">Asset</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5 text-muted-foreground">Grade</label>
              <input
                value={gradeLevel}
                onChange={e => setGradeLevel(e.target.value)}
                className="w-full bg-background border border-border px-3 py-2.5 text-sm min-h-[44px]"
                placeholder="e.g. P3 – JSS1"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5 text-muted-foreground">Subject</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full bg-background border border-border px-3 py-2.5 text-sm min-h-[44px]"
              placeholder="e.g. Scratch, Python, Robotics"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5 text-muted-foreground">Resource URL</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              type="url"
              className="w-full bg-background border border-border px-3 py-2.5 text-sm min-h-[44px]"
              placeholder="https://… (optional — link to external asset)"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Tip: for file uploads, first add the file via the Files page, then reference it here.
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5 text-muted-foreground">Tags (comma-separated)</label>
            <input
              value={tags}
              onChange={e => setTags(e.target.value)}
              className="w-full bg-background border border-border px-3 py-2.5 text-sm min-h-[44px]"
              placeholder="e.g. beginner, scratch, worksheet"
            />
          </div>

          {err && (
            <div className="bg-rose-500/10 border border-rose-500/30 p-3 text-rose-400 text-xs flex items-center gap-2">
              <ExclamationTriangleIcon className="w-4 h-4" /> {err}
            </div>
          )}
        </form>

        <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0 bg-card">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-background border border-border text-xs font-black uppercase tracking-widest hover:bg-muted min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            onClick={handleSubmit as any}
            className="flex-1 py-3 bg-primary hover:bg-primary disabled:opacity-40 text-white text-xs font-black uppercase tracking-widest min-h-[44px] inline-flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
            ) : (<><PlusIcon className="w-3.5 h-3.5" /> Add Resource</>)}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}