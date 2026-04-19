// @refresh reset
'use client';

import { useEffect, useMemo, useState, useCallback } from "react";
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
} from "@/lib/icons";
import VideoPlayer from '@/components/media/VideoPlayer';
import { motion, AnimatePresence } from 'framer-motion';

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
                <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
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
                    className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
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

  const isStaff = profile?.role === "admin" || profile?.role === "teacher" || profile?.role === "school";
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
    if (canMutateLibrary) {
      createClient().from("courses").select("id, title").order("title")
        .then(({ data }) => setCourses((data ?? []) as any));
    }
  }, [profile?.id, authLoading, canMutateLibrary]);

  // Unique subjects derived from loaded data
  const subjects = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => { if (i.subject) set.add(i.subject); });
    return ['All', ...Array.from(set).sort()];
  }, [items]);

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
      case 'video':        return 'from-red-600/30 to-orange-600/20';
      case 'document':     return 'from-blue-600/30 to-indigo-600/20';
      case 'interactive':  return 'from-violet-600/30 to-purple-600/20';
      case 'presentation': return 'from-emerald-600/30 to-teal-600/20';
      default:             return 'from-orange-600/20 to-amber-600/10';
    }
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Enhanced Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BookOpenIcon className="w-5 h-5 text-orange-400" />
                <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Digital Resources</span>
              </div>
              <h1 className="text-3xl lg:text-4xl font-black text-foreground">Content Library</h1>
              <p className="text-muted-foreground mt-2">Discover, preview, and access educational resources with our enhanced in-app viewer</p>
            </div>
            
            {canUpload && (
              <button 
                onClick={() => setShowUpload(true)} 
                className="flex items-center justify-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-none transition-colors shadow-lg"
              >
                <PlusIcon className="w-4 h-4" /> Upload Resource
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Enhanced Search and Filters */}
        <div className="bg-card border border-border p-6 mb-8 space-y-6">
          {/* Search Bar */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search resources by title, subject, or tags..."
              className="w-full bg-background border border-border pl-12 pr-4 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          {/* Filter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Categories */}
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Category</label>
              <select
                value={activeCategory}
                onChange={e => setActiveCategory(e.target.value)}
                className="select-premium w-full px-3 py-2.5 text-sm focus:border-orange-500 transition-colors"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Subjects */}
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Subject</label>
              <select
                value={subjectFilter}
                onChange={e => setSubjectFilter(e.target.value)}
                className="select-premium w-full px-3 py-2.5 text-sm focus:border-orange-500 transition-colors"
              >
                {subjects.map(subject => (
                  <option key={subject} value={subject}>{subject}</option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Sort By</label>
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                className="select-premium w-full px-3 py-2.5 text-sm focus:border-orange-500 transition-colors"
              >
                <option value="newest">Newest First</option>
                <option value="most_used">Most Used</option>
                <option value="top_rated">Top Rated</option>
              </select>
            </div>

            {/* View Toggle */}
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">View</label>
              <div className="flex border border-border">
                <button className="flex-1 px-3 py-2.5 bg-orange-600 text-white text-xs font-bold">
                  <Bars3Icon className="w-4 h-4 mx-auto" />
                </button>
                <button className="flex-1 px-3 py-2.5 bg-background hover:bg-muted text-muted-foreground text-xs font-bold transition-colors">
                  Grid
                </button>
              </div>
            </div>
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
                className="px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-none transition-colors"
              >
                Upload First Resource
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-card border border-border overflow-hidden hover:border-orange-500/30 transition-all duration-200 group cursor-pointer"
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
                    <div className="relative w-full h-full bg-black flex items-center justify-center">
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
                    <h3 className="font-bold text-foreground text-sm leading-tight group-hover:text-orange-400 transition-colors line-clamp-2">
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
    </div>
  );
}