"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
  Search, Send, Phone, Check, CheckCheck,
  Loader2, X, MessageSquare, Users, Building2, Plus,
  ChevronLeft, Info, Filter, UserCircle, UserPlus,
  BookUser, Mail, School, GraduationCap, ChevronRight,
  Pencil, AtSign, FileText, CheckCircle2,
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
  assigned_staff_id?: string | null;
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

interface EmailComposeForm {
  to: string;
  to_name: string;
  subject: string;
  body: string;
  cc: string;
}

interface SubjectDialogState {
  open: boolean;
  subject: string;
  pendingItem: any;
}

const EMPTY_EMAIL_FORM: EmailComposeForm = {
  to: '', to_name: '', subject: '', body: '', cc: '',
};

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
  parents:  'bg-primary',
  school:   'bg-blue-600',
  teachers: 'bg-violet-600',
};
const ROLE_COLORS: Record<string, string> = {
  student: 'bg-emerald-500/20 text-emerald-400',
  parent:  'bg-primary/20 text-primary',
  teacher: 'bg-violet-500/20 text-violet-400',
  school:  'bg-blue-500/20 text-blue-400',
  admin:   'bg-rose-500/20 text-rose-400',
};
const CHANNEL_COLORS: Record<InboxCategory, string> = {
  students: 'bg-emerald-900/40 text-emerald-500',
  parents:  'bg-orange-900/40 text-primary',
  school:   'bg-blue-900/40 text-blue-500',
  teachers: 'bg-violet-900/40 text-violet-500',
};

// ── Component ────────────────────────────────────────────────────────────────
export default function UnifiedInbox() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);

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
  const [policySignal, setPolicySignal]       = useState<string>('');
  const [queueSummary, setQueueSummary]       = useState<{ all: number; unassigned: number; overdue: number; needs_escalation: number } | null>(null);
  const [queueFilter, setQueueFilter]         = useState<'all' | 'unassigned' | 'overdue' | 'needs_escalation'>('all');
  const [convPriority, setConvPriority]       = useState<'low' | 'medium' | 'high'>('medium');
  const [convSlaDueAt, setConvSlaDueAt]       = useState('');
  const [savingConvMeta, setSavingConvMeta]   = useState(false);

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

  // Quick chat by number (floating button)
  const [showQuickChat, setShowQuickChat]       = useState(false);
  const [quickChatNumber, setQuickChatNumber]   = useState('');
  const [quickChatError, setQuickChatError]     = useState('');

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

  // Email compose
  const [showEmailCompose, setShowEmailCompose] = useState(false);
  const [emailForm, setEmailForm] = useState<EmailComposeForm>(EMPTY_EMAIL_FORM);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [showConfirmDetailsCard, setShowConfirmDetailsCard] = useState(false);
  const [confirmingDetails, setConfirmingDetails] = useState(false);
  const [confirmDetailsForm, setConfirmDetailsForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    school_name: '',
    class_name: '',
    confirmed: false,
  });

  // Staff assignment (Multi-user)
  const [staff, setStaff] = useState<any[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [reportingConversation, setReportingConversation] = useState(false);

  // Subject dialog (replaces window.prompt for school/teacher convs)
  const [subjectDialog, setSubjectDialog] = useState<SubjectDialogState>({ open: false, subject: '', pendingItem: null });

  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const activeConvRef   = useRef<Conversation | null>(null);

  const isSchool  = profile?.role === 'school';
  const isTeacher = profile?.role === 'teacher';
  const isAdmin   = profile?.role === 'admin';
  const hasAccess = ['teacher', 'admin', 'school', 'staff', 'parent', 'student'].includes(profile?.role ?? '');
  const isParentOrStudent = ['parent', 'student'].includes(profile?.role ?? '');
  const isStaff = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');

  // Keep ref in sync every render so realtime callbacks always see the current conversation
  activeConvRef.current = activeConv;

  // Students and parents land on the 3-path empty state first on mobile,
  // not the conversation sidebar — sidebar is reachable via back button.
  useEffect(() => {
    if (isParentOrStudent) setShowSidebar(false);
  }, [isParentOrStudent]);

  useEffect(() => {
    if (!hasAccess) return;
    fetch('/api/progression/communication-policy-status')
      .then((r) => r.json())
      .then((j) => {
        const d = j.data;
        if (!d) return;
        if (typeof d.daily_remaining === 'number' && d.daily_limit < 9999) {
          setPolicySignal(`Daily messages left: ${d.daily_remaining}/${d.daily_limit}. Cooldown: ${d.cooldown_seconds_between_messages}s.`);
        } else {
          setPolicySignal('Messaging safety policy is active.');
        }
      })
      .catch(() => {});
  }, [hasAccess]);

  useEffect(() => {
    if (!isStaff || activeTab !== 'students') return;
    fetch(`/api/inbox/queue?filter=${queueFilter}`)
      .then((r) => r.json())
      .then((j) => setQueueSummary(j.summary ?? null))
      .catch(() => {});
  }, [isStaff, activeTab, queueFilter, conversations.length]);

  useEffect(() => {
    const convId = activeConv?.id;
    const convType = activeConv?.type;
    if (!convId || convType !== 'students' || !isStaff) return;
    fetch(`/api/inbox/conversation-meta?conversation_id=${encodeURIComponent(convId)}`)
      .then((r) => r.json())
      .then((j) => {
        const d = j.data;
        setConvPriority((d?.priority === 'low' || d?.priority === 'high') ? d.priority : 'medium');
        setConvSlaDueAt(typeof d?.sla_due_at === 'string' ? String(d.sla_due_at).slice(0, 16) : '');
      })
      .catch(() => {
        setConvPriority('medium');
        setConvSlaDueAt('');
      });
  }, [activeConv?.id, activeConv?.type, isStaff]);

  const saveConversationMeta = async () => {
    if (!activeConv || activeConv.type !== 'students') return;
    setSavingConvMeta(true);
    try {
      const res = await fetch('/api/inbox/conversation-meta', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: activeConv.id,
          priority: convPriority,
          sla_due_at: convSlaDueAt ? new Date(convSlaDueAt).toISOString() : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to save conversation policy');
      setPolicySignal('Conversation priority/SLA saved.');
    } catch (err: any) {
      setSendError(err.message || 'Failed to save conversation policy');
    } finally {
      setSavingConvMeta(false);
    }
  };

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'students'  as const, label: isParentOrStudent ? 'Contact Center' : 'WhatsApp', icon: MessageSquare },
    ...(!isSchool && !isParentOrStudent ? [{ id: 'parents' as const, label: 'Parents',             icon: Users }] : []),
    ...(isAdmin   ? [{ id: 'teachers' as const, label: 'Teachers',           icon: GraduationCap }] : []),
    ...(!isParentOrStudent ? [{ id: 'school' as const, label: isSchool ? 'Teachers' : isAdmin ? 'Schools' : 'School', icon: Building2 }] : []),
  ];

  // ── Real-time ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    fetchConversations(activeTab);
    if (isAdmin || isSchool) fetchStaff();

    // For student/parent: filter realtime to their own conversation only
    const channelName = `wa_inbox_${profile.id}`;
    let ch;

    if (isParentOrStudent) {
      // Students/parents only need to watch whatsapp_messages for their own conversation
      ch = supabase.channel(channelName)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
        }, p => handleRealtime('students', p.new as any))
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_conversations',
        }, () => fetchConversations('students', false))
        .subscribe();
    } else {
      ch = supabase.channel(channelName)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' },
          p => handleRealtime('students', p.new as any))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'parent_teacher_messages' },
          p => handleRealtime('parents', p.new as any))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'school_teacher_messages' },
          p => handleRealtime('school', p.new as any))
        .subscribe();
    }

    return () => { supabase.removeChannel(ch); };
  }, [profile?.id, activeTab]); // eslint-disable-line

  // ── Polling fallback for student/parent (realtime can miss messages) ──────
  useEffect(() => {
    if (!profile || !isParentOrStudent) return;
    const interval = setInterval(() => {
      fetchConversations('students', false);
    }, 15000); // poll every 15s
    return () => clearInterval(interval);
  }, [profile?.id, isParentOrStudent]); // eslint-disable-line

  // ── Auto-open conversation for student/parent (they only have one) ────────
  useEffect(() => {
    if (!isParentOrStudent || activeConv || conversations.length === 0) return;
    const conv = conversations[0];
    setActiveConv(conv);
    fetchMessages(conv);
    setShowSidebar(false);
  }, [conversations, isParentOrStudent]); // eslint-disable-line

  useEffect(() => {
    if (!profile || !isStaff || activeTab !== 'students') return;
    void fetchConversations('students');
  }, [queueFilter]); // eslint-disable-line

  useEffect(() => {
    if (!profile || !isParentOrStudent) return;
    const key = `details_confirmed_${profile.id}`;
    const confirmedOnce = typeof window !== 'undefined' ? window.localStorage.getItem(key) === '1' : false;
    const hasRequired = Boolean(profile.full_name && profile.email && profile.phone && profile.school_name && profile.section_class);
    setConfirmDetailsForm({
      full_name: profile.full_name || '',
      email: profile.email || '',
      phone: profile.phone || '',
      school_name: profile.school_name || '',
      class_name: profile.section_class || '',
      confirmed: confirmedOnce,
    });
    setShowConfirmDetailsCard(!confirmedOnce || !hasRequired);
  }, [profile?.id, isParentOrStudent]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitConfirmDetails = async () => {
    if (!profile) return;
    setConfirmingDetails(true);
    setSendError('');
    try {
      const res = await fetch('/api/customer-book/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmDetailsForm),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not confirm details');
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`details_confirmed_${profile.id}`, '1');
      }
      setShowConfirmDetailsCard(false);
      setPolicySignal('Profile details confirmed. You can now send support messages with proper school/class tags.');
    } catch (err: any) {
      setSendError(err.message || 'Could not confirm details');
    } finally {
      setConfirmingDetails(false);
    }
  };

  const startSupportConversation = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/inbox', { method: 'POST' });
      const json = await res.json();
      if (json.data) {
        await fetchConversations(activeTab);
        const raw = json.data;
        const conv: Conversation = {
          id: raw.id,
          type: 'students' as const,
          contact_name: raw.contact_name || 'Support',
          last_message_at: raw.last_message_at || new Date().toISOString(),
          last_message_preview: raw.last_message_preview || '',
          unread_count: 0,
          role: profile?.role || 'student',
          portal_user_id: raw.portal_user_id,
          phone_number: raw.phone_number,
        };
        setActiveConv(conv);
        setSidebarView('chats');
      }
    } catch (err: any) {
      setSendError(err.message || 'Failed to start support conversation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRealtime = (type: InboxCategory, msg: any) => {
    if (type === activeTab) fetchConversations(type, false);
    const convId = msg.conversation_id || msg.thread_id;
    // Read from ref so this callback always sees the current conversation,
    // even when the subscription was established before the user navigated.
    const currentConv = activeConvRef.current;
    if (currentConv && currentConv.id === convId) {
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, normaliseMsg(msg)]);
      if (msg.direction === 'inbound' || msg.sender_id !== profile?.id) {
        markAsRead(currentConv);
      }
    } else if (isParentOrStudent && convId) {
      // For student/parent: if message is for their conversation (even if not open), refresh list
      fetchConversations('students', false);
    }
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
        if (isParentOrStudent || isTeacher) {
          const res = await fetch('/api/inbox');
          const json = await res.json();
          const rows = json.data ?? [];
          setConversations(rows.map((c: any) => ({
            id: c.id,
            type: 'students' as const,
            phone_number: c.phone_number,
            contact_name: c.contact_name || c.portal_users?.full_name || c.phone_number || 'Unknown',
            last_message_at: c.last_message_at || '',
            last_message_preview: c.last_message_preview || '',
            unread_count: c.unread_count || 0,
            school_name: c.school_name || c.portal_users?.school_name || null,
            role: c.portal_users?.role || (c.portal_user_id ? 'student' : 'external'),
            portal_user_id: c.portal_user_id ?? undefined,
            assigned_staff_id: c.assigned_staff_id,
          })));
          return;
        }

        if (isAdmin || isSchool) {
          if (queueFilter !== 'all') {
            const res = await fetch(`/api/inbox/queue?filter=${queueFilter}`);
            const json = await res.json().catch(() => ({}));
            const rows = Array.isArray(json?.data) ? json.data : [];
            setConversations(rows.map((c: any) => ({
              id: c.id,
              type: 'students' as const,
              phone_number: c.phone_number,
              contact_name: c.contact_name || c.phone_number || 'Unknown',
              last_message_at: c.last_message_at || '',
              last_message_preview: '',
              unread_count: c.unread_count || 0,
              school_name: null,
              role: 'student',
              portal_user_id: undefined,
              assigned_staff_id: c.assigned_staff_id ?? undefined,
            })));
            setQueueSummary(json?.summary ?? null);
            return;
          }

          const query = supabase
            .from('whatsapp_conversations')
            .select('*, portal_user:portal_users!portal_user_id(full_name, phone, school_name, role)')
            .order('last_message_at', { ascending: false });

          const { data } = await query;
          if (data) setConversations(data.map(c => ({
            id:                   c.id,
            type:                 'students' as const,
            phone_number:         c.phone_number,
            contact_name:         c.contact_name || (c.portal_user as any)?.full_name || c.phone_number || 'Unknown',
            last_message_at:      c.last_message_at || '',
            last_message_preview: c.last_message_preview || '',
            unread_count:         c.unread_count || 0,
            school_name:          (c.portal_user as any)?.school_name || c.school_name,
            role:                 (c.portal_user as any)?.role || (c.portal_user_id ? 'student' : 'external'),
            portal_user_id:       c.portal_user_id ?? undefined,
            assigned_staff_id:    c.assigned_staff_id,
          })));
        }
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

  // ── Fetch Staff for assignment ───────────────────────────────────────────
  const fetchStaff = async () => {
    const { data } = await supabase
      .from('portal_users')
      .select('id, full_name, role, avatar_url')
      .in('role', ['admin', 'teacher', 'school'])
      .eq('is_active', true);
    if (data) setStaff(data);
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

      // Students and parents: only their school's teachers + platform admins — no other students, parents, or external
      if (isParentOrStudent) {
        q = (q as any).in('role', ['teacher', 'admin']);
        if (profile?.school_id) {
          q = (q as any).or(`school_id.eq.${profile.school_id},role.eq.admin`);
        } else {
          q = (q as any).eq('role', 'admin');
        }
      }
      // School users only see their own school users
      else if (isSchool && profile?.school_id) {
        q = (q as any).eq('school_id', profile.school_id);
      }
      // Teachers see students, parents, and staff (not other schools' students)
      else if (isTeacher) {
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

      // 2. External WhatsApp contacts (staff-only — students/parents must not see these)
      let externalContacts: Contact[] = [];
      if (!isParentOrStudent) {
        const { data: waConvs } = await supabase
          .from('whatsapp_conversations')
          .select('id, phone_number, contact_name, portal_user_id')
          .is('portal_user_id', null)
          .order('last_message_at', { ascending: false })
          .limit(100);
        externalContacts = (waConvs ?? []).map((c: any) => ({
          id:        c.id,
          full_name: c.contact_name || c.phone_number || 'Unknown',
          phone:     c.phone_number,
          role:      'external',
          source:    'whatsapp' as const,
        }));
      }

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
  const markAsRead = async (conv: Conversation) => {
    if (!profile?.id) return;
    try {
      if (conv.type === 'students') {
        await supabase.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', conv.id);
      } else if (conv.type === 'parents') {
        await supabase.from('parent_teacher_messages').update({ is_read: true }).eq('thread_id', conv.id).neq('sender_id', profile.id);
      } else {
        await supabase.from('school_teacher_messages').update({ is_read: true }).eq('conversation_id', conv.id).neq('sender_id', profile.id);
      }
      
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
    } catch (err) { console.error('markAsRead error:', err); }
  };

  // ── Fetch messages ─────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (conv: Conversation) => {
    setMsgLoading(true);
    try {
      if (conv.type === 'students') {
        // Always use the server endpoint so RLS on whatsapp_messages never blocks any role.
        // The endpoint handles access scoping per-role and marks the conversation as read.
        const res = await fetch(`/api/inbox?conversation_id=${encodeURIComponent(conv.id)}`);
        const json = await res.json();
        if (json.data) setMessages((json.data as any[]).map(normaliseMsg));
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
        return;
      } else if (conv.type === 'parents') {
        // Use server endpoint — marks as read and bypasses any RLS gaps
        const res = await fetch(`/api/parent-teacher/threads/${encodeURIComponent(conv.id)}/messages`);
        const json = await res.json();
        if (json.data) setMessages((json.data as any[]).map(normaliseMsg));
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
        return;
      } else {
        // school / teachers tab — use server endpoint
        const res = await fetch(`/api/school-teacher/conversations/${encodeURIComponent(conv.id)}/messages`);
        const json = await res.json();
        if (json.data) setMessages((json.data as any[]).map(normaliseMsg));
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
        return;
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
        section_class: profileForm.class_name || undefined,
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
        if (json.policy && typeof json.policy.remaining_daily === 'number') {
          setPolicySignal(`Daily messages left: ${json.policy.remaining_daily}.`);
        }
        
        // Show warning if number is not on WhatsApp
        if (json.is_not_whatsapp_user) {
          setSendError(`⚠️ ${json.message || 'This number is not registered on WhatsApp'}`);
        } else if (json.whatsapp_status === 'pending') {
          setSendError(`ℹ️ ${json.message || 'Message saved but not sent via WhatsApp'}`);
        }
      } else if (activeConv.type === 'parents') {
        const res = await fetch(`/api/parent-teacher/threads/${encodeURIComponent(activeConv.id)}/messages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Send failed');
        if (json.data) setMessages(prev => [...prev, normaliseMsg(json.data)]);
      } else {
        // handles both 'school' and 'teachers' tabs
        const res = await fetch(`/api/school-teacher/conversations/${encodeURIComponent(activeConv.id)}/messages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Send failed');
        if (json.data) setMessages(prev => [...prev, normaliseMsg(json.data)]);
      }
      setConversations(prev => prev.map(c => c.id === activeConv.id ? { ...c, last_message_preview: body, last_message_at: new Date().toISOString() } : c));
    } catch (err: any) {
      setSendError(err.message || 'Failed to send');
    } finally { setIsSending(false); }
  };

  const reportConversation = async () => {
    if (!activeConv) return;
    setReportingConversation(true);
    try {
      const res = await fetch('/api/progression/communication-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_conversation_id: activeConv.id,
          reason: 'conversation_safety_concern',
          details: `Reported from inbox (${activeConv.type})`,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to submit report');
      setPolicySignal('Safety report submitted. Staff moderation queue updated.');
    } catch (err: any) {
      setSendError(err.message || 'Failed to submit safety report');
    } finally {
      setReportingConversation(false);
    }
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
          if (isParentOrStudent) {
            // Students/Parents only see Admin/Support staff
            const { data: staffData } = await supabase
              .from('portal_users')
              .select('id, full_name, phone, school_name, role')
              .in('role', ['admin', 'teacher', 'school'])
              .eq('is_active', true);
            
            data = (staffData ?? []).map((u: any) => ({
              id: u.id,
              full_name: u.full_name || 'Staff',
              phone: u.phone,
              school_name: u.school_name || null,
              role: u.role || 'staff',
              isExternalWA: false,
            }));
            setDirectoryResults(data);
            return;
          }

          // WhatsApp tab — search ALL contacts with phone numbers (any role) + external phonebook
          let q = supabase.from('portal_users')
            .select('id, full_name, phone, school_name, role, enrollment_type')
            .eq('is_active', true)
            .not('phone', 'is', null);
          if (isSchool && profile?.school_id) q = (q as any).eq('school_id', profile.school_id);
          if (isTeacher && profile?.school_id) q = (q as any).eq('school_id', profile.school_id);
          if (directorySearch) q = q.ilike('full_name', `%${directorySearch}%`);
          const portalData = (await (q.limit(30) as any)).data || [];

          // Also pull external phonebook (whatsapp_conversations without portal_user_id)
          let extQ = supabase.from('whatsapp_conversations')
            .select('id, contact_name, phone_number')
            .is('portal_user_id', null)
            .order('last_message_at', { ascending: false });
          if (directorySearch) extQ = extQ.ilike('contact_name', `%${directorySearch}%`);
          const extRaw = (await extQ.limit(20)).data || [];
          const extContacts = extRaw.map((c: any) => ({
            id:           c.id,
            full_name:    c.contact_name || c.phone_number || 'Unknown',
            phone:        c.phone_number,
            role:         'external',
            isExternalWA: true,   // flag: already has a WA conversation record
          }));

          data = [...portalData, ...extContacts];
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

  // ── Quick chat by number ───────────────────────────────────────────────────
  const startQuickChat = async () => {
    if (isParentOrStudent) {
      setQuickChatError('Quick chat by number is disabled for student/parent accounts.');
      return;
    }
    const phone = quickChatNumber.replace(/\D/g, '');
    if (!phone || phone.length < 7) {
      setQuickChatError('Please enter a valid phone number (at least 7 digits)');
      return;
    }
    setQuickChatError('');
    setShowQuickChat(false);
    setQuickChatNumber('');
    
    // Check if conversation exists
    const { data: existing } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('phone_number', phone)
      .maybeSingle();
    
    if (existing) {
      // Open existing conversation
      const c: Conversation = {
        id: existing.id,
        type: 'students',
        phone_number: existing.phone_number,
        contact_name: existing.contact_name || `+${phone}`,
        last_message_at: existing.last_message_at ?? '',
        last_message_preview: existing.last_message_preview || '',
        unread_count: existing.unread_count || 0,
        portal_user_id: existing.portal_user_id ?? undefined,
      };
      setConversations(prev => [c, ...prev.filter(x => x.id !== c.id)]);
      setActiveConv(c);
      setShowSidebar(false);
      setSidebarView('chats');
      setActiveTab('students');
    } else {
      // Create new conversation
      const { data: created } = await supabase
        .from('whatsapp_conversations')
        .insert({
          phone_number: phone,
          contact_name: `+${phone}`,
          last_message_at: new Date().toISOString(),
          last_message_preview: '',
          unread_count: 0,
        })
        .select()
        .single();
      
      if (created) {
        const c: Conversation = {
          id: created.id,
          type: 'students',
          phone_number: phone,
          contact_name: `+${phone}`,
          last_message_at: created.last_message_at ?? '',
          last_message_preview: '',
          unread_count: 0,
        };
        setConversations(prev => [c, ...prev]);
        setActiveConv(c);
        setShowSidebar(false);
        setSidebarView('chats');
        setActiveTab('students');
      }
    }
  };

  // ── Open / create a WhatsApp conversation for any contact with a phone ─────
  const openWhatsAppConversation = async (item: {
    id: string; full_name: string; phone?: string; phone_number?: string;
    role?: string; school_name?: string; isExternalWA?: boolean;
  }) => {
    const phone = (item.phone || item.phone_number || '').replace(/\D/g, '');
    if (!phone) { setSendError(`${item.full_name} has no phone number on file.`); return; }

    if (item.isExternalWA) {
      // item.id IS the whatsapp_conversations.id — just open it
      const { data: conv } = await supabase.from('whatsapp_conversations').select('*').eq('id', item.id).maybeSingle();
      if (conv) {
        const c: Conversation = { id: conv.id, type: 'students', phone_number: conv.phone_number, contact_name: conv.contact_name || item.full_name, last_message_at: conv.last_message_at ?? '', last_message_preview: conv.last_message_preview || '', unread_count: conv.unread_count || 0, role: 'external' };
        setConversations(prev => [c, ...prev.filter(x => x.id !== c.id)]);
        setActiveConv(c); setShowSidebar(false);
        setSidebarView('chats'); setActiveTab('students');
      }
      return;
    }

    // Portal user — find or create via server endpoint (sets assigned_staff_id for teachers)
    const convRes = await fetch('/api/inbox/conversation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone_number: phone,
        contact_name: item.full_name,
        portal_user_id: item.id === item.phone ? null : item.id,
      }),
    });
    const convJson = await convRes.json();
    const conv = convJson.data;

    if (conv) {
      const c: Conversation = {
        id: conv.id, type: 'students', phone_number: phone,
        contact_name: item.full_name, last_message_at: conv.last_message_at ?? '',
        last_message_preview: conv.last_message_preview || '', unread_count: 0,
        school_name: item.school_name, role: item.role || 'external',
        portal_user_id: item.id,
      };
      setConversations(prev => [c, ...prev.filter(x => x.id !== c.id)]);
      setActiveConv(c); setShowSidebar(false);
      setSidebarView('chats'); setActiveTab('students');
    }
  };

  // ── Start new conversation ─────────────────────────────────────────────────
  const startNewConversation = async (item: any) => {
    setShowNewChat(false);
    try {
      if (activeTab === 'students') {
        await openWhatsAppConversation(item);
      } else if (activeTab === 'parents') {
        // Find or create a parent-teacher thread for this parent.
        // We need the linked student_id — find it via portal_users.
        if (!profile?.id) return;
        const { data: studentRow } = await supabase
          .from('portal_users')
          .select('id')
          .eq('role', 'student')
          .eq('school_id', item.school_id || profile.school_id || '')
          .limit(1)
          .maybeSingle();
        const studentId = studentRow?.id ?? item.student_id ?? null;

        const { data: existing } = await supabase
          .from('parent_teacher_threads')
          .select('*')
          .eq('parent_id', item.id)
          .eq('teacher_id', profile.id)
          .maybeSingle();
        const thread = existing || (
          await (supabase.from('parent_teacher_threads') as any)
            .insert({ parent_id: item.id, teacher_id: profile.id, student_id: studentId })
            .select()
            .single()
        ).data;
        if (thread) {
          const c: Conversation = {
            id:                   thread.id,
            type:                 'parents' as const,
            contact_name:         item.full_name || 'Parent',
            last_message_at:      thread.created_at || new Date().toISOString(),
            last_message_preview: 'No messages yet',
            unread_count:         0,
            role:                 'parent',
          };
          setConversations(prev => [c, ...prev.filter(x => x.id !== c.id)]);
          setActiveConv(c);
          setShowSidebar(false);
          setSidebarView('chats');
          setActiveTab('parents');
        }
      } else if (activeTab === 'teachers' || activeTab === 'school') {
        // Open subject dialog instead of window.prompt
        setSubjectDialog({ open: true, subject: '', pendingItem: item });
      }
    } catch (err) { console.error(err); }
  };

  // ── Confirm subject dialog and create school/teacher conversation ─────────
  const confirmSubjectAndCreate = async () => {
    const item    = subjectDialog.pendingItem;
    const subject = subjectDialog.subject.trim();
    if (!subject || !item) return;
    setSubjectDialog({ open: false, subject: '', pendingItem: null });
    try {
      const isTeacherTab = activeTab === 'teachers';
      const res = await fetch('/api/school-teacher/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id:  isSchool ? (profile?.school_id || '') : (isTeacherTab ? null : item.id),
          teacher_id: isSchool ? item.id : (isTeacherTab ? item.id : profile?.id),
          subject,
        }),
      });
      const json = await res.json();
      if (json.data) {
        const c: Conversation = {
          id:                   json.data.id,
          type:                 isTeacherTab ? 'teachers' : 'school',
          contact_name:         isTeacherTab ? (item.full_name || 'Teacher') : isSchool ? (item.full_name || 'Teacher') : (item.name || 'School'),
          school_name:          isTeacherTab ? item.school_name : undefined,
          role:                 isTeacherTab ? 'teacher' : isSchool ? 'teacher' : 'school',
          subject,
          last_message_at:      json.data.created_at || new Date().toISOString(),
          last_message_preview: '',
          unread_count:         0,
        };
        setConversations(prev => [c, ...prev.filter(x => x.id !== c.id)]);
        setActiveConv(c); setShowSidebar(false);
        setSidebarView('chats'); setActiveTab(isTeacherTab ? 'teachers' : 'school');
      }
    } catch (err) { console.error('confirmSubjectAndCreate error:', err); }
  };

  // ── Send real email via SendPulse ─────────────────────────────────────────
  const sendEmail = async () => {
    if (!emailForm.to.trim() || !emailForm.subject.trim() || !emailForm.body.trim()) {
      setEmailError('To, Subject, and Body are all required.'); return;
    }
    setSendingEmail(true); setEmailError(''); setEmailSuccess('');
    try {
      const res = await fetch('/api/inbox/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...emailForm,
          origin_school_name: (profile as any)?.school_name || '',
          origin_class_name: (profile as any)?.section_class || '',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json?.code === 'profile_tags_required') {
          throw new Error('Update your school and class profile details before sending support email.');
        }
        throw new Error(json.error || 'Email send failed');
      }
      setEmailSuccess(`Email sent to ${emailForm.to_name || emailForm.to}`);
      setTimeout(() => { setShowEmailCompose(false); setEmailForm(EMPTY_EMAIL_FORM); setEmailSuccess(''); }, 2000);
    } catch (err: any) {
      setEmailError(err.message || 'Failed to send email.');
    } finally { setSendingEmail(false); }
  };

  // ── Open email compose pre-filled from a contact or conversation ──────────
  const openEmailCompose = (contact?: Contact | Conversation | null) => {
    setEmailForm({
      to:       (contact as any)?.email || (contact as any)?.phone_number || '',
      to_name:  (contact as any)?.full_name || (contact as any)?.contact_name || '',
      subject:  '',
      body:     '',
      cc:       '',
    });
    setEmailError(''); setEmailSuccess('');
    setShowEmailCompose(true);
  };

  const openSupportEmailCompose = () => {
    setEmailForm({
      to: 'support@rillcod.com',
      to_name: 'Rillcod Support',
      subject: `${profile?.role === 'teacher' ? 'Teacher' : profile?.role === 'parent' ? 'Parent' : 'Student'} support request`,
      body: '',
      cc: '',
    });
    setEmailError('');
    setEmailSuccess('');
    setShowEmailCompose(true);
  };

  const openAdminEmailCompose = () => {
    setEmailForm({
      to: 'support@rillcod.com',
      to_name: 'Rillcod Admin Team',
      subject: 'Attention: Admin Team',
      body: '',
      cc: '',
    });
    setEmailError('');
    setEmailSuccess('');
    setShowEmailCompose(true);
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

  const assignConversation = async (convId: string, staffId: string | null) => {
    setAssigningId(convId);
    try {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ assigned_staff_id: staffId })
        .eq('id', convId);
      
      if (error) throw error;
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, assigned_staff_id: staffId } : c));
      if (activeConv?.id === convId) {
        setActiveConv(prev => prev ? { ...prev, assigned_staff_id: staffId } : null);
      }
    } catch (err) {
      console.error('assignConversation error:', err);
    } finally {
      setAssigningId(null);
    }
  };

  const assignToMe = async (convId: string) => {
    if (!profile) return;
    await assignConversation(convId, profile.id);
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
    <div className="h-full bg-[#111b21] flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
  if (!hasAccess) return (
    <div className="h-full bg-[#111b21] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <X className="w-16 h-16 text-rose-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-white/50 mb-6">Your account does not have inbox access.</p>
        <Link href="/dashboard" className="px-6 py-2 bg-primary text-white font-bold rounded-xl">Back to Dashboard</Link>
      </div>
    </div>
  );

  const totalUnread = conversations.reduce((s, c) => s + (c.unread_count || 0), 0);

  // Unique school & class values from contacts (for filter dropdowns)
  const uniqueSchools = Array.from(new Set(contacts.map(c => c.school_name).filter(Boolean))) as string[];
  const uniqueClasses = Array.from(new Set(contacts.map(c => c.class_name).filter(Boolean))) as string[];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full overflow-hidden bg-[#111b21]">

      {/* ══ SIDEBAR ══════════════════════════════════════════════════════════ */}
      <div className={`${showSidebar ? 'flex' : 'hidden'} md:flex w-full md:w-[340px] lg:w-[380px] flex-col bg-[#111b21] border-r border-white/[0.07] shrink-0`}>

        {/* Sidebar Header */}
        <div className="h-[56px] px-4 flex items-center justify-between bg-[#1f2c34] shrink-0 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-black text-[16px] tracking-tight">
              {sidebarView === 'contacts' ? 'Contacts' : 'Inbox'}
            </h2>
            {sidebarView === 'chats' && totalUnread > 0 && (
              <span className="bg-primary text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{totalUnread}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => { setShowAddContact(true); setEditingContact(null); setAddContactForm(EMPTY_CONTACT_FORM); setContactError(''); }}
              className="p-2 text-white/50 hover:bg-white/10 rounded-full transition-colors" title="Add contact">
              <UserPlus className="w-5 h-5" />
            </button>
            {sidebarView === 'chats' ? (
              <>
                <button onClick={() => setFilterUnread(v => !v)} title={filterUnread ? 'Show all' : 'Unread only'}
                  className={`p-2 rounded-full transition-colors ${filterUnread ? 'bg-primary text-white' : 'text-white/50 hover:bg-white/10'}`}>
                  <Filter className="w-4 h-4" />
                </button>
                <button onClick={() => openEmailCompose()} className="p-2 text-white/50 hover:text-violet-400 hover:bg-white/10 rounded-full transition-colors" title="Compose email">
                  <Mail className="w-4 h-4" />
                </button>
                <button onClick={isParentOrStudent ? startSupportConversation : () => setShowNewChat(true)} className="p-2 text-white/50 hover:bg-white/10 rounded-full transition-colors" title="New chat">
                  <Plus className="w-5 h-5" />
                </button>
              </>
            ) : null}
            {!isParentOrStudent && (
              <button
                onClick={() => { setSidebarView(v => v === 'chats' ? 'contacts' : 'chats'); setActiveContact(null); }}
                title={sidebarView === 'chats' ? 'View contacts' : 'Back to chats'}
                className={`p-2 rounded-full transition-colors ${sidebarView === 'contacts' ? 'bg-primary/20 text-primary' : 'text-white/50 hover:bg-white/10'}`}
              >
                <BookUser className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {sidebarView === 'chats' ? (
          <>
            {/* Tabs */}
            <div className="flex bg-[#111b21] border-b border-white/[0.06] shrink-0">
              {tabs.map(tab => (
                <button key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setActiveConv(null); setConvSearch(''); setFilterUnread(false); }}
                  className={`flex-1 flex flex-col items-center py-2.5 gap-1 transition-all border-b-2 text-[9px] font-black uppercase tracking-wider ${
                    activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-white/35 hover:text-white/60 hover:bg-white/[0.03]'
                  }`}>
                  <tab.icon className="w-[15px] h-[15px]" />{tab.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="px-3 py-2.5 bg-[#111b21] shrink-0">
              <div className="relative">
                <Search className="w-[15px] h-[15px] absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                <input value={convSearch} onChange={e => setConvSearch(e.target.value)}
                  placeholder={`Search ${activeTab === 'school' && isSchool ? 'teachers' : activeTab}…`}
                  className="w-full bg-[#2a3942] text-white text-[13px] rounded-lg pl-9 pr-4 py-[7px] outline-none placeholder-white/25 focus:ring-1 focus:ring-primary/30" />
                {convSearch && (
                  <button onClick={() => setConvSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {isStaff && activeTab === 'students' && queueSummary && (
              <div className="px-3 pb-2 shrink-0 flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: `All ${queueSummary.all}` },
                  { id: 'unassigned', label: `Unassigned ${queueSummary.unassigned}` },
                  { id: 'overdue', label: `Overdue ${queueSummary.overdue}` },
                  { id: 'needs_escalation', label: `Escalate ${queueSummary.needs_escalation}` },
                ].map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setQueueFilter(q.id as typeof queueFilter)}
                    className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${
                      queueFilter === q.id ? 'bg-violet-500/30 text-violet-200' : 'bg-white/5 text-white/40 hover:bg-white/10'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}

            {isParentOrStudent && (
              <div className="px-3 pb-3 shrink-0">
                <div className="bg-primary/10 border border-primary/20 p-3 rounded-lg">
                  <h4 className="text-[10px] font-black text-brand-red-600 uppercase tracking-[0.2em] mb-2">Support Channels</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={startSupportConversation} className="flex flex-col items-center gap-1 p-2 bg-[#202c33] border border-white/5 hover:border-primary/40 rounded-lg transition-all group">
                      <MessageSquare className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-bold text-white/50 uppercase">In-App</span>
                    </button>
                    <a href="https://wa.me/2348123456789" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 p-2 bg-[#202c33] border border-white/5 hover:border-emerald-500/40 rounded-lg transition-all group">
                      <Phone className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-bold text-white/50 uppercase">WhatsApp</span>
                    </a>
                    <button onClick={openSupportEmailCompose} className="flex flex-col items-center gap-1 p-2 bg-[#202c33] border border-white/5 hover:border-violet-500/40 rounded-lg transition-all group">
                      <Mail className="w-4 h-4 text-violet-500 group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-bold text-white/50 uppercase">Email</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {isLoading ? (
                <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : filteredConvs.length === 0 ? (
                <div className="text-center p-12">
                  <MessageSquare className="w-10 h-10 text-white/10 mx-auto mb-3" />
                  <p className="text-white/30 text-sm">{convSearch || filterUnread ? 'No matching conversations.' : isParentOrStudent ? 'Start a support chat with our team.' : 'No conversations yet.'}</p>
                  {!convSearch && !filterUnread && (
                    <button onClick={isParentOrStudent ? startSupportConversation : () => setShowNewChat(true)} className="mt-3 text-primary text-sm font-bold hover:underline">
                      {isParentOrStudent ? 'Start Chat →' : 'Start one →'}
                    </button>
                  )}
                </div>
              ) : (
                filteredConvs.map(conv => {
                  const assignedStaff = staff.find(s => s.id === conv.assigned_staff_id);
                  const isAssignedToMe = conv.assigned_staff_id === profile?.id;

                  return (
                    <div key={conv.id} onClick={() => { setActiveConv(conv); setShowSidebar(false); setShowInfo(false); }}
                      className={`flex items-center px-3 py-3 cursor-pointer transition-all border-b border-white/[0.04] group relative ${activeConv?.id === conv.id ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]'}`}>
                      
                      <div className="relative shrink-0 mr-3">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-[15px] text-white ${AVATAR_COLORS[conv.type]}`}>
                          {initials(conv.contact_name)}
                        </div>
                        {/* Status dot or assigned staff avatar */}
                        {assignedStaff ? (
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#111b21] overflow-hidden bg-white/10 shrink-0" title={`Assigned to ${assignedStaff.full_name}`}>
                            {assignedStaff.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={assignedStaff.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-violet-600 text-[8px] font-black text-white">
                                {initials(assignedStaff.full_name)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#111b21] bg-white/10" title="Unassigned" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <span className="font-bold text-white text-[15px] truncate">{conv.contact_name}</span>
                          <span className={`text-[11px] shrink-0 ml-2 ${conv.unread_count > 0 ? 'text-primary' : 'text-white/30'}`}>{formatConvTime(conv.last_message_at)}</span>
                        </div>
                        
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isAssignedToMe && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-primary text-white shadow-sm shadow-orange-900/40">You</span>}
                          {conv.role && <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${ROLE_COLORS[conv.role] || 'bg-white/10 text-white/40'}`}>{conv.role}</span>}
                          {conv.school_name && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-white/5 text-white/30 truncate max-w-[80px]">{conv.school_name}</span>}
                        </div>

                        <div className="flex justify-between items-center mt-1">
                          <p className={`text-[13px] truncate mr-2 ${conv.unread_count > 0 ? 'text-white/90 font-medium' : 'text-white/40'}`}>
                            {conv.last_message_preview || 'No messages yet'}
                          </p>
                          {conv.unread_count > 0 && (
                            <span className="bg-primary text-white text-[10px] font-black min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full shrink-0 shadow-sm shadow-primary/50">
                              {conv.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
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
                  className="w-full bg-[#2a3942] text-white text-sm rounded-lg pl-10 pr-4 py-2 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                {contactSearch && (
                  <button onClick={() => setContactSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"><X className="w-3.5 h-3.5" /></button>
                )}
              </div>
              {/* Role filter chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 custom-scrollbar">
                {['all', 'student', 'parent', 'teacher', 'school', 'external'].map(r => (
                  <button key={r} onClick={() => setContactRoleFilter(r)}
                    className={`shrink-0 text-[9px] font-black uppercase px-2.5 py-1 rounded-full transition-colors ${contactRoleFilter === r ? 'bg-primary text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
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
                      className="w-full bg-[#2a3942] text-white text-xs rounded-lg pl-8 pr-3 py-2 outline-none appearance-none focus:ring-1 focus:ring-primary/40">
                      <option value="">All Schools</option>
                      {uniqueSchools.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="relative">
                    <GraduationCap className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
                    <select value={contactClassFilter} onChange={e => setContactClassFilter(e.target.value)}
                      className="w-full bg-[#2a3942] text-white text-xs rounded-lg pl-8 pr-3 py-2 outline-none appearance-none focus:ring-1 focus:ring-primary/40">
                      <option value="">All Classes / Grades</option>
                      {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {(contactSchoolFilter || contactClassFilter) && (
                    <button onClick={() => { setContactSchoolFilter(''); setContactClassFilter(''); }}
                      className="text-[10px] text-primary/70 hover:text-primary font-bold transition-colors">
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
              <button onClick={fetchContacts} className="text-[10px] text-primary/60 hover:text-primary font-bold transition-colors">Refresh</button>
            </div>

            {/* Contact list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {contactsLoading ? (
                <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : filteredContacts.length === 0 ? (
                <div className="text-center p-12">
                  <UserCircle className="w-10 h-10 text-white/10 mx-auto mb-3" />
                  <p className="text-white/30 text-sm">{contactSearch || contactRoleFilter !== 'all' ? 'No matching contacts.' : 'No contacts yet.'}</p>
                  <button onClick={() => { setShowAddContact(true); setEditingContact(null); setAddContactForm(EMPTY_CONTACT_FORM); }}
                    className="mt-3 text-primary text-sm font-bold hover:underline">Add one →</button>
                </div>
              ) : (
                filteredContacts.map(contact => (
                  <div key={contact.id}
                    onClick={() => setActiveContact(prev => prev?.id === contact.id ? null : contact)}
                    className={`px-3 py-3 cursor-pointer transition-colors border-b border-white/[0.04] group ${activeContact?.id === contact.id ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-sm text-white shrink-0 ${
                        contact.role === 'student' ? 'bg-emerald-500' : contact.role === 'parent' ? 'bg-primary' :
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
                      <ChevronRight className={`w-4 h-4 text-white/20 shrink-0 transition-transform ${activeContact?.id === contact.id ? 'rotate-90 text-primary' : 'group-hover:text-primary'}`} />
                    </div>

                    {/* Expanded contact actions */}
                    {activeContact?.id === contact.id && (
                      <div className="mt-3 ml-14 flex flex-wrap gap-2" onClick={e => e.stopPropagation()}>
                        <button onClick={() => startChatFromContact(contact)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary text-white text-[11px] font-black rounded-full transition-colors">
                          <MessageSquare className="w-3 h-3" /> Message
                        </button>
                        {contact.phone && (
                          <button onClick={() => { setActiveContact(null); openWhatsAppConversation(contact); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black rounded-full transition-colors">
                            <MessageSquare className="w-3 h-3" /> WhatsApp
                          </button>
                        )}
                        {contact.email && (
                          <button onClick={() => openEmailCompose(contact)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 text-[11px] font-black rounded-full transition-colors">
                            <Mail className="w-3 h-3" /> Email
                          </button>
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
            <div className="h-[56px] px-3 bg-[#1f2c34] flex items-center justify-between border-b border-white/[0.06] shrink-0 z-10">
              <div className="flex items-center flex-1 min-w-0 gap-3">
                <button onClick={() => { setShowSidebar(true); setActiveConv(null); setShowInfo(false); }} className="md:hidden text-white/50 hover:text-white">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button onClick={() => setShowInfo(v => !v)} className="flex items-center gap-2 min-w-0 text-left group">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm text-white shrink-0 shadow-lg ${AVATAR_COLORS[activeConv.type]}`}>
                      {initials(activeConv.contact_name)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-white text-[15px] truncate group-hover:text-primary transition-colors">{activeConv.contact_name}</h3>
                      <p className="text-[11px] text-white/40 truncate flex items-center gap-1.5">
                        {activeConv.type === 'students' && activeConv.phone_number ? `+${activeConv.phone_number}` :
                         activeConv.subject ? activeConv.subject :
                         activeConv.student_name ? `Re: ${activeConv.student_name}` :
                         activeConv.role || 'Chat'}
                        
                        {/* Assignment Status Pill */}
                        {activeConv.type === 'students' && (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            activeConv.assigned_staff_id === profile?.id ? 'bg-primary/20 text-primary' :
                            activeConv.assigned_staff_id ? 'bg-violet-500/20 text-violet-400' : 'bg-white/5 text-white/30'
                          }`}>
                            {activeConv.assigned_staff_id === profile?.id ? 'Assigned to you' :
                             activeConv.assigned_staff_id ? `Assigned to ${staff.find(s => s.id === activeConv.assigned_staff_id)?.full_name || 'Staff'}` : 'Unassigned'}
                          </span>
                        )}
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Assignment Dropdown (Multi-user) */}
                {activeConv.type === 'students' && (isAdmin || isSchool) && (
                  <div className="relative group/assign">
                    <button 
                      disabled={!!assigningId}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[11px] font-black rounded-lg transition-all border border-white/5"
                    >
                      {assigningId === activeConv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                      <span className="hidden lg:inline">{activeConv.assigned_staff_id ? 'Reassign' : 'Assign'}</span>
                    </button>
                    {/* Dropdown Menu */}
                    <div className="absolute right-0 top-full mt-2 w-56 bg-[#233138] rounded-xl shadow-2xl border border-white/[0.08] hidden group-hover/assign:block z-50 overflow-hidden">
                      <div className="p-2 border-b border-white/5">
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest px-2 py-1">Assign to Staff</p>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                        <button 
                          onClick={() => assignConversation(activeConv.id, profile!.id)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/10 transition-colors border-b border-white/5"
                        >
                          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[10px] font-black text-white">ME</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-white truncate">Assign to myself</p>
                            <p className="text-[10px] text-primary font-bold uppercase tracking-tight">You</p>
                          </div>
                          {activeConv.assigned_staff_id === profile?.id && <Check className="w-4 h-4 text-primary" />}
                        </button>
                        {staff.filter(s => s.id !== profile?.id).map(s => (
                          <button 
                            key={s.id}
                            onClick={() => assignConversation(activeConv.id, s.id)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/10 transition-colors border-b border-white/5"
                          >
                            <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-[10px] font-black text-white overflow-hidden">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {s.avatar_url ? <img src={s.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(s.full_name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-bold text-white truncate">{s.full_name}</p>
                              <p className="text-[10px] text-white/30 font-bold uppercase tracking-tight">{s.role}</p>
                            </div>
                            {activeConv.assigned_staff_id === s.id && <Check className="w-4 h-4 text-violet-500" />}
                          </button>
                        ))}
                        <button 
                          onClick={() => assignConversation(activeConv.id, null)}
                          className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-rose-500/10 transition-colors text-white/40 hover:text-rose-400 group/unassign"
                        >
                          <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center group-hover/unassign:bg-rose-500/20">
                            <X className="w-4 h-4" />
                          </div>
                          <span className="text-[12px] font-bold">Unassign</span>
                          {!activeConv.assigned_staff_id && <Check className="w-4 h-4 text-white/20" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Self-assign Quick Action for Teachers */}
                {activeConv.type === 'students' && isTeacher && !activeConv.assigned_staff_id && (
                  <button 
                    onClick={() => assignToMe(activeConv.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white text-[11px] font-black rounded-lg transition-all border border-emerald-500/20"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Claim Chat
                  </button>
                )}

                <button
                  onClick={() => openEmailCompose(activeConv)}
                  title="Send email via SendPulse"
                  className="p-2 text-white/50 hover:text-violet-400 hover:bg-white/10 rounded-full transition-colors"
                >
                  <Mail className="w-5 h-5" />
                </button>
                <button onClick={() => setShowInfo(v => !v)} className={`p-2 rounded-full transition-colors ${showInfo ? 'text-primary bg-white/10' : 'text-white/50 hover:bg-white/10'}`} title="Contact info">
                  <Info className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* ── Save-to-contacts banner ── */}
            {showSaveBanner && (
              <div className="shrink-0 bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <UserPlus className="w-4 h-4 text-primary shrink-0" />
                  <p className="text-primary text-xs font-bold truncate">
                    <span className="text-white">{activeConv.contact_name}</span> is not in your contacts yet.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={saveContactFromConversation}
                    className="px-3 py-1 bg-primary hover:bg-primary text-white text-[11px] font-black rounded-full transition-colors">
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
              <div className="flex-1 overflow-y-auto px-4 py-3 md:px-6 flex flex-col gap-0.5 custom-scrollbar"
                style={{ backgroundColor: '#0b141a', backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.018' fill-rule='evenodd'%3E%3Cpath d='M0 0h40v40H0zm40 40h40v40H40z'/%3E%3C/g%3E%3C/svg%3E\")" }}>
                {msgLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-white/25" /></div>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-center py-12">
                    <div className="bg-[#182229] rounded-xl px-6 py-5 max-w-xs border border-white/[0.06]">
                      <p className="text-white/40 text-[13px]">No messages yet.</p>
                      {activeConv.type === 'students' && activeConv.phone_number && (
                        <a href={`https://wa.me/${activeConv.phone_number}`} target="_blank" rel="noopener noreferrer"
                          className="mt-3 text-[11px] text-emerald-400 font-bold flex items-center justify-center gap-1 hover:underline">
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
                        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-[2px]`}>
                          <div className={`max-w-[78%] md:max-w-[62%] shadow-sm ${
                            isMine ? 'bg-[#005c4b] text-white rounded-[18px] rounded-tr-[4px] px-3.5 py-2' : 'bg-[#202c33] text-white rounded-[18px] rounded-tl-[4px] px-3.5 pt-2 pb-2'
                          }`}>
                            {/* Inbound meta row — role/school/class for teachers/admins */}
                            {!isMine && (
                              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                <span className="text-primary text-[11px] font-black">{activeConv.contact_name}</span>
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
                <div className="w-[270px] shrink-0 bg-[#0d1418] border-l border-white/[0.07] overflow-y-auto custom-scrollbar">
                  <div className="p-5 text-center border-b border-white/[0.07]">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center font-black text-2xl text-white mx-auto mb-3 ${AVATAR_COLORS[activeConv.type]}`}>
                      {initials(activeConv.contact_name)}
                    </div>
                    <h3 className="text-white font-black text-[16px]">{activeConv.contact_name}</h3>
                    <p className="text-white/40 text-[10px] uppercase font-bold tracking-widest mt-0.5 capitalize">{activeConv.role || activeConv.type}</p>
                  </div>
                  <div className="p-4 space-y-2 text-sm">
                    {/* Quick action buttons */}
                    <div className="flex gap-2">
                      <button onClick={() => openEmailCompose(activeConv)}
                        className="flex items-center gap-1.5 flex-1 justify-center py-2 bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 text-[11px] font-black rounded-lg transition-colors">
                        <Mail className="w-3.5 h-3.5" /> Email
                      </button>
                      {activeConv.phone_number && (
                        <a href={`https://wa.me/${activeConv.phone_number}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 flex-1 justify-center py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-[11px] font-black rounded-lg transition-colors">
                          <Phone className="w-3.5 h-3.5" /> WA
                        </a>
                      )}
                    </div>

                    {[
                      activeConv.phone_number ? { label: 'Phone / WhatsApp', value: `+${activeConv.phone_number}` } : null,
                      activeConv.school_name  ? { label: 'School',           value: activeConv.school_name }       : null,
                      activeConv.student_name ? { label: 'About Student',    value: activeConv.student_name }       : null,
                      activeConv.subject      ? { label: 'Subject',          value: activeConv.subject }             : null,
                      { label: 'Channel', value: activeConv.type === 'teachers' ? 'Internal · Teacher' : activeConv.type === 'school' ? 'Internal · School' : activeConv.type === 'parents' ? 'Internal · Parent' : 'WhatsApp' },
                    ].filter(Boolean).map((item: any) => (
                      <div key={item.label} className="bg-[#202c33]/60 rounded-lg p-3">
                        <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest mb-1">{item.label}</p>
                        <p className="text-white text-[13px] font-bold">{item.value}</p>
                      </div>
                    ))}

                    {activeConv.type === 'students' && activeConv.phone_number && (
                      <a href={`https://wa.me/${activeConv.phone_number}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black rounded-lg transition-colors mt-3">
                        <Phone className="w-4 h-4" /> Open in WhatsApp
                      </a>
                    )}
                    {isStaff && activeConv.type === 'students' && (
                      <div className="mt-3 rounded-lg border border-white/10 bg-[#111b21]/70 p-3 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Queue Controls</p>
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={convPriority}
                            onChange={(e) => setConvPriority((e.target.value as 'low' | 'medium' | 'high') || 'medium')}
                            className="bg-[#2a3942] border border-white/10 rounded-lg px-2 py-2 text-xs text-white"
                          >
                            <option value="low">Low priority</option>
                            <option value="medium">Medium priority</option>
                            <option value="high">High priority</option>
                          </select>
                          <input
                            type="datetime-local"
                            value={convSlaDueAt}
                            onChange={(e) => setConvSlaDueAt(e.target.value)}
                            className="bg-[#2a3942] border border-white/10 rounded-lg px-2 py-2 text-xs text-white"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={saveConversationMeta}
                          disabled={savingConvMeta}
                          className="w-full py-2 rounded-lg bg-violet-600/30 hover:bg-violet-600/40 text-violet-200 text-xs font-black disabled:opacity-50"
                        >
                          {savingConvMeta ? 'Saving...' : 'Save queue policy'}
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={reportConversation}
                      disabled={reportingConversation}
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-sm font-black rounded-lg transition-colors mt-2 disabled:opacity-50"
                    >
                      {reportingConversation ? 'Submitting report...' : 'Report safety issue'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Message Input */}
            <div className="shrink-0 bg-[#1f2c34] border-t border-white/[0.06]">
              {sendError && (
                <div className="px-4 py-2 bg-rose-500/10 text-rose-400 text-xs font-bold flex items-center justify-between border-b border-rose-500/10">
                  <span>{sendError}</span>
                  <button onClick={() => setSendError('')}><X className="w-3 h-3" /></button>
                </div>
              )}
              {policySignal && (
                <div className="px-4 py-2 bg-cyan-500/10 text-cyan-300 text-[11px] font-bold border-b border-cyan-500/10">
                  {policySignal}
                </div>
              )}
              {isParentOrStudent && showConfirmDetailsCard && (
                <div className="border-b border-amber-500/20 bg-amber-500/10 px-3 py-3">
                  <p className="text-[11px] font-black uppercase tracking-widest text-amber-200">Confirm your details</p>
                  <p className="mt-1 text-[11px] text-white/75">Please confirm once so support emails always include your school and class.</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input value={confirmDetailsForm.full_name} onChange={(e) => setConfirmDetailsForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Full name" className="rounded-lg border border-white/10 bg-[#2a3942] px-2.5 py-2 text-xs text-white outline-none" />
                    <input value={confirmDetailsForm.email} onChange={(e) => setConfirmDetailsForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" className="rounded-lg border border-white/10 bg-[#2a3942] px-2.5 py-2 text-xs text-white outline-none" />
                    <input value={confirmDetailsForm.phone} onChange={(e) => setConfirmDetailsForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" className="rounded-lg border border-white/10 bg-[#2a3942] px-2.5 py-2 text-xs text-white outline-none" />
                    <input value={confirmDetailsForm.school_name} onChange={(e) => setConfirmDetailsForm((f) => ({ ...f, school_name: e.target.value }))} placeholder="School" className="rounded-lg border border-white/10 bg-[#2a3942] px-2.5 py-2 text-xs text-white outline-none" />
                    <input value={confirmDetailsForm.class_name} onChange={(e) => setConfirmDetailsForm((f) => ({ ...f, class_name: e.target.value }))} placeholder="Class" className="rounded-lg border border-white/10 bg-[#2a3942] px-2.5 py-2 text-xs text-white outline-none sm:col-span-2" />
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-[11px] text-white/80">
                    <input type="checkbox" checked={confirmDetailsForm.confirmed} onChange={(e) => setConfirmDetailsForm((f) => ({ ...f, confirmed: e.target.checked }))} />
                    I confirm these details are correct.
                  </label>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={submitConfirmDetails} disabled={confirmingDetails || !confirmDetailsForm.confirmed} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-black text-black disabled:opacity-50">
                      {confirmingDetails ? 'Saving...' : 'Confirm details'}
                    </button>
                    <button type="button" onClick={() => setShowConfirmDetailsCard(false)} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold text-white/80">
                      Hide for now
                    </button>
                  </div>
                </div>
              )}
              <form onSubmit={handleSend} className="flex items-end gap-2 px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
                <textarea ref={textareaRef} value={newMessage} onChange={handleTextareaChange}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); } }}
                  placeholder="Type a message…" rows={1}
                  className="flex-1 bg-[#2a3942] text-white text-[14px] rounded-2xl px-4 py-2.5 outline-none resize-none placeholder-white/25 focus:ring-1 focus:ring-white/15 transition-all max-h-[120px] overflow-y-auto leading-relaxed" />
                <button type="submit" disabled={!newMessage.trim() || isSending}
                  className="w-10 h-10 bg-primary hover:bg-primary disabled:bg-white/10 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center transition-all shrink-0 shadow-lg shadow-primary/20">
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-[15px] h-[15px] ml-0.5" />}
                </button>
              </form>
            </div>
          </>
        ) : (
          /* Empty state — full-bleed, native */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none"
            style={{ backgroundColor: '#0b141a', backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.012' fill-rule='evenodd'%3E%3Cpath d='M0 0h40v40H0zm40 40h40v40H40z'/%3E%3C/g%3E%3C/svg%3E\")" }}>
            {/* Decorative ring */}
            <div className="relative mb-7">
              <div className="w-28 h-28 rounded-full border-2 border-white/[0.06] flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-[#202c33] flex items-center justify-center">
                  <MessageSquare className="w-9 h-9 text-white/20" />
                </div>
              </div>
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-card rounded-full" />
              </div>
            </div>
            <h1 className="text-[22px] font-black text-white/75 mb-2 tracking-tight">Unified Inbox</h1>
            <p className="text-white/25 max-w-xs text-[13px] leading-relaxed">
              {isAdmin   ? 'All channels in one place — WhatsApp, parents, teachers & schools.' :
               isSchool  ? 'Reach students via WhatsApp and communicate with teachers directly.' :
               'Student WhatsApp messages, parent threads, and school communications.'}
            </p>
            <p className="text-white/15 text-[11px] mt-2 font-bold uppercase tracking-widest">
              Select a conversation to start
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-7">
              {!isParentOrStudent && (
                <button onClick={() => setShowNewChat(true)} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary text-white text-[13px] font-black rounded-full transition-colors shadow-lg shadow-orange-900/40">
                  <Plus className="w-4 h-4" /> New Chat
                </button>
              )}
              <button onClick={isTeacher ? openAdminEmailCompose : isParentOrStudent ? openSupportEmailCompose : () => openEmailCompose()} className="flex items-center gap-2 px-4 py-2.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 text-[13px] font-black rounded-full border border-violet-500/20 transition-colors">
                <Mail className="w-4 h-4" /> {isTeacher ? 'Email Admin' : isParentOrStudent ? 'Email Support' : 'Email'}
              </button>
              <button onClick={() => setSidebarView('contacts')} className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.07] text-white/50 text-[13px] font-black rounded-full border border-white/[0.07] transition-colors">
                <BookUser className="w-4 h-4" /> Contacts
              </button>
            </div>
            <div className="w-full max-w-5xl mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 text-left">
                <button 
                  onClick={startSupportConversation}
                  className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 hover:border-emerald-400/40 transition-all hover:scale-[1.02] active:scale-[0.98] group text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3 group-hover:bg-emerald-500/30 transition-colors">
                    <MessageSquare className="w-5 h-5 text-emerald-400" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Fast Response</p>
                  <h3 className="text-base font-black text-white mt-2">Start WhatsApp Chat</h3>
                  <p className="text-[11px] text-white/55 mt-2 leading-relaxed">Direct line to rillcod support. Chat in real-time for quick answers.</p>
                  <div className="mt-4 flex items-center gap-1.5 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                    Open Channel <ChevronRight className="w-3 h-3" />
                  </div>
                </button>

                <Link href="/dashboard/support" className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-5 hover:border-cyan-400/40 transition-all hover:scale-[1.02] active:scale-[0.98] group">
                  <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center mb-3 group-hover:bg-cyan-500/30 transition-colors">
                    <FileText className="w-5 h-5 text-cyan-400" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Formal Support</p>
                  <h3 className="text-base font-black text-white mt-2">Open Support Ticket</h3>
                  <p className="text-[11px] text-white/55 mt-2 leading-relaxed">Log billing, access, and platform issues with tracked staff follow-up.</p>
                  <div className="mt-4 flex items-center gap-1.5 text-cyan-400 text-[10px] font-black uppercase tracking-widest">
                    Create Ticket <ChevronRight className="w-3 h-3" />
                  </div>
                </Link>

                <button onClick={openSupportEmailCompose} className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-5 hover:border-violet-400/40 transition-all hover:scale-[1.02] active:scale-[0.98] group text-left">
                  <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center mb-3 group-hover:bg-violet-500/30 transition-colors">
                    <Mail className="w-5 h-5 text-violet-400" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Email Rillcod</p>
                  <h3 className="text-base font-black text-white mt-2">Contact Support Team</h3>
                  <p className="text-[11px] text-white/55 mt-2 leading-relaxed">Send a branded email to <span className="text-violet-300">support@rillcod.com</span>.</p>
                  <div className="mt-4 flex items-center gap-1.5 text-violet-400 text-[10px] font-black uppercase tracking-widest">
                    Send Email <ChevronRight className="w-3 h-3" />
                  </div>
                </button>
            </div>
            {isParentOrStudent && (
              <div className="w-full max-w-3xl mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                <button
                  onClick={() => {
                    setSidebarView('contacts');
                    setContactRoleFilter('teacher');
                    setShowSidebar(true);
                  }}
                  className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 hover:border-amber-400/40 transition-colors text-left"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">Teacher Contact</p>
                  <h3 className="text-sm font-black text-white mt-2">Find Teachers</h3>
                  <p className="text-[11px] text-white/55 mt-2 leading-relaxed">Open the contacts directory already filtered to teacher contacts.</p>
                </button>
                <button onClick={openAdminEmailCompose} className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 hover:border-rose-400/40 transition-colors text-left">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-300">Admin Escalation</p>
                  <h3 className="text-sm font-black text-white mt-2">Contact Admin Team</h3>
                  <p className="text-[11px] text-white/55 mt-2 leading-relaxed">Escalate urgent academic or account issues for admin review.</p>
                </button>
              </div>
            )}
            {isTeacher && (
              <div className="w-full max-w-3xl mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                <button onClick={openAdminEmailCompose} className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4 hover:border-violet-400/40 transition-colors text-left">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Admin Channel</p>
                  <h3 className="text-sm font-black text-white mt-2">Email Admin</h3>
                  <p className="text-[11px] text-white/55 mt-2 leading-relaxed">Use the branded email flow for escalations and formal teacher-to-admin communication.</p>
                </button>
                <button
                  onClick={() => {
                    setSidebarView('contacts');
                    setContactRoleFilter('teacher');
                    setShowSidebar(true);
                  }}
                  className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 hover:border-amber-400/40 transition-colors text-left"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300">Peer Contact</p>
                  <h3 className="text-sm font-black text-white mt-2">Open Teacher Contacts</h3>
                  <p className="text-[11px] text-white/55 mt-2 leading-relaxed">Jump straight into the teacher directory when you need to coordinate with colleagues.</p>
                </button>
                <Link href="/dashboard/support" className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 hover:border-cyan-400/40 transition-colors">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Support</p>
                  <h3 className="text-sm font-black text-white mt-2">Open Staff Ticket</h3>
                  <p className="text-[11px] text-white/55 mt-2 leading-relaxed">Create a tracked support request when the issue should not live only in chat.</p>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ NEW CHAT MODAL ═══════════════════════════════════════════════════ */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-[2px]">
          <div className="w-full max-w-lg bg-[#1f2c34] md:rounded-2xl rounded-t-2xl overflow-hidden shadow-2xl flex flex-col max-h-[88vh] border border-white/[0.07]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
              <div>
                <h2 className="text-white font-black text-[16px]">
                  New {activeTab === 'teachers' ? 'Teacher' : activeTab === 'school' && isSchool ? 'Teacher' : activeTab === 'parents' ? 'Parent' : activeTab === 'students' ? 'Student' : 'School'} Chat
                </h2>
                <p className="text-white/30 text-[11px] mt-0.5">
                  {activeTab === 'students' ? 'Search students by name or school' :
                   activeTab === 'parents'  ? 'Search parents by name' :
                   isSchool                 ? 'Search teachers in your school' : 'Search partner schools'}
                </p>
              </div>
              <button onClick={() => setShowNewChat(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5 text-white/40" /></button>
            </div>
            <div className="px-4 py-3 border-b border-white/[0.05] shrink-0">
              <div className="relative">
                <Search className="w-[15px] h-[15px] absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
                <input autoFocus value={directorySearch} onChange={e => setDirectorySearch(e.target.value)}
                  placeholder="Type to search…"
                  className="w-full bg-[#2a3942] text-white text-[13px] rounded-lg pl-9 pr-4 py-2.5 outline-none placeholder-white/25 focus:ring-1 focus:ring-primary/30" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {loadingDirectory ? (
                <div className="p-12 text-center"><Loader2 className="w-7 h-7 animate-spin mx-auto text-primary" /></div>
              ) : (
                <>
                  {directoryResults.map(item => (
                    <button key={item.id} onClick={() => startNewConversation(item)}
                      className="w-full flex items-center px-4 py-3 hover:bg-white/[0.05] transition-colors text-left group border-b border-white/[0.04]">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm text-white shrink-0 mr-3 ${AVATAR_COLORS[activeTab]}`}>
                        {initials(item.full_name || item.name || 'U')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white text-[13px] truncate">{item.full_name || item.name}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          {item.phone       && <span className="text-[10px] text-emerald-400 flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />+{item.phone.replace(/\D/g, '')}</span>}
                          {item.school_name && <span className="text-[10px] text-white/30 truncate">{item.school_name}</span>}
                          {item.email       && <span className="text-[10px] text-white/25 truncate">{item.email}</span>}
                          {item.role        && <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${ROLE_COLORS[item.role] || 'bg-white/10 text-white/40'}`}>{item.role}</span>}
                          {!item.phone && activeTab === 'students' && <span className="text-[10px] text-rose-400 font-bold">No phone</span>}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-primary transition-colors" />
                    </button>
                  ))}

                  {/* Message by Number Option */}
                  {activeTab === 'students' && directorySearch.replace(/\D/g, '').length >= 7 && (
                    <button 
                      onClick={() => {
                        const phone = directorySearch.replace(/\D/g, '');
                        startNewConversation({ id: phone, full_name: `+${phone}`, phone: phone, role: 'external' });
                      }}
                      className="w-full flex items-center px-4 py-4 bg-primary/5 hover:bg-primary/10 transition-colors text-left group border-b border-primary/10"
                    >
                      <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mr-3">
                        <Plus className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-white text-[14px]">Message +{directorySearch.replace(/\D/g, '')} directly</p>
                        <p className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">Start WhatsApp conversation</p>
                      </div>
                      <MessageSquare className="w-5 h-5 text-primary mr-2" />
                    </button>
                  )}

                  {directoryResults.length === 0 && (!directorySearch || (activeTab === 'students' && directorySearch.replace(/\D/g, '').length < 7)) && (
                    <div className="p-12 text-center text-white/25 text-[13px]">{directorySearch ? 'No results found.' : 'Start typing to search…'}</div>
                  )}
                </>
              )}
            </div>
            {activeTab === 'parents' && (
              <div className="px-5 py-3 bg-[#111b21] border-t border-white/[0.05] text-[11px] text-white/25 text-center">
                To start a parent conversation, initiate from the student&apos;s profile.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ ADD / EDIT CONTACT MODAL ════════════════════════════════════════ */}
      {showAddContact && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-[2px]">
          <div className="w-full max-w-md bg-[#1f2c34] md:rounded-2xl rounded-t-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] border border-white/[0.07]">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
                  {editingContact ? <Pencil className="w-4 h-4 text-primary" /> : <UserPlus className="w-4 h-4 text-primary" />}
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
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Phone / WhatsApp</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={addContactForm.phone} onChange={e => setAddContactForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+234 800 000 0000" type="tel"
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={addContactForm.email} onChange={e => setAddContactForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="name@school.edu.ng" type="email"
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>

              {/* Role */}
              {!editingContact && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Role / Type</label>
                  <div className="flex gap-2 flex-wrap">
                    {['student', 'parent', 'teacher', 'school', 'external'].map(r => (
                      <button key={r} type="button" onClick={() => setAddContactForm(f => ({ ...f, role: r }))}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-black uppercase transition-colors ${addContactForm.role === r ? 'bg-primary text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
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
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>

              {/* Class */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Class / Group</label>
                <div className="relative">
                  <GraduationCap className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={addContactForm.class_name} onChange={e => setAddContactForm(f => ({ ...f, class_name: e.target.value }))}
                    placeholder="e.g. JSS 2A"
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Notes (optional)</label>
                <textarea value={addContactForm.notes} onChange={e => setAddContactForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any additional context…" rows={2}
                  className="w-full bg-[#2a3942] text-white text-sm rounded-xl px-4 py-2.5 outline-none resize-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-white/[0.08] shrink-0 flex gap-3">
              <button onClick={() => { setShowAddContact(false); setEditingContact(null); setContactError(''); }}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-black transition-colors">
                Cancel
              </button>
              <button onClick={saveContact} disabled={savingContact || !addContactForm.full_name.trim()}
                className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary disabled:bg-white/10 disabled:text-white/30 text-white text-sm font-black transition-colors flex items-center justify-center gap-2">
                {savingContact ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : (editingContact ? 'Save Changes' : 'Add Contact')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ══ SUBJECT DIALOG (replaces window.prompt) ════════════════════════ */}
      {subjectDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#202c33] rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h2 className="text-white font-black text-[16px]">New Conversation</h2>
                <p className="text-white/40 text-xs mt-0.5">
                  With: <strong className="text-primary">{subjectDialog.pendingItem?.full_name || subjectDialog.pendingItem?.name || 'Contact'}</strong>
                </p>
              </div>
              <button onClick={() => setSubjectDialog({ open: false, subject: '', pendingItem: null })} className="p-2 hover:bg-white/10 rounded-full">
                <X className="w-5 h-5 text-white/50" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                  Subject / Topic <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    autoFocus
                    value={subjectDialog.subject}
                    onChange={e => setSubjectDialog(d => ({ ...d, subject: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') confirmSubjectAndCreate(); }}
                    placeholder="e.g. Student progress update"
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40"
                  />
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setSubjectDialog({ open: false, subject: '', pendingItem: null })}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-black transition-colors">
                Cancel
              </button>
              <button onClick={confirmSubjectAndCreate} disabled={!subjectDialog.subject.trim()}
                className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary disabled:bg-white/10 disabled:text-white/30 text-white text-sm font-black transition-colors flex items-center justify-center gap-2">
                <MessageSquare className="w-4 h-4" /> Start Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ EMAIL COMPOSE MODAL (via SendPulse) ════════════════════════════ */}
      {showEmailCompose && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#202c33] md:rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-violet-500/20 flex items-center justify-center border border-violet-500/20">
                  <Mail className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <h2 className="text-white font-black text-[16px]">Compose Email</h2>
                  <p className="text-white/30 text-xs">Sent via SendPulse · support@rillcod.com</p>
                </div>
              </div>
              <button onClick={() => { setShowEmailCompose(false); setEmailForm(EMPTY_EMAIL_FORM); setEmailError(''); setEmailSuccess(''); }}
                className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-5 h-5 text-white/50" />
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
              {emailError && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-sm font-bold flex items-center gap-2">
                  <X className="w-4 h-4 shrink-0" />{emailError}
                </div>
              )}
              {emailSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-emerald-400 text-sm font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />{emailSuccess}
                </div>
              )}

              {/* To */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                  To <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <AtSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={emailForm.to} onChange={e => setEmailForm(f => ({ ...f, to: e.target.value }))}
                    placeholder="recipient@email.com" type="email" autoFocus={!emailForm.to}
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-violet-500/40" />
                </div>
                {emailForm.to_name && (
                  <p className="text-[10px] text-violet-400 font-bold mt-1 ml-1">Recipient: {emailForm.to_name}</p>
                )}
              </div>

              {/* CC */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">CC (optional)</label>
                <div className="relative">
                  <AtSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={emailForm.cc} onChange={e => setEmailForm(f => ({ ...f, cc: e.target.value }))}
                    placeholder="cc@email.com"
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-violet-500/40" />
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                  Subject <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={emailForm.subject} onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))}
                    placeholder="e.g. Student Progress Update – Term 2"
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-violet-500/40" />
                </div>
              </div>

              {/* Body */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                  Message <span className="text-rose-400">*</span>
                </label>
                <textarea
                  value={emailForm.body}
                  onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="Write your message here…&#10;&#10;The Rillcod branded template will be applied automatically."
                  rows={7}
                  className="w-full bg-[#2a3942] text-white text-sm rounded-xl px-4 py-3 outline-none resize-none placeholder-white/30 focus:ring-1 focus:ring-violet-500/40 leading-relaxed"
                />
              </div>

              {/* Branding note */}
              <div className="bg-violet-500/5 border border-violet-500/10 rounded-xl p-3 flex items-start gap-2">
                <Mail className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-white/40 leading-relaxed">
                  Emails are sent using the <strong className="text-white/60">Rillcod Academy branded template</strong> via SendPulse SMTP from <strong className="text-violet-400">support@rillcod.com</strong>. Recipients can reply directly to this address.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-white/[0.08] shrink-0 flex gap-3">
              <button onClick={() => { setShowEmailCompose(false); setEmailForm(EMPTY_EMAIL_FORM); setEmailError(''); }}
                className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-black transition-colors">
                Discard
              </button>
              <button onClick={sendEmail} disabled={sendingEmail || !emailForm.to.trim() || !emailForm.subject.trim() || !emailForm.body.trim()}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-white/10 disabled:text-white/30 text-white text-sm font-black transition-colors flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20">
                {sendingEmail
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending via SendPulse…</>
                  : <><Send className="w-4 h-4" /> Send Email</>
                }
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
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 border-2 border-primary/20">
                <UserCircle className="w-8 h-8 text-primary" />
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
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Phone / WhatsApp</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+234 800 000 0000" type="tel"
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">School / Organisation</label>
                <div className="relative">
                  <School className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={profileForm.school_name} onChange={e => setProfileForm(f => ({ ...f, school_name: e.target.value }))}
                    placeholder="e.g. Lagos Academy"
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
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
                className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary disabled:bg-white/10 disabled:text-white/30 text-white text-sm font-black transition-colors flex items-center justify-center gap-2">
                {savingProfile ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save & Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ QUICK CHAT BY NUMBER (FLOATING BUTTON) ═════════════════════════ */}
      {activeTab === 'students' && !showQuickChat && !isParentOrStudent && (
        <button
          onClick={() => setShowQuickChat(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-500 hover:bg-emerald-400 text-white rounded-full shadow-2xl shadow-emerald-900/50 flex items-center justify-center transition-all hover:scale-110 z-40 group"
          title="Quick chat by number"
        >
          <MessageSquare className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
            <Plus className="w-3 h-3" />
          </span>
        </button>
      )}

      {/* ══ QUICK CHAT MODAL ════════════════════════════════════════════════ */}
      {showQuickChat && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#202c33] md:rounded-2xl rounded-t-2xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                  <MessageSquare className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-white font-black text-[16px]">Quick Chat</h2>
                  <p className="text-white/30 text-xs">Start WhatsApp conversation</p>
                </div>
              </div>
              <button
                onClick={() => { setShowQuickChat(false); setQuickChatNumber(''); setQuickChatError(''); }}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-white/50" />
              </button>
            </div>

            {/* Form */}
            <div className="p-5 space-y-4">
              {quickChatError && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-400 text-sm font-bold flex items-center gap-2">
                  <X className="w-4 h-4 shrink-0" />{quickChatError}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">
                  Phone Number <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    autoFocus
                    value={quickChatNumber}
                    onChange={e => { setQuickChatNumber(e.target.value); setQuickChatError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') startQuickChat(); }}
                    placeholder="e.g. +234 800 000 0000 or 2348000000000"
                    type="tel"
                    className="w-full bg-[#2a3942] text-white text-sm rounded-xl pl-10 pr-4 py-3 outline-none placeholder-white/30 focus:ring-2 focus:ring-emerald-500/40"
                  />
                </div>
                <p className="text-[10px] text-white/30 mt-2 ml-1">
                  Enter any phone number to start a WhatsApp conversation. The number doesn&apos;t need to be in your contacts.
                </p>
              </div>

              {/* Preview if valid number */}
              {quickChatNumber.replace(/\D/g, '').length >= 7 && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                    <Phone className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-bold truncate">+{quickChatNumber.replace(/\D/g, '')}</p>
                    <p className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest">Ready to chat</p>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={() => { setShowQuickChat(false); setQuickChatNumber(''); setQuickChatError(''); }}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm font-black transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={startQuickChat}
                disabled={!quickChatNumber.trim() || quickChatNumber.replace(/\D/g, '').length < 7}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-white/30 text-white text-sm font-black transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                <MessageSquare className="w-4 h-4" /> Start Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
