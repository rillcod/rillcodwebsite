// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  EnvelopeIcon, PaperAirplaneIcon, MegaphoneIcon, PlusIcon,
  ArrowPathIcon, CheckIcon, TrashIcon, UserIcon,
  ExclamationTriangleIcon, DocumentTextIcon, XMarkIcon,
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

  // Announcement read tracking
  const [readAnnouncements, setReadAnnouncements] = useState<Set<string>>(new Set());

  // Announcement form
  const [announcement, setAnnouncement] = useState({ title: '', content: '', target_audience: 'all' });
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';
  const isAdmin = profile?.role === 'admin';

  // Handle ?to=<userId> deep-link from admin parent list → open compose pre-filled
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const to = params.get('to');
    if (to) {
      setTab('compose');
      setCompose(f => ({ ...f, recipient_id: to }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [classFilter, setClassFilter] = useState('all');
  const [userSearch, setUserSearch] = useState('');
  const [openNewsletter, setOpenNewsletter] = useState<any>(null);

  useEffect(() => {
    if (authLoading || !profile) return;
    setLoading(true);
    const db = createClient();

    // 1. Fetch users with student metadata for class filtering
    let userQuery = db.from('portal_users')
      .select('id, full_name, email, role, school_id, students!user_id(current_class, grade_level, school_id)')
      .neq('id', profile.id)
      .order('full_name');

    Promise.all([
      db.from('messages').select('*, portal_users!messages_sender_id_fkey(full_name, email, role, school_id)').eq('recipient_id', profile.id).order('created_at', { ascending: false }),
      db.from('messages').select('*, portal_users!messages_recipient_id_fkey(full_name, email, role, school_id)').eq('sender_id', profile.id).order('created_at', { ascending: false }),
      db.from('announcements').select('*, portal_users!announcements_author_id_fkey(full_name, role, school_id)').eq('is_active', true).order('created_at', { ascending: false }),
      db.from('newsletter_delivery').select('*, newsletters(*)').eq('user_id', profile.id).order('delivered_at', { ascending: false }),
      userQuery,
      db.from('teacher_schools').select('teacher_id, school_id'), // Fetch all mappings for correct filtering
      db.from('classes').select('id, name, teacher_id, school_id'),
      db.from('students').select('*').eq('user_id', profile.id).maybeSingle(),
    ]).then(([inbRes, sntRes, annRes, nwlRes, usrRes, tschRes, clsRes, stdRes]) => {
      setInbox(inbRes.data ?? []);
      setSent(sntRes.data ?? []);
      
      const allTeacherSchools = tschRes.data ?? [];
      const myTeacherSchools = new Set(allTeacherSchools.filter(ts => ts.teacher_id === profile.id).map(ts => ts.school_id));
      const myClass = stdRes.data?.current_class || stdRes.data?.grade_level;
      
      const allUsers = (usrRes.data ?? []).map((u: any) => {
        const std = u.students?.[0]; // due to the join
        return {
          ...u,
          current_class: std?.current_class || std?.grade_level || null,
          student_school_id: std?.school_id || u.school_id
        };
      });

      // Filter users based on assignments
      const filteredUsers = allUsers.filter((u: any) => {
        if (isAdmin) return true;
        
        // School Owner: see their students + their assigned teachers
        if (profile.role === 'school') {
          const isMyStudent = u.role === 'student' && u.school_id === profile.school_id;
          const isMyTeacher = u.role === 'teacher' && (
            u.school_id === profile.school_id || 
            allTeacherSchools.some(ts => ts.teacher_id === u.id && ts.school_id === profile.school_id)
          );
          return isMyStudent || isMyTeacher;
        }

        // Teacher: see school owners + students in their assigned schools
        if (profile.role === 'teacher') {
          const inMySchool = u.school_id === profile.school_id || myTeacherSchools.has(u.school_id);
          const isOwner = u.role === 'school' && inMySchool;
          const isMyStudent = u.role === 'student' && inMySchool;
          return isOwner || isMyStudent;
        }

        // Student: see class fellows + teachers in their school
        if (profile.role === 'student') {
           const isClassmate = u.role === 'student' && u.school_id === profile.school_id && u.current_class === myClass;
           const isMyTeacher = u.role === 'teacher' && u.school_id === profile.school_id;
           const isOwner = u.role === 'school' && u.school_id === profile.school_id;
           return isClassmate || isMyTeacher || isOwner;
        }
        
        return u.school_id === profile.school_id;
      });

      setUsers(filteredUsers);

      // Filter announcements based on school if not admin
      let filteredAnn = annRes.data ?? [];
      if (!isAdmin) {
        filteredAnn = filteredAnn.filter(a => {
           const author: any = a.portal_users;
           return author?.role === 'admin' || author?.school_id === profile.school_id || myTeacherSchools.has(author?.school_id);
        });
      }
      setAnnouncements(filteredAnn);

      // Load already-read announcement IDs for this user
      if (profile?.id) {
        createClient().from('announcement_reads')
          .select('announcement_id')
          .eq('portal_user_id', profile.id)
          .then(({ data: reads }) => {
            setReadAnnouncements(new Set((reads ?? []).map((r: any) => r.announcement_id)));
          });
      }

      setNewsletters(nwlRes.data ?? []);
      setLoading(false);
    });
  }, [profile?.id, authLoading, profile?.school_id, profile?.role, isAdmin]);

  const handleDeleteMessage = async (id: string) => {
    if (!confirm('Delete this message?')) return;
    const res = await fetch(`/api/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_deleted: true }),
    });
    if (res.ok) {
      setInbox(prev => prev.filter(m => m.id !== id));
      if (selected?.id === id) setSelected(null);
    }
  };

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

  // Role-filtered recipients for compose
  const composeRecipients = (() => {
    const base = users.filter(u => {
      const matchSearch = !userSearch || u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase());
      const matchClass = classFilter === 'all' || u.current_class === classFilter;
      return matchSearch && matchClass;
    });
    // Students can only message teachers and school staff, not other students
    if (profile?.role === 'student') return base.filter((u: any) => u.role !== 'student');
    return base;
  })();

  const tabs: { key: Tab; label: string; icon: any; count?: number }[] = [
    { key: 'inbox', label: 'Inbox', icon: EnvelopeIcon, count: unread || undefined },
    { key: 'sent', label: 'Sent', icon: PaperAirplaneIcon },
    { key: 'compose', label: 'Compose', icon: PlusIcon },
    profile?.role === 'admin' || profile?.role === 'teacher' ? { key: 'announcements', label: 'Announcements', icon: MegaphoneIcon } : null,
    { key: 'newsletters', label: 'Newsletters', icon: DocumentTextIcon, count: unreadNewsletters || undefined },
  ].filter(Boolean) as any;

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[#7a0606] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">
        
        {/* Navigation Sidebar */}
        <div className="w-full lg:w-64 flex-shrink-0 flex flex-col gap-4">
          <div className="p-4">
            <h1 className="text-2xl font-black tracking-tighter text-foreground flex items-center gap-2">
              <EnvelopeIcon className="w-6 h-6 text-[#7a0606]" /> Messages
            </h1>
          </div>
          
          <nav className="flex flex-col gap-2">
            {tabs.map(t => (
              <button 
                key={t.key} 
                onClick={() => { setTab(t.key); setSelected(null); }}
                className={`group flex items-center justify-between px-4 py-4 rounded-none transition-all duration-300 border ${
                  tab === t.key 
                  ? 'bg-gradient-to-r from-[#7a0606]/20 to-transparent border-[#7a0606]/30 text-foreground shadow-lg shadow-[#7a0606]/5' 
                  : 'bg-white/[0.02] border-border text-muted-foreground hover:text-foreground hover:bg-white/[0.05] hover:border-border'
                }`}
              >
                <div className="flex items-center gap-3">
                  <t.icon className={`w-5 h-5 transition-colors ${tab === t.key ? 'text-[#7a0606]' : 'text-muted-foreground group-hover:text-muted-foreground'}`} />
                  <span className="text-sm font-bold uppercase tracking-widest">{t.label}</span>
                </div>
                {t.count && (
                  <span className="bg-[#7a0606] text-foreground text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center animate-pulse">
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
          
          <div className="mt-auto p-4 bg-white/[0.01] border border-border rounded-none">
             <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-2">Network Status</p>
             <div className="flex items-center gap-2">
               <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
               <span className="text-[11px] font-bold text-emerald-400/80">Encrypted Tunnel Active</span>
             </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 bg-white/[0.02] border border-border rounded-[2.5rem] overflow-hidden flex flex-col backdrop-blur-3xl shadow-2xl relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#7a0606]/40 to-transparent" />
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8">
            
            {/* ── INBOX ─── */}
            {tab === 'inbox' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
                <div className="lg:col-span-5 flex flex-col gap-4">
                  <h3 className="text-xs font-black text-muted-foreground uppercase tracking-[0.3em] px-2">Inbox</h3>
                  {inbox.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-border rounded-none opacity-30">
                      <EnvelopeIcon className="w-12 h-12 mb-2" />
                      <p className="text-sm font-bold">No messages yet</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {inbox.map(msg => (
                        <div key={msg.id} onClick={() => markRead(msg)}
                          className={`group w-full text-left p-5 rounded-none border transition-all duration-300 relative cursor-pointer ${
                            selected?.id === msg.id
                            ? 'bg-[#7a0606]/10 border-[#7a0606]/30'
                            : 'bg-white/[0.02] border-border hover:border-border hover:bg-white/[0.04]'
                          }`}>
                          <div className="flex items-start gap-4">
                            <div className={`w-12 h-12 rounded-none flex items-center justify-center text-lg font-black shrink-0 shadow-lg ${
                              selected?.id === msg.id ? 'bg-[#7a0606] text-foreground' : 'bg-card shadow-sm text-muted-foreground group-hover:text-muted-foreground'
                            }`}>
                              {msg.portal_users?.full_name?.charAt(0) ?? '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                               <div className="flex items-center justify-between gap-2 mb-0.5">
                                 <p className={`text-sm tracking-tight truncate ${!msg.is_read ? 'font-black text-foreground' : 'font-bold text-muted-foreground'}`}>
                                   {msg.portal_users?.full_name ?? 'Unknown Signal'}
                                 </p>
                                 <span className="text-[10px] text-muted-foreground font-bold shrink-0">{new Date(msg.created_at).toLocaleDateString()}</span>
                               </div>
                               {msg.subject && <p className="text-[11px] text-[#7a0606] font-black uppercase tracking-tighter truncate">{msg.subject}</p>}
                               <p className="text-xs text-muted-foreground truncate mt-1 leading-relaxed">{msg.message}</p>
                            </div>
                            {!msg.is_read && <div className="absolute top-4 right-4 w-2 h-2 bg-[#7a0606] rounded-full shadow-[0_0_10px_#7a0606]" />}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteMessage(msg.id); }}
                            className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-400 transition-all">
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="lg:col-span-7 flex flex-col">
                   {selected ? (
                     <div className="bg-white/[0.04] border border-border rounded-[2rem] p-8 space-y-6 animate-in fade-in slide-in-from-right-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-[#7a0606] rounded-none flex items-center justify-center text-xl font-black shadow-xl shadow-[#7a0606]/20">
                              {selected.portal_users?.full_name?.charAt(0) ?? '?'}
                            </div>
                            <div>
                               <p className="text-lg font-black tracking-tight">{selected.portal_users?.full_name}</p>
                               <div className="flex items-center gap-2">
                                 <span className="px-2 py-0.5 bg-card shadow-sm rounded-full text-[10px] font-black text-muted-foreground uppercase tracking-widest">{selected.portal_users?.role}</span>
                                 <span className="text-[10px] text-muted-foreground font-bold">{new Date(selected.created_at).toLocaleString()}</span>
                               </div>
                            </div>
                          </div>
                          <button onClick={() => { setCompose(c => ({ ...c, recipient_id: selected.sender_id, subject: `Re: ${selected.subject || 'Message'}` })); setTab('compose'); }}
                            className="p-4 bg-[#7a0606] hover:bg-[#9a0808] text-foreground rounded-none transition-all shadow-lg hover:scale-105 active:scale-95">
                            <PaperAirplaneIcon className="w-5 h-5" />
                          </button>
                        </div>
                        
                        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                        
                        <div className="space-y-4">
                           {selected.subject && (
                             <h4 className="text-xl font-black text-foreground tracking-tight leading-tight">
                               {selected.subject}
                             </h4>
                           )}
                           <div className="text-sm text-muted-foreground leading-relaxed font-medium whitespace-pre-wrap selection:bg-[#7a0606] selection:text-foreground">
                             {selected.message}
                           </div>
                        </div>
                     </div>
                   ) : (
                     <div className="flex-1 flex flex-col items-center justify-center opacity-20">
                        <div className="w-24 h-24 rounded-full border-2 border-dashed border-border mb-4 flex items-center justify-center">
                          <EnvelopeIcon className="w-10 h-10" />
                        </div>
                        <p className="text-sm font-black uppercase tracking-[0.3em]">No message selected</p>
                        <p className="text-xs font-bold mt-1">Click a message to read it</p>
                     </div>
                   )}
                </div>
              </div>
            )}

            {/* ── SENT ─── */}
            {tab === 'sent' && (
              <div className="max-w-3xl mx-auto space-y-6">
                <h3 className="text-xs font-black text-muted-foreground uppercase tracking-[0.3em] px-2">Sent Messages</h3>
                {sent.length === 0 ? (
                  <div className="py-20 text-center bg-white/[0.01] border border-dashed border-border rounded-none opacity-30 mt-4">
                     <PaperAirplaneIcon className="w-12 h-12 mx-auto mb-4" />
                     <p className="text-sm font-bold uppercase tracking-widest">No sent messages</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {sent.map(msg => (
                      <div key={msg.id} className="group p-6 bg-white/[0.02] border border-border rounded-none hover:bg-white/[0.04] transition-all relative overflow-hidden">
                        <div className="flex items-start gap-4">
                           <div className="w-12 h-12 rounded-none bg-card shadow-sm flex items-center justify-center shrink-0">
                              <UserIcon className="w-6 h-6 text-muted-foreground" />
                           </div>
                           <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-black tracking-tight text-muted-foreground">To: {msg.portal_users?.full_name ?? 'Unknown Target'}</p>
                                <span className="text-[10px] text-muted-foreground font-bold">{new Date(msg.created_at).toLocaleDateString()}</span>
                              </div>
                              {msg.subject && <p className="text-[10px] text-[#7a0606] font-black uppercase tracking-widest mb-1">{msg.subject}</p>}
                              <p className="text-xs text-muted-foreground truncate leading-relaxed">{msg.message}</p>
                              <div className="flex items-center gap-2 mt-3">
                                 <div className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${msg.is_read ? 'bg-emerald-500/10 text-emerald-400' : 'bg-card shadow-sm text-muted-foreground'}`}>
                                    {msg.is_read ? 'Read' : 'Delivered'}
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
              <div className="max-w-2xl mx-auto space-y-5 py-2">
                <div>
                  <h3 className="text-lg font-bold text-foreground">New Message</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {profile?.role === 'student'
                      ? 'Send a message to your teacher or school coordinator'
                      : 'Send a direct message to a member of your school community'}
                  </p>
                </div>

                {/* Recipient row */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">To</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={compose.recipient_id}
                      onChange={e => setCompose(c => ({ ...c, recipient_id: e.target.value }))}
                      className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-none text-sm text-foreground focus:outline-none focus:border-[#7a0606] transition-all">
                      <option value="">Select recipient…</option>
                      {(() => {
                        const grouped: Record<string, any[]> = {};
                        composeRecipients.forEach((u: any) => {
                          const key = u.role === 'student'
                            ? (u.current_class ? `Students — ${u.current_class}` : 'Students')
                            : u.role === 'teacher' ? 'Teachers'
                            : u.role === 'school' ? 'School Coordinators'
                            : 'Administrators';
                          if (!grouped[key]) grouped[key] = [];
                          grouped[key].push(u);
                        });
                        return Object.entries(grouped).map(([grp, members]) => (
                          <optgroup key={grp} label={grp}>
                            {members.map((u: any) => (
                              <option key={u.id} value={u.id}>
                                {u.full_name}{u.current_class ? ` (${u.current_class})` : ''}
                              </option>
                            ))}
                          </optgroup>
                        ));
                      })()}
                    </select>
                    <input
                      type="text"
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      placeholder="Search name…"
                      className="w-full sm:w-40 px-3 py-2.5 bg-white/5 border border-white/10 rounded-none text-xs text-foreground focus:outline-none focus:border-[#7a0606]"
                    />
                    {isStaff && (
                      <select
                        value={classFilter}
                        onChange={e => setClassFilter(e.target.value)}
                        className="w-full sm:w-36 px-3 py-2.5 bg-white/5 border border-white/10 rounded-none text-xs text-muted-foreground focus:outline-none">
                        <option value="all">All Classes</option>
                        {Array.from(new Set(users.filter((u: any) => u.current_class).map((u: any) => u.current_class))).sort().map(c => (
                          <option key={c as string} value={c as string}>{c as string}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Subject */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Subject <span className="normal-case font-normal">(optional)</span></label>
                  <input
                    type="text"
                    value={compose.subject}
                    onChange={e => setCompose(c => ({ ...c, subject: e.target.value }))}
                    placeholder="e.g. Question about homework"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-[#7a0606] transition-all"
                  />
                </div>

                {/* Message */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Message</label>
                  <textarea
                    rows={7}
                    value={compose.message}
                    onChange={e => setCompose(c => ({ ...c, message: e.target.value }))}
                    placeholder="Write your message here…"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-[#7a0606] transition-all resize-none"
                  />
                </div>

                <button
                  onClick={handleSend}
                  disabled={sending || !compose.recipient_id || !compose.message.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#7a0606] hover:bg-[#9a0808] text-white text-sm font-bold rounded-none transition-all disabled:opacity-50">
                  {sending ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> :
                   sent2 ? <CheckIcon className="w-4 h-4" /> :
                   <PaperAirplaneIcon className="w-4 h-4" />}
                  {sending ? 'Sending…' : sent2 ? 'Sent!' : 'Send Message'}
                </button>
              </div>
            )}

            {/* ── ANNOUNCEMENTS ─── */}
            {tab === 'announcements' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-12 flex items-center justify-between mb-2">
                   <h3 className="text-xs font-black text-muted-foreground uppercase tracking-[0.3em] px-2">Announcements</h3>
                </div>

                {(profile?.role === 'admin' || profile?.role === 'teacher') && (
                  <div className="lg:col-span-12 bg-white/[0.03] border border-border rounded-none p-6 space-y-5 shadow-2xl mb-6">
                    <div className="space-y-0.5">
                      <h4 className="text-base font-bold text-foreground">Post Announcement</h4>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Broadcast to your school</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <input 
                         type="text" 
                         value={announcement.title}
                         onChange={e => setAnnouncement(a => ({ ...a, title: e.target.value }))}
                         placeholder="Broadcast Title..."
                         className="w-full px-5 py-4 bg-card shadow-sm border border-border rounded-none text-sm focus:outline-none focus:border-[#7a0606] transition-all" />
                       
                       <select 
                         value={announcement.target_audience}
                         onChange={e => setAnnouncement(a => ({ ...a, target_audience: e.target.value }))}
                         className="w-full px-5 py-4 bg-card shadow-sm border border-border rounded-none text-sm focus:outline-none focus:border-[#7a0606] transition-all cursor-pointer">
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
                      className="w-full px-5 py-4 bg-card shadow-sm border border-border rounded-none text-sm focus:outline-none focus:border-[#7a0606] transition-all resize-none" />

                    <button 
                      onClick={handleAnnouncement}
                      disabled={posting || !announcement.title.trim() || !announcement.content.trim()}
                      className="px-8 py-4 bg-[#7a0606] hover:bg-[#9a0808] text-foreground text-xs font-black uppercase tracking-[0.2em] rounded-none transition-all shadow-xl disabled:opacity-50">
                       {posting ? 'Posting…' : posted ? 'Posted!' : 'Post Announcement'}
                    </button>
                  </div>
                )}

                <div className="lg:col-span-12 space-y-4">
                    {announcements.map(ann => {
                      const isRead = readAnnouncements.has(ann.id);
                      const markRead = () => {
                        if (isRead || !profile?.id) return;
                        setReadAnnouncements(prev => new Set([...prev, ann.id]));
                        createClient().from('announcement_reads').upsert(
                          { portal_user_id: profile.id, announcement_id: ann.id },
                          { onConflict: 'portal_user_id,announcement_id' }
                        ).then(() => {});
                      };
                      return (
                      <div key={ann.id} onClick={markRead}
                        className={`group bg-white/[0.02] border rounded-[2rem] p-7 space-y-4 hover:bg-white/[0.04] transition-all duration-300 relative shadow-lg cursor-pointer ${isRead ? 'border-border opacity-70' : 'border-[#7a0606]/30'}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                             <div className={`w-10 h-10 rounded-none flex items-center justify-center border ${isRead ? 'bg-muted border-border' : 'bg-[#7a0606]/10 border-[#7a0606]/20'}`}>
                                <MegaphoneIcon className={`w-5 h-5 ${isRead ? 'text-muted-foreground' : 'text-[#7a0606]'}`} />
                             </div>
                             <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-black text-foreground text-base tracking-tight leading-none group-hover:text-[#7a0606] transition-colors">{ann.title}</h4>
                                  {!isRead && <span className="w-2 h-2 rounded-full bg-[#7a0606] flex-shrink-0" title="Unread" />}
                                </div>
                                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Author: {ann.portal_users?.full_name ?? 'Nexus Admin'}</p>
                             </div>
                          </div>
                          <div className="flex items-center gap-2">
                             {isRead && <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Read</span>}
                             <span className="px-2 py-0.5 bg-card shadow-sm rounded-full text-[9px] font-black text-muted-foreground uppercase tracking-widest">{ann.target_audience}</span>
                             {isStaff && (isAdmin || ann.author_id === profile?.id) && (
                               <button onClick={e => { e.stopPropagation(); deleteAnnouncement(ann.id); }}
                                 className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-rose-400 bg-card shadow-sm hover:bg-rose-500/10 rounded-none transition-all">
                                 <TrashIcon className="w-4 h-4" />
                               </button>
                             )}
                          </div>
                        </div>
                        <p className="text-[13px] text-muted-foreground leading-relaxed font-medium selection:bg-[#7a0606] selection:text-foreground">{ann.content}</p>
                        <div className="pt-4 mt-2 border-t border-border/[0.03] flex items-center justify-between">
                           <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground font-bold">{new Date(ann.created_at).toLocaleDateString()}</span>
                              <div className="w-1 h-1 bg-muted rounded-full" />
                              <span className="text-[10px] text-muted-foreground font-black uppercase tracking-tighter italic">Verified Bulletin</span>
                           </div>
                           {!isRead && <span className="text-[9px] text-[#7a0606] font-black uppercase tracking-wider">Click to mark as read</span>}
                        </div>
                      </div>
                      );
                    })}
                    {announcements.length === 0 && (
                      <div className="text-center py-24 border border-dashed border-border rounded-[2.5rem] opacity-30">
                        <MegaphoneIcon className="w-16 h-16 mx-auto mb-4" />
                        <p className="font-bold uppercase tracking-[0.4em] text-sm">No announcements yet</p>
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* ── NEWSLETTERS ─── */}
            {tab === 'newsletters' && (
              <div className="space-y-8 py-4 animate-in fade-in duration-700">
                <div className="space-y-1">
                   <h3 className="text-4xl font-black tracking-tighter text-foreground">Rillcod <span className="text-[#FF914D]">Pulse</span></h3>
                   <p className="text-sm text-muted-foreground font-bold uppercase tracking-[0.3em]">Exclusive Digital Editions</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {newsletters.map(nlItem => {
                    const nl = nlItem.newsletters;
                    if (!nl) return null;
                    return (
                      <div key={nl.id} className="group relative bg-[#0d0d16] border border-border rounded-[2.5rem] p-1 transition-all duration-500 hover:shadow-[0_40px_80px_rgba(255,145,77,0.05)] hover:border-[#FF914D]/20 overflow-hidden">
                        <div className="relative overflow-hidden rounded-[2.25rem] bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-8 h-full flex flex-col">
                           <div className="flex items-center justify-between mb-8">
                             <div className="px-3 py-1 bg-[#FF914D]/10 rounded-full border border-[#FF914D]/20">
                               <span className="text-[9px] font-black uppercase tracking-widest text-[#FF914D]">Premium Edition</span>
                             </div>
                             <span className="text-[10px] text-muted-foreground font-bold">{new Date(nl.published_at || nl.created_at).toLocaleDateString()}</span>
                           </div>
                           
                           <div className="mb-6 flex-1">
                             <h4 className="text-2xl font-black text-foreground mb-3 group-hover:text-[#FF914D] transition-colors line-clamp-2 leading-tight tracking-tight">{nl.title}</h4>
                             <p className="text-[13px] text-muted-foreground line-clamp-4 leading-relaxed font-medium mb-6">{nl.content}</p>
                           </div>

                           <button
                             onClick={() => setOpenNewsletter(nl)}
                             className="w-full py-4 bg-card shadow-sm border border-border rounded-none text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-300 hover:bg-[#FF914D] hover:text-[#05050a] hover:border-[#FF914D] hover:scale-[1.02] flex items-center justify-center gap-2 group-hover:shadow-[0_10px_30px_rgba(255,145,77,0.2)]">
                             <DocumentTextIcon className="w-4 h-4" /> Open Signal
                           </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {newsletters.length === 0 && (
                  <div className="text-center py-32 bg-white/[0.01] border border-dashed border-border rounded-[3rem] opacity-30 flex flex-col items-center">
                    <DocumentTextIcon className="w-20 h-20 mb-6" />
                    <p className="text-base font-black uppercase tracking-[0.5em]">No Editions Found</p>
                  </div>
                )}

                {openNewsletter && (
                  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpenNewsletter(null)}>
                    <div className="bg-[#0d0d16] border border-border rounded-[2.5rem] max-w-2xl w-full max-h-[80vh] overflow-y-auto p-8 space-y-6" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between">
                        <div className="px-3 py-1 bg-[#FF914D]/10 rounded-full border border-[#FF914D]/20">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[#FF914D]">Premium Edition</span>
                        </div>
                        <button onClick={() => setOpenNewsletter(null)} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground">
                          <XMarkIcon className="w-5 h-5" />
                        </button>
                      </div>
                      <h2 className="text-2xl font-black text-foreground tracking-tight">{openNewsletter.title}</h2>
                      <p className="text-xs text-muted-foreground font-bold">{new Date(openNewsletter.published_at || openNewsletter.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                      <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap font-medium">{openNewsletter.content}</div>
                    </div>
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

