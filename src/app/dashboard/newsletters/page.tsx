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

  const supabase = createClient();
  const pdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profile?.role === 'admin' || profile?.role === 'school') {
      loadNewsletters();
    }
  }, [profile]);

  async function loadNewsletters() {
    setLoading(true);
    const res = await supabase.from('newsletters')
      .select('*')
      .order('created_at', { ascending: false });
    setNewsletters(res.data ?? []);
    setLoading(false);
  }

  async function handleAIGenerate() {
    if (!topic) return;
    setGenerating(true);
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
      if (json.success) {
        setActiveNewsletter(prev => ({
          ...prev,
          title: json.data.title,
          content: json.data.content
        }));
      }
    } catch (e) {
      console.error(e);
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

  async function handleDownloadPDF() {
    if (!pdfRef.current) return;
    await generateReportPDF(pdfRef.current, `${activeNewsletter?.title || 'Newsletter'}.pdf`);
  }

  if (profile?.role !== 'admin' && profile?.role !== 'school') {
    return (
      <div className="min-h-screen bg-[#05050a] flex items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-violet-900/10 via-transparent to-transparent">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-24 h-24 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto border border-rose-500/20 text-rose-400">
             <InformationCircleIcon className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-white uppercase italic">Access Denied</h1>
          <p className="text-white/40 font-medium leading-relaxed">
            Only Administrators and School Partners can manage official newsletters. Visit the <strong>Messages</strong> tab to view published editions.
          </p>
          <a href="/dashboard" className="inline-block px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white transition-all">
            Return to Command Center
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <SpeakerWaveIcon className="w-5 h-5 text-violet-400" />
              <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Premium Content</span>
            </div>
            <h1 className="text-3xl font-extrabold">Newsletters & Announcements</h1>
            <p className="text-white/40 text-sm mt-1">Design, AI-Draft, and push professional newsletters to everyone.</p>
          </div>
          {view === 'list' ? (
            <button 
              onClick={() => { setView('editor'); setActiveNewsletter({ title: '', content: '' }); }}
              className="flex items-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl text-sm font-bold transition-all shadow-lg shadow-violet-900/40"
            >
              <PlusIcon className="w-5 h-5" /> Create Newsletter
            </button>
          ) : (
            <button 
              onClick={() => setView('list')}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold transition-all border border-white/10"
            >
              <ArrowLeftIcon className="w-4 h-4" /> Back to List
            </button>
          )}
        </div>

        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center gap-3 text-emerald-400 animate-in fade-in slide-in-from-top-4">
            <CheckCircleIcon className="w-5 h-5" />
            <span className="text-sm font-bold">{success}</span>
          </div>
        )}

        {view === 'list' ? (
          /* ── List View ── */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-[32px] h-48 animate-pulse" />
              ))
            ) : newsletters.length === 0 ? (
              <div className="col-span-full py-20 text-center">
                <DocumentTextIcon className="w-16 h-16 mx-auto text-white/10 mb-4" />
                <p className="text-white/40 font-bold">No newsletters created yet.</p>
              </div>
            ) : (
              newsletters.map(nl => (
                <div 
                  key={nl.id} 
                  onClick={() => { setActiveNewsletter(nl); setView('editor'); }}
                  className="group bg-white/5 border border-white/10 rounded-[32px] p-6 hover:bg-white/8 transition-all cursor-pointer relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRightIcon className="w-5 h-5 text-violet-400" />
                  </div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      nl.status === 'published' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {nl.status}
                    </span>
                    <span className="text-[9px] text-white/30 font-black uppercase tracking-widest">
                      {nl.created_at ? new Date(nl.created_at).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white mb-2 line-clamp-2 tracking-tight uppercase leading-tight">{nl.title}</h3>
                  <div className="text-sm text-white/40 line-clamp-3 mb-4 whitespace-pre-wrap h-20 overflow-hidden leading-relaxed">
                    {nl.content}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* ── Editor View ── */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pb-20">
            
            {/* Editor Sidebar (Generation) */}
            <div className="lg:col-span-4 space-y-6 sticky top-24">
              <div className="bg-[#0f0f1a]/80 backdrop-blur-xl border border-white/10 ring-1 ring-white/10 rounded-[2.5rem] p-8 space-y-8 shadow-2xl">
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-violet-600/20 rounded-xl flex items-center justify-center border border-violet-500/30">
                      <SparklesIcon className="w-6 h-6 text-violet-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black tracking-tight uppercase">AI Assistant</h3>
                      <p className="text-[10px] text-white/30 font-black uppercase tracking-widest">Premium Content Engine</p>
                    </div>
                  </div>
                  
                  <p className="text-xs text-white/40 mb-6 leading-relaxed">
                    Enter a topic to generate a premium newsletter draft. Our AI will handle the tone, structure, and professional formatting automatically.
                  </p>
                  
                  <div className="space-y-6">
                    <div className="space-y-3">
                       <p className="text-[10px] font-black text-white/20 uppercase tracking-widest leading-none">Perspective</p>
                       <div className="grid grid-cols-2 gap-2">
                          {['professional', 'energetic', 'visionary'].map(t => (
                            <button
                              key={t}
                              onClick={() => setAiTone(t as any)}
                              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${aiTone === t ? 'bg-violet-600 border-violet-500 text-white' : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10'}`}
                            >
                              {t}
                            </button>
                          ))}
                       </div>
                    </div>

                    <div className="space-y-3">
                       <p className="text-[10px] font-black text-white/20 uppercase tracking-widest leading-none">Target Demographic</p>
                       <div className="grid grid-cols-2 gap-2">
                          {['everyone', 'parents', 'students'].map(a => (
                            <button
                              key={a}
                              onClick={() => setAiAudience(a as any)}
                              className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${aiAudience === a ? 'bg-cyan-600 border-cyan-500 text-white shadow-lg shadow-cyan-900/40' : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10'}`}
                            >
                              {a}
                            </button>
                          ))}
                       </div>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-white/20 uppercase tracking-widest pl-1">Primary Objective / Context</label>
                       <textarea 
                         value={topic}
                         onChange={e => setTopic(e.target.value)}
                         placeholder="e.g. Announcing the new Robotics Lab session starting June 12th for JSS students..."
                         className="w-full bg-white/5 border border-white/10 rounded-3xl px-6 py-6 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-all resize-none h-64 placeholder-white/10 font-medium leading-relaxed shadow-inner"
                       />
                       <p className="text-[9px] text-white/20 italic pl-1">The more detail you provide, the more tailored the narrative becomes.</p>
                    </div>
                    
                    <button 
                      onClick={handleAIGenerate}
                      disabled={generating || !topic}
                      className="w-full py-5 bg-gradient-to-br from-violet-600 to-indigo-700 hover:from-violet-500 hover:to-indigo-600 active:scale-[0.98] rounded-[2rem] text-xs font-black transition-all shadow-2xl shadow-violet-900/40 disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-[0.2em]"
                    >
                      {generating ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5" />}
                      {generating ? 'Cultivating Narrative...' : 'Generate Premium Edition'}
                    </button>
                  </div>
                </div>

                <div className="pt-8 border-t border-white/5 space-y-4">
                  <h3 className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Official Actions</h3>
                  <button 
                    onClick={handleDownloadPDF}
                    className="w-full flex items-center gap-4 px-5 py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-sm font-black transition-all border border-white/10 group"
                  >
                    <PrinterIcon className="w-5 h-5 text-violet-400 group-hover:scale-110 transition-transform" /> 
                    <span className="uppercase tracking-widest">Export PDF Archive</span>
                  </button>
                  {activeNewsletter?.id && (
                    <button 
                      onClick={() => setShowPushModal(true)}
                      className="w-full flex items-center gap-4 px-5 py-4 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 rounded-2xl text-sm font-black transition-all border border-emerald-500/20 group"
                    >
                      <SpeakerWaveIcon className="w-5 h-5 group-hover:animate-pulse" /> 
                      <span className="uppercase tracking-widest">Deploy to Portal</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-8 space-y-10">
              <div className="bg-[#0f0f1a]/80 backdrop-blur-xl border border-white/10 ring-1 ring-white/10 rounded-[3rem] p-10 space-y-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
                
                <div className="flex flex-col gap-6">
                  <div className="flex items-center gap-4 border-b border-white/5 pb-6">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 shrink-0">
                      <DocumentTextIcon className="w-6 h-6 text-white/20" />
                    </div>
                    <input 
                      type="text"
                      value={activeNewsletter?.title || ''}
                      onChange={e => setActiveNewsletter(p => ({ ...p, title: e.target.value }))}
                      placeholder="Edition Headline..."
                      className="w-full bg-transparent text-4xl font-black focus:outline-none placeholder-white/5 tracking-tighter uppercase italic"
                    />
                  </div>
                  
                  <div className="relative group/editor px-4 sm:px-10">
                    <div className="absolute -left-2 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-violet-500/20 to-transparent" />
                    <textarea 
                      value={activeNewsletter?.content || ''}
                      onChange={e => setActiveNewsletter(p => ({ ...p, content: e.target.value }))}
                      placeholder="Strategic communication content goes here... Use Markdown for emphasis."
                      className="w-full bg-transparent text-lg sm:text-2xl leading-[1.8] min-h-[900px] focus:outline-none placeholder-white/5 resize-none font-serif tracking-wide scrollbar-hide selection:bg-violet-500/40 text-white/90"
                    />
                  </div>
                </div>
                
                <div className="pt-8 border-t border-white/5 flex flex-wrap justify-end gap-4">
                   <button 
                    onClick={() => setShowPreview(true)}
                    className="flex items-center gap-3 px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-black transition-all uppercase tracking-widest text-white/60 hover:text-white"
                  >
                    <EyeIcon className="w-4 h-4" />
                    Live Preview
                  </button>
                   <button 
                    onClick={handleSave}
                    disabled={loading || !activeNewsletter?.title}
                    className="flex items-center gap-3 px-8 py-4 bg-violet-600 hover:bg-violet-500 rounded-2xl text-[10px] font-black transition-all shadow-2xl shadow-violet-900/40 hover:-translate-y-1 uppercase tracking-widest"
                  >
                    {loading ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CheckCircleIcon className="w-5 h-5" />}
                    Lock & Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modern Slide-Over Preview Panel */}
        {showPreview && (
          <div className="fixed inset-0 z-[60] flex flex-col bg-[#05050a]/95 backdrop-blur-2xl animate-in fade-in duration-300">
            <div className="flex items-center justify-between p-6 border-b border-white/10 bg-[#0f0f1a]/50">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-violet-600/20 rounded-xl flex items-center justify-center border border-violet-500/30">
                    <EyeIcon className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                     <h3 className="text-sm font-black uppercase tracking-widest">Branded A4 Preview</h3>
                     <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Active Draft Render</span>
                     </div>
                  </div>
               </div>
               <div className="flex items-center gap-3">
                  <button 
                    onClick={handleDownloadPDF}
                    className="hidden sm:flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    <PrinterIcon className="w-4 h-4 text-violet-400" /> Export PDF
                  </button>
                  <button 
                    onClick={() => setShowPreview(false)}
                    className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-rose-500/20 rounded-xl transition-all group"
                  >
                    <XMarkIcon className="w-6 h-6 text-white/40 group-hover:text-rose-500" />
                  </button>
               </div>
            </div>

            <div className="flex-1 overflow-auto p-4 sm:p-12 custom-scrollbar bg-black/40 flex items-start justify-center">
               <div className="relative shadow-[0_0_100px_rgba(0,0,0,0.5)] origin-top transform scale-[0.45] sm:scale-[0.7] lg:scale-100 my-10 lg:my-0 flex-shrink-0">
                  <div 
                     ref={pdfRef} 
                     className="bg-white text-[#111827] overflow-hidden shadow-2xl ring-1 ring-black/10 flex flex-col" 
                     style={{ width: '210mm', minHeight: '297mm', padding: '25mm' }}
                  >
                       <div className="flex items-center gap-6 sm:gap-[30px] border-b-4 border-[#1a1a1a] pb-6 sm:pb-[25px] mb-10 sm:mb-[40px]">
                         <div className="w-16 h-16 sm:w-[90px] sm:h-[90px] bg-[#1a1a1a] rounded-xl sm:rounded-[18px] flex items-center justify-center p-3 sm:p-[15px]">
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
                           {activeNewsletter?.title || 'Untitled Archive'}
                         </h1>
                         
                         <div className="text-base sm:text-[15px] leading-[1.8] text-[#374151] whitespace-pre-wrap font-serif text-justify">
                           {activeNewsletter?.content || 'Awaiting content generation...'}
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
            <div className="bg-[#161625] border border-white/10 rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold">Push to Recipients</h3>
                  <button onClick={() => setShowPushModal(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                    <XMarkIcon className="w-5 h-5 text-white/40" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <p className="text-sm text-white/40">Select who should receive this premium newsletter. It will appear as a "View-Once" popup upon their next login.</p>
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
                        className={`flex items-center gap-3 px-4 py-4 rounded-2xl border transition-all ${
                          targetType === t.id ? 'bg-violet-600/10 border-violet-500/50 text-white' : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/8'
                        }`}
                      >
                        <t.icon className={`w-5 h-5 ${targetType === t.id ? 'text-violet-400' : ''}`} />
                        <span className="text-sm font-bold">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                  <InformationCircleIcon className="w-5 h-5 text-blue-400 shrink-0" />
                  <p className="text-[11px] text-blue-400 font-medium">This document will be embedded with the official signature for premium presentation.</p>
                </div>

                <button 
                  onClick={handlePush}
                  disabled={pushing}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black rounded-2xl transition-all shadow-xl shadow-emerald-900/40 flex items-center justify-center gap-2"
                >
                  {pushing ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <SpeakerWaveIcon className="w-5 h-5" />}
                  Confirm & Push Newsletter
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .prose h1, .prose h2, .prose h3 { color: #111827 !important; margin-bottom: 0.5em; }
        .prose p { margin-bottom: 1em; }
        .prose ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 1em; }
        @media print {
          body * { visibility: hidden; }
          #newsletter-print-area, #newsletter-print-area * { visibility: visible; }
          #newsletter-print-area { position: absolute; left: 0; top: 0; }
        }
      `}</style>
    </div>
  );
}
