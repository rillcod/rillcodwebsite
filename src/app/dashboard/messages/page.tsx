// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  EnvelopeIcon, PaperAirplaneIcon, MegaphoneIcon, PlusIcon,
  ArrowPathIcon, CheckIcon, TrashIcon, UserIcon,
  ExclamationTriangleIcon, DocumentTextIcon,
} from '@/lib/icons';

type Tab = 'inbox' | 'sent' | 'compose' | 'announcements' | 'newsletters';

export default function MessagesPage() {
  const { profile, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('inbox');
  const [inbox, setInbox] = useState<any[]>([]);
  const [sent, setSent] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [newsletters, setNewsletters] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  // Compose form
  const [compose, setCompose] = useState({ recipient_id: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent2, setSent2] = useState(false);

  // Announcement form
  const [announcement, setAnnouncement] = useState({ title: '', content: '', target_audience: 'all' });
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (authLoading || !profile) return;
    setLoading(true);
    const db = createClient();

    // Logic for user filtering:
    // Admin sees all. Partner schools/teachers see only users in their school.
    let userQuery = db.from('portal_users').select('id, full_name, email, role, school_id').neq('id', profile.id).order('full_name');
    if (!isAdmin && profile.school_id) {
      userQuery = userQuery.eq('school_id', profile.school_id);
    }

    Promise.all([
      db.from('messages').select('*, portal_users!messages_sender_id_fkey(full_name, email, role, school_id)').eq('recipient_id', profile.id).order('created_at', { ascending: false }),
      db.from('messages').select('*, portal_users!messages_recipient_id_fkey(full_name, email, role, school_id)').eq('sender_id', profile.id).order('created_at', { ascending: false }),
      db.from('announcements').select('*, portal_users!announcements_author_id_fkey(full_name, role, school_id)').eq('is_active', true).order('created_at', { ascending: false }),
      db.from('newsletter_delivery').select('*, newsletters(*)').eq('user_id', profile.id).order('delivered_at', { ascending: false }),
      userQuery,
    ]).then(([inbRes, sntRes, annRes, nwlRes, usrRes]) => {
      setInbox(inbRes.data ?? []);
      setSent(sntRes.data ?? []);
      
      // Filter announcements based on school if not admin
      let filteredAnn = annRes.data ?? [];
      if (!isAdmin) {
        filteredAnn = filteredAnn.filter(a => {
           const author: any = a.portal_users;
           const authorSchool = author?.school_id;
           const authorRole = author?.role;
           // Show if from admin OR same school
           return authorRole === 'admin' || authorSchool === profile.school_id;
        });
      }
      setAnnouncements(filteredAnn);
      
      setNewsletters(nwlRes.data ?? []);
      setUsers(usrRes.data ?? []);
      setLoading(false);
    });
  }, [profile?.id, authLoading, profile?.school_id, isAdmin]);

  const markRead = async (msg: any) => {
    if (!msg.is_read) {
      await fetch(`/api/messages/${msg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_read: true }),
      });
      setInbox(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m));
    }
    setSelected(msg);
  };

  const handleSend = async () => {
    if (!compose.recipient_id || !compose.message.trim()) return;
    setSending(true);
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient_id: compose.recipient_id,
        subject: compose.subject.trim() || null,
        message: compose.message.trim(),
      }),
    });
    const j = await res.json();
    if (!res.ok) { alert(j.error || 'Failed to send'); }
    else {
      setSent2(true);
      setCompose({ recipient_id: '', subject: '', message: '' });
      setTimeout(() => { setSent2(false); setTab('sent'); }, 1500);
    }
    setSending(false);
  };

  const handleAnnouncement = async () => {
    if (!announcement.title.trim() || !announcement.content.trim()) return;
    setPosting(true);
    const res = await fetch('/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: announcement.title.trim(),
        content: announcement.content.trim(),
        target_audience: announcement.target_audience,
      }),
    });
    const j = await res.json();
    if (!res.ok) { alert(j.error || 'Failed to post'); }
    else {
      setAnnouncements(prev => [j.data, ...prev]);
      setPosted(true);
      setAnnouncement({ title: '', content: '', target_audience: 'all' });
      setTimeout(() => { setPosted(false); setTab('announcements'); }, 1500);
    }
    setPosting(false);
  };

  const deleteAnnouncement = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    await fetch(`/api/announcements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    });
    setAnnouncements(prev => prev.filter(a => a.id !== id));
  };

  const unread = inbox.filter(m => !m.is_read).length;
  const unreadNewsletters = newsletters.filter(nl => !nl.is_viewed).length;

  const tabs: { key: Tab; label: string; icon: any; count?: number }[] = [
    { key: 'inbox', label: 'Inbox', icon: EnvelopeIcon, count: unread || undefined },
    { key: 'sent', label: 'Sent', icon: PaperAirplaneIcon },
    { key: 'compose', label: 'Compose', icon: PlusIcon },
    { key: 'announcements', label: 'Announcements', icon: MegaphoneIcon },
    { key: 'newsletters', label: 'Newsletters', icon: DocumentTextIcon, count: unreadNewsletters || undefined },
  ];

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[#7a0606] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#05050a] text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">
        
        {/* Navigation Sidebar */}
        <div className="w-full lg:w-64 flex-shrink-0 flex flex-col gap-4">
          <div className="p-4">
            <h1 className="text-2xl font-black tracking-tighter text-white flex items-center gap-2">
              <EnvelopeIcon className="w-6 h-6 text-[#7a0606]" /> Messages
            </h1>
          </div>
          
          <nav className="flex flex-col gap-2">
            {tabs.map(t => (
              <button 
                key={t.key} 
                onClick={() => { setTab(t.key); setSelected(null); }}
                className={`group flex items-center justify-between px-4 py-4 rounded-2xl transition-all duration-300 border ${
                  tab === t.key 
                  ? 'bg-gradient-to-r from-[#7a0606]/20 to-transparent border-[#7a0606]/30 text-white shadow-lg shadow-[#7a0606]/5' 
                  : 'bg-white/[0.02] border-white/5 text-white/40 hover:text-white hover:bg-white/[0.05] hover:border-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <t.icon className={`w-5 h-5 transition-colors ${tab === t.key ? 'text-[#7a0606]' : 'text-white/20 group-hover:text-white/40'}`} />
                  <span className="text-sm font-bold uppercase tracking-widest">{t.label}</span>
                </div>
                {t.count && (
                  <span className="bg-[#7a0606] text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center animate-pulse">
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
          
          <div className="mt-auto p-4 bg-white/[0.01] border border-white/5 rounded-2xl">
             <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-2">Network Status</p>
             <div className="flex items-center gap-2">
               <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
               <span className="text-[11px] font-bold text-emerald-400/80">Encrypted Tunnel Active</span>
             </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 bg-white/[0.02] border border-white/5 rounded-[2.5rem] overflow-hidden flex flex-col backdrop-blur-3xl shadow-2xl relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#7a0606]/40 to-transparent" />
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8">
            
            {/* ── INBOX ─── */}
            {tab === 'inbox' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
                <div className="lg:col-span-5 flex flex-col gap-4">
                  <h3 className="text-xs font-black text-white/20 uppercase tracking-[0.3em] px-2">Recent Correspondence</h3>
                  {inbox.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-3xl opacity-30">
                      <EnvelopeIcon className="w-12 h-12 mb-2" />
                      <p className="text-sm font-bold">No incoming signals</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {inbox.map(msg => (
                        <button key={msg.id} onClick={() => markRead(msg)}
                          className={`group w-full text-left p-5 rounded-3xl border transition-all duration-300 relative ${
                            selected?.id === msg.id 
                            ? 'bg-[#7a0606]/10 border-[#7a0606]/30' 
                            : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]'
                          }`}>
                          <div className="flex items-start gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black shrink-0 shadow-lg ${
                              selected?.id === msg.id ? 'bg-[#7a0606] text-white' : 'bg-white/5 text-white/40 group-hover:text-white/60'
                            }`}>
                              {msg.portal_users?.full_name?.charAt(0) ?? '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                               <div className="flex items-center justify-between gap-2 mb-0.5">
                                 <p className={`text-sm tracking-tight truncate ${!msg.is_read ? 'font-black text-white' : 'font-bold text-white/60'}`}>
                                   {msg.portal_users?.full_name ?? 'Unknown Signal'}
                                 </p>
                                 <span className="text-[10px] text-white/20 font-bold shrink-0">{new Date(msg.created_at).toLocaleDateString()}</span>
                               </div>
                               {msg.subject && <p className="text-[11px] text-[#7a0606] font-black uppercase tracking-tighter truncate">{msg.subject}</p>}
                               <p className="text-xs text-white/30 truncate mt-1 leading-relaxed">{msg.message}</p>
                            </div>
                            {!msg.is_read && <div className="absolute top-4 right-4 w-2 h-2 bg-[#7a0606] rounded-full shadow-[0_0_10px_#7a0606]" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="lg:col-span-7 flex flex-col">
                   {selected ? (
                     <div className="bg-white/[0.04] border border-white/10 rounded-[2rem] p-8 space-y-6 animate-in fade-in slide-in-from-right-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-[#7a0606] rounded-2xl flex items-center justify-center text-xl font-black shadow-xl shadow-[#7a0606]/20">
                              {selected.portal_users?.full_name?.charAt(0) ?? '?'}
                            </div>
                            <div>
                               <p className="text-lg font-black tracking-tight">{selected.portal_users?.full_name}</p>
                               <div className="flex items-center gap-2">
                                 <span className="px-2 py-0.5 bg-white/5 rounded-full text-[10px] font-black text-white/40 uppercase tracking-widest">{selected.portal_users?.role}</span>
                                 <span className="text-[10px] text-white/20 font-bold">{new Date(selected.created_at).toLocaleString()}</span>
                               </div>
                            </div>
                          </div>
                          <button onClick={() => { setCompose(c => ({ ...c, recipient_id: selected.sender_id, subject: `Re: ${selected.subject || 'Message'}` })); setTab('compose'); }}
                            className="p-4 bg-[#7a0606] hover:bg-[#9a0808] text-white rounded-2xl transition-all shadow-lg hover:scale-105 active:scale-95">
                            <PaperAirplaneIcon className="w-5 h-5" />
                          </button>
                        </div>
                        
                        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                        
                        <div className="space-y-4">
                           {selected.subject && (
                             <h4 className="text-xl font-black text-white tracking-tight leading-tight">
                               {selected.subject}
                             </h4>
                           )}
                           <div className="text-sm text-white/60 leading-relaxed font-medium whitespace-pre-wrap selection:bg-[#7a0606] selection:text-white">
                             {selected.message}
                           </div>
                        </div>
                     </div>
                   ) : (
                     <div className="flex-1 flex flex-col items-center justify-center opacity-20">
                        <div className="w-24 h-24 rounded-full border-2 border-dashed border-white mb-4 flex items-center justify-center">
                          <EnvelopeIcon className="w-10 h-10" />
                        </div>
                        <p className="text-sm font-black uppercase tracking-[0.3em]">Encrypted Viewer Offline</p>
                        <p className="text-xs font-bold mt-1">Select a transmission to decrypt</p>
                     </div>
                   )}
                </div>
              </div>
            )}

            {/* ── SENT ─── */}
            {tab === 'sent' && (
              <div className="max-w-3xl mx-auto space-y-6">
                <h3 className="text-xs font-black text-white/20 uppercase tracking-[0.3em] px-2">Outbound Transmissions</h3>
                {sent.length === 0 ? (
                  <div className="py-20 text-center bg-white/[0.01] border border-dashed border-white/10 rounded-3xl opacity-30 mt-4">
                     <PaperAirplaneIcon className="w-12 h-12 mx-auto mb-4" />
                     <p className="text-sm font-bold uppercase tracking-widest">Hangar Empty</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {sent.map(msg => (
                      <div key={msg.id} className="group p-6 bg-white/[0.02] border border-white/5 rounded-3xl hover:bg-white/[0.04] transition-all relative overflow-hidden">
                        <div className="flex items-start gap-4">
                           <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center shrink-0">
                              <UserIcon className="w-6 h-6 text-white/20" />
                           </div>
                           <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-black tracking-tight text-white/80">To: {msg.portal_users?.full_name ?? 'Unknown Target'}</p>
                                <span className="text-[10px] text-white/20 font-bold">{new Date(msg.created_at).toLocaleDateString()}</span>
                              </div>
                              {msg.subject && <p className="text-[10px] text-[#7a0606] font-black uppercase tracking-widest mb-1">{msg.subject}</p>}
                              <p className="text-xs text-white/40 truncate leading-relaxed">{msg.message}</p>
                              <div className="flex items-center gap-2 mt-3">
                                 <div className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${msg.is_read ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-white/30'}`}>
                                    {msg.is_read ? 'Signal Confirmed' : 'Transmitted'}
                                 </div>
                              </div>
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── COMPOSE ─── */}
            {tab === 'compose' && (
              <div className="max-w-3xl mx-auto space-y-8 py-4 animate-in fade-in zoom-in-95 duration-500">
                <div className="space-y-2">
                   <h3 className="text-3xl font-black tracking-tighter text-white">New Transmission</h3>
                   <p className="text-sm text-white/30 font-bold uppercase tracking-widest">Drafting secure message</p>
                </div>
                
                <div className="space-y-6">
                  <div className="relative group">
                    <label className="absolute -top-2.5 left-4 px-2 bg-[#050510] text-[10px] font-black text-[#7a0606] uppercase tracking-[0.2em] group-focus-within:text-white transition-colors">Target Recipient</label>
                    <select 
                      value={compose.recipient_id}
                      onChange={e => setCompose(c => ({ ...c, recipient_id: e.target.value }))}
                      className="w-full px-6 py-5 bg-white/[0.03] border border-white/10 rounded-3xl text-sm text-white focus:outline-none focus:border-[#7a0606] transition-all cursor-pointer appearance-none shadow-xl">
                      <option value="">Select target coordinates...</option>
                      {['student', 'teacher', 'school', 'admin'].map(role => {
                         const roleUsers = users.filter(u => u.role === role);
                         if (roleUsers.length === 0) return null;
                         return (
                           <optgroup key={role} label={role === 'student' ? 'CHILDREN / STUDENTS' : role.toUpperCase() + 'S'}>
                             {roleUsers.map(u => (
                               <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                             ))}
                           </optgroup>
                         );
                      })}
                    </select>
                  </div>

                  <div className="relative group">
                    <label className="absolute -top-2.5 left-4 px-2 bg-[#050510] text-[10px] font-black text-white/20 uppercase tracking-[0.2em] group-focus-within:text-[#7a0606] transition-colors">Heading / Subject</label>
                    <input 
                      type="text" 
                      value={compose.subject}
                      onChange={e => setCompose(c => ({ ...c, subject: e.target.value }))}
                      placeholder="Transmission summary..."
                      className="w-full px-6 py-5 bg-white/[0.03] border border-white/10 rounded-3xl text-sm text-white placeholder-white/10 focus:outline-none focus:border-[#7a0606] transition-all shadow-xl" />
                  </div>

                  <div className="relative group">
                    <label className="absolute -top-2.5 left-4 px-2 bg-[#050510] text-[10px] font-black text-white/20 uppercase tracking-[0.2em] group-focus-within:text-[#7a0606] transition-colors">Signal Content</label>
                    <textarea 
                      rows={8} 
                      value={compose.message}
                      onChange={e => setCompose(c => ({ ...c, message: e.target.value }))}
                      placeholder="Type secure transmission..."
                      className="w-full px-6 py-5 bg-white/[0.03] border border-white/10 rounded-3xl text-sm text-white placeholder-white/10 focus:outline-none focus:border-[#7a0606] transition-all resize-none shadow-xl" />
                  </div>

                  <button 
                    onClick={handleSend} 
                    disabled={sending || !compose.recipient_id || !compose.message.trim()}
                    className="w-full py-5 bg-[#7a0606] hover:bg-[#9a0808] text-white text-base font-black uppercase tracking-[0.3em] rounded-3xl transition-all shadow-2xl disabled:opacity-50 active:scale-[0.98] group flex items-center justify-center gap-4">
                    {sending ? (
                      <ArrowPathIcon className="w-6 h-6 animate-spin" />
                    ) : sent2 ? (
                      <CheckIcon className="w-6 h-6" />
                    ) : (
                      <PaperAirplaneIcon className="w-6 h-6 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                    )}
                    {sending ? 'Processing...' : sent2 ? 'Successfully Transmitted' : 'Initiate Send'}
                  </button>
                </div>
              </div>
            )}

            {/* ── ANNOUNCEMENTS ─── */}
            {tab === 'announcements' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-12 flex items-center justify-between mb-2">
                   <h3 className="text-xs font-black text-white/20 uppercase tracking-[0.3em] px-2">Official Academy Bulletins</h3>
                </div>

                {isStaff && (
                  <div className="lg:col-span-12 bg-white/[0.03] border border-white/5 rounded-[2.5rem] p-8 space-y-6 shadow-2xl mb-8">
                    <div className="space-y-1">
                      <h4 className="text-xl font-black text-white tracking-tight">Post Broadcast</h4>
                      <p className="text-[10px] text-[#7a0606] font-black uppercase tracking-widest">Internal Distribution System</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <input 
                         type="text" 
                         value={announcement.title}
                         onChange={e => setAnnouncement(a => ({ ...a, title: e.target.value }))}
                         placeholder="Broadcast Title..."
                         className="w-full px-5 py-4 bg-white/5 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-[#7a0606] transition-all" />
                       
                       <select 
                         value={announcement.target_audience}
                         onChange={e => setAnnouncement(a => ({ ...a, target_audience: e.target.value }))}
                         className="w-full px-5 py-4 bg-white/5 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-[#7a0606] transition-all cursor-pointer">
                         {isAdmin ? (
                           <>
                             <option value="all">Global (All Users)</option>
                             <option value="students">All Students</option>
                             <option value="teachers">All Teachers</option>
                             <option value="schools">All Partner Schools</option>
                             <option value="admins">Admin Nexus</option>
                           </>
                         ) : (
                           <>
                             <option value="all">Everyone in School</option>
                             <option value="students">My Students</option>
                             <option value="teachers">School Staff</option>
                           </>
                         )}
                       </select>
                    </div>

                    <textarea 
                      rows={4} 
                      value={announcement.content}
                      onChange={e => setAnnouncement(a => ({ ...a, content: e.target.value }))}
                      placeholder="Content breakdown..."
                      className="w-full px-5 py-4 bg-white/5 border border-white/5 rounded-2xl text-sm focus:outline-none focus:border-[#7a0606] transition-all resize-none" />

                    <button 
                      onClick={handleAnnouncement}
                      disabled={posting || !announcement.title.trim() || !announcement.content.trim()}
                      className="px-8 py-4 bg-[#7a0606] hover:bg-[#9a0808] text-white text-xs font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl disabled:opacity-50">
                       {posting ? 'Transmitting...' : posted ? 'Broadcast Live' : 'Publish Bulletin'}
                    </button>
                  </div>
                )}

                <div className="lg:col-span-12 space-y-4">
                    {announcements.map(ann => (
                      <div key={ann.id} className="group bg-white/[0.02] border border-white/5 rounded-[2rem] p-7 space-y-4 hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300 relative shadow-lg">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-xl bg-[#7a0606]/10 flex items-center justify-center border border-[#7a0606]/20">
                                <MegaphoneIcon className="w-5 h-5 text-[#7a0606]" />
                             </div>
                             <div>
                                <h4 className="font-black text-white text-base tracking-tight leading-none group-hover:text-[#7a0606] transition-colors">{ann.title}</h4>
                                <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest mt-1">Author: {ann.portal_users?.full_name ?? 'Nexus Admin'}</p>
                             </div>
                          </div>
                          <div className="flex items-center gap-2">
                             <span className="px-2 py-0.5 bg-white/5 rounded-full text-[9px] font-black text-white/40 uppercase tracking-widest">{ann.target_audience}</span>
                             {isStaff && (isAdmin || ann.author_id === profile?.id) && (
                               <button onClick={() => deleteAnnouncement(ann.id)}
                                 className="w-8 h-8 flex items-center justify-center text-white/20 hover:text-rose-400 bg-white/5 hover:bg-rose-500/10 rounded-lg transition-all">
                                 <TrashIcon className="w-4 h-4" />
                               </button>
                             )}
                          </div>
                        </div>
                        <p className="text-[13px] text-white/60 leading-relaxed font-medium selection:bg-[#7a0606] selection:text-white">{ann.content}</p>
                        <div className="pt-4 mt-2 border-t border-white/[0.03] flex items-center justify-between">
                           <div className="flex items-center gap-2">
                              <span className="text-[10px] text-white/20 font-bold">{new Date(ann.created_at).toLocaleDateString()}</span>
                              <div className="w-1 h-1 bg-white/10 rounded-full" />
                              <span className="text-[10px] text-white/20 font-black uppercase tracking-tighter italic">Verified Bulletin</span>
                           </div>
                        </div>
                      </div>
                    ))}
                    {announcements.length === 0 && (
                      <div className="text-center py-24 border border-dashed border-white/10 rounded-[2.5rem] opacity-30">
                        <MegaphoneIcon className="w-16 h-16 mx-auto mb-4" />
                        <p className="font-bold uppercase tracking-[0.4em] text-sm">Silence in Channel</p>
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* ── NEWSLETTERS ─── */}
            {tab === 'newsletters' && (
              <div className="space-y-8 py-4 animate-in fade-in duration-700">
                <div className="space-y-1">
                   <h3 className="text-4xl font-black tracking-tighter text-white">Rillcod <span className="text-[#FF914D]">Pulse</span></h3>
                   <p className="text-sm text-white/30 font-bold uppercase tracking-[0.3em]">Exclusive Digital Editions</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {newsletters.map(nlItem => {
                    const nl = nlItem.newsletters;
                    if (!nl) return null;
                    return (
                      <div key={nl.id} className="group relative bg-[#0d0d16] border border-white/5 rounded-[2.5rem] p-1 transition-all duration-500 hover:shadow-[0_40px_80px_rgba(255,145,77,0.05)] hover:border-[#FF914D]/20 overflow-hidden">
                        <div className="relative overflow-hidden rounded-[2.25rem] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-8 h-full flex flex-col">
                           <div className="flex items-center justify-between mb-8">
                             <div className="px-3 py-1 bg-[#FF914D]/10 rounded-full border border-[#FF914D]/20">
                               <span className="text-[9px] font-black uppercase tracking-widest text-[#FF914D]">Premium Edition</span>
                             </div>
                             <span className="text-[10px] text-white/20 font-bold">{new Date(nl.published_at || nl.created_at).toLocaleDateString()}</span>
                           </div>
                           
                           <div className="mb-6 flex-1">
                             <h4 className="text-2xl font-black text-white mb-3 group-hover:text-[#FF914D] transition-colors line-clamp-2 leading-tight tracking-tight">{nl.title}</h4>
                             <p className="text-[13px] text-white/40 line-clamp-4 leading-relaxed font-medium mb-6">{nl.content}</p>
                           </div>

                           <button 
                             onClick={() => {
                               const params = new URLSearchParams(window.location.search);
                               params.set('newsletterId', nl.id);
                               window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);
                               window.dispatchEvent(new PopStateEvent('popstate'));
                             }}
                             className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-300 hover:bg-[#FF914D] hover:text-[#05050a] hover:border-[#FF914D] hover:scale-[1.02] flex items-center justify-center gap-2 group-hover:shadow-[0_10px_30px_rgba(255,145,77,0.2)]">
                             <DocumentTextIcon className="w-4 h-4" /> Open Signal
                           </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {newsletters.length === 0 && (
                  <div className="text-center py-32 bg-white/[0.01] border border-dashed border-white/10 rounded-[3rem] opacity-30 flex flex-col items-center">
                    <DocumentTextIcon className="w-20 h-20 mb-6" />
                    <p className="text-base font-black uppercase tracking-[0.5em]">No Editions Found</p>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

