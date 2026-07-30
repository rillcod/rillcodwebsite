"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import {
  MessageSquare, Users, Building2, Loader2,
  ChevronRight, GraduationCap,
} from 'lucide-react';

interface PreviewConv {
  id: string;
  type: 'students' | 'parents' | 'school' | 'teachers';
  contact_name: string;
  last_message_preview: string;
  last_message_at: string;
  unread_count: number;
  school_name?: string;
  role?: string;
  phone_number?: string;
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function formatTime(ts: string) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000 && d.getDate() === now.getDate())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

const TYPE_ICON: Record<string, React.ElementType> = {
  students: MessageSquare,
  parents:  Users,
  school:   Building2,
  teachers: GraduationCap,
};

export default function InboxPreviewWidget() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [convs, setConvs] = useState<PreviewConv[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalUnread, setTotalUnread] = useState(0);

  const isSchool  = profile?.role === 'school';
  const isTeacher = profile?.role === 'teacher';
  const isAdmin = profile?.role === 'admin';
  // Widget is staff-only — students/parents have their own minimal view inside the inbox page
  const hasAccess = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');
  const isParentOrStudent = ['parent', 'student'].includes(profile?.role ?? '');
  const inboxHref = isAdmin
    ? '/dashboard/office?workspace=inbox&section=chats'
    : '/dashboard/inbox';
  const conversationHref = (id: string) =>
    isAdmin
      ? `/dashboard/office?workspace=inbox&section=chats&conversation=${id}`
      : `/dashboard/inbox?conversation=${id}`;

  useEffect(() => {
    if (!profile || !hasAccess) { setLoading(false); return; }
    loadPreview();

    // Real-time: refresh preview on any new WhatsApp message or conversation update.
    // Random suffix avoids Supabase channel-cache collision in React StrictMode.
    const ch = supabase.channel(`inbox_widget_${profile.id}_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' },
        () => loadPreview())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_conversations' },
        () => loadPreview())
      .subscribe();

    return () => { ch.unsubscribe(); supabase.removeChannel(ch); };
  }, [profile?.id]); // eslint-disable-line

  const loadPreview = async () => {
    setLoading(true);
    const all: PreviewConv[] = [];

    try {
      // ── WhatsApp / students ──────────────────────────────────────────────
      let wa: any[] = [];
      if (!isParentOrStudent) {
        try {
          const res = await fetch('/api/inbox?limit=5', { cache: 'no-store' });
          const json = res.ok ? await res.json() : { data: [] };
          wa = Array.isArray(json.data) ? json.data : [];
        } catch (e) { console.error(e); }
      }

      if (isParentOrStudent) {
        try {
          const res = await fetch('/api/inbox');
          const json = await res.json();
          const scopedConvs = json.data ?? [];
          for (const c of scopedConvs.slice(0, 8)) {
            all.push({
              id: c.id,
              type: 'students',
              contact_name: c.contact_name || c.portal_users?.full_name || c.phone_number || 'WhatsApp',
              last_message_preview: c.last_message_preview || 'No messages yet',
              last_message_at: c.last_message_at || '',
              unread_count: c.unread_count || 0,
              school_name: c.school_name || undefined,
              role: profile?.role ?? 'student',
              phone_number: c.phone_number,
            });
          }
        } catch (e) { console.error(e); }
      }

      for (const c of wa) {
        const user = c.portal_users || c.portal_user || {};
        all.push({
          id:                   c.id,
          type:                 'students',
          contact_name:         c.contact_name || user.full_name || c.phone_number || 'Unknown',
          last_message_preview: c.last_message_preview || 'No messages yet',
          last_message_at:      c.last_message_at || '',
          unread_count:         c.unread_count || 0,
          school_name:          user.school_name,
          role:                 user.role || 'student',
          phone_number:         c.phone_number,
        });
      }

      // ── Parent threads (not school role) ────────────────────────────────
      if (!isSchool && !isParentOrStudent) {
        try {
          const res = await fetch('/api/inbox/threads?limit=5', { cache: 'no-store' });
          const json = res.ok ? await res.json() : { data: [] };
          const threads = Array.isArray(json.data) ? json.data : [];
          for (const t of threads) {
          const msgs   = (t.messages ?? []) as any[];
          const last   = msgs.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0];
          const unread = msgs.filter(m => !m.is_read && m.sender_id !== profile?.id).length;
          all.push({
            id:                   t.id,
            type:                 'parents',
            contact_name:         (t.parent as any)?.full_name || 'Parent',
            last_message_preview: last?.body || 'No messages yet',
            last_message_at:      last?.sent_at || t.created_at,
            unread_count:         unread,
            school_name:          (t.parent as any)?.school_name,
            role:                 'parent',
          });
        }
        } catch (e) { console.error(e); }
      }

      // ── School/teacher channel ──────────────────────────────────────────
      if (!isParentOrStudent) try {
        const res  = await fetch('/api/school-teacher/conversations');
        const json = await res.json();
        for (const c of (json.data ?? []).slice(0, 3)) {
          all.push({
            id:                   c.id,
            type:                 'school',
            contact_name:         isSchool ? (c.teacher?.full_name || 'Teacher') : (c.school?.name || 'School'),
            last_message_preview: c.last_message_preview || 'No messages yet',
            last_message_at:      c.last_message_at || c.created_at,
            unread_count:         c.unread_count || 0,
            role:                 isSchool ? 'teacher' : 'school',
          });
        }
      } catch { /* silent */ }

      // Sort by most recent and cap at 8
      all.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
      const final = all.slice(0, 8);
      setConvs(final);
      setTotalUnread(all.reduce((s, c) => s + c.unread_count, 0));
    } catch (err) {
      console.error('InboxPreviewWidget error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!hasAccess) return null;

  return (
    <div className="bg-[#111b21] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-[#1f2c34] border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="font-black text-foreground text-base tracking-tight">Unified Inbox</h3>
            <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
              {loading ? 'Connecting…' : (
                <>
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  {convs.length} Conversations
                </>
              )}
            </p>
          </div>
        </div>
        <Link href={inboxHref}
          className="relative flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase tracking-wider rounded-full transition-all shadow-lg shadow-emerald-950/20">
          {totalUnread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-rose-500 text-white text-[9px] font-black flex items-center justify-center rounded-full px-1 shadow-md">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
          Open App <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Content */}
      <div className="bg-[#111b21]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600 dark:text-emerald-400" />
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Loading Chats…</p>
          </div>
        ) : convs.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="w-16 h-16 bg-white/[0.03] rounded-full flex items-center justify-center mx-auto mb-4 border border-white/[0.05]">
              <MessageSquare className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm font-medium">No messages in your inbox.</p>
            <Link href={inboxHref}
              className="mt-4 inline-block text-emerald-600 dark:text-emerald-400 text-[11px] font-black uppercase tracking-widest hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors">
              Start Conversation →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {convs.map(conv => {
              const Icon = TYPE_ICON[conv.type] || MessageSquare;
              return (
                <Link key={conv.id} href={conversationHref(conv.id)}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-[#1f2c34]/50 transition-all group relative">
                  {/* Unread indicator bar */}
                  {conv.unread_count > 0 && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                  )}

                  {/* Avatar */}
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-sm text-white shrink-0 shadow-lg ${
                    conv.type === 'students' ? 'bg-emerald-600' : 
                    conv.type === 'parents' ? 'bg-primary' : 
                    conv.type === 'teachers' ? 'bg-primary' : 'bg-primary'
                  }`}>
                    {initials(conv.contact_name)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`font-bold text-[15px] truncate ${conv.unread_count > 0 ? 'text-white' : 'text-muted-foreground'}`}>
                          {conv.contact_name}
                        </span>
                      </div>
                      <span className={`text-[11px] shrink-0 font-medium ${conv.unread_count > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                        {formatTime(conv.last_message_at)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                         {/* Status Icon */}
                         {conv.unread_count === 0 && <Icon className="w-3 h-3 text-muted-foreground shrink-0" />}
                         <p className={`text-[13px] truncate ${conv.unread_count > 0 ? 'text-muted-foreground font-medium' : 'text-muted-foreground'}`}>
                           {conv.last_message_preview}
                         </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {conv.unread_count > 0 ? (
                          <span className="bg-emerald-500 text-[#111b21] text-[10px] font-black min-w-[20px] h-[20px] flex items-center justify-center px-1 rounded-full shadow-lg shadow-emerald-500/20">
                            {conv.unread_count}
                          </span>
                        ) : (
                          <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border border-white/[0.08] ${
                            conv.type === 'students' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                            conv.type === 'parents'  ? 'bg-primary/10 text-primary' :
                            conv.type === 'teachers' ? 'bg-primary/10 text-primary' :
                                                       'bg-primary/10 text-primary'
                          }`}>
                            {conv.type === 'students' ? 'WhatsApp' : conv.type === 'parents' ? 'Parent' : conv.type === 'teachers' ? 'Teacher' : 'School'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <div className="px-5 py-3 bg-[#1f2c34] border-t border-white/[0.05] flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em]">
          {totalUnread > 0 ? `${totalUnread} Message${totalUnread !== 1 ? 's' : ''} Awaiting` : 'Security Encrypted'}
        </p>
        <Link href={inboxHref}
          className="text-[11px] text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-widest hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors flex items-center gap-1.5 group">
          Full Inbox <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
}
