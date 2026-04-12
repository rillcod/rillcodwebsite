// @refresh reset
'use client';

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import {
  BookOpenIcon, MagnifyingGlassIcon, PlusIcon,
  CheckCircleIcon, XMarkIcon, SparklesIcon,
  VideoCameraIcon, DocumentIcon,
  PresentationChartBarIcon, BoltIcon, ArrowDownTrayIcon, ArrowUpTrayIcon,
  AcademicCapIcon, UserIcon, GlobeAltIcon, BuildingOfficeIcon,
  ArchiveBoxIcon, StarIcon, ArrowPathIcon, ExclamationTriangleIcon,
  Bars3Icon, PencilSquareIcon,
} from "@/lib/icons";
import ShareToParentModal from '@/components/share/ShareToParentModal';
import VideoPlayer from '@/components/media/VideoPlayer';

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

  // Detail panel state
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [libraryShareItem, setLibraryShareItem] = useState<ContentItem | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [assigningCourse, setAssigningCourse] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState(false);

  // Edit / delete panel state
  const [editingItem, setEditingItem] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', description: '', subject: '', gradeLevel: '', tags: '', category: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [replaceFileLoading, setReplaceFileLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Star rating state
  const [myRating, setMyRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);

  // Upload form state
  const [showUpload, setShowUpload] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    contentType: "video",
    fileId: "",
    externalUrl: "",
    category: "",
    tags: "",
    subject: "",
    gradeLevel: "",
    licenseType: "",
    attribution: "",
  });

  const isStaff = profile?.role === "admin" || profile?.role === "teacher" || profile?.role === "school";
  /** Matches API: only admin + teacher may upload, edit, delete, or assign to courses. */
  const canMutateLibrary = profile?.role === "admin" || profile?.role === "teacher";
  const canApprove = profile?.role === "admin";
  const canUpload = canMutateLibrary;
  const canUseSchoolScope = Boolean(profile?.school_id);
  const scopeTabs = canUseSchoolScope
    ? [
        { id: 'all', label: 'All Resources', icon: GlobeAltIcon },
        { id: 'school', label: 'My School', icon: BuildingOfficeIcon },
        { id: 'global', label: 'Rillcod Global', icon: AcademicCapIcon },
      ]
    : [
        { id: 'all', label: 'All Resources', icon: GlobeAltIcon },
        { id: 'global', label: 'Rillcod Global', icon: AcademicCapIcon },
      ];

  const loadItems = async () => {
    setLoading(true); setError(null);
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

  useEffect(() => {
    if (!canUseSchoolScope && activeTab === 'school') {
      setActiveTab('all');
    }
  }, [canUseSchoolScope, activeTab]);

  useEffect(() => {
    // Keep detail panel actions clean when switching selected content.
    setEditingItem(false);
    setAssigningCourse(false);
    setAssignSuccess(false);
    setSelectedCourseId('');
    setMyRating(0);
    setHoverRating(0);
    setRatingDone(false);
  }, [selectedItem?.id]);

  // Load the current user's existing rating for the open item
  useEffect(() => {
    if (!selectedItem || !profile) return;
    createClient()
      .from('content_ratings')
      .select('rating')
      .eq('content_id', selectedItem.id)
      .eq('portal_user_id', profile.id)
      .maybeSingle()
      .then(({ data }) => { if (data) { setMyRating(data.rating ?? 0); setRatingDone(true); } });
  }, [selectedItem?.id, profile?.id]);

  // Unique subjects derived from loaded data
  const subjects = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => { if (i.subject) set.add(i.subject); });
    return ['All', ...Array.from(set).sort()];
  }, [items]);

  // Pending approval count for admins
  const pendingCount = useMemo(() => items.filter(i => !i.is_approved).length, [items]);

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

  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setUploadProgress(0);
    setError(null);

    const isVideo = file.type.startsWith('video/');

    try {
      if (isVideo) {
        // Direct browser → Supabase upload (bypasses server for large files)
        const initRes = await fetch('/api/files/upload', {
          method: 'POST',
          body: (() => { const f = new FormData(); f.append('resumable', 'true'); f.append('filename', file.name); f.append('size', String(file.size)); f.append('mimeType', file.type); return f; })(),
        });
        const initPayload = await initRes.json();
        if (!initRes.ok) throw new Error(initPayload.error || 'Failed to initiate upload');

        const { signedUrl, path, originalFilename, mimeType, size } = initPayload.data;

        // Upload directly to Supabase storage using XHR for progress tracking
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
          };
          xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`Storage upload failed (${xhr.status})`));
          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.open('PUT', signedUrl);
          xhr.setRequestHeader('Content-Type', file.type);
          xhr.send(file);
        });

        // Save file metadata to DB
        const finalRes = await fetch('/api/files/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, originalFilename, mimeType, size }),
        });
        const finalPayload = await finalRes.json();
        if (!finalRes.ok) throw new Error(finalPayload.error || 'Failed to save file record');

        setForm(s => ({ ...s, fileId: finalPayload.data.id, title: s.title || file.name.split('.')[0], category: s.category || 'Videos' }));
      } else {
        // Standard small-file upload through API route
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || 'Upload failed');
        setForm(s => ({ ...s, fileId: payload.data.id, title: s.title || file.name.split('.')[0], category: s.category || 'Guides' }));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      let finalFileId = form.fileId;
      if (form.externalUrl && !finalFileId) {
        const res = await fetch('/api/files/external', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: form.externalUrl, title: form.title, contentType: form.contentType }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'Failed to register file');
        finalFileId = j.data.id;
      }
      const res = await fetch("/api/content-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, fileId: finalFileId || undefined, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) }),
      });
      const createJson = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(createJson?.error ?? "Failed to create");
      await loadItems();
      setShowUpload(false);
      setForm({ title: "", description: "", contentType: "video", fileId: "", externalUrl: "", category: "", tags: "", subject: "", gradeLevel: "", licenseType: "", attribution: "" });
      setNotice('Resource uploaded successfully.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const generateMetadata = async () => {
    if (!form.title.trim()) { setError("Please enter a title first so AI can generate relevant metadata."); return; }
    setGeneratingAi(true); setError(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: 'library-content', topic: form.title, contentType: form.contentType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "AI generation failed");
      const ai = json.data;
      setForm(prev => ({
        ...prev,
        description: ai.description || prev.description,
        category: ai.category || prev.category,
        tags: ai.tags ? ai.tags.join(', ') : prev.tags,
        subject: ai.subject || prev.subject,
        gradeLevel: ai.grade_level || prev.gradeLevel,
        licenseType: ai.license_type || prev.licenseType,
        attribution: ai.attribution || prev.attribution,
      }));
    } catch (e: any) {
      setError("AI was unable to generate metadata: " + e.message);
    } finally {
      setGeneratingAi(false);
    }
  };

  const submitRating = async (stars: number) => {
    if (!selectedItem || ratingLoading) return;
    setRatingLoading(true);
    try {
      const res = await fetch(`/api/content-library/${selectedItem.id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: stars }),
      });
      if (!res.ok) throw new Error('Failed to submit rating');
      setMyRating(stars);
      setRatingDone(true);
      // Reload list so rating_average / rating_count reflects the new vote
      await loadItems();
    } catch (e: any) {
      console.error('Rating error:', e);
    } finally {
      setRatingLoading(false);
    }
  };

  const handleApprove = async (approve: boolean) => {
    if (!selectedItem) return;
    setApprovingId(selectedItem.id);
    setError(null);
    try {
      const res = await fetch(`/api/content-library/${selectedItem.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: approve }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? 'Approval failed');
      setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, is_approved: approve } : i));
      setSelectedItem(prev => prev ? { ...prev, is_approved: approve } : null);
      setNotice(approve ? 'Content approved.' : 'Content moved back to unapproved.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setApprovingId(null);
    }
  };

  const handleAssignToCourse = async () => {
    if (!selectedItem || !selectedCourseId) return;
    setAssignSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/content-library/${selectedItem.id}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: selectedCourseId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? 'Could not add to course');
      const newCount = (selectedItem.usage_count ?? 0) + 1;
      setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, usage_count: newCount } : i));
      setSelectedItem(prev => prev ? { ...prev, usage_count: newCount } : null);
      setAssignSuccess(true);
      setNotice('Content added to course.');
      setTimeout(() => { setAssigningCourse(false); setAssignSuccess(false); setSelectedCourseId(''); }, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not add to course');
    } finally {
      setAssignSaving(false);
    }
  };

  const openEdit = (item: ContentItem) => {
    setEditForm({
      title: item.title,
      description: item.description ?? '',
      subject: item.subject ?? '',
      gradeLevel: item.grade_level ?? '',
      tags: item.tags?.join(', ') ?? '',
      category: item.category ?? '',
    });
    setEditingItem(true);
  };

  const handleUpdateContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/content-library/${selectedItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          subject: editForm.subject || null,
          gradeLevel: editForm.gradeLevel || null,
          tags: editForm.tags.split(',').map(t => t.trim()).filter(Boolean),
          category: editForm.category || null,
        }),
      });
      const up = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(up?.error ?? 'Update failed');
      const updated = { ...selectedItem, ...editForm, tags: editForm.tags.split(',').map(t => t.trim()).filter(Boolean) };
      setSelectedItem(updated as ContentItem);
      setItems(prev => prev.map(i => i.id === selectedItem.id ? updated as ContentItem : i));
      setEditingItem(false);
      setNotice('Content details updated.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleReplaceFile = async (file: File) => {
    if (!selectedItem) return;
    const fileId = selectedItem.file_id;
    if (!fileId) { setError('No file attached to replace'); return; }
    setReplaceFileLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/files/${fileId}`, { method: 'PATCH', body: fd });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Replace failed');
      // Update local state with new public_url
      const updated = { ...selectedItem, files: { ...selectedItem.files, public_url: payload.data.public_url } };
      setSelectedItem(updated as ContentItem);
      setItems(prev => prev.map(i => i.id === selectedItem.id ? updated as ContentItem : i));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setReplaceFileLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    if (!confirm(`Delete "${selectedItem.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/content-library/${selectedItem.id}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error ?? 'Delete failed');
      // Best-effort: delete the files record + R2 object
      if (selectedItem.file_id) {
        await fetch(`/api/files/${selectedItem.file_id}`, { method: 'DELETE' }).catch(() => {});
      }
      setItems(prev => prev.filter(i => i.id !== selectedItem.id));
      setSelectedItem(null);
      setNotice('Content deleted.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

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

  const buildLibraryShareMsg = (item: ContentItem) => {
    const fileUrl = item.files?.public_url;
    let msg = `📖 *${item.title}*\n`;
    if (item.description) msg += `${item.description.slice(0, 150)}${item.description.length > 150 ? '…' : ''}\n`;
    msg += `\nType: ${item.content_type || 'Resource'}\n`;
    if (fileUrl) msg += `\n🔗 Download/View: ${fileUrl}`;
    else msg += `\n🔗 Library: ${typeof window !== 'undefined' ? window.location.origin : 'https://rillcod.com'}/dashboard/library`;
    msg += `\n\n_Rillcod Technologies — www.rillcod.com_`;
    return msg;
  };

  return (
    <div className="bg-background text-foreground selection:bg-orange-500/30">
      <ShareToParentModal
        open={!!libraryShareItem}
        onClose={() => setLibraryShareItem(null)}
        defaultMessage={libraryShareItem ? buildLibraryShareMsg(libraryShareItem) : ''}
        title={libraryShareItem?.title}
      />
      <div className="max-w-[1600px] mx-auto min-h-screen flex flex-col">

        {/* Top Header */}
        <header className="px-6 py-8 border-b border-border flex flex-col lg:flex-row lg:items-center justify-between gap-6 sticky top-0 bg-background/95 backdrop-blur-md z-30">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <SparklesIcon className="w-4 h-4 text-orange-400" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-400">Resource Hub</span>
            </div>
            <h1 className="text-4xl font-black tracking-tight">Content Library</h1>
          </div>

          <div className="flex flex-1 max-w-2xl items-center gap-3">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="w-5 h-5 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by title, subject, or tags..."
                className="w-full pl-12 pr-4 py-4 bg-card border border-border rounded-none text-sm focus:border-orange-500 outline-none transition-all placeholder:text-muted-foreground"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              )}
            </div>
            {canUpload && (
              <button onClick={() => setShowUpload(true)} className="px-6 py-4 bg-orange-600 hover:bg-orange-500 text-white font-black text-sm rounded-none transition-all flex items-center gap-2 flex-shrink-0">
                <PlusIcon className="w-4 h-4" /> Upload
              </button>
            )}
          </div>
        </header>

        {(error || notice) && (
          <div className="px-6 pt-4">
            {error && (
              <div className="mb-2 bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-rose-400 text-xs flex items-center justify-between gap-2">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="text-rose-300 hover:text-rose-100">Dismiss</button>
              </div>
            )}
            {notice && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-emerald-400 text-xs flex items-center justify-between gap-2">
                <span>{notice}</span>
                <button onClick={() => setNotice(null)} className="text-emerald-300 hover:text-emerald-100">Dismiss</button>
              </div>
            )}
          </div>
        )}

        {/* Pending approval banner (admin only) */}
        {canApprove && pendingCount > 0 && (
          <div className="mx-6 mt-4 bg-amber-500/10 border border-amber-500/30 px-5 py-3 flex items-center gap-3">
            <ExclamationTriangleIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-300 font-bold">
              {pendingCount} item{pendingCount > 1 ? 's' : ''} pending your approval
            </p>
          </div>
        )}

        <main className="flex-1 flex overflow-hidden">

          {/* Sidebar Filters */}
          <aside className="w-72 border-r border-border p-6 space-y-8 overflow-auto hidden xl:block flex-shrink-0">
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Scope</p>
              <div className="space-y-1">
                {scopeTabs.map(t => (
                  <button key={t.id} onClick={() => setActiveTab(t.id as any)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-none text-sm font-bold transition-all ${activeTab === t.id ? 'bg-orange-600 text-white' : 'text-muted-foreground hover:bg-card hover:text-foreground'}`}>
                    <t.icon className="w-5 h-5" /> {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Category</p>
              <div className="space-y-1">
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-none text-sm font-bold transition-all ${activeCategory === cat ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-card hover:text-foreground'}`}>
                    <span>{cat}</span>
                    {activeCategory === cat && <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                  </button>
                ))}
              </div>
            </div>

            {subjects.length > 1 && (
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Subject</p>
                <div className="space-y-1">
                  {subjects.map(sub => (
                    <button key={sub} onClick={() => setSubjectFilter(sub)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-none text-sm font-bold transition-all ${subjectFilter === sub ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-card hover:text-foreground'}`}>
                      <span>{sub}</span>
                      {subjectFilter === sub && <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="p-5 bg-gradient-to-br from-orange-600/20 to-indigo-600/10 border border-orange-500/20 text-center space-y-3">
              <BoltIcon className="w-7 h-7 text-orange-400 mx-auto" />
              <p className="text-xs font-bold text-foreground">Missing a resource?</p>
              <p className="text-[10px] text-muted-foreground">Request content from the academic team.</p>
              <button className="w-full py-2 bg-card hover:bg-muted text-foreground font-black text-[10px] border border-border uppercase tracking-widest transition-all">Request</button>
            </div>
          </aside>

          {/* Content Canvas */}
          <section className="flex-1 p-6 lg:p-8 overflow-auto bg-muted/20">

            {/* Mobile filters + sort row */}
            <div className="flex flex-wrap items-center gap-2 mb-6 xl:justify-end">
              <div className="xl:hidden flex gap-2 flex-wrap flex-1">
                <select value={activeTab} onChange={e => setActiveTab(e.target.value as any)}
                  className="bg-card border border-border px-3 py-2 text-xs font-bold text-foreground outline-none">
                  {scopeTabs.map(tab => (
                    <option key={tab.id} value={tab.id}>{tab.label}</option>
                  ))}
                </select>
                <select value={activeCategory} onChange={e => setActiveCategory(e.target.value)}
                  className="bg-card border border-border px-3 py-2 text-xs font-bold text-foreground outline-none">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {subjects.length > 1 && (
                  <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
                    className="bg-card border border-border px-3 py-2 text-xs font-bold text-foreground outline-none">
                    {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Bars3Icon className="w-4 h-4 text-muted-foreground" />
                <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
                  className="bg-card border border-border px-3 py-2 text-xs font-bold text-foreground outline-none">
                  <option value="newest">Newest First</option>
                  <option value="most_used">Most Used</option>
                  <option value="top_rated">Top Rated</option>
                </select>
              </div>
            </div>

            {/* Result count */}
            <p className="text-xs text-muted-foreground font-bold mb-6">
              Showing {filtered.length} of {items.length} resource{items.length !== 1 ? 's' : ''}
              {search && <span> matching "<span className="text-foreground">{search}</span>"</span>}
            </p>

            {filtered.length === 0 ? (
              <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-4">
                <ArchiveBoxIcon className="w-16 h-16 text-muted-foreground/20" />
                <div>
                  <p className="text-muted-foreground font-bold">No resources found</p>
                  <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters or search terms</p>
                </div>
                {(search || activeCategory !== 'All' || subjectFilter !== 'All') && (
                  <button
                    onClick={() => { setSearch(''); setActiveCategory('All'); setSubjectFilter('All'); setActiveTab('all'); }}
                    className="text-xs text-orange-400 hover:text-orange-300 font-bold underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                {filtered.map(item => (
                  <div key={item.id} onClick={() => setSelectedItem(item)}
                    className="group relative bg-card border border-border hover:border-orange-500/40 transition-all cursor-pointer flex flex-col overflow-hidden">

                    {/* Pending badge */}
                    {canApprove && !item.is_approved && (
                      <div className="absolute top-3 left-3 z-10 px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[9px] font-black uppercase tracking-wider">
                        Pending Approval
                      </div>
                    )}

                    {/* Coloured top accent strip */}
                    <div className={`h-1.5 w-full bg-gradient-to-r ${getTypeColor(item.content_type)}`} />

                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 bg-muted flex items-center justify-center text-orange-400 group-hover:bg-orange-600 group-hover:text-white transition-all duration-300">
                          {getTypeIcon(item.content_type)}
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 bg-muted border border-border text-muted-foreground">
                            {item.content_type}
                          </span>
                          {item.school_id ? (
                            <span className="text-[8px] font-black uppercase text-blue-400">School</span>
                          ) : (
                            <span className="text-[8px] font-black uppercase text-emerald-400">Global</span>
                          )}
                        </div>
                      </div>

                      <h3 className="text-base font-bold text-foreground mb-1.5 group-hover:text-orange-400 transition-colors line-clamp-2">
                        {item.title}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-4 flex-1 leading-relaxed">
                        {item.description || 'A learning resource curated for Rillcod Academy students.'}
                      </p>

                      {/* Tags */}
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-4">
                          {item.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="px-2 py-0.5 bg-muted border border-border text-[9px] font-bold text-muted-foreground uppercase tracking-wide">
                              {tag}
                            </span>
                          ))}
                          {item.tags.length > 3 && (
                            <span className="px-2 py-0.5 text-[9px] font-bold text-muted-foreground">+{item.tags.length - 3}</span>
                          )}
                        </div>
                      )}

                      {/* Meta row */}
                      <div className="grid grid-cols-3 gap-1.5 mb-4">
                        {[
                          { label: 'Subject', value: item.subject || 'General' },
                          { label: 'Grade',   value: item.grade_level || 'All' },
                          { label: 'Uses',    value: String(item.usage_count ?? 0) },
                        ].map(f => (
                          <div key={f.label} className="bg-muted p-2 text-center">
                            <p className="text-[8px] font-black text-muted-foreground uppercase tracking-tighter mb-0.5">{f.label}</p>
                            <p className="text-[10px] font-black text-foreground truncate">{f.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-4 border-t border-border">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground font-bold">
                          <StarIcon className="w-3.5 h-3.5 text-amber-400" />
                          {item.rating_count && item.rating_count > 0
                            ? <>{item.rating_average?.toFixed(1)} <span className="text-[9px] opacity-50">({item.rating_count})</span></>
                            : <span className="opacity-50">No ratings</span>
                          }
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                          View Details →
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      {/* Upload/Create Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/90 backdrop-blur-xl">
          <div className="w-full max-w-2xl bg-card border border-border p-8 space-y-6 shadow-2xl relative overflow-y-auto max-h-[90vh]">
            <button onClick={() => setShowUpload(false)} className="absolute top-6 right-6 p-2 hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
              <XMarkIcon className="w-5 h-5" />
            </button>

            <div>
              <h2 className="text-2xl font-black mb-1">Upload Resource</h2>
              <p className="text-muted-foreground text-sm">Add a new resource to the Content Library.</p>
            </div>

            <form onSubmit={handleCreate} className="space-y-5">
              {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-rose-400 text-xs flex items-center gap-2">
                  <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Title *</label>
                  <div className="relative">
                    <input required value={form.title}
                      onChange={e => setForm(s => ({ ...s, title: e.target.value }))}
                      placeholder="e.g. Intro to Logic Gates"
                      className="w-full bg-background border border-border px-4 py-3 pr-12 text-sm text-foreground focus:border-orange-500 outline-none transition-all" />
                    <button type="button" onClick={generateMetadata} disabled={generatingAi || !form.title}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white transition-all"
                      title="AI Auto-Fill Metadata">
                      {generatingAi ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <SparklesIcon className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[9px] text-muted-foreground">Enter a title then click ✦ to auto-fill metadata with AI.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Resource Type</label>
                  <select value={form.contentType} onChange={e => setForm(s => ({ ...s, contentType: e.target.value }))}
                    className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground focus:border-orange-500 outline-none transition-all">
                    <option value="video">Video</option>
                    <option value="document">Document</option>
                    <option value="interactive">Interactive</option>
                    <option value="presentation">Presentation</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Upload File</label>
                  <div className="relative group cursor-pointer">
                    <input type="file" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    <div className={`w-full border-2 border-dashed p-6 text-center transition-all ${form.fileId ? 'border-primary/50 bg-primary/5' : 'border-border group-hover:border-primary/50'}`}>
                      {form.fileId
                        ? <CheckCircleIcon className="w-8 h-8 text-primary mx-auto mb-2" />
                        : <ArrowDownTrayIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2 group-hover:text-primary transition-colors" />}
                      <p className="text-xs font-bold text-muted-foreground">{form.fileId ? 'File uploaded successfully' : 'Click to upload (videos upload directly)'}</p>
                      {saving && uploadProgress > 0 && (
                        <div className="mt-3">
                          <div className="w-full bg-white/10 rounded-full h-1.5">
                            <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                          </div>
                          <p className="text-[10px] text-primary mt-1">{uploadProgress}%</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Or Remote URL</label>
                  <div className={`flex flex-col border-2 border-dashed p-4 gap-3 transition-all ${form.externalUrl ? 'border-blue-500/50 bg-blue-500/5' : 'border-border'}`}>
                    <GlobeAltIcon className={`w-6 h-6 mx-auto ${form.externalUrl ? 'text-blue-400' : 'text-muted-foreground'}`} />
                    <input value={form.externalUrl}
                      onChange={e => setForm(s => ({ ...s, externalUrl: e.target.value, fileId: "" }))}
                      placeholder="https://..."
                      className="w-full bg-background border border-border px-3 py-2 text-xs text-foreground outline-none focus:border-blue-500 transition-all" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Description</label>
                <textarea rows={3} value={form.description}
                  onChange={e => setForm(s => ({ ...s, description: e.target.value }))}
                  placeholder="Describe what this resource covers..."
                  className="w-full bg-background border border-border px-4 py-3 text-sm text-foreground focus:border-orange-500 outline-none resize-none" />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Subject',              name: 'subject' },
                  { label: 'Grade Level',          name: 'gradeLevel' },
                  { label: 'Category',             name: 'category' },
                  { label: 'Tags (comma-sep.)',    name: 'tags' },
                ].map(f => (
                  <div key={f.name} className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{f.label}</label>
                    <input value={(form as any)[f.name]}
                      onChange={e => setForm(s => ({ ...s, [f.name]: e.target.value }))}
                      className="w-full bg-background border border-border px-3 py-2.5 text-xs text-foreground outline-none focus:border-orange-500" />
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowUpload(false)}
                  className="flex-1 py-3.5 text-muted-foreground hover:text-foreground font-bold transition-colors border border-border">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3.5 bg-orange-600 hover:bg-orange-500 text-white font-black transition-all disabled:opacity-50">
                  {saving ? 'Processing...' : 'Upload to Library'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Panel */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={() => setSelectedItem(null)}>
          <div className="w-full max-w-xl bg-card border-l border-border h-full shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>

            {/* Header */}
            {/* Header — video player for video items, gradient card for others */}
            {selectedItem.content_type === 'video' && selectedItem.files?.public_url ? (
              <div className="relative">
                <VideoPlayer
                  url={selectedItem.files.public_url}
                  title={selectedItem.title}
                  cinemaMode
                />
                <button onClick={() => setSelectedItem(null)}
                  className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black/80 text-white transition-all z-30">
                  <XMarkIcon className="w-4 h-4" />
                </button>
                {canApprove && !selectedItem.is_approved && (
                  <div className="absolute top-3 left-3 px-2.5 py-1 bg-amber-500/80 text-amber-900 text-[10px] font-black uppercase tracking-wider z-30">
                    Pending Approval
                  </div>
                )}
              </div>
            ) : selectedItem.files?.public_url &&
              (selectedItem.files?.file_type === 'pdf' || selectedItem.content_type === 'document' || selectedItem.content_type === 'guide') ? (
              <div className="relative border-b border-border bg-black">
                <iframe
                  src={selectedItem.files.public_url}
                  title={selectedItem.title}
                  className="w-full"
                  style={{ height: '480px', border: 'none' }}
                />
                <button onClick={() => setSelectedItem(null)}
                  className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black/80 text-white transition-all z-30">
                  <XMarkIcon className="w-4 h-4" />
                </button>
                {canApprove && !selectedItem.is_approved && (
                  <div className="absolute top-3 left-3 px-2.5 py-1 bg-amber-500/30 border border-amber-500/50 text-amber-300 text-[10px] font-black uppercase tracking-wider z-30">
                    Pending Approval
                  </div>
                )}
              </div>
            ) : (
              <div className={`relative h-52 bg-gradient-to-br ${getTypeColor(selectedItem.content_type)} border-b border-border flex items-center justify-center overflow-hidden`}>
                <div className="absolute inset-0 opacity-10">
                  <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                        <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="0.5" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                  </svg>
                </div>
                <div className="text-orange-400 opacity-30">
                  {getTypeIcon(selectedItem.content_type)}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <BookOpenIcon className="w-24 h-24 text-white/10" />
                </div>
                <button onClick={() => setSelectedItem(null)}
                  className="absolute top-5 right-5 p-2.5 bg-black/30 hover:bg-black/50 text-white transition-all">
                  <XMarkIcon className="w-5 h-5" />
                </button>
                {canApprove && !selectedItem.is_approved && (
                  <div className="absolute top-5 left-5 px-2.5 py-1 bg-amber-500/30 border border-amber-500/50 text-amber-300 text-[10px] font-black uppercase tracking-wider">
                    Pending Approval
                  </div>
                )}
              </div>
            )}

            <div className="p-8 space-y-8">
              {/* Title + badges */}
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-orange-500/15 text-orange-400 border border-orange-500/20">
                    {selectedItem.content_type}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-muted text-muted-foreground border border-border">
                    {selectedItem.subject || 'All Subjects'}
                  </span>
                  {selectedItem.grade_level && (
                    <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-muted text-muted-foreground border border-border">
                      {selectedItem.grade_level}
                    </span>
                  )}
                </div>
                <h2 className="text-3xl font-black text-foreground leading-tight">{selectedItem.title}</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {selectedItem.description || 'This resource contributes to the Rillcod Academy digital curriculum.'}
                </p>
              </div>

              {/* Tags */}
              {selectedItem.tags && selectedItem.tags.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedItem.tags.map(tag => (
                      <span key={tag} className="px-2.5 py-1 bg-muted border border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 bg-background border border-border text-center">
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Used</p>
                  <p className="text-xl font-black text-foreground">{selectedItem.usage_count ?? 0}</p>
                </div>
                <div className="p-4 bg-background border border-border text-center">
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Rating</p>
                  <p className="text-xl font-black text-foreground">
                    {selectedItem.rating_count && selectedItem.rating_count > 0
                      ? selectedItem.rating_average?.toFixed(1)
                      : '—'}
                  </p>
                </div>
                <div className="p-4 bg-background border border-border text-center">
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Added</p>
                  <p className="text-sm font-black text-foreground">{new Date(selectedItem.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</p>
                </div>
              </div>

              {/* Star Rating */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {ratingDone ? 'Your Rating' : 'Rate this Resource'}
                </p>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      disabled={ratingLoading}
                      onClick={() => submitRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="transition-transform hover:scale-110 disabled:opacity-50"
                    >
                      <StarIcon className={`w-7 h-7 transition-colors ${(hoverRating || myRating) >= star ? 'text-amber-400' : 'text-white/10'}`} />
                    </button>
                  ))}
                  {ratingLoading && <div className="ml-2 w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />}
                  {ratingDone && !ratingLoading && <span className="ml-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest">Saved</span>}
                </div>
              </div>

              {/* Attribution / License */}
              {(selectedItem.attribution || selectedItem.license_type) && (
                <div className="bg-muted/50 border border-border px-4 py-3 text-xs text-muted-foreground space-y-0.5">
                  {selectedItem.license_type && <p><span className="font-bold">License:</span> {selectedItem.license_type}</p>}
                  {selectedItem.attribution && <p><span className="font-bold">Attribution:</span> {selectedItem.attribution}</p>}
                </div>
              )}

              {/* Actions */}
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Actions</p>
                {selectedItem.files?.public_url && (
                  <div className="flex gap-2">
                    {/* Open inline (view in browser / media player) */}
                    <a
                      href={selectedItem.files.public_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 flex-1 py-4 bg-orange-600 hover:bg-orange-500 text-white font-black transition-all"
                    >
                      <ArrowDownTrayIcon className="w-5 h-5" /> Open
                    </a>
                    {/* Force download — saves file to device */}
                    <a
                      href={`${selectedItem.files.public_url}?download=1&filename=${encodeURIComponent(selectedItem.title)}`}
                      className="flex items-center justify-center gap-2 px-5 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black transition-all"
                      title="Save to device"
                    >
                      <ArrowDownTrayIcon className="w-5 h-5" />
                    </a>
                  </div>
                )}
                {isStaff && (
                  <button
                    onClick={() => setLibraryShareItem(selectedItem)}
                    className="flex items-center justify-center gap-3 w-full py-4 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] font-black transition-all"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Share to Parent via WhatsApp
                  </button>
                )}

                {/* Assign to Course — teachers & admins only */}
                {canMutateLibrary && courses.length > 0 && (
                  <div>
                    {!assigningCourse ? (
                      <button onClick={() => setAssigningCourse(true)}
                        className="flex items-center justify-center gap-2 w-full py-4 bg-card hover:bg-muted text-foreground font-bold border border-border transition-all">
                        <UserIcon className="w-4 h-4 text-orange-400" /> Assign to Course
                      </button>
                    ) : (
                      <div className="border border-border p-4 space-y-3 bg-background">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Select Course</p>
                        <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)}
                          className="w-full bg-card border border-border px-3 py-2.5 text-sm text-foreground outline-none focus:border-orange-500">
                          <option value="">— Choose a course —</option>
                          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={() => { setAssigningCourse(false); setSelectedCourseId(''); }}
                            className="flex-1 py-2.5 text-muted-foreground hover:text-foreground font-bold border border-border text-xs transition-all">
                            Cancel
                          </button>
                          <button onClick={handleAssignToCourse} disabled={!selectedCourseId || assignSaving}
                            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs disabled:opacity-50 transition-all">
                            {assignSuccess ? 'Assigned!' : assignSaving ? 'Assigning...' : 'Confirm'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Approve / Reject */}
                {canApprove && !selectedItem.is_approved && (
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => handleApprove(true)} disabled={approvingId === selectedItem.id}
                      className="py-3.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 font-bold border border-emerald-500/30 transition-all disabled:opacity-50">
                      {approvingId === selectedItem.id ? 'Approving...' : 'Approve'}
                    </button>
                    <button onClick={() => handleApprove(false)} disabled={approvingId === selectedItem.id}
                      className="py-3.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 font-bold border border-rose-500/30 transition-all disabled:opacity-50">
                      Reject
                    </button>
                  </div>
                )}
                {canApprove && selectedItem.is_approved && (
                  <button onClick={() => handleApprove(false)} disabled={approvingId === selectedItem.id}
                    className="w-full py-3 text-xs text-rose-400 hover:text-rose-300 font-bold border border-rose-500/20 transition-all disabled:opacity-50">
                    {approvingId === selectedItem.id ? 'Revoking...' : 'Revoke Approval'}
                  </button>
                )}
              </div>

              {/* Edit content + replace file + delete — staff only */}
              {canUpload && (
                <div className="border-t border-border pt-6 space-y-3">
                  <button
                    onClick={() => editingItem ? setEditingItem(false) : openEdit(selectedItem)}
                    className="flex items-center justify-center gap-2 w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-foreground font-bold text-xs uppercase tracking-widest transition-all"
                  >
                    <PencilSquareIcon className="w-4 h-4" />
                    {editingItem ? 'Cancel Edit' : 'Edit Details'}
                  </button>

                  {editingItem && (
                    <form onSubmit={handleUpdateContent} className="space-y-3 border border-border p-4 bg-background">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Edit Content Details</p>

                      <input required value={editForm.title} onChange={e => setEditForm(s => ({ ...s, title: e.target.value }))}
                        placeholder="Title"
                        className="w-full bg-card border border-border px-3 py-2.5 text-sm text-foreground outline-none focus:border-orange-500" />

                      <textarea rows={3} value={editForm.description} onChange={e => setEditForm(s => ({ ...s, description: e.target.value }))}
                        placeholder="Description"
                        className="w-full bg-card border border-border px-3 py-2.5 text-sm text-foreground outline-none focus:border-orange-500 resize-none" />

                      <div className="grid grid-cols-2 gap-2">
                        <input value={editForm.subject} onChange={e => setEditForm(s => ({ ...s, subject: e.target.value }))}
                          placeholder="Subject"
                          className="w-full bg-card border border-border px-3 py-2 text-xs text-foreground outline-none focus:border-orange-500" />
                        <input value={editForm.gradeLevel} onChange={e => setEditForm(s => ({ ...s, gradeLevel: e.target.value }))}
                          placeholder="Grade level"
                          className="w-full bg-card border border-border px-3 py-2 text-xs text-foreground outline-none focus:border-orange-500" />
                      </div>

                      <input value={editForm.tags} onChange={e => setEditForm(s => ({ ...s, tags: e.target.value }))}
                        placeholder="Tags (comma separated)"
                        className="w-full bg-card border border-border px-3 py-2 text-xs text-foreground outline-none focus:border-orange-500" />

                      <button type="submit" disabled={editSaving}
                        className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest transition-all">
                        {editSaving ? 'Saving...' : 'Save Changes'}
                      </button>

                      {/* Replace file */}
                      {selectedItem.file_id && (
                        <div className="border-t border-border pt-3 space-y-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Replace File</p>
                          <label className={`flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed cursor-pointer transition-all text-xs font-bold ${replaceFileLoading ? 'border-orange-500/40 text-orange-400' : 'border-border text-muted-foreground hover:border-orange-500/40 hover:text-orange-400'}`}>
                            <ArrowUpTrayIcon className="w-4 h-4" />
                            {replaceFileLoading ? 'Uploading...' : 'Upload new file to replace current'}
                            <input type="file" className="hidden" disabled={replaceFileLoading}
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleReplaceFile(f); e.target.value = ''; }} />
                          </label>
                          {replaceFileLoading && (
                            <div className="flex items-center gap-2 text-[10px] text-orange-400">
                              <div className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                              Uploading to R2...
                            </div>
                          )}
                        </div>
                      )}
                    </form>
                  )}
                </div>
              )}

              {/* Delete — danger zone */}
              {canUpload && (
                <div className="border-t border-rose-500/20 pt-4">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center justify-center gap-2 w-full py-3 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/30 text-rose-400 font-bold text-xs uppercase tracking-widest transition-all disabled:opacity-50"
                  >
                    {deleting
                      ? <><div className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" /> Deleting...</>
                      : <><XMarkIcon className="w-4 h-4" /> Delete Content</>
                    }
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
