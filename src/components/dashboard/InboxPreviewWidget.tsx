"use client";

import React, { useEffect, useState } from 'react';
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
  const supabase = createClient();
  const [convs, setConvs] = useState<PreviewConv[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalUnread, setTotalUnread] = useState(0);

  const isSchool  = profile?.role === 'school';
  const isTeacher = profile?.role === 'teacher';
  const hasAccess = ['admin', 'teacher', 'school', 'parent', 'student'].includes(profile?.role ?? '');
  const isParentOrStudent = ['parent', 'student'].includes(profile?.role ?? '');

  useEffect(() => {
    if (!profile || !hasAccess) { setLoading(false); return; }
    loadPreview();
  }, [profile?.id]); // eslint-disable-line

  const loadPreview = async () => {
    setLoading(true);
    const all: PreviewConv[] = [];

    try {
      // ── WhatsApp / students ──────────────────────────────────────────────
      let wa: any[] = [];
      if (!isParentOrStudent) {
        const waRes = await supabase
          .from('whatsapp_conversations')
          .select('id, phone_number, contact_name, last_message_at, last_message_preview, unread_count, portal_user:portal_users!portal_user_id(full_name, school_name, role)')
          .order('last_message_at', { ascending: false })
          .limit(5);
        wa = waRes.data ?? [];
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
        all.push({
          id:                   c.id,
          type:                 'students',
          contact_name:         c.contact_name || (c.portal_user as any)?.full_name || c.phone_number || 'Unknown',
          last_message_preview: c.last_message_preview || 'No messages yet',
          last_message_at:      c.last_message_at || '',
          unread_count:         c.unread_count || 0,
          school_name:          (c.portal_user as any)?.school_name,
          role:                 (c.portal_user as any)?.role || 'student',
          phone_number:         c.phone_number,
        });
      }

      // ── Parent threads (not school role) ────────────────────────────────
      if (!isSchool && !isParentOrStudent) {
        let q = supabase
          .from('parent_teacher_threads')
          .select('id, created_at, parent:portal_users!parent_id(full_name, school_name), messages:parent_teacher_messages(body, sent_at, is_read, sender_id)')
          .order('created_at', { ascending: false })
          .limit(3);
        if (isTeacher && profile?.id) q = q.eq('teacher_id', profile.id);
        const { data: threads } = await q;
        for (const t of threads ?? []) {
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
    <div className="bg-[#111b21] border border-white/[0.08] rounded-none shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-[#1f2c34] border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h3 className="font-black text-white text-base tracking-tight">Unified Inbox</h3>
            <p className="text-white/40 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
              {loading ? 'Connecting…' : (
                <>
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  {convs.length} Conversations
                </>
              )}
            </p>
          </div>
        </div>
        <Link href="/dashboard/inbox"
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase tracking-wider rounded-full transition-all shadow-lg shadow-emerald-950/20">
          Open App <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Content */}
      <div className="bg-[#111b21]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Loading Chats…</p>
          </div>
        ) : convs.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="w-16 h-16 bg-white/[0.03] rounded-full flex items-center justify-center mx-auto mb-4 border border-white/[0.05]">
              <MessageSquare className="w-8 h-8 text-white/10" />
            </div>
            <p className="text-white/40 text-sm font-medium">No messages in your inbox.</p>
            <Link href="/dashboard/inbox"
              className="mt-4 inline-block text-emerald-400 text-[11px] font-black uppercase tracking-widest hover:text-emerald-300 transition-colors">
              Start Conversation →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {convs.map(conv => {
              const Icon = TYPE_ICON[conv.type] || MessageSquare;
              return (
                <Link key={conv.id} href="/dashboard/inbox"
                  className="flex items-center gap-4 px-5 py-4 hover:bg-[#1f2c34]/50 transition-all group relative">
                  {/* Unread indicator bar */}
                  {conv.unread_count > 0 && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                  )}

                  {/* Avatar */}
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-sm text-white shrink-0 shadow-lg ${
                    conv.type === 'students' ? 'bg-emerald-600' : 
                    conv.type === 'parents' ? 'bg-primary' : 
                    conv.type === 'teachers' ? 'bg-violet-600' : 'bg-blue-700'
                  }`}>
                    {initials(conv.contact_name)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`font-bold text-[15px] truncate ${conv.unread_count > 0 ? 'text-white' : 'text-white/70'}`}>
                          {conv.contact_name}
                        </span>
                      </div>
                      <span className={`text-[11px] shrink-0 font-medium ${conv.unread_count > 0 ? 'text-emerald-500' : 'text-white/30'}`}>
                        {formatTime(conv.last_message_at)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                         {/* Status Icon */}
                         {conv.unread_count === 0 && <Icon className="w-3 h-3 text-white/20 shrink-0" />}
                         <p className={`text-[13px] truncate ${conv.unread_count > 0 ? 'text-white/90 font-medium' : 'text-white/40'}`}>
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
                            conv.type === 'students' ? 'bg-emerald-500/10 text-emerald-400' :
                            conv.type === 'parents'  ? 'bg-primary/10 text-primary' :
                            conv.type === 'teachers' ? 'bg-violet-500/10 text-violet-400' :
                                                       'bg-blue-500/10 text-blue-400'
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
        <p className="text-[10px] text-white/30 font-black uppercase tracking-[0.2em]">
          {totalUnread > 0 ? `${totalUnread} Message${totalUnread !== 1 ? 's' : ''} Awaiting` : 'Security Encrypted'}
        </p>
        <Link href="/dashboard/inbox"
          className="text-[11px] text-emerald-400 font-black uppercase tracking-widest hover:text-emerald-300 transition-colors flex items-center gap-1.5 group">
          Full Inbox <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
}
