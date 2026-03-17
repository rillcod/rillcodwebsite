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
  const [newsletters, setNewsletters] = useState<any[]>([]); // Note: any[] is left as requested for other issues, but we select correct fields for nl
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

  useEffect(() => {
    if (authLoading || !profile) return;
    setLoading(true);
    const db = createClient();
    Promise.all([
      db.from('messages').select('*, portal_users!messages_sender_id_fkey(full_name, email)').eq('recipient_id', profile.id).order('created_at', { ascending: false }),
      db.from('messages').select('*, portal_users!messages_recipient_id_fkey(full_name, email)').eq('sender_id', profile.id).order('created_at', { ascending: false }),
      db.from('announcements').select('*, portal_users!announcements_author_id_fkey(full_name)').eq('is_active', true).order('created_at', { ascending: false }),
      db.from('newsletter_delivery').select('*, newsletters(*)').eq('user_id', profile.id).order('delivered_at', { ascending: false }),
      db.from('portal_users').select('id, full_name, email, role').neq('id', profile.id).order('full_name'),
    ]).then(([inbRes, sntRes, annRes, nwlRes, usrRes]) => {
      setInbox(inbRes.data ?? []);
      setSent(sntRes.data ?? []);
      setAnnouncements(annRes.data ?? []);
      setNewsletters(nwlRes.data ?? []);
      setUsers(usrRes.data ?? []);
      setLoading(false);
    });
  }, [profile?.id, authLoading]); // eslint-disable-line

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
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <EnvelopeIcon className="w-5 h-5 text-indigo-400" />
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Communication</span>
          </div>
          <h1 className="text-3xl font-extrabold">Messages & Announcements</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 border border-white/10 rounded-2xl p-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setSelected(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${tab === t.key ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
              <t.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
              {t.count && <span className="bg-rose-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{t.count}</span>}
            </button>
          ))}
        </div>

        {/* ── INBOX ─── */}
        {tab === 'inbox' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="font-bold text-sm">Inbox <span className="text-white/30">({inbox.length})</span></h3>
                {unread > 0 && <span className="text-xs text-indigo-400">{unread} unread</span>}
              </div>
              {inbox.length === 0 ? (
                <div className="p-8 text-center text-white/30 text-sm">Your inbox is empty</div>
              ) : (
                <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
                  {inbox.map(msg => (
                    <button key={msg.id} onClick={() => markRead(msg)}
                      className={`w-full text-left p-4 hover:bg-white/5 transition-colors ${selected?.id === msg.id ? 'bg-indigo-500/10' : ''}`}>
                      <div className="flex items-start gap-2">
                        {!msg.is_read && <div className="w-2 h-2 bg-indigo-400 rounded-full mt-1.5 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${!msg.is_read ? 'font-bold text-white' : 'text-white/70'}`}>
                            {msg.portal_users?.full_name ?? 'Unknown'}
                          </p>
                          {msg.subject && <p className="text-xs text-white/50 truncate">{msg.subject}</p>}
                          <p className="text-xs text-white/30 truncate mt-0.5">{msg.message}</p>
                          <p className="text-xs text-white/20 mt-1">{new Date(msg.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selected ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-[#7a0606] rounded-lg flex items-center justify-center text-sm font-black">
                    {selected.portal_users?.full_name?.charAt(0) ?? '?'}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{selected.portal_users?.full_name}</p>
                    <p className="text-xs text-white/30">{new Date(selected.created_at).toLocaleString()}</p>
                  </div>
                </div>
                {selected.subject && <p className="font-semibold text-white/80">{selected.subject}</p>}
                <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{selected.message}</p>
                <button onClick={() => { setCompose(c => ({ ...c, recipient_id: selected.sender_id })); setTab('compose'); }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-xl transition-colors">
                  <PaperAirplaneIcon className="w-3.5 h-3.5" /> Reply
                </button>
              </div>
            ) : (
              <div className="hidden lg:flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl">
                <p className="text-white/20 text-sm">Select a message to read</p>
              </div>
            )}
          </div>
        )}

        {/* ── SENT ─── */}
        {tab === 'sent' && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10">
              <h3 className="font-bold text-sm">Sent Messages <span className="text-white/30">({sent.length})</span></h3>
            </div>
            {sent.length === 0 ? (
              <div className="p-8 text-center text-white/30 text-sm">No sent messages</div>
            ) : (
              <div className="divide-y divide-white/5">
                {sent.map(msg => (
                  <div key={msg.id} className="p-4 flex items-start gap-3">
                    <UserIcon className="w-5 h-5 text-white/20 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/70">To: <span className="text-white">{msg.portal_users?.full_name ?? 'Unknown'}</span></p>
                      {msg.subject && <p className="text-xs text-white/50">{msg.subject}</p>}
                      <p className="text-xs text-white/30 truncate mt-0.5">{msg.message}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-white/20">
                        <span>{new Date(msg.created_at).toLocaleDateString()}</span>
                        {msg.is_read && <span className="text-emerald-400">Read</span>}
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
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
            <h3 className="font-bold">New Message</h3>
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">To <span className="text-rose-400">*</span></label>
              <select value={compose.recipient_id}
                onChange={e => setCompose(c => ({ ...c, recipient_id: e.target.value }))}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer">
                <option value="">Select recipient…</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Subject</label>
              <input type="text" value={compose.subject}
                onChange={e => setCompose(c => ({ ...c, subject: e.target.value }))}
                placeholder="Optional subject"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500 transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Message <span className="text-rose-400">*</span></label>
              <textarea rows={6} value={compose.message}
                onChange={e => setCompose(c => ({ ...c, message: e.target.value }))}
                placeholder="Type your message…"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500 transition-colors resize-none" />
            </div>
            <button onClick={handleSend} disabled={sending || !compose.recipient_id || !compose.message.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50">
              {sending ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : sent2 ? <CheckIcon className="w-4 h-4" /> : <PaperAirplaneIcon className="w-4 h-4" />}
              {sending ? 'Sending…' : sent2 ? 'Sent!' : 'Send Message'}
            </button>
          </div>
        )}

        {/* ── ANNOUNCEMENTS ─── */}
        {tab === 'announcements' && (
          <div className="space-y-4">
            {isStaff && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                <h3 className="font-bold flex items-center gap-2">
                  <MegaphoneIcon className="w-5 h-5 text-indigo-400" /> Post Announcement
                </h3>
                <div>
                  <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Title <span className="text-rose-400">*</span></label>
                  <input type="text" value={announcement.title}
                    onChange={e => setAnnouncement(a => ({ ...a, title: e.target.value }))}
                    placeholder="Announcement title…"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500 transition-colors" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Audience</label>
                    <select value={announcement.target_audience}
                      onChange={e => setAnnouncement(a => ({ ...a, target_audience: e.target.value }))}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer">
                      <option value="all">Everyone</option>
                      <option value="students">Students Only</option>
                      <option value="teachers">Teachers Only</option>
                      <option value="admins">Admins Only</option>
                      <option value="schools">Partner Schools Only</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Content <span className="text-rose-400">*</span></label>
                  <textarea rows={4} value={announcement.content}
                    onChange={e => setAnnouncement(a => ({ ...a, content: e.target.value }))}
                    placeholder="Announcement content…"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-indigo-500 transition-colors resize-none" />
                </div>
                <button onClick={handleAnnouncement}
                  disabled={posting || !announcement.title.trim() || !announcement.content.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50">
                  {posting ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : posted ? <CheckIcon className="w-4 h-4" /> : <PlusIcon className="w-4 h-4" />}
                  {posting ? 'Posting…' : posted ? 'Posted!' : 'Post Announcement'}
                </button>
              </div>
            )}

            <div className="space-y-3">
              {announcements.filter(a => a.target_audience === 'all' || a.target_audience === `${profile?.role}s`).map(ann => (
                <div key={ann.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <MegaphoneIcon className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                      <h4 className="font-bold text-white">{ann.title}</h4>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-white/30 capitalize">{ann.target_audience}</span>
                      {isStaff && (
                        <button onClick={() => deleteAnnouncement(ann.id)}
                          className="p-1.5 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg transition-colors">
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{ann.content}</p>
                  <div className="flex items-center gap-3 text-xs text-white/30">
                    <span>By {ann.portal_users?.full_name ?? 'Admin'}</span>
                    <span>{new Date(ann.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
              {announcements.length === 0 && (
                <div className="text-center py-12 bg-white/5 border border-white/10 rounded-2xl">
                  <MegaphoneIcon className="w-12 h-12 mx-auto text-white/10 mb-3" />
                  <p className="text-white/30">No announcements yet</p>
                </div>
              )}
            </div>
          </div>
        )}
        {/* ── NEWSLETTERS ─── */}
        {tab === 'newsletters' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {newsletters.map(nlItem => {
                const nl = nlItem.newsletters;
                if (!nl) return null;
                return (
                  <div key={nl.id} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all group overflow-hidden relative">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#FF914D]">Premium Edition</span>
                      <span className="text-[10px] text-white/20">{new Date(nl.published_at || nl.created_at).toLocaleDateString()}</span>
                    </div>
                    <h4 className="font-extrabold text-white text-lg mb-2 truncate">{nl.title}</h4>
                    <p className="text-sm text-white/40 line-clamp-3 mb-6 leading-relaxed">{nl.content}</p>
                    <button 
                      onClick={() => {
                        const params = new URLSearchParams(window.location.search);
                        params.set('newsletterId', nl.id);
                        window.history.pushState({}, '', `${window.location.pathname}?${params.toString()}`);
                        // Dispatch popstate event to trigger useSearchParams effect if needed
                        window.dispatchEvent(new PopStateEvent('popstate'));
                      }}
                      className="w-full py-3 bg-white/5 group-hover:bg-indigo-600 group-hover:text-white border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                    >
                      Open Newsletter
                    </button>
                  </div>
                );
              })}
              {newsletters.length === 0 && (
                <div className="col-span-full py-20 text-center bg-white/5 border border-white/10 rounded-2xl">
                  <DocumentTextIcon className="w-16 h-16 mx-auto text-white/10 mb-4" />
                  <p className="text-white/40 font-bold uppercase tracking-widest text-xs">No newsletters delivered yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
