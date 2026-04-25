'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  SparklesIcon,
  DocumentTextIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  SpeakerWaveIcon,
  UserGroupIcon,
  AcademicCapIcon,
  BuildingOfficeIcon,
  EyeIcon,
  PrinterIcon,
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
  ArrowLeftIcon,
  XMarkIcon,
  InformationCircleIcon
} from '@/lib/icons';
import { generateReportPDF } from '@/lib/pdf-utils';

// Strip markdown symbols for clean document display
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')        // Remove # headings
    .replace(/\*\*(.+?)\*\*/g, '$1')    // Remove **bold**
    .replace(/\*(.+?)\*/g, '$1')        // Remove *italic*
    .replace(/^[\-\*]\s+/gm, '• ')     // Convert - / * bullets to •
    .replace(/^(\d+)\.\s+/gm, '$1. ')  // Keep numbered lists clean
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // Remove code blocks
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links, keep text
    .trim();
}

// ── Components ──

interface Newsletter {
  id: string;
  title: string;
  content: string;
  status: string | null;
  created_at: string | null;
  published_at: string | null;
}

export default function NewslettersPage() {
  const { profile } = useAuth();
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [activeNewsletter, setActiveNewsletter] = useState<Partial<Newsletter> | null>(null);
  
  // AI Generation State
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  
  // Pushing/Delivery State
  const [showPushModal, setShowPushModal] = useState(false);
  const [targetType, setTargetType] = useState<'all' | 'students' | 'teachers' | 'schools'>('all');
  const [pushing, setPushing] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [aiTone, setAiTone] = useState<'professional' | 'energetic' | 'visionary'>('professional');
  const [aiAudience, setAiAudience] = useState<'everyone' | 'parents' | 'students'>('everyone');
  const [showPreview, setShowPreview] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const supabase = createClient();
  const pdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profile?.role) {
      loadNewsletters();
    }
  }, [profile]);

  async function loadNewsletters() {
    setLoading(true);
    let data: Newsletter[] = [];

    if (profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school') {
      const res = await supabase.from('newsletters')
        .select('*')
        .order('created_at', { ascending: false });
      data = res.data ?? [];
    } else {
      // For Students and Parents, they see newsletters delivered to them
      if (!profile?.id) {
        setLoading(false);
        return;
      }
      const userId = profile.id;
      const { data: deliveries } = await supabase
        .from('newsletter_delivery')
        .select('newsletter_id, is_viewed')
        .eq('user_id', userId);
      
      if (deliveries && deliveries.length > 0) {
        const ids = deliveries.map(d => d.newsletter_id).filter((id): id is string => id !== null);
        const { data: nls } = await supabase
          .from('newsletters')
          .select('*')
          .in('id', ids)
          .eq('status', 'published')
          .order('published_at', { ascending: false });
        data = nls ?? [];

        // Mark them as viewed
        await supabase
          .from('newsletter_delivery')
          .update({ is_viewed: true })
          .eq('user_id', userId)
          .in('newsletter_id', ids);
      }
    }

    setNewsletters(data);
    setLoading(false);
  }

  async function handleAIGenerate() {
    if (!topic) return;
    setGenerating(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'newsletter',
          topic,
          tone: aiTone,
          audience: aiAudience
        })
      });
      const json = await res.json();
      if (json.success && json.data) {
        const title = json.data.title || json.data.headline || '';
        const content = json.data.content || json.data.body || json.data.text || '';
        if (!content) {
          setAiError('AI returned empty content. Please try again.');
          return;
        }
        setActiveNewsletter(prev => ({
          ...prev,
          title: stripMarkdown(title),
          content: stripMarkdown(content),
        }));
      } else {
        setAiError(json.error || 'Generation failed. Please try again.');
      }
    } catch (e: any) {
      setAiError(e.message || 'Network error. Please check your connection.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!activeNewsletter?.title || !activeNewsletter?.content) return;
    setLoading(true);
    const payload = {
      title: activeNewsletter.title,
      content: activeNewsletter.content,
      author_id: profile?.id,
      school_id: profile?.school_id,
      status: 'draft'
    };

    const result = activeNewsletter.id
      ? await supabase.from('newsletters').update(payload).eq('id', activeNewsletter.id).select().single()
      : await supabase.from('newsletters').insert([payload]).select().single();

    if (result.data && !activeNewsletter.id) setActiveNewsletter(result.data);

    if (!result.error) {
      setSuccess('Newsletter saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
      loadNewsletters();
    }
    setLoading(false);
  }

  async function handlePush() {
    if (!activeNewsletter?.id) return;
    setPushing(true);
    try {
      // 1. Get target user IDs
      let userQuery = supabase.from('portal_users').select('id');
      if (profile?.role === 'school' && profile.school_id) userQuery = userQuery.eq('school_id', profile.school_id);
      if (targetType === 'students') userQuery = userQuery.eq('role', 'student');
      if (targetType === 'teachers') userQuery = userQuery.eq('role', 'teacher');
      if (targetType === 'schools') userQuery = userQuery.eq('role', 'school');
      
      const { data: users } = await userQuery;
      if (!users || users.length === 0) throw new Error('No target users found');

      // 2. Create delivery entries
      const deliveryRows = users.map(u => ({
        newsletter_id: activeNewsletter.id,
        user_id: u.id
      }));

      const { error: delErr } = await supabase.from('newsletter_delivery').insert(deliveryRows);
      if (delErr) throw delErr;

      // 3. Update status
      await supabase.from('newsletters').update({ 
        status: 'published',
        published_at: new Date().toISOString()
      }).eq('id', activeNewsletter.id);

      setSuccess(`Newsletter pushed to ${users.length} recipients!`);
      setShowPushModal(false);
      setView('list');
      loadNewsletters();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPushing(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this newsletter? This cannot be undone.')) return;
    await supabase.from('newsletters').delete().eq('id', id);
    setNewsletters(prev => prev.filter(n => n.id !== id));
  }

  async function handleDownloadPDF() {
    if (!pdfRef.current) return;
    await generateReportPDF(pdfRef.current, `${activeNewsletter?.title || 'Newsletter'}.pdf`);
  }

  const isManager = profile?.role === 'admin' || profile?.role === 'teacher';

  if (profile?.role !== 'admin' && profile?.role !== 'school' && profile?.role !== 'teacher' && profile?.role !== 'student' && profile?.role !== 'parent') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-orange-900/10 via-transparent to-transparent">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-24 h-24 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto border border-rose-500/20 text-rose-400">
             <InformationCircleIcon className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-foreground uppercase italic">Access Denied</h1>
          <p className="text-muted-foreground font-medium leading-relaxed">
            You do not have access to this page.
          </p>
          <a href="/dashboard" className="inline-block px-8 py-4 bg-card shadow-sm hover:bg-muted border border-border rounded-none text-[10px] font-black uppercase tracking-widest text-foreground transition-all">
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <SpeakerWaveIcon className="w-5 h-5 text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-widest">Official Channel</span>
            </div>
            <h1 className="text-3xl font-extrabold">{isManager ? 'Newsletters' : 'Official Newsletters'}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isManager 
                ? 'Design, AI-Draft, and push professional newsletters to all stakeholders.' 
                : 'Stay updated with the latest news, technological trends, and school announcements.'}
            </p>
          </div>
          {view === 'list' ? (
            isManager && (
              <button 
                onClick={() => { setView('editor'); setActiveNewsletter({ title: '', content: '' }); }}
                className="flex items-center gap-2 px-5 py-3 bg-primary hover:bg-primary rounded-none text-sm font-bold transition-all shadow-lg shadow-orange-900/40"
              >
                <PlusIcon className="w-5 h-5" /> Create Newsletter
              </button>
            )
          ) : (
            <button 
              onClick={() => setView('list')}
              className="flex items-center gap-2 px-4 py-2 bg-card shadow-sm hover:bg-muted rounded-none text-sm font-bold transition-all border border-border"
            >
              <ArrowLeftIcon className="w-4 h-4" /> Back to Newsletters
            </button>
          )}
        </div>

        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-none p-4 flex items-center gap-3 text-emerald-400 animate-in fade-in slide-in-from-top-4">
            <CheckCircleIcon className="w-5 h-5" />
            <span className="text-sm font-bold">{success}</span>
          </div>
        )}

        {view === 'list' ? (
          /* ── List View ── */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="bg-card shadow-sm border border-border rounded-2xl h-48 animate-pulse" />
              ))
            ) : newsletters.length === 0 ? (
              <div className="col-span-full py-20 text-center">
                <DocumentTextIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground font-bold">No newsletters created yet.</p>
              </div>
            ) : (
              newsletters.map(nl => (
                <div
                  key={nl.id}
                  onClick={() => { setActiveNewsletter(nl); setView('editor'); }}
                  className="group bg-card shadow-sm border border-border rounded-2xl p-6 hover:bg-white/8 transition-all cursor-pointer relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4 flex items-center gap-2">
                    {isManager && (
                      <button
                        onClick={e => handleDelete(nl.id, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400"
                        title="Delete newsletter"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                    <ChevronRightIcon className="w-5 h-5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      nl.status === 'published' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {nl.status || 'draft'}
                    </span>
                    <span className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">
                      {nl.created_at ? new Date(nl.created_at).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-foreground mb-2 line-clamp-2 tracking-tight uppercase leading-tight">{nl.title}</h3>
                  <div className="text-sm text-muted-foreground line-clamp-3 mb-4 whitespace-pre-wrap h-20 overflow-hidden leading-relaxed">
                    {nl.content}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* ── Editor View ── */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pb-20 relative">
            
            {/* AI Assistant - Collapsible on Mobile */}
            <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24 order-2 lg:order-1">
              <div className="bg-background/80 backdrop-blur-xl border border-border ring-1 ring-white/10 rounded-2xl lg:rounded-[2.5rem] p-6 lg:p-8 space-y-6 lg:space-y-8 shadow-2xl">
                <div className="flex items-center justify-between lg:block">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/20 rounded-none flex items-center justify-center border border-primary/30">
                      <SparklesIcon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm lg:text-lg font-black tracking-tight uppercase">AI Assistant</h3>
                      <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest hidden sm:block">AI Newsletter Builder</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-6">
                    <div className="space-y-3">
                       <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none">Perspective</p>
                       <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
                          {['professional', 'energetic', 'visionary'].map(t => (
                            <button
                              key={t}
                              onClick={() => setAiTone(t as any)}
                              className={`px-3 py-2 rounded-none text-[9px] font-black uppercase tracking-widest border transition-all ${aiTone === t ? 'bg-primary border-primary text-foreground' : 'bg-card shadow-sm border-border text-muted-foreground hover:bg-muted'}`}
                            >
                              {t}
                            </button>
                          ))}
                       </div>
                    </div>

                    <div className="space-y-3">
                       <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none">Audience</p>
                       <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
                          {['everyone', 'parents', 'students'].map(a => (
                            <button
                              key={a}
                              onClick={() => setAiAudience(a as any)}
                              className={`px-3 py-2 rounded-none text-[9px] font-black uppercase tracking-widest border transition-all ${aiAudience === a ? 'bg-cyan-600 border-cyan-500 text-foreground shadow-lg shadow-cyan-900/40' : 'bg-card shadow-sm border-border text-muted-foreground hover:bg-muted'}`}
                            >
                              {a}
                            </button>
                          ))}
                       </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest pl-1">Topic or Announcement</label>
                     <textarea 
                       value={topic}
                       onChange={e => setTopic(e.target.value)}
                       placeholder="Announce your news..."
                       className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-all resize-none h-32 lg:h-64 placeholder-muted-foreground font-medium shadow-inner"
                     />
                  </div>
                  
                  <button
                    onClick={handleAIGenerate}
                    disabled={generating || !topic}
                    className="w-full py-4 lg:py-5 bg-gradient-to-br from-primary to-indigo-700 hover:from-primary hover:to-indigo-600 active:scale-[0.98] rounded-xl lg:rounded-[2rem] text-[10px] lg:text-xs font-black transition-all shadow-2xl shadow-orange-900/40 disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-[0.2em]"
                  >
                    {generating ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5" />}
                    {generating ? 'Generating...' : 'Generate'}
                  </button>

                  {aiError && (
                    <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl">
                      <InformationCircleIcon className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-rose-400 font-semibold">{aiError}</p>
                    </div>
                  )}
                </div>

                <div className="pt-6 lg:pt-8 border-t border-border flex flex-col gap-3">
                  <button 
                    onClick={handleDownloadPDF}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-card shadow-sm hover:bg-muted rounded-none text-[10px] font-black transition-all border border-border group"
                  >
                    <PrinterIcon className="w-4 h-4 text-primary" /> 
                    <span className="uppercase tracking-widest">Export PDF</span>
                  </button>
                  {activeNewsletter?.id && (
                    <button 
                      onClick={() => setShowPushModal(true)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 rounded-none text-[10px] font-black transition-all border border-emerald-500/20 group"
                    >
                      <SpeakerWaveIcon className="w-4 h-4" /> 
                      <span className="uppercase tracking-widest">Send to Users</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-8 space-y-8 order-1 lg:order-2">
              <div className="bg-background/80 backdrop-blur-xl border border-border ring-1 ring-white/10 rounded-2xl lg:rounded-[3rem] p-6 lg:p-10 space-y-6 lg:space-y-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                
                <div className="flex flex-col gap-6">
                  <div className="flex items-center gap-4 border-b border-border pb-6">
                    <div className="hidden sm:flex w-12 h-12 bg-card shadow-sm rounded-none items-center justify-center border border-border shrink-0">
                      <DocumentTextIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <input 
                      type="text"
                      value={activeNewsletter?.title || ''}
                      onChange={e => setActiveNewsletter(p => ({ ...p, title: e.target.value }))}
                      placeholder="Headline..."
                      className="w-full bg-transparent text-2xl lg:text-4xl font-black focus:outline-none placeholder-muted-foreground tracking-tighter uppercase italic"
                    />
                  </div>
                  
                  <div className="relative group/editor">
                    <div className="absolute -left-2 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-primary/20 to-transparent hidden sm:block" />
                    <textarea 
                      value={activeNewsletter?.content || ''}
                      onChange={e => setActiveNewsletter(p => ({ ...p, content: e.target.value }))}
                      placeholder="Content..."
                      className="w-full bg-transparent text-base lg:text-2xl leading-[1.6] lg:leading-[1.8] min-h-[400px] lg:min-h-[900px] focus:outline-none placeholder-muted-foreground resize-none font-serif tracking-wide scrollbar-hide text-muted-foreground"
                    />
                  </div>
                </div>
                
                <div className="pt-6 lg:pt-8 border-t border-border flex flex-wrap justify-end gap-3">
                   <button 
                    onClick={() => setShowPreview(true)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-3 px-5 py-3 bg-card shadow-sm border border-border rounded-none text-[9px] font-black transition-all uppercase tracking-widest text-muted-foreground"
                  >
                    <EyeIcon className="w-4 h-4" /> Preview
                  </button>
                   <button 
                    onClick={handleSave}
                    disabled={loading || !activeNewsletter?.title}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-3 px-6 py-3 bg-primary hover:bg-primary rounded-none text-[9px] font-black transition-all shadow-xl shadow-orange-900/40 uppercase tracking-widest"
                  >
                    {loading ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modern Slide-Over Preview Panel */}
        {showPreview && (
          <div className="fixed inset-0 z-[60] flex flex-col bg-background/95 backdrop-blur-2xl animate-in fade-in duration-300">
            <div className="flex items-center justify-between p-6 border-b border-border bg-background/50">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/20 rounded-none flex items-center justify-center border border-primary/30">
                    <EyeIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                     <h3 className="text-sm font-black uppercase tracking-widest">Print Preview</h3>
                     <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">A4 Layout</span>
                     </div>
                  </div>
               </div>
               <div className="flex items-center gap-3">
                  <button 
                    onClick={handleDownloadPDF}
                    className="hidden sm:flex items-center gap-2 px-6 py-3 bg-card shadow-sm hover:bg-muted border border-border rounded-none text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    <PrinterIcon className="w-4 h-4 text-primary" /> Export PDF
                  </button>
                  <button 
                    onClick={() => setShowPreview(false)}
                    className="w-12 h-12 flex items-center justify-center bg-card shadow-sm hover:bg-rose-500/20 rounded-none transition-all group"
                  >
                    <XMarkIcon className="w-6 h-6 text-muted-foreground group-hover:text-rose-500" />
                  </button>
               </div>
            </div>

            <div className="flex-1 overflow-auto p-4 lg:p-12 custom-scrollbar bg-black/40 flex items-start justify-center">
               <div className="relative shadow-[0_0_100px_rgba(0,0,0,0.5)] origin-top transform scale-[0.55] sm:scale-[0.75] lg:scale-100 my-16 sm:my-10 lg:my-0 flex-shrink-0">
                  <div 
                     ref={pdfRef} 
                     className="bg-card text-[#111827] overflow-hidden shadow-2xl ring-1 ring-black/10 flex flex-col" 
                     style={{ width: '210mm', minHeight: '297mm', padding: '25mm' }}
                  >
                       <div className="flex items-center gap-6 sm:gap-[30px] border-b-4 border-[#1a1a1a] pb-6 sm:pb-[25px] mb-10 sm:mb-[40px]">
                         <div className="w-16 h-16 sm:w-[90px] sm:h-[90px] bg-[#1a1a1a] rounded-none sm:rounded-[18px] flex items-center justify-center p-3 sm:p-[15px]">
                           <img src="/logo.png" alt="Logo" className="w-full h-full object-contain filter invert" />
                         </div>
                         <div className="flex-1">
                           <div className="text-lg sm:text-[28px] font-black text-[#1a1a1a] tracking-tight sm:tracking-[-1px] uppercase">RILLCOD TECHNOLOGIES</div>
                           <div className="text-[8px] sm:text-[12px] color-[#4b5563] mt-0.5 sm:mt-[2px] font-semibold tracking-wider sm:tracking-[2px] uppercase">Official Institutional Communication</div>
                           <div className="hidden sm:block text-[10px] text-[#9ca3af] mt-[6px] font-medium">26 Ogiesoba Avenue, Benin City &nbsp;·&nbsp; academy.rillcod.com &nbsp;·&nbsp; 0811 660 0091</div>
                         </div>
                         <div className="text-right">
                           <div className="text-[10px] sm:text-[14px] font-black text-[#1a1a1a] uppercase tracking-widest sm:tracking-[1px]">VOL. {new Date().getFullYear()}</div>
                           <div className="text-[8px] sm:text-[10px] text-[#1a1a1a] mt-1 sm:mt-[4px] font-extrabold uppercase">
                             {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                           </div>
                         </div>
                       </div>
   
                       <div className="max-w-none">
                         <div className="text-[9px] sm:text-[11px] font-black text-[#1a1a1a] uppercase tracking-[3px] mb-[15px]">Topic / Subject</div>
                         <h1 className="text-2xl sm:text-[38px] font-black text-[#1a1a1a] mb-6 sm:mb-[40px] leading-[1.1] uppercase tracking-[-1.5px]">
                           {activeNewsletter?.title || 'Untitled Newsletter'}
                         </h1>
                         
                         <div className="text-base sm:text-[15px] leading-[1.8] text-[#374151] whitespace-pre-wrap font-serif text-justify">
                           {activeNewsletter?.content ? stripMarkdown(activeNewsletter.content) : 'Start writing or use the AI assistant to generate content...'}
                         </div>
                       </div>
   
                       <div className="mt-12 sm:mt-[80px] border-t-2 border-[#f3f4f6] pt-6 sm:pt-[30px]">
                         <div className="flex justify-between items-center">
                           <div className="relative">
                             <img src="/images/signature.png" alt="Official Signature" className="w-32 sm:w-[180px] absolute -top-10 sm:-top-[50px] left-0 opacity-80" />
                             <div className="mt-5 sm:mt-[20px]">
                               <div className="text-xs sm:text-[16px] font-black text-[#1a1a1a] uppercase text-nowrap">The Administrator</div>
                               <div className="text-[8px] sm:text-[11px] text-[#6b7280] font-semibold uppercase tracking-[1px] text-nowrap">Rillcod Technologies Executive Office</div>
                             </div>
                           </div>
                           <div className="text-right">
                              <div className="w-20 h-20 sm:w-[120px] sm:h-[120px] border-2 border-dashed border-[#e5e7eb] rounded-full flex items-center justify-center text-center text-[7px] sm:text-[10px] text-[#d1d5db] font-extrabold uppercase tracking-widest sm:tracking-[1px]">
                                Official<br/>Academy<br/>Stamp
                              </div>
                           </div>
                         </div>
                       </div>
                     </div>
                  </div>
               </div>
            </div>
          )}

        {/* Push Modal */}
        {showPushModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-popover border border-border rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold">Push to Recipients</h3>
                  <button onClick={() => setShowPushModal(false)} className="p-2 hover:bg-card shadow-sm rounded-none transition-colors">
                    <XMarkIcon className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Select who should receive this newsletter. It will appear as a notification upon their next login.</p>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: 'all', label: 'All Users', icon: UserGroupIcon },
                      { id: 'students', label: 'Students Only', icon: AcademicCapIcon },
                      { id: 'teachers', label: 'Teachers Only', icon: UserGroupIcon },
                      { id: 'schools', label: 'Partner Schools Only', icon: BuildingOfficeIcon },
                    ].map(t => (
                      <button 
                        key={t.id}
                        onClick={() => setTargetType(t.id as any)}
                        className={`flex items-center gap-3 px-4 py-4 rounded-none border transition-all ${
                          targetType === t.id ? 'bg-primary/10 border-primary/50 text-foreground' : 'bg-card shadow-sm border-border text-muted-foreground hover:bg-white/8'
                        }`}
                      >
                        <t.icon className={`w-5 h-5 ${targetType === t.id ? 'text-primary' : ''}`} />
                        <span className="text-sm font-bold">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-none">
                  <InformationCircleIcon className="w-5 h-5 text-blue-400 shrink-0" />
                  <p className="text-[11px] text-blue-400 font-medium">Recipients will see this newsletter the next time they log in.</p>
                </div>

                <button 
                  onClick={handlePush}
                  disabled={pushing}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-foreground text-sm font-black rounded-none transition-all shadow-xl shadow-emerald-900/40 flex items-center justify-center gap-2"
                >
                  {pushing ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <SpeakerWaveIcon className="w-5 h-5" />}
                  Confirm & Push Newsletter
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .prose h1, .prose h2, .prose h3 { color: #111827 !important; margin-bottom: 0.5em; }
        .prose p { margin-bottom: 1em; }
        .prose ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 1em; }
        @media print {
          body * { visibility: hidden; }
          #newsletter-print-area, #newsletter-print-area * { visibility: visible; }
          #newsletter-print-area { position: absolute; left: 0; top: 0; }
        }
      `}} />
    </div>
  );
}
