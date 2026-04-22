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

const TYPE_COLOR: Record<string, string> = {
  students: 'bg-emerald-500',
  parents:  'bg-orange-500',
  school:   'bg-blue-600',
  teachers: 'bg-violet-600',
};

export default function InboxPreviewWidget() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [convs, setConvs] = useState<PreviewConv[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalUnread, setTotalUnread] = useState(0);

  const isSchool  = profile?.role === 'school';
  const isTeacher = profile?.role === 'teacher';
  const isAdmin   = profile?.role === 'admin';
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
      setConvs(all.slice(0, 8));
      setTotalUnread(all.reduce((s, c) => s + c.unread_count, 0));
    } catch (err) {
      console.error('InboxPreviewWidget error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!hasAccess) return null;

  return (
    <div className="bg-card border border-border rounded-none shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-none bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <h3 className="font-black text-foreground text-sm tracking-tight">Unified Inbox</h3>
            <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">
              {loading ? 'Loading…' : `${convs.length} conversation${convs.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          {totalUnread > 0 && (
            <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
              {totalUnread} unread
            </span>
          )}
        </div>
        <Link href="/dashboard/inbox"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 text-[11px] font-black uppercase tracking-wider rounded-full transition-colors">
          Open Inbox <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
        </div>
      ) : convs.length === 0 ? (
        <div className="text-center py-10">
          <MessageSquare className="w-8 h-8 text-muted mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No conversations yet.</p>
          <Link href="/dashboard/inbox"
            className="mt-3 inline-block text-orange-400 text-sm font-bold hover:underline">
            Open Inbox →
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {convs.map(conv => {
            const Icon = TYPE_ICON[conv.type] || MessageSquare;
            return (
              <Link key={conv.id} href="/dashboard/inbox"
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors group">
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-[13px] text-white shrink-0 ${TYPE_COLOR[conv.type]}`}>
                  {initials(conv.contact_name)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-bold text-sm truncate ${conv.unread_count > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {conv.contact_name}
                      </span>
                      {/* Channel pill */}
                      <span className={`shrink-0 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                        conv.type === 'students' ? 'bg-emerald-500/10 text-emerald-400' :
                        conv.type === 'parents'  ? 'bg-orange-500/10 text-orange-400' :
                        conv.type === 'teachers' ? 'bg-violet-500/10 text-violet-400' :
                                                   'bg-blue-500/10 text-blue-400'
                      }`}>
                        {conv.type === 'students' ? 'WhatsApp' : conv.type === 'parents' ? 'Parent' : conv.type === 'teachers' ? 'Teacher' : 'School'}
                      </span>
                    </div>
                    <span className={`text-[10px] shrink-0 ${conv.unread_count > 0 ? 'text-orange-400 font-bold' : 'text-muted-foreground'}`}>
                      {formatTime(conv.last_message_at)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs truncate ${conv.unread_count > 0 ? 'text-foreground/70 font-semibold' : 'text-muted-foreground'}`}>
                      {conv.last_message_preview}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {conv.school_name && (
                        <span className="text-[9px] text-muted-foreground font-bold bg-muted px-1.5 py-0.5 rounded-full truncate max-w-[80px]">
                          {conv.school_name}
                        </span>
                      )}
                      {conv.unread_count > 0 ? (
                        <span className="bg-orange-500 text-white text-[10px] font-black min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full">
                          {conv.unread_count}
                        </span>
                      ) : (
                        <Icon className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-orange-400 transition-colors" />
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Footer CTA */}
      {convs.length > 0 && (
        <div className="px-5 py-3 bg-muted/20 border-t border-border flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
            {totalUnread > 0 ? `${totalUnread} unread message${totalUnread !== 1 ? 's' : ''} waiting` : 'All caught up'}
          </p>
          <Link href="/dashboard/inbox"
            className="text-[11px] text-orange-400 font-black hover:underline transition-colors flex items-center gap-1">
            Full Inbox <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
