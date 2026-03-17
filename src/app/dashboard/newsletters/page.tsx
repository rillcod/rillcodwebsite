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

  const supabase = createClient();
  const pdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    loadNewsletters();
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
        body: JSON.stringify({ type: 'newsletter', topic })
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
      status: 'draft'
    };

    const result = activeNewsletter.id
      ? await supabase.from('newsletters').update(payload).eq('id', activeNewsletter.id)
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
      if (targetType === 'students') userQuery = userQuery.eq('role', 'student');
      if (targetType === 'teachers') userQuery = userQuery.eq('role', 'teacher');
      if (targetType === 'schools') userQuery = userQuery.eq('role', 'school');
      
      const { data: users } = await userQuery;
      if (!users?.length) throw new Error('No target users found');

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

  if (profile?.role !== 'admin') {
    return <div className="p-8 text-white/40">Access Denied. Only Administrators can access this page.</div>;
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
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      nl.status === 'published' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {nl.status}
                    </span>
                    <span className="text-[10px] text-white/20 font-bold uppercase">
                      {nl.created_at ? new Date(nl.created_at).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2 line-clamp-2">{nl.title}</h3>
                  <div className="text-sm text-white/40 line-clamp-3 mb-4 whitespace-pre-wrap h-20 overflow-hidden">
                    {nl.content}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* ── Editor View ── */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Editor Sidebar (Generation) */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white/5 border border-white/10 rounded-[32px] p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
                    <SparklesIcon className="w-5 h-5 text-violet-400" />
                    AI Assistant
                  </h3>
                  <p className="text-xs text-white/40 mb-4 leading-relaxed">
                    Enter a topic to generate a premium newsletter draft. Our AI will handle the tone, structure, and formatting.
                  </p>
                  <div className="space-y-3">
                    <textarea 
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                      placeholder="e.g. Upcoming Robotics Workshop for Creative Students..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 transition-all resize-none h-24"
                    />
                    <button 
                      onClick={handleAIGenerate}
                      disabled={generating || !topic}
                      className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-xl text-sm font-black transition-all shadow-xl shadow-violet-900/40 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {generating ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5" />}
                      Generate AI Draft
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/10 space-y-4">
                  <h3 className="text-xs font-bold text-white/20 uppercase tracking-widest">Document Actions</h3>
                  <button 
                    onClick={handleDownloadPDF}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold transition-all border border-white/10"
                  >
                    <PrinterIcon className="w-4 h-4 text-violet-400" /> Print Professional A4
                  </button>
                  {activeNewsletter?.id && (
                    <button 
                      onClick={() => setShowPushModal(true)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 rounded-xl text-sm font-bold transition-all border border-emerald-500/20"
                    >
                      <SpeakerWaveIcon className="w-4 h-4" /> Push to Recipients
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 space-y-6 shadow-2xl">
                <input 
                  type="text"
                  value={activeNewsletter?.title || ''}
                  onChange={e => setActiveNewsletter(p => ({ ...p, title: e.target.value }))}
                  placeholder="Newsletter Title..."
                  className="w-full bg-transparent text-3xl font-black focus:outline-none placeholder-white/10"
                />
                <textarea 
                  value={activeNewsletter?.content || ''}
                  onChange={e => setActiveNewsletter(p => ({ ...p, content: e.target.value }))}
                  placeholder="The concept of the text goes here... Support Markdown."
                  className="w-full bg-transparent text-sm leading-relaxed min-h-[500px] focus:outline-none placeholder-white/5 resize-none border-t border-white/5 pt-6"
                />
                <div className="pt-6 border-t border-white/10 flex justify-end gap-3">
                   <button 
                    onClick={handleSave}
                    disabled={loading || !activeNewsletter?.title}
                    className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl text-sm font-bold transition-all shadow-lg"
                  >
                    {loading ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CheckCircleIcon className="w-5 h-5" />}
                    Save Newsletter
                  </button>
                </div>
              </div>

              {/* Live Preview (A4 Style) */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-white/20 uppercase tracking-widest pl-4">Live A4 Preview</h3>
                <div className="p-8 bg-white/5 border border-white/10 rounded-[40px] shadow-inner overflow-hidden">
                   {/* This is the printable area */}
                  <div ref={pdfRef} className="bg-white text-[#111827] mx-auto overflow-hidden shadow-2xl" style={{ width: '210mm', minHeight: '297mm', padding: '20mm' }}>
                    {/* Branded Letterhead */}
                    <div style={{ borderBottom: '3px solid #1d4ed8', paddingBottom: '20px', marginBottom: '30px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <img src="/logo.png" alt="Logo" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#1d4ed8', letterSpacing: '-0.5px' }}>RILLCOD TECHNOLOGIES</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>Coding Today, Innovating Tomorrow</div>
                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City &nbsp;·&nbsp; 08116600091</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>OFFICIAL NEWSLETTER</div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="max-w-none">
                      <h1 className="text-3xl font-black text-[#111827] mb-8">{activeNewsletter?.title || 'Untitled Newsletter'}</h1>
                      <div className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap font-serif bg-white p-4 rounded-xl border border-gray-100">
                        {activeNewsletter?.content || ''}
                      </div>
                    </div>

                    {/* Signature */}
                    <div style={{ marginTop: '60px', borderTop: '1px solid #e5e7eb', paddingTop: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div>
                          <img src="/images/signature.png" alt="Official Signature" style={{ width: '150px', marginBottom: '10px' }} />
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#111827'  }}>THE ADMINISTRATOR</div>
                          <div style={{ fontSize: '11px', color: '#6b7280'  }}>Rillcod Academy Management</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                           <div style={{ width: '100px', height: '100px', border: '1px solid #f3f4f6', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', textTransform: 'uppercase', fontSize: '10px', color: '#f3f4f6' }}>STAMP SPACE</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

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

      {/* Global CSS for Print and Prose */}
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
