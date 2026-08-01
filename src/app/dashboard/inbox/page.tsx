"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
  Search, Send, Phone, Check, CheckCheck,
  Loader2, X, MessageSquare, Users, Building2, Plus,
  ChevronLeft, Info, Filter, UserCircle, UserPlus,
  BookUser, Mail, School, GraduationCap, ChevronRight,
  Pencil, AtSign, FileText, CheckCircle2, Clock, ExternalLink, Trash2, Smile, Paperclip,
  Tag, BookOpen, AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { brandContact } from '@/config/brand';
import { useOfficeOptional } from '@/components/office/OfficeContext';
import { useOfficeAdminRedirect } from '@/components/office/useOfficeAdminRedirect';

// ── Types ───────────────────────────────────────────────────────────────────
type InboxCategory = 'students' | 'parents' | 'school' | 'teachers';
type SidebarView = 'chats' | 'contacts';

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
  opted_out?: boolean;
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
  opted_out?: boolean;
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
  parents: 'bg-primary',
  school: 'bg-primary',
  teachers: 'bg-primary',
};
const ROLE_COLORS: Record<string, string> = {
  student: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  parent: 'bg-primary/20 text-primary',
  teacher: 'bg-primary/20 text-primary',
  school: 'bg-primary/20 text-primary',
  admin: 'bg-rose-500/20 text-rose-600 dark:text-rose-400',
};
const CHANNEL_COLORS: Record<InboxCategory, string> = {
  students: 'bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
  parents: 'bg-primary/40 text-primary',
  school: 'bg-blue-900/40 text-primary',
  teachers: 'bg-violet-900/40 text-primary',
};

// Helper to render message body with professional WhatsApp Template styling
const renderMessageBody = (body: string) => {
  if (!body) return '';

  if (body.startsWith('[Template: ')) {
    const templateMatch = body.match(/^\[Template:\s*([^\]]+)\](?:\s*Variables:\s*(.+))?$/i);
    if (templateMatch) {
      const templateName = templateMatch[1];
      const variablesString = templateMatch[2] || '';
      const variables = variablesString ? variablesString.split(',').map(v => v.trim()) : [];

      return (
        <div className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-indigo-500/5 border border-indigo-500/10 text-[13px] my-1 max-w-full text-left">
          <div className="flex items-center gap-1.5 font-semibold text-indigo-600 dark:text-indigo-400">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            <span>WhatsApp Business Template</span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[11.5px] bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-900/30 text-indigo-700 dark:text-indigo-300 w-fit">
            <span>Name:</span>
            <span className="font-bold">{templateName}</span>
          </div>
          {variables.length > 0 && (
            <div className="flex flex-col gap-1 mt-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Variables</span>
              <div className="flex flex-wrap gap-1">
                {variables.map((v, i) => (
                  <span key={i} className="text-[11px] bg-white/5 border border-white/10 text-muted-foreground px-2 py-0.5 rounded font-mono break-all">
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
  }

  return <span>{body}</span>;
};

// ── Component ────────────────────────────────────────────────────────────────
export default function UnifiedInbox() {
  const { profile, loading: authLoading } = useAuth();
  const office = useOfficeOptional();
  const searchParams = useSearchParams();
  const deepLinkConversationId = searchParams.get('conversation');
  const redirecting = useOfficeAdminRedirect({ workspace: 'inbox', section: 'chats' });
  const supabase = useMemo(() => createClient(), []);

  // Chat state
  const [sidebarView, setSidebarView] = useState<SidebarView>('chats');
  const [activeTab, setActiveTab] = useState<InboxCategory>('students');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filteredConvs, setFilteredConvs] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [convSearch, setConvSearch] = useState('');
  const [filterUnread, setFilterUnread] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [sendError, setSendError] = useState('');
  const [policySignal, setPolicySignal] = useState<string>('');
  const [waFallbackUrl, setWaFallbackUrl] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [queueSummary, setQueueSummary] = useState<{ all: number; unassigned: number; overdue: number; needs_escalation: number } | null>(null);
  const [queueFilter, setQueueFilter] = useState<'all' | 'unassigned' | 'overdue' | 'needs_escalation'>('all');
  const [convPriority, setConvPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [convSlaDueAt, setConvSlaDueAt] = useState('');
  const [savingConvMeta, setSavingConvMeta] = useState(false);

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [contactRoleFilter, setContactRoleFilter] = useState<string>('all');
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [addContactForm, setAddContactForm] = useState(EMPTY_CONTACT_FORM);
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState('');
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  // New chat (from contacts modal)
  const [showNewChat, setShowNewChat] = useState(false);
  const [directorySearch, setDirectorySearch] = useState('');
  const [directoryResults, setDirectoryResults] = useState<any[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  // Quick chat by number (floating button)
  const [showQuickChat, setShowQuickChat] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [showNewMessagePicker, setShowNewMessagePicker] = useState(false);
  const [quickChatNumber, setQuickChatNumber] = useState('');
  const [quickChatError, setQuickChatError] = useState('');

  // Advanced contact filters
  const [contactSchoolFilter, setContactSchoolFilter] = useState('');
  const [contactClassFilter, setContactClassFilter] = useState('');
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
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [reportingConversation, setReportingConversation] = useState(false);
  const [deleteConfirmConvId, setDeleteConfirmConvId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState('');

  // Subject dialog (replaces window.prompt for school/teacher convs)
  const [subjectDialog, setSubjectDialog] = useState<SubjectDialogState>({ open: false, subject: '', pendingItem: null });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeConvRef = useRef<Conversation | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const assignMenuRef = useRef<HTMLDivElement>(null);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');

  const isSchool = profile?.role === 'school';
  const isTeacher = profile?.role === 'teacher';
  const isAdmin = profile?.role === 'admin';

  // ── WhatsApp URL builder — pre-fills message text so user just hits Send ────
  function buildWaUrl(phone: string | null | undefined, text?: string): string {
    const clean = (phone ?? '').replace(/\D/g, '');
    const base  = `https://wa.me/${clean}`;
    if (!text?.trim()) return base;
    return `${base}?text=${encodeURIComponent(text.trim())}`;
  }

  // ── Emoji picker ────────────────────────────────────────────────────────────
  const EMOJI_LIST = [
    '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛',
    '😜','😝','🤑','🤗','🤭','🤫','🤔','😐','😑','🙄','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖',
    '😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🥳','😎',
    '🤓','🧐','😴','😷','🤒','🤕','🤧','🥴','😬','🙃','🫠','🥹','🫡','🤫','🫣','🫢','🫥','😶','🤥',
    '👍','👎','👊','✊','🤛','🤜','🤞','✌️','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👋','🤚','🖐️','✋',
    '👌','🤌','🤏','👏','🙌','🤲','🙏','🤝','💪','🦾','💅','🫶','🫱','🫲','🫳','🫴',
    '📚','📖','✏️','📝','📋','📊','📈','💻','📱','⌨️','🖥️','📌','📎','📅','📆','🔍','📓','📔','📒',
    '📕','📗','📘','📙','🔑','🔒','🔔','📢','📣','💬','💭','🗣️','👁️','👀','📩','📨','📧','📮',
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','💕','💞','💓','💗','💖','💘','💝','❣️',
    '✅','❌','⚠️','⭐','🌟','💫','🔥','💥','✨','🎯','🏆','🥇','🎉','🎊','🎈','🎁','💡','🔖','🚀','🎓',
  ];

  function insertEmoji(emoji: string) {
    const ta = textareaRef.current;
    if (!ta) { setNewMessage(prev => prev + emoji); return; }
    const start = ta.selectionStart ?? newMessage.length;
    const end   = ta.selectionEnd   ?? newMessage.length;
    const next  = newMessage.slice(0, start) + emoji + newMessage.slice(end);
    setNewMessage(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + emoji.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return;
    function handle(e: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showEmojiPicker]);

  useEffect(() => {
    setShowAssignMenu(false);
  }, [activeConv?.id]);

  useEffect(() => {
    if (!showAssignMenu) return;
    function handle(e: MouseEvent) {
      if (assignMenuRef.current && !assignMenuRef.current.contains(e.target as Node)) {
        setShowAssignMenu(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showAssignMenu]);

  const hasAccess = ['teacher', 'admin', 'school', 'staff', 'parent', 'student'].includes(profile?.role ?? '');
  const isParentOrStudent = ['parent', 'student'].includes(profile?.role ?? '');
  const isStaff = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');

  // Keep ref in sync every render so realtime callbacks always see the current conversation
  activeConvRef.current = activeConv;

  // Students and parents land on the 3-path empty state first on mobile,
  // Students/parents land on no-sidebar on the WhatsApp tab.
  // On the Teachers tab, students need to see the sidebar list.
  useEffect(() => {
    if (isParentOrStudent && activeTab === 'students') setShowSidebar(false);
  }, [isParentOrStudent, activeTab]);

  useEffect(() => {
    if (!hasAccess) return;
    fetch('/api/progression/communication-policy-status')
      .then((r) => r.json())
      .then((j) => {
        const d = j.data;
        if (!d) return;
        // Only show signal when approaching limits — suppress generic noise
        if (typeof d.daily_remaining === 'number' && d.daily_limit < 9999 && d.daily_remaining <= 5) {
          setPolicySignal(`⚠️ Only ${d.daily_remaining} message${d.daily_remaining !== 1 ? 's' : ''} left today.`);
        }
      })
      .catch(() => { });
  }, [hasAccess]);

  useEffect(() => {
    if (!isStaff || activeTab !== 'students') return;
    fetch(`/api/inbox/queue?filter=${queueFilter}`)
      .then((r) => r.json())
      .then((j) => setQueueSummary(j.summary ?? null))
      .catch(() => { });
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
      office?.notifyOfficeChange('inbox');
    } catch (err: any) {
      setSendError(err.message || 'Failed to save conversation policy');
    } finally {
      setSavingConvMeta(false);
    }
  };

  // ── Tabs ─────────────────────────────────────────────────────────────────
  // School is a channel to students AND parents — show both tabs for school role
  const tabs = [
    { id: 'students' as const, label: 'WhatsApp', icon: MessageSquare },
    ...(!isParentOrStudent ? [{ id: 'parents' as const, label: 'Parents', icon: Users }] : []),
    ...(isAdmin || profile?.role === 'student' ? [{ id: 'teachers' as const, label: 'Teachers', icon: GraduationCap }] : []),
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
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'student_teacher_messages',
        }, p => handleRealtime('teachers', p.new as any))
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

  // ── Auto-open conversation for student/parent on WhatsApp tab only ────────
  useEffect(() => {
    if (!isParentOrStudent || activeConv || conversations.length === 0) return;
    if (activeTab !== 'students') return; // Teachers tab: show list instead
    const conv = conversations[0];
    setActiveConv(conv);
    fetchMessages(conv);
    setShowSidebar(false);
  }, [conversations, isParentOrStudent, activeTab]); // eslint-disable-line

  // Deep-link: open a specific conversation from ?conversation= (Office Center / notifications)
  useEffect(() => {
    if (!deepLinkConversationId || conversations.length === 0) return;
    if (activeConv?.id === deepLinkConversationId) return;
    const match = conversations.find((c) => c.id === deepLinkConversationId);
    if (!match) return;
    setActiveConv(match);
    setShowSidebar(false);
    void fetchMessages(match);
  }, [deepLinkConversationId, conversations]); // eslint-disable-line

  useEffect(() => {
    if (!profile || !isStaff || activeTab !== 'students') return;
    void fetchConversations('students');
  }, [queueFilter]); // eslint-disable-line

  useEffect(() => {
    if (!profile || !isParentOrStudent) return;
    const key = `details_confirmed_${profile.id}`;
    const confirmedOnce = typeof window !== 'undefined' ? window.localStorage.getItem(key) === '1' : false;
    // School & class are resolved automatically from the child's record — a parent only
    // needs their own contact details confirmed before messaging support.
    const hasRequired = Boolean(profile.full_name && profile.email && profile.phone);
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
          opted_out: Boolean(raw.opted_out),
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
      id: m.id,
      conversation_id: m.conversation_id || m.thread_id || '',
      sender_id: m.sender_id,
      direction: m.direction,
      body: m.body,
      created_at: m.created_at || m.sent_at,
      status: m.status,
      is_read: m.is_read,
    };
  }

  // ── Fetch conversations ────────────────────────────────────────────────────
  const fetchConversations = async (cat: InboxCategory, setLoad = true) => {
    if (setLoad) { setIsLoading(true); setFetchError(''); }
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
            opted_out: Boolean(c.opted_out),
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
              opted_out: Boolean(c.opted_out),
            })));
            setQueueSummary(json?.summary ?? null);
            return;
          }

          const waRes = await fetch('/api/inbox', { cache: 'no-store' });
          const waJson = waRes.ok ? await waRes.json() : { data: [] };
          const data = Array.isArray(waJson.data) ? waJson.data : [];
          if (data) setConversations(data.map((c: any) => ({
            id: c.id,
            type: 'students' as const,
            phone_number: c.phone_number,
            contact_name: c.contact_name || (c.portal_users || c.portal_user as any)?.full_name || c.phone_number || 'Unknown',
            last_message_at: c.last_message_at || '',
            last_message_preview: c.last_message_preview || '',
            unread_count: c.unread_count || 0,
            school_name: (c.portal_users || c.portal_user as any)?.school_name || c.school_name,
            role: (c.portal_users || c.portal_user as any)?.role || (c.portal_user_id ? 'student' : 'external'),
            portal_user_id: c.portal_user_id ?? undefined,
            assigned_staff_id: c.assigned_staff_id,
            opted_out: Boolean(c.opted_out),
          })));
        }
      } else if (cat === 'parents') {
        const threadsRes = await fetch('/api/inbox/threads', { cache: 'no-store' });
        const threadsJson = threadsRes.ok ? await threadsRes.json() : { data: [] };
        const data = Array.isArray(threadsJson.data) ? threadsJson.data : [];
        if (data) setConversations(data.map((t: any) => {
          const msgs = (t.messages ?? []) as any[];
          const last = msgs.sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0];
          const unread = msgs.filter(m => !m.is_read && m.sender_id !== profile?.id).length;
          return {
            id: t.id, type: 'parents' as const,
            contact_name: (t.parent as any)?.full_name || 'Parent',
            student_name: (t.student as any)?.full_name,
            avatar_url: (t.parent as any)?.avatar_url,
            last_message_at: last?.sent_at || t.created_at,
            last_message_preview: last?.body || 'No messages yet',
            unread_count: unread,
            phone_number: (t.parent as any)?.phone,
            school_name: (t.parent as any)?.school_name,
            role: 'parent',
          };
        }));
      } else if (cat === 'teachers') {
        if (profile?.role === 'student') {
          // Student→Teacher direct threads
          const res = await fetch('/api/student-teacher/threads');
          const json = await res.json();
          if (json.data) setConversations(json.data.map((t: any) => ({
            id: t.id, type: 'teachers' as const,
            contact_name: t.teacher?.full_name || 'Teacher',
            avatar_url: t.teacher?.avatar_url,
            last_message_at: t.last_message_at || t.created_at,
            last_message_preview: t.last_message_preview || 'No messages yet',
            unread_count: t.unread_count || 0,
            role: 'teacher',
          })));
          return;
        }
        // Admin: all school-teacher conversations
        const res = await fetch('/api/school-teacher/conversations?type=teacher');
        const json = await res.json();
        if (json.data) setConversations(json.data.map((c: any) => ({
          id: c.id, type: 'teachers' as const,
          contact_name: c.teacher?.full_name || 'Teacher',
          subject: c.subject,
          last_message_at: c.last_message_at || c.created_at,
          last_message_preview: c.last_message_preview || 'No messages yet',
          unread_count: c.unread_count || 0,
          school_name: c.teacher?.school_name,
          role: 'teacher',
        })));
      } else {
        const res = await fetch('/api/school-teacher/conversations');
        const json = await res.json();
        if (json.data) setConversations(json.data.map((c: any) => ({
          id: c.id, type: 'school' as const,
          contact_name: isSchool ? (c.teacher?.full_name || 'Teacher') : (c.school?.name || 'School Office'),
          subject: c.subject,
          last_message_at: c.last_message_at || c.created_at,
          last_message_preview: c.last_message_preview || 'No messages yet',
          unread_count: c.unread_count || 0,
          role: isSchool ? 'teacher' : 'school',
        })));
      }
    } catch (err: any) { console.error('fetchConversations error:', err); setFetchError(err.message || 'Failed to load conversations'); }
    finally { if (setLoad) setIsLoading(false); }
  };

  // ── Fetch Staff for assignment ───────────────────────────────────────────
  const fetchStaff = async () => {
    const res = await fetch('/api/inbox/contacts?role=all&limit=100', { cache: 'no-store' });
    const json = res.ok ? await res.json() : { data: [] };
    setStaff((json.data ?? []).filter((u: any) => ['admin', 'teacher', 'school'].includes(u.role)));
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
      const res = await fetch('/api/inbox/contacts?role=all&limit=100&include_external=1', { cache: 'no-store' });
      const json = res.ok ? await res.json() : { data: [] };
      const rows = Array.isArray(json.data) ? json.data : [];
      setContacts(rows.map((u: any) => ({
        id: u.id, full_name: u.full_name || u.contact_name || 'Unknown',
        phone: u.phone || u.phone_number, email: u.email, school_name: u.school_name,
        school_id: u.school_id, role: u.role, is_active: u.is_active,
        source: u.source || 'portal', portal_user_id: u.role === 'external' ? undefined : u.id,
        opted_out: Boolean(u.opted_out),
      })));
    } catch (err) { console.error('fetchContacts error:', err); }
    finally { setContactsLoading(false); }
  }, []);
  useEffect(() => {
    if (sidebarView === 'contacts' && profile) fetchContacts();
  }, [sidebarView, profile?.id]); // eslint-disable-line

  // ── Filter contacts ────────────────────────────────────────────────────────
  useEffect(() => {
    let r = contacts;
    if (contactRoleFilter !== 'all') r = r.filter(c => c.role === contactRoleFilter);
    if (contactSchoolFilter.trim()) r = r.filter(c => c.school_name?.toLowerCase().includes(contactSchoolFilter.toLowerCase()));
    if (contactClassFilter.trim()) r = r.filter(c => c.class_name?.toLowerCase().includes(contactClassFilter.toLowerCase()));
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
      full_name: activeConv.contact_name,
      phone: activeConv.phone_number || '',
      email: '',
      school_name: activeConv.school_name || '',
      role: activeConv.role || 'student',
      class_name: activeConv.class_name || '',
      notes: '',
    });
    setContactError('');
    setShowAddContact(true);
    setShowSaveBanner(false);
  };

  // ── Fetch messages ─────────────────────────────────────────────────────────
  const markAsRead = async (conv: Conversation) => {
    try {
      await fetch('/api/inbox/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conv.id }),
      });
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
    } catch (err) { console.error('[inbox] markAsRead error:', err); }
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
      } else if (conv.type === 'teachers' && profile?.role === 'student') {
        const res = await fetch(`/api/student-teacher/threads/${encodeURIComponent(conv.id)}/messages`);
        const json = await res.json();
        if (json.data) setMessages((json.data as any[]).map(m => ({ ...normaliseMsg(m), created_at: m.sent_at || m.created_at })));
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
        return;
      } else {
        // school / teachers tab (admin/teacher) — use server endpoint
        const res = await fetch(`/api/school-teacher/conversations/${encodeURIComponent(conv.id)}/messages`);
        const json = await res.json();
        if (json.data) setMessages((json.data as any[]).map(normaliseMsg));
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
        return;
      }
    } catch (err: any) { console.error('fetchMessages error:', err); setSendError(err.message || 'Failed to load messages'); }
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
      const profileRes = await fetch('/api/inbox/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: profileForm.full_name,
          phone: profileForm.phone || undefined,
          school_name: profileForm.school_name || undefined,
          section_class: profileForm.class_name || undefined,
        }),
      });
      if (!profileRes.ok) {
        const profileErr = await profileRes.json().catch(() => ({}));
        throw new Error(profileErr?.error || 'Failed to update profile');
      }
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

    // Optimistic insert — message appears instantly before API round-trip
    const tempId = `temp_${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: activeConv.id,
      sender_id: profile.id,
      direction: 'outbound',
      body,
      created_at: new Date().toISOString(),
      status: 'sending',
    };
    setMessages(prev => [...prev, optimistic]);
    setConversations(prev => prev.map(c =>
      c.id === activeConv.id ? { ...c, last_message_preview: body, last_message_at: new Date().toISOString() } : c
    ));
    setWaFallbackUrl(null);

    setIsSending(true);
    try {
      if (activeConv.type === 'students') {
        const res = await fetch('/api/inbox/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: activeConv.id, message: body }),
        });
        const json = await res.json();
        if (!res.ok) {
          setMessages(prev => prev.filter(m => m.id !== tempId));
          if (res.status === 429 && json.cooldown_remaining_seconds) {
            setCooldownSeconds(json.cooldown_remaining_seconds);
            setSendError(`Please wait ${json.cooldown_remaining_seconds}s before sending again.`);
            return;
          }
          throw new Error(json.error || 'Send failed');
        }

        // Replace optimistic bubble with real server message
        if (json.data) {
          setMessages(prev => prev.map(m => m.id === tempId ? normaliseMsg(json.data) : m));
        }

        // Update daily remaining — only show when running low
        if (json.policy && typeof json.policy.remaining_daily === 'number' && json.policy.remaining_daily <= 5) {
          setPolicySignal(`⚠️ Only ${json.policy.remaining_daily} message${json.policy.remaining_daily !== 1 ? 's' : ''} left today.`);
        }

        // Surface actionable fallback CTAs instead of plain error text
        if (json.is_not_whatsapp_user) {
          setWaFallbackUrl(json.fallback_url || null);
          setSendError(`+${activeConv.phone_number} is not on WhatsApp. Message saved.`);
        } else if (json.is_rate_limit_error) {
          setWaFallbackUrl(json.fallback_url || null);
          setSendError(`Rate limit reached. Message saved — send via WhatsApp directly.`);
        } else if (json.whatsapp_status === 'pending' && json.fallback_url) {
          setWaFallbackUrl(json.fallback_url);
        }
      } else if (activeConv.type === 'parents') {
        const res = await fetch(`/api/parent-teacher/threads/${encodeURIComponent(activeConv.id)}/messages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
        const json = await res.json();
        if (!res.ok) {
          setMessages(prev => prev.filter(m => m.id !== tempId));
          throw new Error(json.error || 'Send failed');
        }
        if (json.data) {
          setMessages(prev => prev.map(m => m.id === tempId ? normaliseMsg(json.data) : m));
        }
      } else if (activeConv.type === 'teachers' && profile?.role === 'student') {
        const res = await fetch(`/api/student-teacher/threads/${encodeURIComponent(activeConv.id)}/messages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
        const json = await res.json();
        if (!res.ok) {
          setMessages(prev => prev.filter(m => m.id !== tempId));
          throw new Error(json.error || 'Send failed');
        }
        if (json.data) {
          setMessages(prev => prev.map(m => m.id === tempId ? { ...normaliseMsg(json.data), created_at: json.data.sent_at || json.data.created_at } : m));
        }
      } else {
        const res = await fetch(`/api/school-teacher/conversations/${encodeURIComponent(activeConv.id)}/messages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
        const json = await res.json();
        if (!res.ok) {
          setMessages(prev => prev.filter(m => m.id !== tempId));
          throw new Error(json.error || 'Send failed');
        }
        if (json.data) {
          setMessages(prev => prev.map(m => m.id === tempId ? normaliseMsg(json.data) : m));
        }
      }
      office?.notifyOfficeChange('inbox');
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
        if (activeTab === 'students' || activeTab === 'parents' || activeTab === 'teachers' || isSchool) {
          const requestedRole = activeTab === 'parents' ? 'parent' : activeTab === 'teachers' || isSchool ? 'teacher' : 'all';
          const includeExternal = activeTab === 'students' && !isParentOrStudent ? '&include_external=1' : '';
          const res = await fetch(`/api/inbox/contacts?q=${encodeURIComponent(directorySearch)}&role=${requestedRole}&limit=50${includeExternal}`, { cache: 'no-store' });
          const json = res.ok ? await res.json() : { data: [] };
          data = Array.isArray(json.data) ? json.data : [];
        } else {
          let q = supabase.from('schools').select('id, name, email').order('name');
          if (directorySearch) q = q.ilike('name', `%${directorySearch}%`);
          data = (await (q.limit(30) as any)).data || [];
        }
        setDirectoryResults(data);      } catch { setDirectoryResults([]); }
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

    const res = await fetch('/api/inbox/conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: phone, contact_name: `+${phone}`, portal_user_id: null }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.data) {
      setQuickChatError(json.error || 'Failed to start WhatsApp chat');
      setShowQuickChat(true);
      return;
    }

    const conv = json.data;
    const c: Conversation = {
      id: conv.id,
      type: 'students',
      phone_number: conv.phone_number,
      contact_name: conv.contact_name || `+${phone}`,
      last_message_at: conv.last_message_at ?? '',
      last_message_preview: conv.last_message_preview || '',
      unread_count: conv.unread_count || 0,
      portal_user_id: conv.portal_user_id ?? undefined,
      assigned_staff_id: conv.assigned_staff_id ?? undefined,
      opted_out: Boolean(conv.opted_out),
    };
    setConversations(prev => [c, ...prev.filter(x => x.id !== c.id)]);
    setActiveConv(c);
    setShowSidebar(false);
    setSidebarView('chats');
    setActiveTab('students');
  };

  // ── Open / create a WhatsApp conversation for any contact with a phone ─────
  const openWhatsAppConversation = async (item: {
    id: string; full_name: string; phone?: string; phone_number?: string;
    role?: string; school_name?: string; isExternalWA?: boolean; opted_out?: boolean;
  }) => {
    const phone = (item.phone || item.phone_number || '').replace(/\D/g, '');
    if (!phone) { setSendError(`${item.full_name} has no phone number on file.`); return; }

    if (item.isExternalWA) {
      const row = item as any;
      const c: Conversation = { id: item.id, type: 'students', phone_number: phone, contact_name: item.full_name, last_message_at: row.last_message_at ?? '', last_message_preview: row.last_message_preview || '', unread_count: row.unread_count || 0, role: 'external', assigned_staff_id: row.assigned_staff_id ?? undefined, opted_out: Boolean(item.opted_out) };
      setConversations(prev => [c, ...prev.filter(x => x.id !== c.id)]);
      setActiveConv(c); setShowSidebar(false);
      setSidebarView('chats'); setActiveTab('students');
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
    const convJson = await convRes.json().catch(() => ({}));
    if (!convRes.ok) {
      setSendError(convJson.error || 'Failed to open WhatsApp conversation.');
      return;
    }
    const conv = convJson.data;

    if (conv) {
      const c: Conversation = {
        id: conv.id, type: 'students', phone_number: phone,
        contact_name: item.full_name, last_message_at: conv.last_message_at ?? '',
        last_message_preview: conv.last_message_preview || '', unread_count: 0,
        school_name: item.school_name, role: item.role || 'external',
        portal_user_id: item.id,
        assigned_staff_id: conv.assigned_staff_id ?? undefined,
        opted_out: Boolean(conv.opted_out),
      };
      setConversations(prev => [c, ...prev.filter(x => x.id !== c.id)]);
      setActiveConv(c); setShowSidebar(false);
      setSidebarView('chats'); setActiveTab('students');
      office?.notifyOfficeChange('inbox');
    }
  };

  // ── Start new conversation ─────────────────────────────────────────────────
  const startNewConversation = async (item: any) => {
    setShowNewChat(false);
    try {
      if (activeTab === 'students') {
        await openWhatsAppConversation(item);
      } else if (activeTab === 'parents') {
        // The server validates the parent and resolves the linked student.
        if (!profile?.id) return;
        const threadRes = await fetch('/api/inbox/threads', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent_id: item.id, teacher_id: profile.id }),
        });
        if (!threadRes.ok) {
          const threadErr = await threadRes.json().catch(() => ({}));
          throw new Error(threadErr?.error || 'Failed to create thread');
        }
        const thread = (await threadRes.json()).data;
        if (thread) {
          const c: Conversation = {
            id: thread.id,
            type: 'parents' as const,
            contact_name: item.full_name || 'Parent',
            last_message_at: thread.created_at || new Date().toISOString(),
            last_message_preview: 'No messages yet',
            unread_count: 0,
            role: 'parent',
          };
          setConversations(prev => [c, ...prev.filter(x => x.id !== c.id)]);
          setActiveConv(c);
          setShowSidebar(false);
          setSidebarView('chats');
          setActiveTab('parents');
        }
      } else if (activeTab === 'teachers' && profile?.role === 'student') {
        // Student initiates a direct thread with their teacher
        const res = await fetch('/api/student-teacher/threads', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacher_id: item.id }),
        });
        const json = await res.json();
        if (json.data) {
          const c: Conversation = {
            id: json.data.id, type: 'teachers' as const,
            contact_name: item.full_name || 'Teacher',
            avatar_url: item.avatar_url,
            last_message_at: json.data.created_at || new Date().toISOString(),
            last_message_preview: 'No messages yet',
            unread_count: 0, role: 'teacher',
          };
          setConversations(prev => [c, ...prev.filter(x => x.id !== c.id)]);
          setActiveConv(c);
          setShowSidebar(false);
          setSidebarView('chats');
          setActiveTab('teachers');
        }
      } else if (activeTab === 'teachers' || activeTab === 'school') {
        // Open subject dialog instead of window.prompt
        setSubjectDialog({ open: true, subject: '', pendingItem: item });
      }
    } catch (err) { console.error(err); }
  };

  // ── Confirm subject dialog and create school/teacher conversation ─────────
  const confirmSubjectAndCreate = async () => {
    const item = subjectDialog.pendingItem;
    const subject = subjectDialog.subject.trim();
    if (!subject || !item) return;
    setSubjectDialog({ open: false, subject: '', pendingItem: null });
    try {
      const isTeacherTab = activeTab === 'teachers';
      const res = await fetch('/api/school-teacher/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: isSchool ? (profile?.school_id || '') : (isTeacherTab ? null : item.id),
          teacher_id: isSchool ? item.id : (isTeacherTab ? item.id : profile?.id),
          subject,
        }),
      });
      const json = await res.json();
      if (json.data) {
        const c: Conversation = {
          id: json.data.id,
          type: isTeacherTab ? 'teachers' : 'school',
          contact_name: isTeacherTab ? (item.full_name || 'Teacher') : isSchool ? (item.full_name || 'Teacher') : (item.name || 'School'),
          school_name: isTeacherTab ? item.school_name : undefined,
          role: isTeacherTab ? 'teacher' : isSchool ? 'teacher' : 'school',
          subject,
          last_message_at: json.data.created_at || new Date().toISOString(),
          last_message_preview: '',
          unread_count: 0,
        };
        setConversations(prev => [c, ...prev.filter(x => x.id !== c.id)]);
        setActiveConv(c); setShowSidebar(false);
        setSidebarView('chats'); setActiveTab(isTeacherTab ? 'teachers' : 'school');
        office?.notifyOfficeChange('inbox');
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
      office?.notifyOfficeChange('inbox');
      setTimeout(() => { setShowEmailCompose(false); setEmailForm(EMPTY_EMAIL_FORM); setEmailSuccess(''); }, 2000);
    } catch (err: any) {
      setEmailError(err.message || 'Failed to send email.');
    } finally { setSendingEmail(false); }
  };

  // ── Open email compose pre-filled from a contact or conversation ──────────
  const openEmailCompose = (contact?: Contact | Conversation | null) => {
    const recipientEmail = (contact as any)?.email || '';
    setEmailForm({
      to: recipientEmail,
      to_name: (contact as any)?.full_name || (contact as any)?.contact_name || '',
      subject: (contact as any)?.contact_name || (contact as any)?.full_name
        ? `Rillcod follow-up: ${(contact as any)?.contact_name || (contact as any)?.full_name}`
        : '',
      body: '',
      cc: '',
    });
    setEmailError(recipientEmail ? '' : 'No email is saved for this contact yet. Add one before sending a company email.');
    setEmailSuccess('');
    setShowEmailCompose(true);
  };

  const openSupportEmailCompose = () => {
    const roleLabel =
      profile?.role === 'teacher' ? 'Teacher' :
      profile?.role === 'school' ? 'School' :
      profile?.role === 'parent' ? 'Parent' :
      profile?.role === 'admin' ? 'Admin' : 'Student';
    setEmailForm({
      to: `${brandContact.email}`,
      to_name: 'Rillcod Client Support',
      subject: `${roleLabel} support request`,
      body: '',
      cc: '',
    });
    setEmailError('');
    setEmailSuccess('');
    setShowEmailCompose(true);
  };

  const openAdminEmailCompose = () => {
    setEmailForm({
      to: `${brandContact.email}`,
      to_name: 'Rillcod Company Operations',
      subject: 'Attention: Company Operations Team',
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
      if (contact.phone) {
        await openWhatsAppConversation({
          id: contact.id,
          full_name: contact.full_name,
          phone: contact.phone,
          role: contact.role,
          school_name: contact.school_name,
          isExternalWA: contact.source === 'whatsapp',
          opted_out: contact.opted_out,
        });
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
        const contactRes = await fetch('/api/inbox/contact', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingContact.id,
            full_name: addContactForm.full_name,
            phone: addContactForm.phone || undefined,
            school_name: addContactForm.school_name || undefined,
            conversation_id: (editingContact as any).conversation_id ?? (editingContact.source === 'whatsapp' ? editingContact.id : null),
          }),
        });
        if (!contactRes.ok) {
          const contactErr = await contactRes.json().catch(() => ({}));
          throw new Error(contactErr?.error || 'Failed to update contact');
        }
        setContacts(prev => prev.map(c => c.id === editingContact.id ? {
          ...c,
          full_name: addContactForm.full_name,
          phone: addContactForm.phone,
          email: addContactForm.email,
          school_name: addContactForm.school_name,
        } : c));
      } else {
        // New contact: create whatsapp_conversations record for external contacts
        const cleanPhone = addContactForm.phone?.replace(/\D/g, '');
        const insertPayload: Record<string, unknown> = {
          contact_name: addContactForm.full_name,
          last_message_at: new Date().toISOString(),
          last_message_preview: '',
          unread_count: 0,
        };
        if (cleanPhone) insertPayload.phone_number = cleanPhone;
        const createRes = await fetch('/api/inbox/contact', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full_name: addContactForm.full_name, phone: cleanPhone }),
        });
        const createJson = await createRes.json().catch(() => ({}));
        if (!createRes.ok) throw new Error(createJson.error || 'Failed to create contact');
        const data = createJson.data;
        const newContact: Contact = {
          id: data.id,
          full_name: addContactForm.full_name,
          phone: cleanPhone,
          email: addContactForm.email,
          school_name: addContactForm.school_name,
          role: addContactForm.role,
          class_name: addContactForm.class_name,
          source: 'whatsapp',
        };
        setContacts(prev => [newContact, ...prev]);
      }
      setShowAddContact(false);
      setEditingContact(null);
      setAddContactForm(EMPTY_CONTACT_FORM);
      office?.notifyOfficeChange('inbox');
    } catch (err: any) {
      setContactError(err.message || 'Failed to save contact.');
    } finally { setSavingContact(false); }
  };

  const assignConversation = async (convId: string, staffId: string | null) => {
    setAssigningId(convId);
    try {
      await fetch('/api/inbox/assign', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: convId, staff_id: staffId }),
      });
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, assigned_staff_id: staffId } : c));
      if (activeConv?.id === convId) {
        setActiveConv(prev => prev ? { ...prev, assigned_staff_id: staffId } : null);
      }
      office?.notifyOfficeChange('inbox');
    } catch (err) {
      console.error('[inbox] assignConversation failed', err);
    } finally {
      setAssigningId(null);
      setShowAssignMenu(false);
    }
  };

  const assignToMe = async (convId: string) => {
    if (!profile) return;
    await assignConversation(convId, profile.id);
  };

  const deleteConversation = async (conv: Conversation) => {
    const canDelete = isStaff || (profile?.role === 'student' && conv.type === 'teachers');
    if (!canDelete) return;
    if (deleteConfirmConvId !== conv.id) {
      setDeleteConfirmConvId(conv.id);
      return;
    }
    setDeleteConfirmConvId(null);
    try {
      let url: string;
      if (conv.type === 'students') {
        url = `/api/inbox/conversation?id=${encodeURIComponent(conv.id)}`;
      } else if (conv.type === 'parents') {
        url = `/api/parent-teacher/threads?id=${encodeURIComponent(conv.id)}`;
      } else if (conv.type === 'teachers' && profile?.role === 'student') {
        url = `/api/student-teacher/threads?id=${encodeURIComponent(conv.id)}`;
      } else {
        url = `/api/school-teacher/conversations?id=${encodeURIComponent(conv.id)}`;
      }
      const res  = await fetch(url, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      setConversations(prev => prev.filter(c => c.id !== conv.id));
      if (activeConv?.id === conv.id) {
        setActiveConv(null);
        setMessages([]);
        setShowSidebar(true);
      }
      office?.notifyOfficeChange('inbox');
    } catch (err: any) {
      setSendError(err.message || 'Failed to delete conversation');
    }
  };

  const openEditContact = (c: Contact) => {
    setEditingContact(c);
    setAddContactForm({ full_name: c.full_name, phone: c.phone || '', email: c.email || '', school_name: c.school_name || '', role: c.role, class_name: c.class_name || '', notes: '' });
    setShowAddContact(true);
  };

  // ── Cooldown countdown ticker ──────────────────────────────────────────────
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const t = setTimeout(() => setCooldownSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldownSeconds]);

  // ── Auto-resize textarea ───────────────────────────────────────────────────
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target.value.length > 4096) return;
    setNewMessage(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  // ── Guards ─────────────────────────────────────────────────────────────────
  if (authLoading || redirecting) return (
    <div className="h-full bg-[#111b21] flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
  if (!hasAccess) return (
    <div className="h-full bg-[#111b21] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <X className="w-16 h-16 text-rose-600 dark:text-rose-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-6">Your account does not have inbox access.</p>
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
        <div className="h-[56px] px-4 flex items-center justify-between bg-[#202c33] shrink-0 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <h2 className="text-foreground font-black text-[16px] tracking-tight">
              {sidebarView === 'contacts' ? 'Contacts' : 'Inbox'}
            </h2>
            {sidebarView === 'chats' && totalUnread > 0 && (
              <span className="bg-primary text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{totalUnread}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => { setShowAddContact(true); setEditingContact(null); setAddContactForm(EMPTY_CONTACT_FORM); setContactError(''); }}
              className="p-2 text-muted-foreground hover:bg-white/10 rounded-full transition-colors" title="Add contact">
              <UserPlus className="w-5 h-5" />
            </button>
            {sidebarView === 'chats' ? (
              <>
                <button onClick={() => setFilterUnread(v => !v)} title={filterUnread ? 'Show all' : 'Unread only'}
                  className={`p-2 rounded-full transition-colors ${filterUnread ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-white/10'}`}>
                  <Filter className="w-4 h-4" />
                </button>
                <button onClick={() => openEmailCompose()} className="p-2 text-muted-foreground hover:text-primary hover:bg-white/10 rounded-full transition-colors" title="Compose email">
                  <Mail className="w-4 h-4" />
                </button>
                <button
                  onClick={
                    profile?.role === 'student' && activeTab === 'teachers'
                      ? () => setShowNewChat(true)
                      : isParentOrStudent
                        ? startSupportConversation
                        : () => setShowNewMessagePicker(true)
                  }
                  className="p-2 text-muted-foreground hover:bg-white/10 rounded-full transition-colors" title="New message">
                  <Plus className="w-5 h-5" />
                </button>
              </>
            ) : null}
            {!isParentOrStudent && (
              <button
                onClick={() => { setSidebarView(v => v === 'chats' ? 'contacts' : 'chats'); setActiveContact(null); }}
                title={sidebarView === 'chats' ? 'View contacts' : 'Back to chats'}
                className={`p-2 rounded-full transition-colors ${sidebarView === 'contacts' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-white/10'}`}
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
                  onClick={() => {
                    setActiveTab(tab.id); setActiveConv(null); setConvSearch(''); setFilterUnread(false);
                    // Students need to see the sidebar when on the Teachers tab
                    if (profile?.role === 'student' && tab.id === 'teachers') setShowSidebar(true);
                  }}
                  className={`flex-1 flex flex-col items-center py-2.5 gap-1 transition-all border-b-2 text-[9px] font-black uppercase tracking-wider ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-white/60 hover:bg-white/[0.03]'
                    }`}>
                  <tab.icon className="w-[15px] h-[15px]" />{tab.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="px-3 py-2.5 bg-[#111b21] shrink-0">
              <div className="relative">
                <Search className="w-[15px] h-[15px] absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={convSearch} onChange={e => setConvSearch(e.target.value)}
                  placeholder={`Search ${activeTab === 'school' && isSchool ? 'teachers' : activeTab}…`}
                  className="w-full bg-[#2a3942] text-foreground text-[13px] rounded-lg pl-9 pr-4 py-[7px] outline-none placeholder-white/25 focus:ring-1 focus:ring-primary/30" />
                {convSearch && (
                  <button onClick={() => setConvSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white/60">
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
                    className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${queueFilter === q.id ? 'bg-primary/30 text-violet-800 dark:text-violet-200' : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                      }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}

            {isParentOrStudent && activeTab === 'students' && (
              <div className="px-3 pb-3 shrink-0">
                <div className="bg-primary/10 border border-primary/20 p-3 rounded-lg">
                  <h4 className="text-[10px] font-black text-brand-red-600 uppercase tracking-[0.2em] mb-2">Support Channels</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={startSupportConversation} className="flex flex-col items-center gap-1 p-2 bg-[#202c33] border border-white/5 hover:border-primary/40 rounded-lg transition-all group">
                      <MessageSquare className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-bold text-muted-foreground uppercase">In-App</span>
                    </button>
                    <a href={brandContact.whatsapp} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 p-2 bg-[#202c33] border border-white/5 hover:border-emerald-500/40 rounded-lg transition-all group">
                      <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-bold text-muted-foreground uppercase">WhatsApp</span>
                    </a>
                    <button onClick={openSupportEmailCompose} className="flex flex-col items-center gap-1 p-2 bg-[#202c33] border border-white/5 hover:border-primary/40 rounded-lg transition-all group">
                      <Mail className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
                      <span className="text-[8px] font-bold text-muted-foreground uppercase">Email</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
            {profile?.role === 'student' && activeTab === 'teachers' && (
              <div className="px-3 pb-3 shrink-0">
                <div className="bg-violet-900/20 border border-violet-500/20 p-3 rounded-lg">
                  <h4 className="text-[10px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-[0.2em] mb-1">Direct to Teacher</h4>
                  <p className="text-[10px] text-muted-foreground mb-2">Pick any of your teachers to start a private conversation.</p>
                  <button onClick={() => setShowNewChat(true)} className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 rounded-lg text-[10px] font-bold text-violet-700 dark:text-violet-300 transition-all">
                    <GraduationCap className="w-3.5 h-3.5" /> Pick a Teacher
                  </button>
                </div>
              </div>
            )}

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {isLoading ? (
                <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : fetchError ? (
                <div className="text-center p-12">
                  <p className="text-rose-600 dark:text-rose-400 text-sm mb-3">{fetchError}</p>
                  <button onClick={() => fetchConversations(activeTab)} className="text-primary text-sm font-bold hover:underline">Retry</button>
                </div>
              ) : filteredConvs.length === 0 ? (
                <div className="text-center p-12">
                  <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">
                    {convSearch || filterUnread
                      ? 'No matching conversations.'
                      : (profile?.role === 'student' && activeTab === 'teachers')
                        ? 'Message a teacher directly.'
                        : isParentOrStudent
                          ? 'Start a support chat with our team.'
                          : 'No conversations yet.'}
                  </p>
                  {!convSearch && !filterUnread && (
                    <button
                      onClick={
                        profile?.role === 'student' && activeTab === 'teachers'
                          ? () => setShowNewChat(true)
                          : isParentOrStudent
                            ? startSupportConversation
                            : () => setShowNewChat(true)
                      }
                      className="mt-3 text-primary text-sm font-bold hover:underline">
                      {(profile?.role === 'student' && activeTab === 'teachers') ? 'Pick a teacher →' : isParentOrStudent ? 'Start Chat →' : 'Start one →'}
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
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-[15px] text-foreground ${AVATAR_COLORS[conv.type]}`}>
                          {initials(conv.contact_name)}
                        </div>
                        {/* Status dot or assigned staff avatar */}
                        {assignedStaff ? (
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#111b21] overflow-hidden bg-white/10 shrink-0" title={`Assigned to ${assignedStaff.full_name}`}>
                            {assignedStaff.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={assignedStaff.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-primary text-[8px] font-black text-white">
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
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="font-bold text-foreground text-[15px] truncate">{conv.contact_name}</span>
                            {conv.opted_out && (
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/35 shrink-0">
                                Opted Out
                              </span>
                            )}
                          </div>
                          <span className={`text-[12px] shrink-0 ml-2 ${conv.unread_count > 0 ? 'text-[#00a884] font-medium' : 'text-[#8696a0]'}`}>{formatConvTime(conv.last_message_at)}</span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isAssignedToMe && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-primary text-white shadow-sm shadow-primary/40">You</span>}
                          {conv.role && <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${ROLE_COLORS[conv.role] || 'bg-white/10 text-muted-foreground'}`}>{conv.role}</span>}
                          {conv.school_name && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-white/5 text-muted-foreground truncate max-w-[80px]">{conv.school_name}</span>}
                        </div>

                        <div className="flex justify-between items-center mt-1">
                          <p className={`text-[14px] truncate mr-2 ${conv.unread_count > 0 ? 'text-muted-foreground font-medium' : 'text-[#8696a0]'}`}>
                            {conv.last_message_preview || 'No messages yet'}
                          </p>
                          {conv.unread_count > 0 && (
                            <span className="bg-[#00a884] text-[#111b21] text-[11px] font-bold min-w-[20px] h-[20px] flex items-center justify-center px-1 rounded-full shrink-0">
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
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={contactSearch} onChange={e => setContactSearch(e.target.value)}
                  placeholder="Search contacts…"
                  className="w-full bg-[#2a3942] text-foreground text-sm rounded-lg pl-10 pr-4 py-2 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                {contactSearch && (
                  <button onClick={() => setContactSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white/60"><X className="w-3.5 h-3.5" /></button>
                )}
              </div>
              {/* Role filter chips */}
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 custom-scrollbar">
                {['all', 'student', 'parent', 'teacher', 'school', 'external'].map(r => (
                  <button key={r} onClick={() => setContactRoleFilter(r)}
                    className={`shrink-0 text-[9px] font-black uppercase px-2.5 py-1 rounded-full transition-colors ${contactRoleFilter === r ? 'bg-primary text-white' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}>
                    {r}
                  </button>
                ))}
                <button onClick={() => setShowAdvancedFilters(v => !v)}
                  className={`shrink-0 text-[9px] font-black uppercase px-2.5 py-1 rounded-full transition-colors flex items-center gap-1 ${showAdvancedFilters || contactSchoolFilter || contactClassFilter ? 'bg-primary/20 text-primary' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}>
                  <Filter className="w-2.5 h-2.5" /> More
                </button>
              </div>

              {/* Advanced filters — school & class */}
              {showAdvancedFilters && (
                <div className="space-y-2 pt-1">
                  <div className="relative">
                    <School className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <select value={contactSchoolFilter} onChange={e => setContactSchoolFilter(e.target.value)}
                      className="w-full bg-[#2a3942] text-foreground text-xs rounded-lg pl-8 pr-3 py-2 outline-none appearance-none focus:ring-1 focus:ring-primary/40">
                      <option value="">All Schools</option>
                      {uniqueSchools.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="relative">
                    <GraduationCap className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <select value={contactClassFilter} onChange={e => setContactClassFilter(e.target.value)}
                      className="w-full bg-[#2a3942] text-foreground text-xs rounded-lg pl-8 pr-3 py-2 outline-none appearance-none focus:ring-1 focus:ring-primary/40">
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
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
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
                  <UserCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">{contactSearch || contactRoleFilter !== 'all' ? 'No matching contacts.' : 'No contacts yet.'}</p>
                  <button onClick={() => { setShowAddContact(true); setEditingContact(null); setAddContactForm(EMPTY_CONTACT_FORM); }}
                    className="mt-3 text-primary text-sm font-bold hover:underline">Add one →</button>
                </div>
              ) : (
                filteredContacts.map(contact => (
                  <div key={contact.id}
                    onClick={() => setActiveContact(prev => prev?.id === contact.id ? null : contact)}
                    className={`px-3 py-3 cursor-pointer transition-colors border-b border-white/[0.04] group ${activeContact?.id === contact.id ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-sm text-white shrink-0 ${contact.role === 'student' ? 'bg-emerald-500' : contact.role === 'parent' ? 'bg-primary' :
                        contact.role === 'teacher' ? 'bg-primary' : contact.role === 'school' ? 'bg-indigo-600' : 'bg-white/20'
                        }`}>
                        {initials(contact.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground text-[14px] truncate">{contact.full_name}</span>
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 ${ROLE_COLORS[contact.role] || 'bg-white/10 text-muted-foreground'}`}>{contact.role}</span>
                          {contact.source === 'whatsapp' && <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 shrink-0">WA</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {contact.phone && <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{contact.phone}</span>}
                          {contact.school_name && <span className="text-[11px] text-muted-foreground truncate max-w-[110px]">{contact.school_name}</span>}
                          {contact.class_name && <span className="text-[11px] text-primary">{contact.class_name}</span>}
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
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-violet-700 dark:text-violet-300 text-[11px] font-black rounded-full transition-colors">
                            <Mail className="w-3 h-3" /> Email
                          </button>
                        )}
                        <button onClick={() => openEditContact(contact)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-muted-foreground text-[11px] font-black rounded-full transition-colors">
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        {/* Full detail row */}
                        {(contact.email || contact.school_name) && (
                          <div className="w-full mt-1 bg-[#111b21] rounded-xl p-2 space-y-1">
                            {contact.email && <p className="text-[11px] text-muted-foreground"><span className="text-muted-foreground font-bold">Email:</span> {contact.email}</p>}
                            {contact.school_name && <p className="text-[11px] text-muted-foreground"><span className="text-muted-foreground font-bold">School:</span> {contact.school_name}</p>}
                            {contact.class_name && <p className="text-[11px] text-muted-foreground"><span className="text-muted-foreground font-bold">Class:</span> {contact.class_name}</p>}
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
            <div className="h-[56px] px-4 bg-[#202c33] flex items-center justify-between border-b border-white/[0.06] shrink-0 z-10">
              <div className="flex items-center flex-1 min-w-0 gap-3">
                <button onClick={() => { setShowSidebar(true); setActiveConv(null); setShowInfo(false); }} className="md:hidden text-muted-foreground hover:text-white">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button onClick={() => setShowInfo(v => !v)} className="flex items-center gap-2 min-w-0 text-left group">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm text-foreground shrink-0 shadow-lg ${AVATAR_COLORS[activeConv.type]}`}>
                      {initials(activeConv.contact_name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="font-bold text-foreground text-[15px] truncate group-hover:text-primary transition-colors">{activeConv.contact_name}</h3>
                        {activeConv.opted_out && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/35 shrink-0">
                            Opted Out
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
                        {activeConv.type === 'students' && activeConv.phone_number ? `+${activeConv.phone_number}` :
                          activeConv.subject ? activeConv.subject :
                            activeConv.student_name ? `Re: ${activeConv.student_name}` :
                              activeConv.role || 'Chat'}

                        {activeConv.type === 'students' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase">
                            Company WhatsApp
                          </span>
                        )}

                        {/* Assignment Status Pill */}
                        {activeConv.type === 'students' && (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase ${activeConv.assigned_staff_id === profile?.id ? 'bg-primary/20 text-primary' :
                            activeConv.assigned_staff_id ? 'bg-primary/20 text-primary' : 'bg-white/5 text-muted-foreground'
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
                  <div className="relative" ref={assignMenuRef}>
                    <button
                      type="button"
                      onClick={() => setShowAssignMenu(v => !v)}
                      disabled={!!assigningId}
                      aria-expanded={showAssignMenu}
                      className="flex items-center gap-1.5 min-h-9 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white text-[11px] font-black rounded-lg transition-all border border-white/5"
                    >
                      {assigningId === activeConv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                      <span>{activeConv.assigned_staff_id ? 'Reassign' : 'Assign'}</span>
                    </button>
                    {showAssignMenu && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-[#233138] rounded-xl shadow-2xl border border-white/[0.08] z-50 overflow-hidden">
                      <div className="p-2 border-b border-white/5">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-2 py-1">Assign to Staff</p>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                        <button
                          onClick={() => assignConversation(activeConv.id, profile!.id)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/10 transition-colors border-b border-white/5"
                        >
                          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[10px] font-black text-white">ME</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-foreground truncate">Assign to myself</p>
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
                            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[10px] font-black text-white overflow-hidden">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {s.avatar_url ? <img src={s.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(s.full_name)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-bold text-foreground truncate">{s.full_name}</p>
                              <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight">{s.role}</p>
                            </div>
                            {activeConv.assigned_staff_id === s.id && <Check className="w-4 h-4 text-primary" />}
                          </button>
                        ))}
                        <button
                          onClick={() => assignConversation(activeConv.id, null)}
                          className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-rose-500/10 transition-colors text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 group/unassign"
                        >
                          <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center group-hover/unassign:bg-rose-500/20">
                            <X className="w-4 h-4" />
                          </div>
                          <span className="text-[12px] font-bold">Unassign</span>
                          {!activeConv.assigned_staff_id && <Check className="w-4 h-4 text-muted-foreground" />}
                        </button>
                      </div>
                    </div>
                    )}
                  </div>
                )}

                {/* Self-assign Quick Action for Teachers */}
                {activeConv.type === 'students' && isTeacher && !activeConv.assigned_staff_id && (
                  <button
                    onClick={() => assignToMe(activeConv.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-600 dark:text-emerald-400 hover:text-white text-[11px] font-black rounded-lg transition-all border border-emerald-500/20"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Claim Chat
                  </button>
                )}

                <button
                  onClick={() => openEmailCompose(activeConv)}
                  title="Send branded company email"
                  className="p-2 text-muted-foreground hover:text-primary hover:bg-white/10 rounded-full transition-colors"
                >
                  <Mail className="w-5 h-5" />
                </button>
                <button onClick={() => setShowInfo(v => !v)} className={`p-2 rounded-full transition-colors ${showInfo ? 'text-primary bg-white/10' : 'text-muted-foreground hover:bg-white/10'}`} title="Contact info">
                  <Info className="w-5 h-5" />
                </button>
                {(isStaff || (profile?.role === 'student' && activeConv.type === 'teachers')) && (
                  deleteConfirmConvId === activeConv.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-rose-600 dark:text-rose-400 text-[10px] font-black hidden sm:inline">Delete?</span>
                      <button onClick={() => deleteConversation(activeConv)} className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-600 dark:text-rose-400 text-[10px] font-black rounded-lg transition-colors">Yes</button>
                      <button onClick={() => setDeleteConfirmConvId(null)} className="px-2 py-1 bg-white/5 hover:bg-white/10 text-muted-foreground text-[10px] font-black rounded-lg transition-colors">No</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => deleteConversation(activeConv)}
                      title="Delete conversation"
                      className="p-2 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 rounded-full transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )
                )}
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
                  <button onClick={() => setShowSaveBanner(false)} className="text-muted-foreground hover:text-white/60">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Chat body */}
            <div className="flex flex-1 overflow-hidden">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 md:px-[6%] flex flex-col gap-1 custom-scrollbar"
                style={{ backgroundColor: '#0b141a', backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath opacity='0.03' fill='%23ffffff' d='M25 25h10v10H25zm30 30h10v10H55zm-20 20h10v10H35zm40-40h10v10H75zM15 65h10v10H15zm50-50h10v10H65z'/%3E%3C/svg%3E\")", backgroundSize: '100px 100px' }}>
                {msgLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-center py-12">
                    <div className="bg-[#182229] rounded-xl px-6 py-5 max-w-xs border border-white/[0.06]">
                      <p className="text-muted-foreground text-[13px]">No messages yet.</p>
                      {activeConv.type === 'students' && activeConv.phone_number && (
                        <a href={buildWaUrl(activeConv.phone_number, newMessage)} target="_blank" rel="noopener noreferrer"
                          className="mt-3 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center gap-1 hover:underline">
                          <Phone className="w-3 h-3" /> {newMessage.trim() ? 'Open WA (message pre-filled)' : 'Open in WhatsApp'}
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isMine = msg.sender_id === profile?.id || msg.direction === 'outbound';
                    const showDate = idx === 0 || !sameDay(messages[idx - 1].created_at, msg.created_at);
                    return (
                      <React.Fragment key={msg.id}>
                        {showDate && (
                          <div className="flex justify-center my-3">
                            <span className="bg-[#202c33] text-muted-foreground text-[11px] font-bold px-3 py-1 rounded-full">{formatDateSep(msg.created_at)}</span>
                          </div>
                        )}
                        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-0.5`}>
                          <div className={`relative max-w-[85%] md:max-w-[70%] shadow-sm ${isMine ? 'bg-[#005c4b] text-[#e9edef] rounded-lg rounded-tr-none px-2.5 py-1.5' : 'bg-[#202c33] text-[#e9edef] rounded-lg rounded-tl-none px-2.5 pt-1.5 pb-1.5'
                            }`}>
                            {/* Tail pseudo-elements could be done with pure CSS or SVG, using simple CSS borders here */}
                            {isMine ? (
                              <div className="absolute top-0 -right-2 w-0 h-0 border-[4px] border-transparent border-t-[#005c4b] border-l-[#005c4b]" />
                            ) : (
                              <div className="absolute top-0 -left-2 w-0 h-0 border-[4px] border-transparent border-t-[#202c33] border-r-[#202c33]" />
                            )}
                            {/* Inbound meta row — role/school/class for teachers/admins */}
                            {!isMine && (
                              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                <span className="text-primary text-[11px] font-black">{activeConv.contact_name}</span>
                                {activeConv.role && (
                                  <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${ROLE_COLORS[activeConv.role] || 'bg-white/10 text-muted-foreground'}`}>{activeConv.role}</span>
                                )}
                                <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${CHANNEL_COLORS[activeConv.type]}`}>
                                  {activeConv.type === 'students' ? 'WhatsApp' : activeConv.type === 'parents' ? 'Parent' : activeConv.type === 'teachers' ? 'Teacher' : 'School'}
                                </span>
                                {activeConv.school_name && (
                                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-white/5 text-muted-foreground truncate max-w-[120px]">{activeConv.school_name}</span>
                                )}
                                {activeConv.class_name && (
                                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">{activeConv.class_name}</span>
                                )}
                              </div>
                            )}
                            <div className="flex flex-wrap items-end justify-between gap-2 mt-0.5">
                              <div className="text-[14.2px] leading-snug whitespace-pre-wrap break-words">{renderMessageBody(msg.body)}</div>
                              <div className={`flex items-center gap-1 shrink-0 ${isMine ? 'text-[#8696a0]' : 'text-[#8696a0]'}`}>
                                <span className="text-[11px] leading-none mt-1">{formatMsgTime(msg.created_at)}</span>
                                {isMine && (
                                  msg.status === 'sending' ? <Clock className="w-3.5 h-3.5 text-[#8696a0] animate-pulse" /> :
                                    msg.is_read || msg.status === 'read' ? <CheckCheck className="w-4 h-4 text-[#53bdeb]" /> :
                                      msg.status === 'delivered' ? <CheckCheck className="w-4 h-4" /> :
                                        <Check className="w-4 h-4" />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* ── Info Panel ─────────────────────────────────────────────
                   Mobile: fixed overlay from right (backdrop closes it)
                   Desktop: static side panel                           */}
              {showInfo && (
                <>
                  {/* Mobile backdrop */}
                  <div className="md:hidden fixed inset-0 z-[54] bg-foreground/35 dark:bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowInfo(false)} />

                  <div className={[
                    /* mobile: fixed right drawer */
                    'fixed top-[var(--app-header-height)] right-0 bottom-[var(--app-bottom-nav-height)] w-[88vw] max-w-[320px] z-[55]',
                    /* desktop: static side column */
                    'md:static md:top-auto md:bottom-auto md:right-auto md:w-[280px] md:max-w-none md:z-auto md:shrink-0',
                    /* shared */
                    'flex flex-col overflow-hidden',
                  ].join(' ')}
                    style={{ background: '#0d1418', borderLeft: '1px solid rgba(255,255,255,0.07)' }}>

                    {/* ── Header gradient ── */}
                    <div className="shrink-0 relative pb-5"
                      style={{ background: 'linear-gradient(160deg,#1a2830 0%,#111b21 100%)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {/* Close on mobile */}
                      <div className="flex items-center justify-between px-4 pt-4 pb-2 md:hidden">
                        <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#8696a0' }}>Contact Info</span>
                        <button onClick={() => setShowInfo(false)} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
                          <X className="w-4 h-4" style={{ color: '#8696a0' }} />
                        </button>
                      </div>
                      <div className="hidden md:flex items-center justify-between px-4 pt-4 pb-2">
                        <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#8696a0' }}>Contact Info</span>
                        <button onClick={() => setShowInfo(false)} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                          <X className="w-3.5 h-3.5" style={{ color: '#8696a0' }} />
                        </button>
                      </div>

                      {/* Avatar + name */}
                      <div className="flex flex-col items-center gap-2 px-4">
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center font-black text-2xl text-foreground shadow-lg ring-4 ring-white/[0.08] ${AVATAR_COLORS[activeConv.type]}`}>
                          {initials(activeConv.contact_name)}
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1.5 min-w-0">
                            <h3 className="font-black text-foreground text-[15px] leading-tight">{activeConv.contact_name}</h3>
                            {activeConv.opted_out && (
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/35 shrink-0">
                                Opted Out
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-center gap-1.5 mt-1 flex-wrap">
                            {activeConv.role && (
                              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${ROLE_COLORS[activeConv.role] || 'bg-white/10 text-muted-foreground'}`}>
                                {activeConv.role}
                              </span>
                            )}
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${CHANNEL_COLORS[activeConv.type]}`}>
                              {activeConv.type === 'teachers' ? 'Teacher' : activeConv.type === 'school' ? 'School' : activeConv.type === 'parents' ? 'Parent' : 'WhatsApp'}
                            </span>
                          </div>
                          {activeConv.class_name && (
                            <p className="text-[10px] mt-1" style={{ color: '#8696a0' }}>{activeConv.class_name}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── Scrollable body ── */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      <div className="p-4 space-y-3 mobile-page-root">

                        {/* Action buttons */}
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => openEmailCompose(activeConv)}
                            className="flex flex-col items-center gap-1.5 py-3 rounded-xl transition-colors"
                            style={{ background: 'rgba(124,58,237,0.12)', color: '#a78bfa' }}>
                            <Mail className="w-5 h-5" />
                            <span className="text-[10px] font-black uppercase tracking-wide">Email</span>
                          </button>
                          {activeConv.phone_number ? (
                            <a href={buildWaUrl(activeConv.phone_number, newMessage)}
                              target="_blank" rel="noopener noreferrer"
                              className="flex flex-col items-center gap-1.5 py-3 rounded-xl transition-colors"
                              style={{ background: newMessage.trim() ? 'rgba(0,168,132,0.2)' : 'rgba(0,168,132,0.1)', color: '#00a884' }}
                              title={newMessage.trim() ? 'Opens WhatsApp with your message pre-filled' : 'Open WhatsApp'}>
                              <Phone className="w-5 h-5" />
                              <span className="text-[10px] font-black uppercase tracking-wide leading-tight text-center">
                                {newMessage.trim() ? 'Send WA' : 'WhatsApp'}
                              </span>
                            </a>
                          ) : (
                            <div className="flex flex-col items-center gap-1.5 py-3 rounded-xl opacity-30" style={{ background: 'rgba(255,255,255,0.05)', color: '#8696a0' }}>
                              <Phone className="w-5 h-5" />
                              <span className="text-[10px] font-black uppercase tracking-wide">No Phone</span>
                            </div>
                          )}
                        </div>

                        {/* Info cards */}
                        {[
                          activeConv.phone_number ? { icon: <Phone className="w-3.5 h-3.5" />, label: 'WhatsApp', value: `+${activeConv.phone_number}` } : null,
                          activeConv.school_name  ? { icon: <School className="w-3.5 h-3.5" />, label: 'School', value: activeConv.school_name } : null,
                          activeConv.class_name   ? { icon: <Tag className="w-3.5 h-3.5" />, label: 'Class', value: activeConv.class_name } : null,
                          activeConv.student_name ? { icon: <Users className="w-3.5 h-3.5" />, label: 'Student', value: activeConv.student_name } : null,
                          activeConv.subject      ? { icon: <BookOpen className="w-3.5 h-3.5" />, label: 'Subject', value: activeConv.subject } : null,
                        ].filter(Boolean).map((item: any) => (
                          <div key={item.label} className="flex items-start gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <span className="mt-0.5 shrink-0" style={{ color: '#8696a0' }}>{item.icon}</span>
                            <div className="min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#8696a0' }}>{item.label}</p>
                              <p className="text-foreground text-[12px] font-bold break-words">{item.value}</p>
                            </div>
                          </div>
                        ))}

                        {/* WA pre-fill CTA for students */}
                        {activeConv.type === 'students' && activeConv.phone_number && newMessage.trim() && (
                          <a href={buildWaUrl(activeConv.phone_number, newMessage)}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-foreground text-[12px] font-black transition-all active:scale-95"
                            style={{ background: '#00a884' }}
                            onClick={() => setNewMessage('')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                              <path d="M12 0C5.374 0 0 5.373 0 12c0 2.117.554 4.103 1.522 5.827L.057 23.882a.5.5 0 00.613.613l6.056-1.465A11.945 11.945 0 0012 24c6.626 0 12-5.373 12-12S18.626 0 12 0zm0 21.818a9.808 9.808 0 01-5.029-1.388l-.36-.215-3.733.903.921-3.626-.235-.372A9.8 9.8 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                            </svg>
                            Open WA — message pre-filled → just Send
                          </a>
                        )}

                        {/* Queue controls (staff only) */}
                        {isStaff && activeConv.type === 'students' && (
                          <div className="rounded-xl p-3 space-y-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#8696a0' }}>Queue Controls</p>
                            <div className="grid grid-cols-1 gap-2">
                              <select value={convPriority}
                                onChange={e => setConvPriority((e.target.value as 'low' | 'medium' | 'high') || 'medium')}
                                className="w-full text-foreground text-[12px] rounded-xl px-3 py-2.5 outline-none appearance-none"
                                style={{ background: '#2a3942' }}>
                                <option value="low">Low priority</option>
                                <option value="medium">Medium priority</option>
                                <option value="high">High priority</option>
                              </select>
                              <input type="datetime-local" value={convSlaDueAt}
                                onChange={e => setConvSlaDueAt(e.target.value)}
                                className="w-full text-foreground text-[12px] rounded-xl px-3 py-2.5 outline-none"
                                style={{ background: '#2a3942' }} />
                            </div>
                            <button type="button" onClick={saveConversationMeta} disabled={savingConvMeta}
                              className="w-full py-2.5 rounded-xl text-[12px] font-black disabled:opacity-50 transition-colors"
                              style={{ background: 'rgba(124,58,237,0.2)', color: '#a78bfa' }}>
                              {savingConvMeta ? 'Saving…' : 'Save queue policy'}
                            </button>
                          </div>
                        )}

                        {/* Report */}
                        <button type="button" onClick={reportConversation} disabled={reportingConversation}
                          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[12px] font-black disabled:opacity-50 transition-colors"
                          style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
                          {reportingConversation ? 'Submitting…' : 'Report safety issue'}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Message Input */}
            <div className="shrink-0 bg-[#202c33] border-none px-2 py-2 md:px-4 md:py-3">
              {(sendError || cooldownSeconds > 0) && (
                <div className="px-4 py-2 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center justify-between border-b border-rose-500/10 gap-3">
                  <span className="flex-1 flex items-center gap-2">
                    {cooldownSeconds > 0 ? (
                      <>
                        <Clock className="w-3 h-3 shrink-0" />
                        Wait {cooldownSeconds}s before sending again
                      </>
                    ) : sendError}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {waFallbackUrl && (
                      <a
                        href={waFallbackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black rounded-full transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" /> Open WhatsApp
                      </a>
                    )}
                    <button onClick={() => { setSendError(''); setWaFallbackUrl(null); setCooldownSeconds(0); }}><X className="w-3 h-3" /></button>
                  </div>
                </div>
              )}
              {policySignal && (
                <div className="px-4 py-2 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] font-bold border-b border-amber-500/10 flex items-center justify-between">
                  <span>{policySignal}</span>
                  <button onClick={() => setPolicySignal('')}><X className="w-3 h-3 text-amber-700/50 dark:text-amber-300/50" /></button>
                </div>
              )}
              {isParentOrStudent && showConfirmDetailsCard && (
                <div className="border-b border-amber-500/20 bg-amber-500/10 px-3 py-3">
                  <p className="text-[11px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-200">Confirm your details</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Please confirm once so support emails always include your school and class.</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input value={confirmDetailsForm.full_name} onChange={(e) => setConfirmDetailsForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Full name" className="rounded-lg border border-white/10 bg-[#2a3942] px-2.5 py-2 text-xs text-foreground outline-none" />
                    <input value={confirmDetailsForm.email} onChange={(e) => setConfirmDetailsForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" className="rounded-lg border border-white/10 bg-[#2a3942] px-2.5 py-2 text-xs text-foreground outline-none" />
                    <input value={confirmDetailsForm.phone} onChange={(e) => setConfirmDetailsForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" className="rounded-lg border border-white/10 bg-[#2a3942] px-2.5 py-2 text-xs text-foreground outline-none sm:col-span-2" />
                    {/* School & class are NOT asked here — they resolve automatically from the
                        child's record and reach support with every message. */}
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <input type="checkbox" checked={confirmDetailsForm.confirmed} onChange={(e) => setConfirmDetailsForm((f) => ({ ...f, confirmed: e.target.checked }))} />
                    I confirm these details are correct.
                  </label>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={submitConfirmDetails} disabled={confirmingDetails || !confirmDetailsForm.confirmed} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-black text-black disabled:opacity-50">
                      {confirmingDetails ? 'Saving...' : 'Confirm details'}
                    </button>
                    <button type="button" onClick={() => setShowConfirmDetailsCard(false)} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold text-muted-foreground">
                      Hide for now
                    </button>
                  </div>
                </div>
              )}
              {activeConv?.opted_out ? (
                <div className="px-5 py-4 bg-red-950/20 border-t border-red-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 select-none">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0 animate-pulse" />
                    <div>
                      <p className="text-sm font-bold text-foreground leading-none">WhatsApp Outbound Blocked</p>
                      <p className="text-[12px] text-[#8696a0] mt-1.5 leading-relaxed">
                        This contact has opted out of WhatsApp messages by texting "STOP". They must text "START" or "SUBSCRIBE" to opt back in before you can reply.
                      </p>
                    </div>
                  </div>
                  {activeConv.phone_number && (
                    <a href={`https://wa.me/${activeConv.phone_number}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-500/25 hover:bg-red-500/35 border border-red-500/30 text-foreground text-[12px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 shrink-0 self-start sm:self-center">
                      <ExternalLink className="w-4 h-4" /> Direct WA Link
                    </a>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSend} className="flex items-end gap-3 mt-1 pb-1">
                  <div className="flex items-center gap-1 shrink-0 mb-1 ml-1 relative" ref={emojiPickerRef}>
                    {/* Emoji picker popup */}
                    {showEmojiPicker && (
                      <div className="absolute bottom-full left-0 mb-2 w-[300px] sm:w-[340px] rounded-2xl shadow-2xl overflow-hidden z-[80]"
                        style={{ background: '#233138', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {/* Search bar */}
                        <div className="p-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                          <input
                            value={emojiSearch} onChange={e => setEmojiSearch(e.target.value)}
                            placeholder="Search emoji…"
                            className="w-full text-[#d1d7db] text-[13px] rounded-lg px-3 py-1.5 outline-none"
                            style={{ background: '#2a3942', caretColor: '#00a884' }}
                            autoFocus
                          />
                        </div>
                        {/* Grid */}
                        <div className="p-2 grid grid-cols-8 gap-0.5 max-h-[220px] overflow-y-auto">
                          {EMOJI_LIST
                            .filter(e => !emojiSearch || e.includes(emojiSearch))
                            .map((emoji, i) => (
                              <button key={i} type="button"
                                onClick={() => { insertEmoji(emoji); setShowEmojiPicker(false); setEmojiSearch(''); }}
                                className="w-9 h-9 flex items-center justify-center text-[20px] rounded-lg hover:bg-white/10 transition-colors leading-none">
                                {emoji}
                              </button>
                            ))}
                          {EMOJI_LIST.filter(e => !emojiSearch || e.includes(emojiSearch)).length === 0 && (
                            <div className="col-span-8 py-4 text-center text-[12px]" style={{ color: '#8696a0' }}>No match</div>
                          )}
                        </div>
                      </div>
                    )}
                    <button type="button"
                      onClick={() => { setShowEmojiPicker(v => !v); setEmojiSearch(''); }}
                      className="p-2 transition-colors"
                      style={{ color: showEmojiPicker ? '#00a884' : '#8696a0' }}
                      title="Emoji">
                      <Smile className="w-6 h-6" />
                    </button>
                    <button type="button" className="p-2 text-[#8696a0] hover:text-[#d1d7db] transition-colors" title="Attach (file sharing requires WhatsApp app)">
                      <Paperclip className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex-1 relative">
                    <textarea ref={textareaRef} value={newMessage} onChange={handleTextareaChange}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); } }}
                      placeholder="Type a message" rows={1}
                      className="w-full bg-[#2a3942] text-[#d1d7db] text-[15px] rounded-lg px-4 py-2.5 outline-none resize-none placeholder-[#8696a0] focus:ring-0 transition-all max-h-[120px] overflow-y-auto leading-relaxed" />
                    {newMessage.length > 3500 && (
                      <span className={`absolute bottom-1.5 right-2 text-[9px] font-black pointer-events-none ${newMessage.length > 4000 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {4096 - newMessage.length}
                      </span>
                    )}
                  </div>
                  {/* WA direct-send: opens WhatsApp with message pre-filled — user just taps Send in WA */}
                  {activeConv?.type === 'students' && activeConv.phone_number && newMessage.trim() && (
                    <a href={buildWaUrl(activeConv.phone_number, newMessage)}
                      target="_blank" rel="noopener noreferrer"
                      className="w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0 mb-1"
                      style={{ background: '#00a884' }}
                      title="Open WhatsApp with message pre-filled — just press Send"
                      onClick={() => setNewMessage('')}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                        <path d="M12 0C5.374 0 0 5.373 0 12c0 2.117.554 4.103 1.522 5.827L.057 23.882a.5.5 0 00.613.613l6.056-1.465A11.945 11.945 0 0012 24c6.626 0 12-5.373 12-12S18.626 0 12 0zm0 21.818a9.808 9.808 0 01-5.029-1.388l-.36-.215-3.733.903.921-3.626-.235-.372A9.8 9.8 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                      </svg>
                    </a>
                  )}
                  <button type="submit" disabled={!newMessage.trim() || isSending || cooldownSeconds > 0}
                    className="w-10 h-10 bg-transparent text-[#8696a0] hover:text-[#d1d7db] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0 mb-1">
                    {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> :
                      cooldownSeconds > 0 ? <span className="text-xs font-black">{cooldownSeconds}</span> :
                        <Send className="w-6 h-6" />}
                  </button>
                </form>
              )}
            </div>
          </>
        ) : (
          /* Empty state — full-bleed, native */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none border-b-[6px] border-b-[#00a884] overflow-y-auto"
            style={{ backgroundColor: '#202c33' }}>
            <div className="max-w-[560px] mx-auto text-center mt-8 mobile-page-root">
              {/* Fake laptop illustration to match WA web */}
              <div className="mx-auto mb-10 w-[280px]">
                <svg viewBox="0 0 100 100" className="w-full h-auto text-white/[0.04] drop-shadow-md">
                  <path fill="currentColor" d="M10,70 L90,70 L85,20 L15,20 Z" />
                  <rect fill="currentColor" x="5" y="72" width="90" height="6" rx="3" />
                </svg>
              </div>
              <h1 className="text-[32px] font-light text-[#e9edef] mb-4 tracking-tight">Rillcod Web Hub</h1>
              <p className="text-[#8696a0] text-[14px] leading-relaxed mb-8 max-w-sm mx-auto mobile-page-root">
                Send and receive messages seamlessly.<br />
                Company WhatsApp, teacher, parent, and student communication in one workspace.
              </p>
            </div>
            <p className="text-muted-foreground text-[11px] mt-2 font-bold uppercase tracking-widest">
              Select a conversation to start
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-7">
              {!isParentOrStudent && (
                <button onClick={() => setShowNewChat(true)} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary text-white text-[13px] font-black rounded-full transition-colors shadow-lg shadow-primary/40">
                  <Plus className="w-4 h-4" /> New Chat
                </button>
              )}
              <button onClick={isTeacher ? openAdminEmailCompose : isParentOrStudent ? openSupportEmailCompose : () => openEmailCompose()} className="flex items-center gap-2 px-4 py-2.5 bg-primary/20 hover:bg-primary/30 text-violet-700 dark:text-violet-300 text-[13px] font-black rounded-full border border-primary/20 transition-colors">
                <Mail className="w-4 h-4" /> {isTeacher ? 'Company Email' : isParentOrStudent ? 'Support Email' : 'Company Email'}
              </button>
              <button onClick={() => setSidebarView('contacts')} className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.07] text-muted-foreground text-[13px] font-black rounded-full border border-white/[0.07] transition-colors">
                <BookUser className="w-4 h-4" /> Contacts
              </button>
            </div>
            <div className="w-full max-w-5xl mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 text-left">
              <button
                onClick={startSupportConversation}
                className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 hover:border-emerald-400/40 transition-all hover:scale-[1.02] active:scale-[0.98] group text-left"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3 group-hover:bg-emerald-500/30 transition-colors">
                  <MessageSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">Fast Response</p>
                <h3 className="text-base font-black text-foreground mt-2">Start WhatsApp Chat</h3>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">Direct line to rillcod support. Chat in real-time for quick answers.</p>
                <div className="mt-4 flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                  Open Channel <ChevronRight className="w-3 h-3" />
                </div>
              </button>

              <Link href="/dashboard/support" className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-5 hover:border-cyan-400/40 transition-all hover:scale-[1.02] active:scale-[0.98] group">
                <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center mb-3 group-hover:bg-cyan-500/30 transition-colors">
                  <FileText className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-300">Formal Support</p>
                <h3 className="text-base font-black text-foreground mt-2">Open Support Ticket</h3>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">Log billing, access, and platform issues with tracked staff follow-up.</p>
                <div className="mt-4 flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400 text-[10px] font-black uppercase tracking-widest">
                  Create Ticket <ChevronRight className="w-3 h-3" />
                </div>
              </Link>

              <button onClick={openSupportEmailCompose} className="rounded-2xl border border-primary/20 bg-primary/10 p-5 hover:border-primary/40 transition-all hover:scale-[1.02] active:scale-[0.98] group text-left">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mb-3 group-hover:bg-primary/30 transition-colors">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-700 dark:text-violet-300">Company Email</p>
                <h3 className="text-base font-black text-foreground mt-2">Contact Support Team</h3>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">Send a branded company email to <span className="text-violet-700 dark:text-violet-300">{brandContact.email}</span>.</p>
                <div className="mt-4 flex items-center gap-1.5 text-primary text-[10px] font-black uppercase tracking-widest">
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
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">Teacher Contact</p>
                  <h3 className="text-sm font-black text-foreground mt-2">Find Teachers</h3>
                  <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">Open the directory filtered to teachers who can reply through the company WhatsApp lane.</p>
                </button>
                <button onClick={openAdminEmailCompose} className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 hover:border-rose-400/40 transition-colors text-left">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-700 dark:text-rose-300">Admin Escalation</p>
                  <h3 className="text-sm font-black text-foreground mt-2">Contact Admin Team</h3>
                  <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">Escalate urgent academic or account issues for admin review.</p>
                </button>
                {profile?.role === 'student' && (
                  <Link href="/dashboard/assignments" className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 hover:border-emerald-400/40 transition-colors">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">Assignment Alerts</p>
                    <h3 className="text-sm font-black text-foreground mt-2">Assignments & Projects</h3>
                    <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">Coursework updates continue inside your assignment system alongside this WhatsApp lane.</p>
                  </Link>
                )}
              </div>
            )}
            {isTeacher && (
              <div className="w-full max-w-3xl mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                <button onClick={openAdminEmailCompose} className="rounded-2xl border border-primary/20 bg-primary/10 p-4 hover:border-primary/40 transition-colors text-left">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-700 dark:text-violet-300">Company Email</p>
                  <h3 className="text-sm font-black text-foreground mt-2">Email Admin</h3>
                  <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">Use the branded company email flow for escalations and formal teacher-to-admin communication.</p>
                </button>
                <button
                  onClick={() => {
                    setSidebarView('contacts');
                    setContactRoleFilter('teacher');
                    setShowSidebar(true);
                  }}
                  className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 hover:border-amber-400/40 transition-colors text-left"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">Peer Contact</p>
                  <h3 className="text-sm font-black text-foreground mt-2">Open Teacher Contacts</h3>
                  <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">Jump straight into the teacher directory when you need to coordinate as a company representative.</p>
                </button>
                <Link href="/dashboard/support" className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 hover:border-cyan-400/40 transition-colors">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-300">Support</p>
                  <h3 className="text-sm font-black text-foreground mt-2">Open Staff Ticket</h3>
                  <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">Create a tracked support request when the issue should not live only in chat.</p>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ NEW CHAT MODAL — WhatsApp style ════════════════════════════════ */}
      {showNewChat && (
        <div
          className="fixed inset-0 z-[60] flex items-end md:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.72)' }}
          onClick={() => setShowNewChat(false)}
        >
          <div
            className="w-full max-w-lg flex flex-col overflow-hidden shadow-2xl md:rounded-2xl rounded-t-3xl pb-[64px] md:pb-0"
            style={{ background: '#1f2c34', maxHeight: '88vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-4 px-5 py-4 shrink-0" style={{ background: '#2a3942' }}>
              <button onClick={() => setShowNewChat(false)} className="p-1.5 hover:bg-white/10 rounded-full transition-colors shrink-0">
                <ChevronLeft className="w-5 h-5 text-muted-foreground" />
              </button>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: '#0284c7' }}>
                  <MessageSquare className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-foreground font-black text-[16px]">New In-App Message</h2>
                  <p className="text-[11px]" style={{ color: '#8696a0' }}>
                    {activeTab === 'students' ? 'Search students' : activeTab === 'parents' ? 'Search parents' : activeTab === 'teachers' ? 'Search teachers' : isSchool ? 'Search teachers' : 'Search partner schools'}
                  </p>
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: '#1f2c34' }}>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#8696a0' }} />
                <input autoFocus value={directorySearch} onChange={e => setDirectorySearch(e.target.value)}
                  placeholder="Search by name, school…"
                  className="w-full text-foreground text-[14px] rounded-xl pl-9 pr-4 py-2.5 outline-none"
                  style={{ background: '#2a3942', caretColor: '#00a884' }}
                />
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {loadingDirectory ? (
                <div className="p-12 text-center">
                  <Loader2 className="w-7 h-7 animate-spin mx-auto" style={{ color: '#00a884' }} />
                </div>
              ) : (
                <>
                  {directoryResults.map(item => (
                    <button key={item.id} onClick={() => startNewConversation(item)}
                      className="w-full flex items-center px-4 py-3.5 hover:bg-white/[0.05] active:bg-white/10 transition-colors text-left group"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className={`w-11 h-11 rounded-full flex items-center justify-center font-black text-[15px] text-foreground shrink-0 mr-3.5 ${AVATAR_COLORS[activeTab]}`}>
                        {initials(item.full_name || item.name || 'U')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground text-[14px] truncate">{item.full_name || item.name}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          {item.phone && <span className="text-[11px] flex items-center gap-0.5" style={{ color: '#00a884' }}><Phone className="w-2.5 h-2.5" />+{item.phone.replace(/\D/g, '')}</span>}
                          {item.school_name && <span className="text-[11px] truncate" style={{ color: '#8696a0' }}>{item.school_name}</span>}
                          {item.role && <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${ROLE_COLORS[item.role] || 'bg-white/10 text-muted-foreground'}`}>{item.role}</span>}
                          {!item.phone && activeTab === 'students' && <span className="text-[10px] font-bold" style={{ color: '#f87171' }}>No phone</span>}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 shrink-0 group-hover:opacity-80 transition-opacity" style={{ color: '#8696a0' }} />
                    </button>
                  ))}

                  {activeTab === 'students' && directorySearch.replace(/\D/g, '').length >= 7 && (
                    <button
                      onClick={() => {
                        const phone = directorySearch.replace(/\D/g, '');
                        startNewConversation({ id: phone, full_name: `+${phone}`, phone, role: 'external' });
                      }}
                      className="w-full flex items-center px-4 py-4 hover:bg-white/[0.05] active:bg-white/10 transition-colors text-left group"
                      style={{ background: 'rgba(0,168,132,0.05)', borderBottom: '1px solid rgba(0,168,132,0.12)' }}
                    >
                      <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 mr-3.5" style={{ background: '#00a884' }}>
                        <Plus className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-foreground text-[14px]">Message +{directorySearch.replace(/\D/g, '')} via WhatsApp</p>
                        <p className="text-[11px] font-bold uppercase tracking-widest mt-0.5" style={{ color: '#00a884' }}>Start WhatsApp conversation</p>
                      </div>
                    </button>
                  )}

                  {directoryResults.length === 0 && (
                    <div className="p-12 text-center text-[13px]" style={{ color: '#8696a0' }}>
                      {directorySearch ? 'No results found.' : 'Start typing to search…'}
                    </div>
                  )}
                </>
              )}
            </div>

            {activeTab === 'parents' && (
              <div className="px-5 py-3 text-[11px] text-center" style={{ background: '#111b21', borderTop: '1px solid rgba(255,255,255,0.05)', color: '#8696a0' }}>
                To start a parent conversation, initiate from the student&apos;s profile.
              </div>
            )}
            <div className="pb-4 shrink-0" />
          </div>
        </div>
      )}

      {/* ══ ADD / EDIT CONTACT MODAL ════════════════════════════════════════ */}
      {showAddContact && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-foreground/35 dark:bg-black/60 backdrop-blur-[2px]">
          <div className="w-full max-w-md bg-[#1f2c34] md:rounded-2xl rounded-t-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] border border-white/[0.07]">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
                  {editingContact ? <Pencil className="w-4 h-4 text-primary" /> : <UserPlus className="w-4 h-4 text-primary" />}
                </div>
                <div>
                  <h2 className="text-foreground font-black text-[16px]">{editingContact ? 'Edit Contact' : 'New Contact'}</h2>
                  <p className="text-muted-foreground text-xs">{editingContact ? 'Update contact details' : 'Add to your contact book'}</p>
                </div>
              </div>
              <button onClick={() => { setShowAddContact(false); setEditingContact(null); setContactError(''); }}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
              {contactError && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-600 dark:text-rose-400 text-sm font-bold flex items-center gap-2">
                  <X className="w-4 h-4 shrink-0" />{contactError}
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                  Full Name <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                <div className="relative">
                  <UserCircle className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={addContactForm.full_name} onChange={e => setAddContactForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="e.g. Amara Okonkwo" autoFocus
                    className="w-full bg-[#2a3942] text-foreground text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Phone / WhatsApp</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={addContactForm.phone} onChange={e => setAddContactForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+234 800 000 0000" type="tel"
                    className="w-full bg-[#2a3942] text-foreground text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={addContactForm.email} onChange={e => setAddContactForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="name@school.edu.ng" type="email"
                    className="w-full bg-[#2a3942] text-foreground text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>

              {/* Role */}
              {!editingContact && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Role / Type</label>
                  <div className="flex gap-2 flex-wrap">
                    {['student', 'parent', 'teacher', 'school', 'external'].map(r => (
                      <button key={r} type="button" onClick={() => setAddContactForm(f => ({ ...f, role: r }))}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-black uppercase transition-colors ${addContactForm.role === r ? 'bg-primary text-white' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* School */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">School / Organisation</label>
                <div className="relative">
                  <School className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={addContactForm.school_name} onChange={e => setAddContactForm(f => ({ ...f, school_name: e.target.value }))}
                    placeholder="e.g. Lagos Academy"
                    className="w-full bg-[#2a3942] text-foreground text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>

              {/* Class */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Class / Group</label>
                <div className="relative">
                  <GraduationCap className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={addContactForm.class_name} onChange={e => setAddContactForm(f => ({ ...f, class_name: e.target.value }))}
                    placeholder="e.g. JSS 2A"
                    className="w-full bg-[#2a3942] text-foreground text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Notes (optional)</label>
                <textarea value={addContactForm.notes} onChange={e => setAddContactForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any additional context…" rows={2}
                  className="w-full bg-[#2a3942] text-foreground text-sm rounded-xl px-4 py-2.5 outline-none resize-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-white/[0.08] shrink-0 flex gap-3">
              <button onClick={() => { setShowAddContact(false); setEditingContact(null); setContactError(''); }}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-muted-foreground text-sm font-black transition-colors">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 dark:bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#202c33] rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h2 className="text-foreground font-black text-[16px]">New Conversation</h2>
                <p className="text-muted-foreground text-xs mt-0.5">
                  With: <strong className="text-primary">{subjectDialog.pendingItem?.full_name || subjectDialog.pendingItem?.name || 'Contact'}</strong>
                </p>
              </div>
              <button onClick={() => setSubjectDialog({ open: false, subject: '', pendingItem: null })} className="p-2 hover:bg-white/10 rounded-full">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                  Subject / Topic <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    autoFocus
                    value={subjectDialog.subject}
                    onChange={e => setSubjectDialog(d => ({ ...d, subject: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') confirmSubjectAndCreate(); }}
                    placeholder="e.g. Student progress update"
                    className="w-full bg-[#2a3942] text-foreground text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40"
                  />
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setSubjectDialog({ open: false, subject: '', pendingItem: null })}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-muted-foreground text-sm font-black transition-colors">
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

      {/* ══ EMAIL COMPOSE MODAL ════════════════════════════ */}
      {showEmailCompose && (
        <div
          className="fixed inset-0 z-[60] flex items-end md:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.72)' }}
          onClick={() => { setShowEmailCompose(false); setEmailForm(EMPTY_EMAIL_FORM); setEmailError(''); setEmailSuccess(''); }}
        >
          <div
            className="w-full max-w-lg flex flex-col overflow-hidden shadow-2xl md:rounded-2xl rounded-t-3xl pb-[64px] md:pb-0"
            style={{ background: '#1f2c34', maxHeight: '92vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-4 px-5 py-4 shrink-0" style={{ background: '#2a3942' }}>
              <button onClick={() => { setShowEmailCompose(false); setEmailForm(EMPTY_EMAIL_FORM); setEmailError(''); setEmailSuccess(''); }}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors shrink-0">
                <ChevronLeft className="w-5 h-5 text-muted-foreground" />
              </button>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: '#7c3aed' }}>
                  <Mail className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-foreground font-black text-[16px]">New Email</h2>
                  <p className="text-[11px]" style={{ color: '#8696a0' }}>via {brandContact.email}</p>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
              {emailError && (
                <div className="rounded-xl px-4 py-3 text-sm font-bold flex items-center gap-2"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                  <X className="w-4 h-4 shrink-0" />{emailError}
                </div>
              )}
              {emailSuccess && (
                <div className="rounded-xl px-4 py-3 text-sm font-bold flex items-center gap-2"
                  style={{ background: 'rgba(0,168,132,0.12)', border: '1px solid rgba(0,168,132,0.3)', color: '#00a884' }}>
                  <CheckCircle2 className="w-4 h-4 shrink-0" />{emailSuccess}
                </div>
              )}

              {/* To */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#8696a0' }}>
                  To <span style={{ color: '#f87171' }}>*</span>
                </label>
                <div className="relative">
                  <AtSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#8696a0' }} />
                  <input value={emailForm.to} onChange={e => setEmailForm(f => ({ ...f, to: e.target.value }))}
                    placeholder="recipient@email.com" type="email" autoFocus={!emailForm.to}
                    className="w-full text-foreground text-[14px] rounded-xl pl-10 pr-4 py-3 outline-none"
                    style={{ background: '#2a3942', caretColor: '#7c3aed' }} />
                </div>
                {emailForm.to_name && (
                  <p className="text-[10px] font-bold mt-1 ml-1" style={{ color: '#7c3aed' }}>To: {emailForm.to_name}</p>
                )}
              </div>

              {/* CC */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#8696a0' }}>CC (optional)</label>
                <div className="relative">
                  <AtSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#8696a0' }} />
                  <input value={emailForm.cc} onChange={e => setEmailForm(f => ({ ...f, cc: e.target.value }))}
                    placeholder="cc@email.com"
                    className="w-full text-foreground text-[14px] rounded-xl pl-10 pr-4 py-3 outline-none"
                    style={{ background: '#2a3942', caretColor: '#7c3aed' }} />
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#8696a0' }}>
                  Subject <span style={{ color: '#f87171' }}>*</span>
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#8696a0' }} />
                  <input value={emailForm.subject} onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))}
                    placeholder="e.g. Student Progress Update – Term 2"
                    className="w-full text-foreground text-[14px] rounded-xl pl-10 pr-4 py-3 outline-none"
                    style={{ background: '#2a3942', caretColor: '#7c3aed' }} />
                </div>
              </div>

              {/* Body */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#8696a0' }}>
                  Message <span style={{ color: '#f87171' }}>*</span>
                </label>
                <textarea
                  value={emailForm.body}
                  onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))}
                  placeholder="Write your message…"
                  rows={7}
                  className="w-full text-foreground text-[14px] rounded-xl px-4 py-3 outline-none resize-none leading-relaxed"
                  style={{ background: '#2a3942', caretColor: '#7c3aed' }}
                />
              </div>

              {/* Info strip */}
              <div className="rounded-xl p-3 flex items-start gap-2.5"
                style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.18)' }}>
                <Mail className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#7c3aed' }} />
                <p className="text-[11px] leading-relaxed" style={{ color: '#8696a0' }}>
                  Sent as a branded Rillcod Academy email from <strong style={{ color: '#a78bfa' }}>{brandContact.email}</strong>.
                  Rillcod.com addresses are delivered as in-app notifications instead.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 flex gap-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <button onClick={() => { setShowEmailCompose(false); setEmailForm(EMPTY_EMAIL_FORM); setEmailError(''); }}
                className="px-5 py-3 rounded-xl text-sm font-black transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)' }}>
                Discard
              </button>
              <button onClick={sendEmail} disabled={sendingEmail || !emailForm.to.trim() || !emailForm.subject.trim() || !emailForm.body.trim()}
                className="flex-1 py-3 rounded-xl text-foreground text-sm font-black transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ background: '#7c3aed' }}>
                {sendingEmail
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                  : <><Send className="w-4 h-4" /> Send Email</>
                }
              </button>
            </div>
            <div className="pb-2 shrink-0" />
          </div>
        </div>
      )}

      {/* ══ PROFILE REQUIRED POPUP ══════════════════════════════════════════ */}
      {showProfilePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 dark:bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#202c33] rounded-2xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 text-center border-b border-white/[0.08]">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 border-2 border-primary/20">
                <UserCircle className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-foreground font-black text-lg">Complete Your Profile</h2>
              <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
                Before sending a message, please fill in your details so recipients know who you are.
              </p>
            </div>

            {/* Form */}
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Your Full Name <span className="text-rose-600 dark:text-rose-400">*</span></label>
                <div className="relative">
                  <UserCircle className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={profileForm.full_name} onChange={e => setProfileForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="e.g. Mrs. Adaeze Okafor" autoFocus
                    className="w-full bg-[#2a3942] text-foreground text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Phone / WhatsApp</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+234 800 000 0000" type="tel"
                    className="w-full bg-[#2a3942] text-foreground text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">School / Organisation</label>
                <div className="relative">
                  <School className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={profileForm.school_name} onChange={e => setProfileForm(f => ({ ...f, school_name: e.target.value }))}
                    placeholder="e.g. Lagos Academy"
                    className="w-full bg-[#2a3942] text-foreground text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder-white/30 focus:ring-1 focus:ring-primary/40" />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => { setShowProfilePopup(false); setPendingSendBody(''); }}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-muted-foreground text-sm font-black transition-colors">
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

      {/* ══ FAB — sidebar view only on mobile, above the bottom nav ════════ */}
      {!isParentOrStudent && showSidebar && (
        <button
          onClick={() => setShowNewMessagePicker(true)}
          style={{ backgroundColor: '#00a884' }}
          className="md:hidden fixed bottom-[76px] right-5 z-[55] w-14 h-14 flex items-center justify-center rounded-full shadow-2xl active:scale-95 transition-all text-white"
          title="New Message"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* ══ NEW MESSAGE PICKER — WhatsApp-style channel chooser ════════════ */}
      {showNewMessagePicker && (
        <div
          className="fixed inset-0 z-[60] flex items-end md:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.72)' }}
          onClick={() => setShowNewMessagePicker(false)}
        >
          <div
            className="w-full max-w-md flex flex-col overflow-hidden shadow-2xl md:rounded-2xl rounded-t-3xl pb-[64px] md:pb-0"
            style={{ background: '#1f2c34', maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-4 px-5 py-4 shrink-0" style={{ background: '#2a3942' }}>
              <button
                onClick={() => setShowNewMessagePicker(false)}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors shrink-0"
              >
                <ChevronLeft className="w-5 h-5 text-muted-foreground" />
              </button>
              <div>
                <h2 className="text-foreground font-black text-[17px] tracking-tight">New Message</h2>
                <p className="text-[11px] mt-0.5" style={{ color: '#8696a0' }}>Choose how to reach out</p>
              </div>
            </div>

            {/* Channel rows */}
            <div className="flex-1 overflow-y-auto py-2">

              {/* WhatsApp */}
              <button
                onClick={() => { setShowNewMessagePicker(false); setShowQuickChat(true); }}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.06] active:bg-white/10 transition-colors text-left"
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: '#00a884' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.374 0 0 5.373 0 12c0 2.117.554 4.103 1.522 5.827L.057 23.882a.5.5 0 00.613.613l6.056-1.465A11.945 11.945 0 0012 24c6.626 0 12-5.373 12-12S18.626 0 12 0zm0 21.818a9.808 9.808 0 01-5.029-1.388l-.36-.215-3.733.903.921-3.626-.235-.372A9.8 9.8 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-bold text-[15px]">WhatsApp</p>
                  <p className="text-[12px] mt-0.5" style={{ color: '#8696a0' }}>Start a chat with any phone number</p>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: '#8696a0' }} />
              </button>

              <div className="mx-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

              {/* Email */}
              <button
                onClick={() => { setShowNewMessagePicker(false); openEmailCompose(); }}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.06] active:bg-white/10 transition-colors text-left"
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: '#7c3aed' }}>
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-bold text-[15px]">Email</p>
                  <p className="text-[12px] mt-0.5" style={{ color: '#8696a0' }}>Send branded email via {brandContact.email}</p>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: '#8696a0' }} />
              </button>

              <div className="mx-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

              {/* In-App */}
              <button
                onClick={() => { setShowNewMessagePicker(false); setShowNewChat(true); }}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.06] active:bg-white/10 transition-colors text-left"
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: '#0284c7' }}>
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-bold text-[15px]">In-App Message</p>
                  <p className="text-[12px] mt-0.5" style={{ color: '#8696a0' }}>Message students, teachers or schools in the platform</p>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: '#8696a0' }} />
              </button>

            </div>

            {/* Safe area spacer for mobile */}
            <div className="shrink-0 h-safe-area-inset-bottom pb-4" />
          </div>
        </div>
      )}

      {/* ══ QUICK CHAT MODAL — WhatsApp style ══════════════════════════════ */}
      {showQuickChat && (
        <div
          className="fixed inset-0 z-[60] flex items-end md:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.72)' }}
          onClick={() => { setShowQuickChat(false); setQuickChatNumber(''); setQuickChatError(''); }}
        >
          <div
            className="w-full max-w-sm flex flex-col overflow-hidden shadow-2xl md:rounded-2xl rounded-t-3xl pb-[64px] md:pb-0"
            style={{ background: '#1f2c34' }}
            onClick={e => e.stopPropagation()}
          >
            {/* WA-style header */}
            <div className="flex items-center gap-4 px-5 py-4 shrink-0" style={{ background: '#2a3942' }}>
              <button
                onClick={() => { setShowQuickChat(false); setQuickChatNumber(''); setQuickChatError(''); }}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors shrink-0"
              >
                <ChevronLeft className="w-5 h-5 text-muted-foreground" />
              </button>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: '#00a884' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.374 0 0 5.373 0 12c0 2.117.554 4.103 1.522 5.827L.057 23.882a.5.5 0 00.613.613l6.056-1.465A11.945 11.945 0 0012 24c6.626 0 12-5.373 12-12S18.626 0 12 0zm0 21.818a9.808 9.808 0 01-5.029-1.388l-.36-.215-3.733.903.921-3.626-.235-.372A9.8 9.8 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-foreground font-black text-[16px]">New WhatsApp Chat</h2>
                  <p className="text-[11px]" style={{ color: '#8696a0' }}>Enter any phone number</p>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="p-5 space-y-4">
              {quickChatError && (
                <div className="rounded-xl px-4 py-3 text-sm font-bold flex items-center gap-2"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                  <X className="w-4 h-4 shrink-0" />{quickChatError}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#00a884' }}>
                  Phone / WhatsApp Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#8696a0' }} />
                  <input
                    autoFocus
                    value={quickChatNumber}
                    onChange={e => { setQuickChatNumber(e.target.value); setQuickChatError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') startQuickChat(); }}
                    placeholder="+234 800 000 0000"
                    type="tel"
                    className="w-full text-foreground text-[15px] rounded-xl pl-10 pr-4 py-3.5 outline-none placeholder-white/20"
                    style={{ background: '#2a3942', caretColor: '#00a884' }}
                  />
                </div>
                <p className="text-[11px] mt-2 ml-1" style={{ color: '#8696a0' }}>
                  The number doesn&apos;t need to be saved in your contacts.
                </p>
              </div>

              {/* Preview card — WA style */}
              {quickChatNumber.replace(/\D/g, '').length >= 7 && (
                <div className="rounded-xl p-3.5 flex items-center gap-3"
                  style={{ background: 'rgba(0,168,132,0.08)', border: '1px solid rgba(0,168,132,0.25)' }}>
                  <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-foreground font-black text-lg"
                    style={{ background: '#00a884' }}>
                    {quickChatNumber.replace(/\D/g, '').slice(-2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground text-[14px] font-bold truncate">+{quickChatNumber.replace(/\D/g, '')}</p>
                    <p className="text-[11px] font-bold uppercase tracking-widest mt-0.5" style={{ color: '#00a884' }}>Ready to message</p>
                  </div>
                  <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: '#00a884' }} />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-6 flex gap-3">
              <button
                onClick={() => { setShowQuickChat(false); setQuickChatNumber(''); setQuickChatError(''); }}
                className="px-5 py-3 rounded-xl text-sm font-black transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)' }}
              >
                Cancel
              </button>
              <button
                onClick={startQuickChat}
                disabled={!quickChatNumber.trim() || quickChatNumber.replace(/\D/g, '').length < 7}
                className="flex-1 py-3 rounded-xl text-foreground text-sm font-black transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ background: '#00a884' }}
              >
                <Send className="w-4 h-4" /> Start Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
