"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
  Search, Send, Phone, Check, CheckCheck,
  Loader2, X, MessageSquare, Users, Building2, Plus,
  ChevronLeft, Info, Filter, UserCircle, UserPlus,
  BookUser, Mail, School, GraduationCap, ChevronRight,
  ArrowLeft, Pencil, Trash2, ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

// ── Types ───────────────────────────────────────────────────────────────────
type InboxCategory = 'students' | 'parents' | 'school' | 'teachers';
type SidebarView   = 'chats' | 'contacts';

interface Conversation {
  id: string;
  type: InboxCategory;
  phone_number?: string;
  contact_name: string;
  avatar_url?: string;
  last_message_at: string;
  last_message_preview: string;
  unread_count: number;
  subject?: string;
  student_name?: string;
  school_name?: string;
  class_name?: string;
  role?: string;
  portal_user_id?: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id?: string;
  direction?: 'inbound' | 'outbound';
  body: string;
  created_at: string;
  status?: string;
  is_read?: boolean;
}

interface Contact {
  id: string;
  full_name: string;
  phone?: string;
  email?: string;
  school_name?: string;
  school_id?: string;
  role: string;
  class_name?: string;
  is_active?: boolean;
  source: 'portal' | 'whatsapp';
  portal_user_id?: string;
}

const EMPTY_CONTACT_FORM = {
  full_name: '',
  phone: '',
  email: '',
  school_name: '',
  role: 'student' as string,
  class_name: '',
  notes: '',
};

interface ProfilePopupForm {
  full_name: string;
  phone: string;
  school_name: string;
  class_name: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
function formatConvTime(ts: string) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000 && d.getDate() === now.getDate())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}
function formatMsgTime(ts: string) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function formatDateSep(ts: string) {
  const d = new Date(ts), now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000 && d.getDate() === now.getDate()) return 'Today';
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

const AVATAR_COLORS: Record<InboxCategory, string> = {
  students: 'bg-emerald-500',
  parents:  'bg-orange-500',
  school:   'bg-blue-600',
  teachers: 'bg-violet-600',
};
const ROLE_COLORS: Record<string, string> = {
  student: 'bg-emerald-500/20 text-emerald-400',
  parent:  'bg-orange-500/20 text-orange-400',
  teacher: 'bg-violet-500/20 text-violet-400',
  school:  'bg-blue-500/20 text-blue-400',
  admin:   'bg-rose-500/20 text-rose-400',
};
const CHANNEL_COLORS: Record<InboxCategory, string> = {
  students: 'bg-emerald-900/40 text-emerald-500',
  parents:  'bg-orange-900/40 text-orange-500',
  school:   'bg-blue-900/40 text-blue-500',
  teachers: 'bg-violet-900/40 text-violet-500',
};

// ── Component ────────────────────────────────────────────────────────────────
export default function UnifiedInbox() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  // Chat state
  const [sidebarView, setSidebarView]         = useState<SidebarView>('chats');
  const [activeTab, setActiveTab]             = useState<InboxCategory>('students');
  const [conversations, setConversations]     = useState<Conversation[]>([]);
  const [filteredConvs, setFilteredConvs]     = useState<Conversation[]>([]);
  const [messages, setMessages]               = useState<Message[]>([]);
  const [activeConv, setActiveConv]           = useState<Conversation | null>(null);
  const [newMessage, setNewMessage]           = useState('');
  const [isLoading, setIsLoading]             = useState(true);
  const [isSending, setIsSending]             = useState(false);
  const [showSidebar, setShowSidebar]         = useState(true);
  const [showInfo, setShowInfo]               = useState(false);
  const [convSearch, setConvSearch]           = useState('');
  const [filterUnread, setFilterUnread]       = useState(false);
  const [msgLoading, setMsgLoading]           = useState(false);
  const [sendError, setSendError]             = useState('');

  // Contacts state
  const [contacts, setContacts]               = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSearch, setContactSearch]     = useState('');
  const [contactRoleFilter, setContactRoleFilter] = useState<string>('all');
  const [activeContact, setActiveContact]     = useState<Contact | null>(null);
  const [showAddContact, setShowAddContact]   = useState(false);
  const [addContactForm, setAddContactForm]   = useState(EMPTY_CONTACT_FORM);
  const [savingContact, setSavingContact]     = useState(false);
  const [contactError, setContactError]       = useState('');
  const [editingContact, setEditingContact]   = useState<Contact | null>(null);

  // New chat (from contacts modal)
  const [showNewChat, setShowNewChat]           = useState(false);
  const [directorySearch, setDirectorySearch]   = useState('');
  const [directoryResults, setDirectoryResults] = useState<any[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  // Advanced contact filters
  const [contactSchoolFilter, setContactSchoolFilter] = useState('');
  const [contactClassFilter, setContactClassFilter]   = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // "Save to contacts" for unknown inbound senders
  const [showSaveBanner, setShowSaveBanner] = useState(false);

  // Profile popup — required before first message
  const [showProfilePopup, setShowProfilePopup] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfilePopupForm>({ full_name: '', phone: '', school_name: '', class_name: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [pendingSendBody, setPendingSendBody] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  const isSchool  = profile?.role === 'school';
  const isTeacher = profile?.role === 'teacher';
  const isAdmin   = profile?.role === 'admin';
  const hasAccess = ['teacher', 'admin', 'school', 'staff'].includes(profile?.role ?? '');

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'students'  as const, label: 'Students',                         icon: MessageSquare },
    ...(!isSchool ? [{ id: 'parents' as const, label: 'Parents',            icon: Users }] : []),
    ...(isAdmin   ? [{ id: 'teachers' as const, label: 'Teachers',          icon: GraduationCap }] : []),
    { id: 'school'    as const, label: isSchool ? 'Teachers' : isAdmin ? 'Schools' : 'School', icon: Building2 },
  ];

  // ── Real-time ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    fetchConversations(activeTab);
    const ch = supabase.channel('wa_inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' },
        p => handleRealtime('students', p.new as any))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'parent_teacher_messages' },
        p => handleRealtime('parents', p.new as any))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'school_teacher_messages' },
        p => handleRealtime('school', p.new as any))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id, activeTab]); // eslint-disable-line

  const handleRealtime = (type: InboxCategory, msg: any) => {
    if (type === activeTab) fetchConversations(type, false);
    const convId = msg.conversation_id || msg.thread_id;
    if (activeConv?.id === convId)
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, normaliseMsg(msg)]);
  };

  function normaliseMsg(m: any): Message {
    return {
      id:              m.id,
      conversation_id: m.conversation_id || m.thread_id || '',
      sender_id:       m.sender_id,
      direction:       m.direction,
      body:            m.body,
      created_at:      m.created_at || m.sent_at,
      status:          m.status,
      is_read:         m.is_read,
    };
  }

  // ── Fetch conversations ────────────────────────────────────────────────────
  const fetchConversations = async (cat: InboxCategory, setLoad = true) => {
    if (setLoad) setIsLoading(true);
    try {
      if (cat === 'students') {
        const { data } = await supabase
          .from('whatsapp_conversations')
          .select('*, portal_user:portal_users!portal_user_id(full_name, phone, school_name, role)')
          .order('last_message_at', { ascending: false });
        if (data) setConversations(data.map(c => ({
          id:                   c.id,
          type:                 'students' as const,
          phone_number:         c.phone_number,
          contact_name:         c.contact_name || (c.portal_user as any)?.full_name || c.phone_number || 'Unknown',
          last_message_at:      c.last_message_at || '',
          last_message_preview: c.last_message_preview || '',
          unread_count:         c.unread_count || 0,
          school_name:          (c.portal_user as any)?.school_name,
          role:                 (c.portal_user as any)?.role || 'student',
          portal_user_id:       c.portal_user_id ?? undefined,
        })));
      } else if (cat === 'parents') {
        let q = supabase.from('parent_teacher_threads').select(`
          *, parent:portal_users!parent_id(id, full_name, avatar_url, phone, school_name),
          student:portal_users!student_id(full_name),
          messages:parent_teacher_messages(body, sent_at, is_read, sender_id)
        `).order('created_at', { ascending: false });
        if (isTeacher && profile?.id) q = q.eq('teacher_id', profile.id);
        const { data } = await q;
        if (data) setConversations(data.map(t => {
          const msgs  = (t.messages ?? []) as any[];
          const last  = msgs.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0];
          const unread = msgs.filter(m => !m.is_read && m.sender_id !== profile?.id).length;
          return {
            id: t.id, type: 'parents' as const,
            contact_name:         (t.parent as any)?.full_name || 'Parent',
            student_name:         (t.student as any)?.full_name,
            avatar_url:           (t.parent as any)?.avatar_url,
            last_message_at:      last?.sent_at || t.created_at,
            last_message_preview: last?.body || 'No messages yet',
            unread_count:         unread,
            phone_number:         (t.parent as any)?.phone,
            school_name:          (t.parent as any)?.school_name,
            role:                 'parent',
          };
        }));
      } else if (cat === 'teachers') {
        // Admin-only: direct messages with individual teachers
        // Re-uses school_teacher_conversations filtered to where teacher side is a teacher (not a school)
        const res  = await fetch('/api/school-teacher/conversations?type=teacher');
        const json = await res.json();
        if (json.data) setConversations(json.data.map((c: any) => ({
          id:                   c.id, type: 'teachers' as const,
          contact_name:         c.teacher?.full_name || 'Teacher',
          subject:              c.subject,
          last_message_at:      c.last_message_at || c.created_at,
          last_message_preview: c.last_message_preview || 'No messages yet',
          unread_count:         c.unread_count || 0,
          school_name:          c.teacher?.school_name,
          role:                 'teacher',
        })));
      } else {
        const res  = await fetch('/api/school-teacher/conversations');
        const json = await res.json();
        if (json.data) setConversations(json.data.map((c: any) => ({
          id:                   c.id, type: 'school' as const,
          contact_name:         isSchool ? (c.teacher?.full_name || 'Teacher') : (c.school?.name || 'School Office'),
          subject:              c.subject,
          last_message_at:      c.last_message_at || c.created_at,
          last_message_preview: c.last_message_preview || 'No messages yet',
          unread_count:         c.unread_count || 0,
          role:                 isSchool ? 'teacher' : 'school',
        })));
      }
    } catch (err) { console.error('fetchConversations error:', err); }
    finally { if (setLoad) setIsLoading(false); }
  };

  // ── Filter conversations ───────────────────────────────────────────────────
  useEffect(() => {
    let r = conversations;
    if (filterUnread) r = r.filter(c => c.unread_count > 0);
    if (convSearch.trim()) {
      const q = convSearch.toLowerCase();
      r = r.filter(c =>
        c.contact_name.toLowerCase().includes(q) ||
        c.last_message_preview.toLowerCase().includes(q) ||
        c.subject?.toLowerCase().includes(q) ||
        c.phone_number?.includes(q) ||
        c.school_name?.toLowerCase().includes(q) ||
        c.student_name?.toLowerCase().includes(q)
      );
    }
    setFilteredConvs(r);
  }, [conversations, convSearch, filterUnread]);

  // ── Fetch contacts ─────────────────────────────────────────────────────────
  const fetchContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      // 1. Pull portal users (role-aware)
      let q = supabase
        .from('portal_users')
        .select('id, full_name, phone, email, school_name, school_id, role, is_active')
        .eq('is_active', true)
        .neq('id', profile?.id ?? '')
        .order('full_name');

      // School users only see students from their school + their assigned teachers
      if (isSchool && profile?.school_id) {
        q = (q as any).eq('school_id', profile.school_id);
      }
      // Teachers see all except other non-relevant roles (but DO include other teachers for collaboration)
      if (isTeacher) {
        q = (q as any).in('role', ['student', 'parent', 'teacher', 'school', 'admin']);
      }

      const { data: portalUsers } = await q.limit(200);
      const portalContacts: Contact[] = (portalUsers ?? []).map((u: any) => ({
        id:           u.id,
        full_name:    u.full_name || 'Unknown',
        phone:        u.phone,
        email:        u.email,
        school_name:  u.school_name,
        school_id:    u.school_id,
        role:         u.role,
        is_active:    u.is_active,
        source:       'portal' as const,
        portal_user_id: u.id,
      }));

      // 2. Pull external WhatsApp contacts (conversations without a portal_user_id)
      const { data: waConvs } = await supabase
        .from('whatsapp_conversations')
        .select('id, phone_number, contact_name, portal_user_id')
        .is('portal_user_id', null)
        .order('last_message_at', { ascending: false })
        .limit(100);

      const externalContacts: Contact[] = (waConvs ?? []).map((c: any) => ({
        id:        c.id,
        full_name: c.contact_name || c.phone_number || 'Unknown',
        phone:     c.phone_number,
        role:      'external',
        source:    'whatsapp' as const,
      }));

      setContacts([...portalContacts, ...externalContacts]);
    } catch (err) { console.error('fetchContacts error:', err); }
    finally { setContactsLoading(false); }
  }, [profile?.id, profile?.school_id, isSchool, isTeacher]); // eslint-disable-line

  useEffect(() => {
    if (sidebarView === 'contacts' && profile) fetchContacts();
  }, [sidebarView, profile?.id]); // eslint-disable-line

  // ── Filter contacts ────────────────────────────────────────────────────────
  useEffect(() => {
    let r = contacts;
    if (contactRoleFilter !== 'all')      r = r.filter(c => c.role === contactRoleFilter);
    if (contactSchoolFilter.trim())        r = r.filter(c => c.school_name?.toLowerCase().includes(contactSchoolFilter.toLowerCase()));
    if (contactClassFilter.trim())         r = r.filter(c => c.class_name?.toLowerCase().includes(contactClassFilter.toLowerCase()));
    if (contactSearch.trim()) {
      const q = contactSearch.toLowerCase();
      r = r.filter(c =>
        c.full_name.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.school_name?.toLowerCase().includes(q) ||
        c.class_name?.toLowerCase().includes(q)
      );
    }
    setFilteredContacts(r);
  }, [contacts, contactSearch, contactRoleFilter, contactSchoolFilter, contactClassFilter]);

  // ── Save contact from a live conversation (unknown inbound sender) ─────────
  const saveContactFromConversation = () => {
    if (!activeConv) return;
    setEditingContact(null);
    setAddContactForm({
      full_name:   activeConv.contact_name,
      phone:       activeConv.phone_number || '',
      email:       '',
      school_name: activeConv.school_name || '',
      role:        activeConv.role || 'student',
      class_name:  activeConv.class_name || '',
      notes:       '',
    });
    setContactError('');
    setShowAddContact(true);
    setShowSaveBanner(false);
  };

  // ── Fetch messages ─────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (conv: Conversation) => {
    setMsgLoading(true);
    try {
      if (conv.type === 'students') {
        const { data } = await supabase.from('whatsapp_messages').select('*')
          .eq('conversation_id', conv.id).order('created_at', { ascending: true });
        if (data) setMessages(data.map(normaliseMsg));
      } else if (conv.type === 'parents') {
        const { data } = await supabase.from('parent_teacher_messages').select('*')
          .eq('thread_id', conv.id).order('sent_at', { ascending: true });
        if (data) setMessages(data.map(m => ({ ...normaliseMsg(m), conversation_id: m.thread_id })));
      } else {
        const { data } = await supabase.from('school_teacher_messages').select('*')
          .eq('conversation_id', conv.id).order('created_at', { ascending: true });
        if (data) setMessages(data.map(normaliseMsg));
      }
      if (conv.unread_count > 0 && profile?.id) {
        if (conv.type === 'students')
          await supabase.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', conv.id);
        else if (conv.type === 'parents')
          await supabase.from('parent_teacher_messages').update({ is_read: true }).eq('thread_id', conv.id).neq('sender_id', profile.id);
        else
          await supabase.from('school_teacher_messages').update({ is_read: true }).eq('conversation_id', conv.id).neq('sender_id', profile.id);
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
      }
    } catch (err) { console.error('fetchMessages error:', err); }
    finally { setMsgLoading(false); }
  }, [profile?.id]); // eslint-disable-line

  useEffect(() => {
    if (!activeConv) return;
    fetchMessages(activeConv);
    // Show "Save to contacts" banner for WhatsApp convs where the contact isn't in our portal
    if (activeConv.type === 'students' && !activeConv.portal_user_id) {
      setShowSaveBanner(true);
    } else {
      setShowSaveBanner(false);
    }
  }, [activeConv]); // eslint-disable-line
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Profile popup save ────────────────────────────────────────────────────
  const saveProfileAndSend = async () => {
    if (!profileForm.full_name.trim()) return;
    setSavingProfile(true);
    try {
      await supabase.from('portal_users').update({
        full_name:   profileForm.full_name,
        phone:       profileForm.phone || undefined,
        school_name: profileForm.school_name || undefined,
      }).eq('id', profile!.id);
      setShowProfilePopup(false);
      // Now actually send the pending message
      if (pendingSendBody && activeConv && profile) {
        const body = pendingSendBody; setPendingSendBody('');
        await dispatchSend(body);
      }
    } catch (err: any) { setSendError(err.message || 'Failed to save profile.'); }
    finally { setSavingProfile(false); }
  };

  const dispatchSend = async (body: string) => {
    if (!activeConv || !profile) return;
    setIsSending(true);
    try {
      if (activeConv.type === 'students') {
        const res  = await fetch('/api/inbox/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversation_id: activeConv.id, message: body }) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Send failed');
        if (json.data) setMessages(prev => [...prev, normaliseMsg(json.data)]);
      } else if (activeConv.type === 'parents') {
        const { data, error } = await supabase.from('parent_teacher_messages').insert({ thread_id: activeConv.id, sender_id: profile.id, body }).select().single();
        if (error) throw error;
        if (data) setMessages(prev => [...prev, { ...normaliseMsg(data), conversation_id: data.thread_id }]);
      } else {
        // handles both 'school' and 'teachers' tabs — both use school_teacher_messages
        const { data, error } = await supabase.from('school_teacher_messages').insert({ conversation_id: activeConv.id, sender_id: profile.id, body }).select().single();
        if (error) throw error;
        if (data) setMessages(prev => [...prev, normaliseMsg(data)]);
      }
      setConversations(prev => prev.map(c => c.id === activeConv.id ? { ...c, last_message_preview: body, last_message_at: new Date().toISOString() } : c));
    } catch (err: any) {
      setSendError(err.message || 'Failed to send');
    } finally { setIsSending(false); }
  };

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConv || !profile) return;
    // If user hasn't filled name/phone yet — require profile update first
    const needsProfile = !(profile as any).full_name || !(profile as any).phone;
    if (needsProfile && activeConv.type === 'students') {
      const body = newMessage.trim();
      setNewMessage('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      setPendingSendBody(body);
      setProfileForm({ full_name: (profile as any).full_name || '', phone: (profile as any).phone || '', school_name: (profile as any).school_name || '', class_name: '' });
      setShowProfilePopup(true);
      return;
    }
    setSendError('');
    const body = newMessage.trim();
    setNewMessage('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await dispatchSend(body);
  };

  // ── Directory search (New Chat modal) ─────────────────────────────────────
  useEffect(() => {
    if (!showNewChat) { setDirectoryResults([]); setDirectorySearch(''); return; }
    const search = async () => {
      setLoadingDirectory(true);
      try {
        let data: any[] = [];
        if (activeTab === 'students') {
          let q = supabase.from('portal_users').select('id, full_name, phone, school_name, role, enrollment_type').eq('is_active', true).eq('role', 'student');
          if (isSchool && profile?.school_id) q = (q as any).eq('school_id', profile.school_id);
          if (directorySearch) q = q.ilike('full_name', `%${directorySearch}%`);
          data = (await (q.limit(30) as any)).data || [];
        } else if (activeTab === 'parents') {
          let q = supabase.from('portal_users').select('id, full_name, phone, role').eq('is_active', true).eq('role', 'parent');
          if (directorySearch) q = q.ilike('full_name', `%${directorySearch}%`);
          data = (await (q.limit(30) as any)).data || [];
        } else if (activeTab === 'teachers') {
          // Admin → all teachers in the system
          let q = supabase.from('portal_users').select('id, full_name, phone, school_name, role').eq('is_active', true).eq('role', 'teacher');
          if (directorySearch) q = q.ilike('full_name', `%${directorySearch}%`);
          data = (await (q.limit(50) as any)).data || [];
        } else if (isSchool) {
          let q = supabase.from('portal_users').select('id, full_name, phone, role').eq('is_active', true).eq('role', 'teacher');
          if (profile?.school_id) q = (q as any).eq('school_id', profile.school_id);
          if (directorySearch) q = q.ilike('full_name', `%${directorySearch}%`);
          data = (await (q.limit(30) as any)).data || [];
        } else {
          let q = supabase.from('schools').select('id, name, email').order('name');
          if (directorySearch) q = q.ilike('name', `%${directorySearch}%`);
          data = (await (q.limit(30) as any)).data || [];
        }
        setDirectoryResults(data);
      } catch { setDirectoryResults([]); }
      finally { setLoadingDirectory(false); }
    };
    const t = setTimeout(search, 250);
    return () => clearTimeout(t);
  }, [directorySearch, showNewChat, activeTab]); // eslint-disable-line

  // ── Start new conversation ─────────────────────────────────────────────────
  const startNewConversation = async (item: any) => {
    setShowNewChat(false);
    try {
      if (activeTab === 'students') {
        const cleanPhone = item.phone?.replace(/\D/g, '');
        if (!cleanPhone) { setSendError('This student has no phone number on file.'); return; }
        const { data: existing } = await supabase.from('whatsapp_conversations').select('*').eq('phone_number', cleanPhone).maybeSingle();
        const conv = existing || (await supabase.from('whatsapp_conversations').insert({ phone_number: cleanPhone, contact_name: item.full_name, portal_user_id: item.id, last_message_at: new Date().toISOString(), last_message_preview: '' }).select().single()).data;
        if (conv) {
          const c: Conversation = { id: conv.id, type: 'students', phone_number: cleanPhone, contact_name: item.full_name, last_message_at: conv.last_message_at ?? '', last_message_preview: conv.last_message_preview || '', unread_count: 0, school_name: item.school_name, role: item.role || 'student', portal_user_id: item.id };
          setConversations(prev => [c, ...prev.filter(x => x.id !== c.id)]);
          setActiveConv(c); setShowSidebar(false);
          setSidebarView('chats'); setActiveTab('students');
        }
      } else if (activeTab === 'teachers' || activeTab === 'school') {
        const subject = window.prompt(activeTab === 'teachers' ? `Message to ${item.full_name} — subject:` : 'Subject for this conversation:');
        if (!subject?.trim()) return;
        const res = await fetch('/api/school-teacher/conversations', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            school_id:  isSchool ? (profile?.school_id || '') : (activeTab === 'teachers' ? null : item.id),
            teacher_id: isSchool ? item.id : (activeTab === 'teachers' ? item.id : profile?.id),
            subject:    subject.trim(),
          }),
        });
        const json = await res.json();
        if (json.data) {
          const isTeacherTab = activeTab === 'teachers';
          const c: Conversation = {
            id:                   json.data.id,
            type:                 isTeacherTab ? 'teachers' : 'school',
            contact_name:         isTeacherTab ? (item.full_name || 'Teacher') : isSchool ? (item.full_name || 'Teacher') : (item.name || 'School'),
            school_name:          isTeacherTab ? item.school_name : undefined,
            role:                 isTeacherTab ? 'teacher' : isSchool ? 'teacher' : 'school',
            subject:              subject.trim(),
            last_message_at:      json.data.created_at || new Date().toISOString(),
            last_message_preview: '',
            unread_count:         0,
          };
          setConversations(prev => [c, ...prev.filter(x => x.id !== c.id)]);
          setActiveConv(c); setShowSidebar(false);
          setSidebarView('chats'); setActiveTab(isTeacherTab ? 'teachers' : 'school');
        }
      }
    } catch (err) { console.error(err); }
  };

  // ── Start chat from contact card ───────────────────────────────────────────
  const startChatFromContact = async (contact: Contact) => {
    setActiveContact(null);
    const role = contact.role;
    // Determine which tab this contact belongs to
    if (role === 'student' || role === 'external') {
      setSidebarView('chats'); setActiveTab('students');
      await fetchConversations('students');
      // Find existing conversation
      const { data: existing } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .or(contact.phone ? `phone_number.eq.${contact.phone?.replace(/\D/g, '')}` : `portal_user_id.eq.${contact.id}`)
        .maybeSingle();
      if (existing) {
        const c: Conversation = {
          id: existing.id, type: 'students',
          phone_number:         existing.phone_number,
          contact_name:         contact.full_name,
          last_message_at:      existing.last_message_at ?? '',
          last_message_preview: existing.last_message_preview || '',
          unread_count:         existing.unread_count || 0,
          school_name:          contact.school_name,
          role:                 contact.role,
          portal_user_id:       contact.portal_user_id,
        };
        setActiveConv(c); setShowSidebar(false);
      } else if (contact.phone) {
        // create new conversation
        const cleanPhone = contact.phone.replace(/\D/g, '');
        const { data: created } = await supabase.from('whatsapp_conversations').insert({
          phone_number: cleanPhone, contact_name: contact.full_name,
          portal_user_id: contact.portal_user_id || null,
          last_message_at: new Date().toISOString(), last_message_preview: '',
        }).select().single();
        if (created) {
          const c: Conversation = { id: created.id, type: 'students', phone_number: cleanPhone, contact_name: contact.full_name, last_message_at: created.last_message_at ?? '', last_message_preview: '', unread_count: 0, school_name: contact.school_name, role: contact.role };
          setConversations(prev => [c, ...prev]);
          setActiveConv(c); setShowSidebar(false);
        }
      } else {
        setSendError(`${contact.full_name} has no phone number. Update their profile first.`);
      }
    } else if (role === 'parent') {
      setSidebarView('chats'); setActiveTab('parents');
      await fetchConversations('parents');
    } else if (role === 'teacher') {
      // Admin → use Teachers tab; teacher/school → use School tab
      const targetTab = isAdmin ? 'teachers' : 'school';
      setSidebarView('chats'); setActiveTab(targetTab);
      await fetchConversations(targetTab);
    } else {
      // role === 'school' | 'admin' → internal school tab
      setSidebarView('chats'); setActiveTab('school');
      await fetchConversations('school');
    }
  };

  // ── Save new / edit contact ────────────────────────────────────────────────
  const saveContact = async () => {
    if (!addContactForm.full_name.trim()) { setContactError('Name is required.'); return; }
    setSavingContact(true); setContactError('');
    try {
      if (editingContact) {
        // Update portal_users if it's a portal contact
        if (editingContact.source === 'portal') {
          const { error } = await supabase.from('portal_users').update({
            full_name:   addContactForm.full_name,
            phone:       addContactForm.phone || undefined,
            school_name: addContactForm.school_name || undefined,
          }).eq('id', editingContact.id);
          if (error) throw error;
        } else {
          // Update whatsapp_conversations contact_name / phone_number
          const { error } = await supabase.from('whatsapp_conversations').update({
            contact_name: addContactForm.full_name,
            phone_number: addContactForm.phone?.replace(/\D/g, '') || undefined,
          }).eq('id', editingContact.id);
          if (error) throw error;
        }
        setContacts(prev => prev.map(c => c.id === editingContact.id ? {
          ...c,
          full_name:   addContactForm.full_name,
          phone:       addContactForm.phone,
          email:       addContactForm.email,
          school_name: addContactForm.school_name,
        } : c));
      } else {
        // New contact: create whatsapp_conversations record for external contacts
        const cleanPhone = addContactForm.phone?.replace(/\D/g, '');
        const insertPayload: Record<string, unknown> = {
          contact_name:         addContactForm.full_name,
          last_message_at:      new Date().toISOString(),
          last_message_preview: '',
          unread_count:         0,
        };
        if (cleanPhone) insertPayload.phone_number = cleanPhone;
        const { data, error } = await (supabase.from('whatsapp_conversations') as any).insert(insertPayload).select().single();
        if (error) throw error;
        const newContact: Contact = {
          id:        data.id,
          full_name: addContactForm.full_name,
          phone:     cleanPhone,
          email:     addContactForm.email,
          school_name: addContactForm.school_name,
          role:      addContactForm.role,
          class_name: addContactForm.class_name,
          source:    'whatsapp',
        };
        setContacts(prev => [newContact, ...prev]);
      }
      setShowAddContact(false);
      setEditingContact(null);
      setAddContactForm(EMPTY_CONTACT_FORM);
    } catch (err: any) {
      setContactError(err.message || 'Failed to save contact.');
    } finally { setSavingContact(false); }
  };

  const openEditContact = (c: Contact) => {
    setEditingContact(c);
    setAddContactForm({ full_name: c.full_name, phone: c.phone || '', email: c.email || '', school_name: c.school_name || '', role: c.role, class_name: c.class_name || '', notes: '' });
    setShowAddContact(true);
  };

  // ── Auto-resize textarea ───────────────────────────────────────────────────
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
    </div>
  );
  if (!hasAccess) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <X className="w-16 h-16 text-rose-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-white/50 mb-6">Messaging is restricted to staff members.</p>
        <Link href="/dashboard" className="px-6 py-2 bg-orange-600 text-white font-bold rounded-xl">Back to Dashboard</Link>
      </div>
    </div>
  );

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);

  // Unique school & class values from contacts (for filter dropdowns)
  const uniqueSchools = Array.from(new Set(contacts.map(c => c.school_name).filter(Boolean))) as string[];
  const uniqueClasses = Array.from(new Set(contacts.map(c => c.class_name).filter(Boolean))) as string[];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-64px)] md:h-[calc(100vh-80px)] overflow-hidden bg-[#111b21] max-w-[1400px] mx-auto md:my-4 md:rounded-2xl md:border border-white/10 md:shadow-2xl">

      {/* ══ SIDEBAR ══════════════════════════════════════════════════════════ */}
      <div className={`${showSidebar ? 'flex' : 'hidden'} md:flex w-full md:w-[360px] lg:w-[400px] flex-col bg-[#111b21] border-r border-white/[0.08] shrink-0`}>

        {/* Sidebar Header */}
        <div className="h-14 px-4 flex items-center justify-between bg-[#202c33] shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-black text-[16px] tracking-tight">
              {sidebarView === 'contacts' ? 'Contacts' : 'Inbox'}
            </h2>
            {sidebarView === 'chats' && totalUnread > 0 && (
              <span className="bg-orange-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{totalUnread}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {sidebarView === 'chats' ? (
              <>
                <button onClick={() => setFilterUnread(v => !v)} title={filterUnread ? 'Show all' : 'Unread only'}
                  className={`p-2 rounded-full transition-colors ${filterUnread ? 'bg-orange-500 text-white' : 'text-white/50 hover:bg-white/10'}`}>
                  <Filter className="w-4 h-4" />
                </button>
                <button onClick={() => setShowNewChat(true)} className="p-2 text-white/50 hover:bg-white/10 rounded-full transition-colors" title="New chat">
                  <Plus className="w-5 h-5" />
                </button>
              </>
            ) : (
              <button onClick={() => { setShowAddContact(true); setEditingContact(null); setAddContactForm(EMPTY_CONTACT_FORM); setContactError(''); }}
                className="p-2 text-white/50 hover:bg-white/10 rounded-full transition-colors" title="Add contact">
                <UserPlus className="w-5 h-5" />
              </button>
            )}
            {/* Toggle chats ↔ contacts */}
            <button
              onClick={() => { setSidebarView(v => v === 'chats' ? 'contacts' : 'chats'); setActiveContact(null); }}
              title={sidebarView === 'chats' ? 'View contacts' : 'Back to chats'}
              className={`p-2 rounded-full transition-colors ${sidebarView === 'contacts' ? 'bg-orange-500/20 text-orange-400' : 'text-white/50 hover:bg-white/10'}`}
            >
              <BookUser className="w-5 h-5" />
            </button>
          </div>
        </div>

        {sidebarView === 'chats' ? (
          <>
            {/* Tabs */}
            <div className="flex bg-[#202c33] border-b border-white/[0.06] shrink-0">
              {tabs.map(tab => (
                <button key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setActiveConv(null); setConvSearch(''); setFilterUnread(false); }}
                  className={`flex-1 flex flex-col items-center py-2.5 gap-1 transition-all border-b-2 text-[10px] font-black uppercase tracking-wider ${
                    activeTab === tab.id ? 'border-orange-400 text-orange-400' : 'border-transparent text-white/40 hover:text-white/60 hover:bg-white/5'
                  }`}>
                  <tab.icon className="w-4 h-4" />{tab.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="px-3 py-2 bg-[#111b21] shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input value={convSearch} onChange={e => setConvSearch(e.target.value)}
                  placeholder={`Search ${activeTab === 'school' && isSchool ? 'teachers' : activeTab}…`}
                  className="w-full bg-[#2a3942] text-white text-sm rounded-lg pl-10 pr-4 py-2 outline-none placeholder-white/30 focus:ring-1 focus:ring-orange-500/40" />
                {convSearch && (
                  <button onClick={() => setConvSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {filterUnread && (
              <div className="px-4 pb-1 shrink-0">
                <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Showing unread only</span>
              </div>
            )}

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {isLoading ? (
                <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-orange-400" /></div>
              ) : filteredConvs.length === 0 ? (
                <div className="text-center p-12">
                  <MessageSquare className="w-10 h-10 text-white/10 mx-auto mb-3" />
                  <p className="text-white/30 text-sm">{convSearch || filterUnread ? 'No matching conversations.' : 'No conversations yet.'}</p>
                  {!convSearch && !filterUnread && (
                    <button onClick={() => setShowNewChat(true)} className="mt-3 text-orange-400 text-sm font-bold hover:underline">Start one →</button>
                  )}
                </div>
              ) : (
                filteredConvs.map(conv => (
                  <div key={conv.id} onClick={() => { setActiveConv(conv); setShowSidebar(false); setShowInfo(false); }}
                    className={`flex items-center px-3 py-3 cursor-pointer transition-colors border-b border-white/[0.04] group ${activeConv?.id === conv.id ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]'}`}>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-[15px] text-white shrink-0 mr-3 ${AVATAR_COLORS[conv.type]}`}>
                      {initials(conv.contact_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <span className="font-bold text-white text-[15px] truncate">{conv.contact_name}</span>
                        <span className={`text-[11px] shrink-0 ml-2 ${conv.unread_count > 0 ? 'text-orange-400' : 'text-white/30'}`}>{formatConvTime(conv.last_message_at)}</span>
                      </div>
                      {(conv.subject || conv.student_name) && (
                        <p className="text-[11px] text-orange-400/80 font-bold truncate">{conv.subject || `Re: ${conv.student_name}`}</p>
                      )}
                      {/* Meta pills */}
                      <div className="flex items-center gap-1 flex-wrap mt-0.5">
                        {conv.role && <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${ROLE_COLORS[conv.role] || 'bg-white/10 text-white/40'}`}>{conv.role}</span>}
                        {conv.school_name && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-white/5 text-white/30 truncate max-w-[90px]">{conv.school_name}</span>}
                        {conv.class_name  && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400">{conv.class_name}</span>}
                      </div>
                      <div className="flex justify-between items-center mt-0.5">
                        <p className="text-[13px] text-white/40 truncate mr-2">{conv.last_message_preview || 'No messages yet'}</p>
                        {conv.unread_count > 0 && (
                          <span className="bg-orange-500 text-white text-[10px] font-black min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full shrink-0">{conv.unread_count}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          /* ── CONTACTS VIEW ─────────────────────────────────────────────── */
          <>
            {/* Contact search + filters */}
            <div className="px-3 py-2 bg-[#111b21] shrink-0 space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input value={contactSearch} onChange={e => setContactSearch(e.target.value)}
                  placeholder="Search contacts…"
                  className="w-full bg-[#2a3942] text-white text-sm rounded-lg pl-10 pr-4 py-2 outline-none placeholder-white/30 focus:ring-1 focus:ring-orange-500/40" />
                {contactSearch && (
                  <button onClick={() => setContactSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"><X className="w-3.5 h-3.5" /></button>
                )}
              </div>
              {/* Role filter chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 custom-scrollbar">
                {['all', 'student', 'parent', 'teacher', 'school', 'external'].map(r => (
                  <button key={r} onClick={() => setContactRoleFilter(r)}
                    className={`shrink-0 text-[9px] font-black uppercase px-2.5 py-1 rounded-full transition-colors ${contactRoleFilter === r ? 'bg-orange-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
                    {r}
                  </button>
                ))}
                <button onClick={() => setShowAdvancedFilters(v => !v)}
                  className={`shrink-0 text-[9px] font-black uppercase px-2.5 py-1 rounded-full transition-colors flex items-center gap-1 ${showAdvancedFilters || contactSchoolFilter || contactClassFilter ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
                  <Filter className="w-2.5 h-2.5" /> More
                </button>
              </div>

              {/* Advanced filters — school & class */}
              {showAdvancedFilters && (
                <div className="space-y-2 pt-1">
                  <div className="relative">
                    <School className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
                    <select value={contactSchoolFilter} onChange={e => setContactSchoolFilter(e.target.value)}
                      className="w-full bg-[#2a3942] text-white text-xs rounded-lg pl-8 pr-3 py-2 outline-none appearance-none focus:ring-1 focus:ring-orange-500/40">
                      <option value="">All Schools</option>
                      {uniqueSchools.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="relative">
                    <GraduationCap className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
                    <select value={contactClassFilter} onChange={e => setContactClassFilter(e.target.value)}
                      className="w-full bg-[#2a3942] text-white text-xs rounded-lg pl-8 pr-3 py-2 outline-none appearance-none focus:ring-1 focus:ring-orange-500/40">
                      <option value="">All Classes / Grades</option>
                      {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {(contactSchoolFilter || contactClassFilter) && (
                    <button onClick={() => { setContactSchoolFilter(''); setContactClassFilter(''); }}
                      className="text-[10px] text-orange-400/70 hover:text-orange-400 font-bold transition-colors">
                      Clear filters ×
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Contact count */}
            <div className="px-4 py-1.5 shrink-0 flex items-center justify-between">
              <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">
                {contactsLoading ? 'Loading…' : `${filteredContacts.length} contact${filteredContacts.length !== 1 ? 's' : ''}`}
              </span>
              <button onClick={fetchContacts} className="text-[10px] text-orange-400/60 hover:text-orange-400 font-bold transition-colors">Refresh</button>
            </div>

            {/* Contact list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {contactsLoading ? (
                <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-orange-400" /></div>
              ) : filteredContacts.length === 0 ? (
                <div className="text-center p-12">
                  <UserCircle className="w-10 h-10 text-white/10 mx-auto mb-3" />
                  <p className="text-white/30 text-sm">{contactSearch || contactRoleFilter !== 'all' ? 'No matching contacts.' : 'No contacts yet.'}</p>
                  <button onClick={() => { setShowAddContact(true); setEditingContact(null); setAddContactForm(EMPTY_CONTACT_FORM); }}
                    className="mt-3 text-orange-400 text-sm font-bold hover:underline">Add one →</button>
                </div>
              ) : (
                filteredContacts.map(contact => (
                  <div key={contact.id}
                    onClick={() => setActiveContact(prev => prev?.id === contact.id ? null : contact)}
                    className={`px-3 py-3 cursor-pointer transition-colors border-b border-white/[0.04] group ${activeContact?.id === contact.id ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-sm text-white shrink-0 ${
                        contact.role === 'student' ? 'bg-emerald-500' : contact.role === 'parent' ? 'bg-orange-500' :
                        contact.role === 'teacher' ? 'bg-blue-600' : contact.role === 'school' ? 'bg-indigo-600' : 'bg-white/20'
                      }`}>
                        {initials(contact.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-[14px] truncate">{contact.full_name}</span>
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 ${ROLE_COLORS[contact.role] || 'bg-white/10 text-white/40'}`}>{contact.role}</span>
                          {contact.source === 'whatsapp' && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-900/40 text-emerald-500 shrink-0">WA</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {contact.phone && <span className="text-[11px] text-emerald-400 flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{contact.phone}</span>}
                          {contact.school_name && <span className="text-[11px] text-white/30 truncate max-w-[110px]">{contact.school_name}</span>}
                          {contact.class_name  && <span className="text-[11px] text-violet-400">{contact.class_name}</span>}
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-white/20 shrink-0 transition-transform ${activeContact?.id === contact.id ? 'rotate-90 text-orange-400' : 'group-hover:text-orange-400'}`} />
                    </div>

                    {/* Expanded contact actions */}
                    {activeContact?.id === contact.id && (
                      <div className="mt-3 ml-14 flex flex-wrap gap-2" onClick={e => e.stopPropagation()}>
                        <button onClick={() => startChatFromContact(contact)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-[11px] font-black rounded-full transition-colors">
                          <MessageSquare className="w-3 h-3" /> Message
                        </button>
                        {contact.phone && (
                          <a href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black rounded-full transition-colors">
                            <ExternalLink className="w-3 h-3" /> WhatsApp
                          </a>
                        )}
                        {contact.email && (
                          <a href={`mailto:${contact.email}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[11px] font-black rounded-full transition-colors">
                            <Mail className="w-3 h-3" /> Email
                          </a>
                        )}
                        <button onClick={() => openEditContact(contact)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 text-[11px] font-black rounded-full transition-colors">
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        {/* Full detail row */}
                        {(contact.email || contact.school_name) && (
                          <div className="w-full mt-1 bg-[#111b21] rounded-xl p-2 space-y-1">
                            {contact.email      && <p className="text-[11px] text-white/40"><span className="text-white/20 font-bold">Email:</span> {contact.email}</p>}
                            {contact.school_name && <p className="text-[11px] text-white/40"><span className="text-white/20 font-bold">School:</span> {contact.school_name}</p>}
                            {contact.class_name  && <p className="text-[11px] text-white/40"><span className="text-white/20 font-bold">Class:</span> {contact.class_name}</p>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* ══ CHAT AREA ════════════════════════════════════════════════════════ */}
      <div className={`${showSidebar ? 'hidden' : 'flex'} md:flex flex-1 flex-col relative overflow-hidden`}>
        {activeConv ? (
          <>
            {/* Chat Header */}
            <div className="h-14 px-3 bg-[#202c33] flex items-center justify-between border-b border-white/[0.06] shrink-0 z-10">
              <div className="flex items-center flex-1 min-w-0 gap-3">
                <button onClick={() => { setShowSidebar(true); setActiveConv(null); setShowInfo(false); }} className="md:hidden text-white/50 hover:text-white">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button onClick={() => setShowInfo(v => !v)} className="flex items-center gap-2 flex-1 min-w-0 text-left group">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm text-white shrink-0 ${AVATAR_COLORS[activeConv.type]}`}>
                    {initials(activeConv.contact_name)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-white text-[15px] truncate group-hover:text-orange-300 transition-colors">{activeConv.contact_name}</h3>
                    <p className="text-[11px] text-white/40 truncate">
                      {activeConv.type === 'students' && activeConv.phone_number ? `+${activeConv.phone_number}` :
                       activeConv.subject ? activeConv.subject :
                       activeConv.student_name ? `Re: ${activeConv.student_name}` :
                       activeConv.type === 'school' && isSchool ? 'Teacher' : activeConv.type}
                    </p>
                  </div>
                </button>
              </div>
              <div className="flex items-center gap-1">
                {activeConv.phone_number && (
                  <a href={`https://wa.me/${activeConv.phone_number}`} target="_blank" rel="noopener noreferrer"
                    className="p-2 text-white/50 hover:text-emerald-400 hover:bg-white/10 rounded-full transition-colors" title="Open in WhatsApp">
                    <Phone className="w-5 h-5" />
                  </a>
                )}
                <button onClick={() => setShowInfo(v => !v)} className={`p-2 rounded-full transition-colors ${showInfo ? 'text-orange-400 bg-white/10' : 'text-white/50 hover:bg-white/10'}`} title="Contact info">
                  <Info className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* ── Save-to-contacts banner ── */}
            {showSaveBanner && (
              <div className="shrink-0 bg-orange-500/10 border-b border-orange-500/20 px-4 py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <UserPlus className="w-4 h-4 text-orange-400 shrink-0" />
                  <p className="text-orange-300 text-xs font-bold truncate">
                    <span className="text-white">{activeConv.contact_name}</span> is not in your contacts yet.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={saveContactFromConversation}
                    className="px-3 py-1 bg-orange-500 hover:bg-orange-400 text-white text-[11px] font-black rounded-full transition-colors">
                    Add Contact
                  </button>
                  <button onClick={() => setShowSaveBanner(false)} className="text-white/30 hover:text-white/60">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Chat body */}
            <div className="flex flex-1 overflow-hidden">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 md:p-5 flex flex-col gap-1 custom-scrollbar"
                style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.02\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")', backgroundColor: '#0b141a' }}>
                {msgLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-white/30" /></div>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-center py-12">
                    <div className="bg-[#202c33] rounded-2xl px-6 py-4 max-w-xs">
                      <p className="text-white/50 text-sm">No messages yet.</p>
                      {activeConv.type === 'students' && activeConv.phone_number && (
                        <a href={`https://wa.me/${activeConv.phone_number}`} target="_blank" rel="noopener noreferrer"
                          className="mt-2 text-xs text-emerald-400 font-bold flex items-center justify-center gap-1 hover:underline">
                          <Phone className="w-3 h-3" /> Open in WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isMine   = msg.sender_id === profile?.id || msg.direction === 'outbound';
                    const showDate = idx === 0 || !sameDay(messages[idx - 1].created_at, msg.created_at);
                    return (
                      <React.Fragment key={msg.id}>
                        {showDate && (
                          <div className="flex justify-center my-3">
                            <span className="bg-[#202c33] text-white/50 text-[11px] font-bold px-3 py-1 rounded-full">{formatDateSep(msg.created_at)}</span>
                          </div>
                        )}
                        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] md:max-w-[65%] shadow-md ${
                            isMine ? 'bg-[#005c4b] text-white rounded-2xl rounded-tr-sm px-3.5 py-2' : 'bg-[#202c33] text-white rounded-2xl rounded-tl-sm px-3.5 pt-2 pb-2'
                          }`}>
                            {/* Inbound meta row — role/school/class for teachers/admins */}
                            {!isMine && (
                              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                <span className="text-orange-400 text-[11px] font-black">{activeConv.contact_name}</span>
                                {activeConv.role && (
                                  <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${ROLE_COLORS[activeConv.role] || 'bg-white/10 text-white/40'}`}>{activeConv.role}</span>
                                )}
                                <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${CHANNEL_COLORS[activeConv.type]}`}>
                                  {activeConv.type === 'students' ? 'WhatsApp' : activeConv.type === 'parents' ? 'Parent' : activeConv.type === 'teachers' ? 'Teacher' : 'School'}
                                </span>
                                {activeConv.school_name && (
                                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-white/5 text-white/40 truncate max-w-[120px]">{activeConv.school_name}</span>
                                )}
                                {activeConv.class_name && (
                                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400">{activeConv.class_name}</span>
                                )}
                              </div>
                            )}
                            <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">{msg.body}</p>
                            <div className={`flex items-center justify-end gap-1 mt-1 ${isMine ? 'text-white/50' : 'text-white/30'}`}>
                              <span className="text-[10px]">{formatMsgTime(msg.created_at)}</span>
                              {isMine && (
                                msg.is_read || msg.status === 'read' ? <CheckCheck className="w-3.5 h-3.5 text-blue-400" /> :
                                msg.status === 'delivered'           ? <CheckCheck className="w-3.5 h-3.5" /> :
                                                                       <Check className="w-3.5 h-3.5" />
                              )}
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* ── Info Panel ──────────────────────────────────────────── */}
              {showInfo && (
                <div className="w-[280px] shrink-0 bg-[#111b21] border-l border-white/[0.08] overflow-y-auto custom-scrollbar">
                  <div className="p-5 text-center border-b border-white/[0.08]">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center font-black text-2xl text-white mx-auto mb-3 ${AVATAR_COLORS[activeConv.type]}`}>
                      {initials(activeConv.contact_name)}
                    </div>
                    <h3 className="text-white font-black text-lg">{activeConv.contact_name}</h3>
                    <p className="text-white/40 text-xs uppercase font-bold tracking-widest mt-0.5 capitalize">{activeConv.role || activeConv.type}</p>
                  </div>
                  <div className="p-4 space-y-3 text-sm">
                    {activeConv.phone_number && (
                      <div className="bg-[#202c33] rounded-xl p-3">
                        <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1">Phone / WhatsApp</p>
                        <a href={`https://wa.me/${activeConv.phone_number}`} target="_blank" rel="noopener noreferrer"
                          className="text-emerald-400 font-bold text-sm hover:underline flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5" />+{activeConv.phone_number}
                        </a>
                      </div>
                    )}
                    {activeConv.school_name && (
                      <div className="bg-[#202c33] rounded-xl p-3">
                        <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1">School</p>
                        <p className="text-white text-sm font-bold">{activeConv.school_name}</p>
                      </div>
                    )}
                    {activeConv.student_name && (
                      <div className="bg-[#202c33] rounded-xl p-3">
                        <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1">About Student</p>
                        <p className="text-white text-sm font-bold">{activeConv.student_name}</p>
                      </div>
                    )}
                    {activeConv.subject && (
                      <div className="bg-[#202c33] rounded-xl p-3">
                        <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1">Subject</p>
                        <p className="text-white text-sm font-bold">{activeConv.subject}</p>
                      </div>
                    )}
                    <div className="bg-[#202c33] rounded-xl p-3">
                      <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1">Channel</p>
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm font-bold capitalize">{activeConv.type}</p>
                        {activeConv.role && <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${ROLE_COLORS[activeConv.role] || 'bg-white/10 text-white/40'}`}>{activeConv.role}</span>}
                      </div>
                    </div>
                    {activeConv.type === 'students' && activeConv.phone_number && (
                      <a href={`https://wa.me/${activeConv.phone_number}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black rounded-xl transition-colors">
                        <Phone className="w-4 h-4" /> Open in WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Message Input */}
            <div className="shrink-0 bg-[#202c33] border-t border-white/[0.06]">
              {sendError && (
                <div className="px-4 py-2 bg-rose-500/10 text-rose-400 text-xs font-bold flex items-center justify-between">
                  <span>{sendError}</span>
                  <button onClick={() => setSendError('')}><X className="w-3 h-3" /></button>
                </div>
              )}
              <form onSubmit={handleSend} className="flex items-end gap-2 px-3 py-2">
                <textarea ref={textareaRef} value={newMessage} onChange={handleTextareaChange}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); } }}
                  placeholder="Type a message…" rows={1}
                  className="flex-1 bg-[#2a3942] text-white text-[15px] rounded-2xl px-4 py-3 outline-none resize-none placeholder-white/30 focus:ring-1 focus:ring-white/20 transition-all max-h-[120px] overflow-y-auto" />
                <button type="submit" disabled={!newMessage.trim() || isSending}
                  className="w-11 h-11 bg-orange-500 hover:bg-orange-400 disabled:bg-white/10 text-white rounded-full flex items-center justify-center transition-all shrink-0 shadow-lg shadow-orange-500/20">
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
                </button>
              </form>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8"
            style={{ backgroundColor: '#0b141a', backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.015\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
            <div className="w-24 h-24 bg-[#202c33] rounded-full flex items-center justify-center mb-6 border border-white/10">
              <MessageSquare className="w-12 h-12 text-white/20" />
            </div>
            <h1 className="text-2xl font-black text-white/80 mb-3">Unified Inbox</h1>
            <p className="text-white/30 max-w-sm text-sm leading-relaxed">
              {isAdmin   ? 'Manage WhatsApp, parent & school communications across all channels.' :
               isSchool  ? 'Communicate with your students via WhatsApp and your teachers via direct messages.' :
               'Manage student WhatsApp messages, parent threads, and school communications.'}
            </p>
            <div className="flex items-center gap-3 mt-6">
              <button onClick={() => setShowNewChat(true)} className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white text-sm font-black rounded-full transition-colors shadow-lg shadow-orange-500/20">
                <Plus className="w-4 h-4" /> New Chat
              </button>
              <button onClick={() => setSidebarView('contacts')} className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 text-sm font-black rounded-full transition-colors">
                <BookUser className="w-4 h-4" /> Contacts
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══ NEW CHAT MODAL ═══════════════════════════════════════════════════ */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#202c33] md:rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] shrink-0">
              <div>
                <h2 className="text-white font-black text-lg">
                  New {activeTab === 'teachers' ? 'Teacher' : activeTab === 'school' && isSchool ? 'Teacher' : activeTab === 'parents' ? 'Parent' : activeTab === 'students' ? 'Student' : 'School'} Chat
                </h2>
                <p className="text-white/30 text-xs mt-0.5">
                  {activeTab === 'students' ? 'Search students by name or school' :
                   activeTab === 'parents'  ? 'Search parents by name' :
                   isSchool                 ? 'Search teachers in your school' : 'Search partner schools'}
                </p>
              </div>
              <button onClick={() => setShowNewChat(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5 text-white/50" /></button>
            </div>
            <div className="px-4 py-3 border-b border-white/[0.06] shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input autoFocus value={directorySearch} onChange={e => setDirectorySearch(e.target.value)}
                  placeholder="Type to search…"
                  className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-orange-500/40" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {loadingDirectory ? (
                <div className="p-12 text-center"><Loader2 className="w-7 h-7 animate-spin mx-auto text-orange-400" /></div>
              ) : directoryResults.length === 0 ? (
                <div className="p-12 text-center text-white/30 text-sm">{directorySearch ? 'No results found.' : 'Start typing to search…'}</div>
              ) : (
                directoryResults.map(item => (
                  <button key={item.id} onClick={() => startNewConversation(item)}
                    className="w-full flex items-center px-4 py-3 hover:bg-[#2a3942] transition-colors text-left group border-b border-white/[0.04]">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-sm text-white shrink-0 mr-3 ${AVATAR_COLORS[activeTab]}`}>
                      {initials(item.full_name || item.name || 'U')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-[14px] truncate">{item.full_name || item.name}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        {item.phone       && <span className="text-[11px] text-emerald-400 flex items-center gap-1"><Phone className="w-2.5 h-2.5" />+{item.phone.replace(/\D/g, '')}</span>}
                        {item.school_name && <span className="text-[11px] text-white/30 truncate">{item.school_name}</span>}
                        {item.email       && <span className="text-[11px] text-white/30 truncate">{item.email}</span>}
                        {item.role        && <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded-full ${ROLE_COLORS[item.role] || 'bg-white/10 text-white/40'}`}>{item.role}</span>}
                        {!item.phone && activeTab === 'students' && <span className="text-[10px] text-rose-400 font-bold">No phone</span>}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-orange-400 transition-colors" />
                  </button>
                ))
              )}
            </div>
            {activeTab === 'parents' && (
              <div className="px-5 py-3 bg-[#111b21] border-t border-white/[0.06] text-xs text-white/30 text-center">
                To start a parent conversation, go to the student's profile and initiate from there.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ ADD / EDIT CONTACT MODAL ════════════════════════════════════════ */}
      {showAddContact && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#202c33] md:rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center">
                  {editingContact ? <Pencil className="w-4 h-4 text-orange-400" /> : <UserPlus className="w-4 h-4 text-orange-400" />}
                </div>
                <div>
                  <h2 className="text-white font-black text-[16px]">{editingContact ? 'Edit Contact' : 'New Contact'}</h2>
                  <p className="text-white/30 text-xs">{editingContact ? 'Update contact details' : 'Add to your contact book'}</p>
                </div>
              </div>
              <button onClick={() => { setShowAddContact(false); setEditingContact(null); setContactError(''); }}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5 text-white/50" /></button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
              {contactError && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-sm font-bold flex items-center gap-2">
                  <X className="w-4 h-4 shrink-0" />{contactError}
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                  Full Name <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <UserCircle className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={addContactForm.full_name} onChange={e => setAddContactForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="e.g. Amara Okonkwo" autoFocus
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-orange-500/40" />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Phone / WhatsApp</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={addContactForm.phone} onChange={e => setAddContactForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+234 800 000 0000" type="tel"
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-orange-500/40" />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={addContactForm.email} onChange={e => setAddContactForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="name@school.edu.ng" type="email"
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-orange-500/40" />
                </div>
              </div>

              {/* Role */}
              {!editingContact && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Role / Type</label>
                  <div className="flex gap-2 flex-wrap">
                    {['student', 'parent', 'teacher', 'school', 'external'].map(r => (
                      <button key={r} type="button" onClick={() => setAddContactForm(f => ({ ...f, role: r }))}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-black uppercase transition-colors ${addContactForm.role === r ? 'bg-orange-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* School */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">School / Organisation</label>
                <div className="relative">
                  <School className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={addContactForm.school_name} onChange={e => setAddContactForm(f => ({ ...f, school_name: e.target.value }))}
                    placeholder="e.g. Lagos Academy"
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-orange-500/40" />
                </div>
              </div>

              {/* Class */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Class / Group</label>
                <div className="relative">
                  <GraduationCap className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={addContactForm.class_name} onChange={e => setAddContactForm(f => ({ ...f, class_name: e.target.value }))}
                    placeholder="e.g. JSS 2A"
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-orange-500/40" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Notes (optional)</label>
                <textarea value={addContactForm.notes} onChange={e => setAddContactForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any additional context…" rows={2}
                  className="w-full bg-[#2a3942] text-white text-sm rounded-xl px-4 py-2.5 outline-none resize-none placeholder-white/30 focus:ring-1 focus:ring-orange-500/40" />
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-white/[0.08] shrink-0 flex gap-3">
              <button onClick={() => { setShowAddContact(false); setEditingContact(null); setContactError(''); }}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-black transition-colors">
                Cancel
              </button>
              <button onClick={saveContact} disabled={savingContact || !addContactForm.full_name.trim()}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:bg-white/10 disabled:text-white/30 text-white text-sm font-black transition-colors flex items-center justify-center gap-2">
                {savingContact ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : (editingContact ? 'Save Changes' : 'Add Contact')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ══ PROFILE REQUIRED POPUP ══════════════════════════════════════════ */}
      {showProfilePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#202c33] rounded-2xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 text-center border-b border-white/[0.08]">
              <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mx-auto mb-4 border-2 border-orange-500/20">
                <UserCircle className="w-8 h-8 text-orange-400" />
              </div>
              <h2 className="text-white font-black text-lg">Complete Your Profile</h2>
              <p className="text-white/40 text-xs mt-1 leading-relaxed">
                Before sending a message, please fill in your details so recipients know who you are.
              </p>
            </div>

            {/* Form */}
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Your Full Name <span className="text-rose-400">*</span></label>
                <div className="relative">
                  <UserCircle className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={profileForm.full_name} onChange={e => setProfileForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="e.g. Mrs. Adaeze Okafor" autoFocus
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-orange-500/40" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Phone / WhatsApp</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+234 800 000 0000" type="tel"
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-orange-500/40" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">School / Organisation</label>
                <div className="relative">
                  <School className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={profileForm.school_name} onChange={e => setProfileForm(f => ({ ...f, school_name: e.target.value }))}
                    placeholder="e.g. Lagos Academy"
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-orange-500/40" />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => { setShowProfilePopup(false); setPendingSendBody(''); }}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-black transition-colors">
                Cancel
              </button>
              <button onClick={saveProfileAndSend} disabled={savingProfile || !profileForm.full_name.trim()}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:bg-white/10 disabled:text-white/30 text-white text-sm font-black transition-colors flex items-center justify-center gap-2">
                {savingProfile ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save & Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
