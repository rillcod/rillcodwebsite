// @refresh reset
'use client';

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { createClient } from "@/lib/supabase/client";
import { 
  BookOpenIcon, MagnifyingGlassIcon, PlusIcon, 
  CheckCircleIcon, XMarkIcon, SparklesIcon,
  ChevronDownIcon, ChevronUpIcon, VideoCameraIcon,
  DocumentIcon, ChatBubbleBottomCenterTextIcon,
  PresentationChartBarIcon, BoltIcon, ArrowDownTrayIcon,
  AcademicCapIcon, UserIcon, GlobeAltIcon, BuildingOfficeIcon,
  ArchiveBoxIcon, StarIcon, ArrowPathIcon, ExclamationTriangleIcon
} from "@/lib/icons";

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
  created_at: string;
  files?: {
    public_url?: string | null;
    file_type?: string | null;
    thumbnail_url?: string | null;
  } | null;
};

const CATEGORIES = ['All', 'Videos', 'Guides', 'Projects', 'Interactive', 'Assets'];

export default function ContentLibraryPage() {
  const { profile, loading: authLoading } = useAuth();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<'all' | 'school' | 'global'>('all');
  const [activeCategory, setActiveCategory] = useState('All');
  
  // Detail "Canvas" State
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);

  // Form State
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
  const canApprove = profile?.role === "admin";
  const canUpload = profile?.role === "admin" || profile?.role === "teacher";

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
    if (isStaff) {
      createClient().from("courses").select("id, title").order("title")
        .then(({ data }) => setCourses((data ?? []) as any));
    }
  }, [profile?.id, authLoading]);

  // Filtering Logic
  const filtered = useMemo(() => {
    return items.filter(item => {
      const matchSearch = !search || item.title.toLowerCase().includes(search.toLowerCase()) || item.subject?.toLowerCase().includes(search.toLowerCase());
      const matchTab = activeTab === 'all' ? true : activeTab === 'school' ? item.school_id === profile?.school_id : !item.school_id;
      const matchCat = activeCategory === 'All' ? true : item.category === activeCategory || item.content_type.toLowerCase().includes(activeCategory.toLowerCase().slice(0,-1));
      return matchSearch && matchTab && matchCat;
    });
  }, [items, search, activeTab, activeCategory, profile?.school_id]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData
      });
      
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Upload failed');
      const fileRecord = payload.data;

      setForm(s => ({ 
        ...s, 
        fileId: fileRecord.id, 
        title: s.title || file.name.split('.')[0],
        category: s.category || (file.type.includes('video') ? 'Videos' : 'Guides')
      }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      let finalFileId = form.fileId;
      
      // Handle external resource URL
      if (form.externalUrl && !finalFileId) {
        const res = await fetch('/api/files/external', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: form.externalUrl,
            title: form.title,
            contentType: form.contentType,
          }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'Failed to register file');
        finalFileId = j.data.id;
      }

      const res = await fetch("/api/content-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          ...form, 
          fileId: finalFileId,
          tags: form.tags.split(',').map(t=>t.trim()).filter(Boolean) 
        }),
      });
      if (!res.ok) throw new Error("Failed to create");
      await loadItems();
      setShowUpload(false);
      setForm({ title: "", description: "", contentType: "video", fileId: "", externalUrl: "", category: "", tags: "", subject: "", gradeLevel: "", licenseType: "", attribution: "" });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const generateMetadata = async () => {
    if (!form.title.trim()) {
      setError("Please enter a title first so AI can generate relevant metadata.");
      return;
    }
    setGeneratingAi(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: 'library-content',
          topic: form.title,
          contentType: form.contentType
        }),
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
        attribution: ai.attribution || prev.attribution
      }));
    } catch (e: any) {
      setError("AI was unable to generate metadata: " + e.message);
    } finally {
      setGeneratingAi(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'video': return <VideoCameraIcon className="w-5 h-5" />;
      case 'document': return <DocumentIcon className="w-5 h-5" />;
      case 'interactive': return <BoltIcon className="w-5 h-5" />;
      case 'presentation': return <PresentationChartBarIcon className="w-5 h-5" />;
      default: return <ArchiveBoxIcon className="w-5 h-5" />;
    }
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0A0A12] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0A0A12] text-foreground selection:bg-orange-500/30">
      
      {/* Background Orbs */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
         <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-orange-600/10 rounded-full blur-[120px]" />
         <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto min-h-screen flex flex-col">
        
        {/* Top Header */}
        <header className="px-6 py-8 border-b border-border flex flex-col lg:flex-row lg:items-center justify-between gap-6 backdrop-blur-md sticky top-0 bg-[#0A0A12]/60 z-30">
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
                    placeholder="Search by topic, subject, or keywords..."
                    className="w-full pl-12 pr-4 py-4 bg-card shadow-sm border border-border rounded-none text-sm focus:border-orange-500 outline-none transition-all placeholder:text-muted-foreground"
                 />
              </div>
              {canUpload && (
                 <button onClick={() => setShowUpload(true)} className="px-6 py-4 bg-orange-600 hover:bg-orange-500 text-foreground font-black text-sm rounded-none shadow-xl shadow-orange-900/20 transition-all flex items-center gap-2 flex-shrink-0">
                    <PlusIcon className="w-4 h-4" /> Upload Content
                 </button>
              )}
           </div>
        </header>

        <main className="flex-1 flex overflow-hidden">
           
           {/* Sidebar Filters */}
           <aside className="w-72 border-r border-border p-6 space-y-10 overflow-auto hidden xl:block">
              <div className="space-y-4">
                 <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Scope</p>
                 <div className="space-y-1">
                    {[
                      { id: 'all', label: 'All Resources', icon: GlobeAltIcon },
                      { id: 'school', label: 'My School', icon: BuildingOfficeIcon },
                      { id: 'global', label: 'Rillcod Global', icon: AcademicCapIcon },
                    ].map(t => (
                       <button key={t.id} onClick={() => setActiveTab(t.id as any)}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-none text-sm font-bold transition-all ${activeTab === t.id ? 'bg-orange-600 text-foreground' : 'text-muted-foreground hover:bg-card shadow-sm hover:text-foreground'}`}>
                          <t.icon className="w-5 h-5" /> {t.label}
                       </button>
                    ))}
                 </div>
              </div>

              <div className="space-y-4">
                 <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Categories</p>
                 <div className="space-y-1">
                    {CATEGORIES.map(cat => (
                       <button key={cat} onClick={() => setActiveCategory(cat)}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-none text-sm font-bold transition-all ${activeCategory === cat ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-card shadow-sm hover:text-foreground'}`}>
                          <span>{cat}</span>
                          {activeCategory === cat && <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                       </button>
                    ))}
                 </div>
              </div>

              <div className="p-6 bg-gradient-to-br from-orange-600/20 to-indigo-600/10 border border-orange-500/20 rounded-none text-center space-y-3">
                 <BoltIcon className="w-8 h-8 text-orange-400 mx-auto" />
                 <p className="text-xs font-bold text-muted-foreground">Missing something?</p>
                 <p className="text-[10px] text-muted-foreground">Request content from the academic team.</p>
                 <button className="w-full py-2 bg-card shadow-sm hover:bg-muted text-foreground font-black text-[10px] rounded-none border border-border uppercase tracking-widest transition-all">Request</button>
              </div>
           </aside>

           {/* Content Canvas */}
           <section className="flex-1 p-6 lg:p-10 overflow-auto bg-black/20">
              
              <div className="flex items-center justify-between mb-8 xl:hidden">
                 <div className="flex gap-2">
                    <select value={activeTab} onChange={e => setActiveTab(e.target.value as any)} className="bg-card shadow-sm border border-border rounded-none px-3 py-2 text-xs font-bold text-foreground outline-none">
                       <option value="all">All Scopes</option>
                       <option value="school">My School</option>
                       <option value="global">Global</option>
                    </select>
                    <select value={activeCategory} onChange={e => setActiveCategory(e.target.value)} className="bg-card shadow-sm border border-border rounded-none px-3 py-2 text-xs font-bold text-foreground outline-none">
                       {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                 </div>
              </div>

              {filtered.length === 0 ? (
                 <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-4">
                    <ArchiveBoxIcon className="w-16 h-16 text-white/5" />
                    <div>
                       <p className="text-muted-foreground font-bold">No resources found</p>
                       <p className="text-xs text-muted-foreground">Try adjusting your filters or search terms</p>
                    </div>
                 </div>
              ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-8">
                    {filtered.map(item => (
                       <div key={item.id} onClick={() => setSelectedItem(item)}
                          className="group relative bg-white/[0.03] border border-border rounded-[2.5rem] p-6 hover:bg-white/[0.06] hover:border-orange-500/30 transition-all cursor-pointer flex flex-col shadow-2xl overflow-hidden active:scale-95">
                          
                          {/* Visual Background Pattern/Thumbnail */}
                          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-600/10 to-transparent rounded-full -translate-y-12 translate-x-12 blur-2xl group-hover:bg-orange-600/20 transition-all" />
                          
                          <div className="flex items-start justify-between mb-6">
                             <div className="w-14 h-14 bg-card shadow-sm rounded-none flex items-center justify-center text-orange-400 group-hover:bg-orange-600 group-hover:text-foreground transition-all duration-500 shadow-lg">
                                {getTypeIcon(item.content_type)}
                             </div>
                             <div className="flex flex-col items-end gap-2">
                                <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 bg-card shadow-sm border border-border rounded-full text-muted-foreground">
                                   {item.content_type}
                                </span>
                                {item.school_id ? (
                                   <span className="text-[8px] font-black uppercase text-blue-400">School Private</span>
                                ) : (
                                   <span className="text-[8px] font-black uppercase text-emerald-400">Global Asset</span>
                                )}
                             </div>
                          </div>

                          <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-orange-400 transition-colors">{item.title}</h3>
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-8 flex-1 leading-relaxed">{item.description || 'Professional learning resource curated for Rillcod Technologies students.'}</p>
                          
                          {/* BKey Fields */}
                          <div className="grid grid-cols-3 gap-2 mb-8">
                             {[
                               { label: 'Subject', value: item.subject || 'General' },
                               { label: 'Grade', value: item.grade_level || 'All' },
                               { label: 'Topic', value: item.category || 'N/A' },
                             ].map(f => (
                                <div key={f.label} className="bg-card shadow-sm rounded-none p-2 text-center border border-border">
                                   <p className="text-[8px] font-black text-muted-foreground uppercase tracking-tighter mb-0.5">{f.label}</p>
                                   <p className="text-[10px] font-black text-muted-foreground truncate">{f.value}</p>
                                </div>
                             ))}
                          </div>

                          <div className="flex items-center justify-between pt-5 border-t border-border">
                             <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-bold">
                                <StarIcon className="w-4 h-4 text-amber-500" />
                                {item.rating_average || '5.0'}
                                <span className="text-[10px] opacity-40">({item.usage_count || 0})</span>
                             </div>
                             <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-[10px] font-black uppercase text-orange-400 tracking-widest">Details →</span>
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
            <div className="w-full max-w-2xl bg-[#0F0F1A] border border-border rounded-[3rem] p-10 space-y-8 shadow-2xl relative overflow-y-auto max-h-[90vh]">
               <button onClick={() => setShowUpload(false)} className="absolute top-8 right-8 p-3 hover:bg-card shadow-sm rounded-none text-muted-foreground hover:text-foreground transition-all">
                  <XMarkIcon className="w-6 h-6" />
               </button>
               
               <div>
                  <h2 className="text-3xl font-black mb-2">Upload Asset</h2>
                  <p className="text-muted-foreground text-sm">Add a new resource to the Rillcod Technologies Library.</p>
               </div>                <form onSubmit={handleCreate} className="space-y-6">
                  {error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-none px-5 py-3 text-rose-400 text-xs flex items-center gap-2">
                       <ExclamationTriangleIcon className="w-4 h-4" />
                       {error}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Content Title *</label>
                        <div className="relative group">
                           <input required value={form.title} onChange={e => setForm(s=>({...s, title: e.target.value}))} placeholder="e.g. Intro to Logic Gates" className="w-full bg-card shadow-sm border border-border rounded-none px-5 py-4 text-sm text-foreground focus:border-orange-500 outline-none transition-all" />
                           <button 
                              type="button"
                              onClick={generateMetadata}
                              disabled={generatingAi || !form.title}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:bg-muted text-foreground rounded-none transition-all group/ai shadow-xl"
                              title="AI Auto-Fill Metadata"
                           >
                              {generatingAi ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                           </button>
                        </div>
                        <p className="text-[9px] text-muted-foreground font-medium px-1">Enter a title and click the sparkle for AI metadata magic.</p>
                     </div>
                     <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Resource Type</label>
                        <select value={form.contentType} onChange={e => setForm(s=>({...s, contentType: e.target.value}))} className="w-full bg-card shadow-sm border border-border rounded-none px-5 py-4 text-sm text-foreground focus:border-orange-500 outline-none transition-all">
                           <option value="video">Video</option>
                           <option value="document">Document</option>
                           <option value="interactive">Interactive</option>
                           <option value="presentation">Presentation</option>
                        </select>
                     </div>
                  </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                         <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Upload File</label>
                         <div className="relative group cursor-pointer">
                            <input type="file" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                            <div className={`w-full border-2 border-dashed rounded-none p-8 text-center transition-all ${form.fileId ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-border group-hover:border-orange-500/50 group-hover:bg-orange-500/5'}`}>
                               {form.fileId ? <CheckCircleIcon className="w-10 h-10 text-emerald-400 mx-auto mb-3" /> : <ArrowDownTrayIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3 group-hover:text-orange-400" />}
                               <p className="text-sm font-bold text-muted-foreground group-hover:text-foreground transition-colors">{form.fileId ? 'File Uploaded' : 'Click or drag to upload'}</p>
                               <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest">Local Asset</p>
                            </div>
                         </div>
                      </div>

                      <div className="space-y-1.5">
                         <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Or Remote URL (Cloudinary/YouTube)</label>
                         <div className="h-full flex flex-col">
                            <div className={`flex-1 flex flex-col border-2 border-dashed rounded-none p-6 transition-all ${form.externalUrl ? 'border-blue-500/50 bg-blue-500/5' : 'border-border'}`}>
                               <GlobeAltIcon className={`w-8 h-8 mx-auto mb-3 ${form.externalUrl ? 'text-blue-400' : 'text-muted-foreground'}`} />
                               <input 
                                  value={form.externalUrl}
                                  onChange={e => setForm(s => ({ ...s, externalUrl: e.target.value, fileId: "" }))}
                                  placeholder="https://cloudinary.com/..." 
                                  className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-3 text-xs text-foreground outline-none focus:border-blue-500 transition-all mb-2"
                               />
                               <p className="text-[10px] text-muted-foreground text-center uppercase tracking-widest font-bold">Remote Resource</p>
                            </div>
                         </div>
                      </div>
                   </div>

                  <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Description</label>
                     <textarea rows={3} value={form.description} onChange={e => setForm(s=>({...s, description: e.target.value}))} placeholder="Describe what this resource covers..." className="w-full bg-card shadow-sm border border-border rounded-none px-5 py-4 text-sm text-foreground focus:border-orange-500 outline-none resize-none" />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     {[
                        { label: 'Subject', name: 'subject' },
                        { label: 'Grade Level', name: 'gradeLevel' },
                        { label: 'Category', name: 'category' },
                        { label: 'Tags (comma separated)', name: 'tags' }
                     ].map(f => (
                        <div key={f.name} className="space-y-1.5">
                           <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{f.label}</label>
                           <input 
                              value={(form as any)[f.name]} 
                              onChange={e => setForm(s=>({...s, [f.name]: e.target.value}))} 
                              className="w-full bg-card shadow-sm border border-border rounded-none px-5 py-3 text-xs text-foreground outline-none focus:border-orange-500" 
                           />
                        </div>
                     ))}
                  </div>

                  <div className="flex gap-4 pt-6">
                     <button type="button" onClick={() => setShowUpload(false)} className="flex-1 py-4 text-muted-foreground hover:text-foreground font-bold transition-colors">Cancel</button>
                     <button type="submit" disabled={saving} className="flex-1 py-4 bg-orange-600 hover:bg-orange-500 text-foreground font-black rounded-none shadow-xl shadow-orange-900/40 transition-all">
                        {saving ? 'Processing...' : 'Upload to Hub'}
                     </button>
                  </div>
               </form>
            </div>
         </div>
      )}

      {/* Detailed "Canvas" Sidebar/Modal */}
      {selectedItem && (
         <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setSelectedItem(null)}>
            <div className="w-full max-w-2xl bg-[#0F0F1A] border-l border-border h-full shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500" onClick={e => e.stopPropagation()}>
               
               <div className="relative h-64 bg-gradient-to-br from-orange-600 to-indigo-800 flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 opacity-20 pointer-events-none">
                     <div className="w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
                  </div>
                  <BookOpenIcon className="w-32 h-32 text-muted-foreground" />
                  <button onClick={() => setSelectedItem(null)} className="absolute top-6 right-6 p-3 bg-black/20 hover:bg-black/40 rounded-none text-foreground transition-all">
                     <XMarkIcon className="w-6 h-6" />
                  </button>
               </div>

               <div className="p-10 space-y-10">
                  <div className="space-y-4">
                     <div className="flex gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full">{selectedItem.content_type}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-card shadow-sm text-muted-foreground rounded-full">{selectedItem.subject || 'All Subjects'}</span>
                     </div>
                     <h2 className="text-4xl font-black text-foreground">{selectedItem.title}</h2>
                     <p className="text-muted-foreground text-base leading-relaxed">{selectedItem.description || 'This resource contributes to the Rillcod Technologies digital curriculum, providing structured learning paths for students.'}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                     <div className="p-6 bg-card shadow-sm border border-border rounded-none space-y-2">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Metadata</p>
                        <div className="space-y-1">
                           <p className="text-sm font-bold text-muted-foreground">Grade: {selectedItem.grade_level || 'General'}</p>
                           <p className="text-sm font-bold text-muted-foreground">Category: {selectedItem.category || 'N/A'}</p>
                           <p className="text-sm font-bold text-muted-foreground">License: {selectedItem.license_type || 'Copyright Rillcod'}</p>
                        </div>
                     </div>
                     <div className="p-6 bg-card shadow-sm border border-border rounded-none space-y-2 text-right">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Reach</p>
                        <div className="space-y-1">
                           <p className="text-sm font-bold text-muted-foreground">Usage: {selectedItem.usage_count || 0} times</p>
                           <p className="text-sm font-bold text-muted-foreground">Rating: {selectedItem.rating_average || '5.0'}/5</p>
                           <p className="text-sm font-bold text-muted-foreground">Added: {new Date(selectedItem.created_at).toLocaleDateString()}</p>
                        </div>
                     </div>
                  </div>

                  <div className="space-y-4">
                     <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Actions</p>
                     <div className="flex flex-col gap-3">
                        <a href={selectedItem.files?.public_url || '#'} target="_blank" className="flex items-center justify-center gap-3 w-full py-5 bg-orange-600 hover:bg-orange-500 text-foreground font-black rounded-none shadow-xl shadow-orange-900/20 transition-all">
                           <ArrowDownTrayIcon className="w-6 h-6" /> Open / Download Asset
                        </a>
                        {isStaff && (
                           <button className="flex items-center justify-center gap-3 w-full py-5 bg-card shadow-sm hover:bg-muted text-muted-foreground font-black rounded-none border border-border transition-all">
                              <UserIcon className="w-5 h-5 text-orange-400" /> Assign to Course
                           </button>
                        )}
                        {canApprove && !selectedItem.is_approved && (
                           <div className="grid grid-cols-2 gap-3 mt-4">
                              <button className="py-4 bg-emerald-600/20 text-emerald-400 font-bold rounded-none border border-emerald-500/20">Approve</button>
                              <button className="py-4 bg-rose-600/20 text-rose-400 font-bold rounded-none border border-rose-500/20">Reject</button>
                           </div>
                        )}
                     </div>
                  </div>
               </div>

            </div>
         </div>
      )}

    </div>
  );
}
