'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { ChatBubbleLeftRightIcon, PaperAirplaneIcon, ArrowLeftIcon, UserIcon, AcademicCapIcon } from '@/lib/icons';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface Thread {
  id: string;
  parent_id: string;
  teacher_id: string;
  student_id: string;
  created_at: string;
  portal_users_parent?: { full_name: string };
  portal_users_teacher?: { full_name: string };
  portal_users_student?: { full_name: string };
}

interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  sent_at: string;
  is_read: boolean;
  portal_users?: { full_name: string; avatar_url?: string };
}

interface Recipient {
  id: string;
  full_name: string;
  role: string;
  email: string | null;
  phone: string | null;
  school_name: string | null;
}

interface InternalMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  subject: string | null;
  message: string;
  created_at: string;
  sender?: { id: string; full_name: string; role: string };
  recipient?: { id: string; full_name: string; role: string };
}

export default function MessagesPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientId, setRecipientId] = useState('');
  const [subject, setSubject] = useState('');
  const [directMessages, setDirectMessages] = useState<InternalMessage[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [policyHint, setPolicyHint] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const isParentOrStudent = profile?.role === 'parent' || profile?.role === 'student';

  useEffect(() => {
    if (isParentOrStudent) {
      router.replace('/dashboard/inbox');
    }
  }, [isParentOrStudent, router]);

  useEffect(() => {
    if (isParentOrStudent) {
      void loadDirectChannels();
      return;
    }
    void loadThreads();
  }, [isParentOrStudent, profile?.id]);

  useEffect(() => {
    if (!selected) return;
    loadMessages(selected.id);
    const supabase = createClient();
    const channel = supabase
      .channel(`ptt-${selected.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'parent_teacher_messages', filter: `thread_id=eq.${selected.id}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message]);
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selected?.id]);

  async function loadThreads() {
    setLoading(true);
    const res = await fetch('/api/parent-teacher/threads');
    const json = await res.json();
    setThreads(json.data ?? []);
    setLoading(false);
  }

  async function loadDirectChannels() {
    setLoading(true);
    try {
      const msgRes = await fetch('/api/messages?channels=1');
      const msgJson = await msgRes.json();
      if (!msgRes.ok) throw new Error(msgJson?.error || 'Failed to load messages');
      const eligible = ((msgJson?.recipients ?? []) as any[]).map((u) => ({
        id: u.id,
        full_name: u.full_name,
        role: u.role,
        email: u.email ?? null,
        phone: u.phone ?? null,
        school_name: u.school_name ?? null,
      })) as Recipient[];

      setRecipients(eligible);
      if (eligible.length > 0 && !recipientId) setRecipientId(eligible[0].id);
      setDirectMessages((msgJson?.data ?? []) as InternalMessage[]);
      const statRes = await fetch('/api/progression/communication-policy-status');
      const stat = await statRes.json().catch(() => ({}));
      const s = stat?.data;
      if (s && typeof s.daily_remaining === 'number' && s.daily_limit < 9999) {
        setPolicyHint(`Daily messages left: ${s.daily_remaining}/${s.daily_limit} • Cooldown: ${s.cooldown_seconds_between_messages}s`);
      } else {
        setPolicyHint('Messaging safety policy is active.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load communication channels');
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(threadId: string) {
    const res = await fetch(`/api/parent-teacher/threads/${threadId}/messages`);
    const json = await res.json();
    setMessages(json.data ?? []);
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100);
  }

  async function sendMessage() {
    if (!input.trim() || !selected || sending) return;
    setSending(true);
    await fetch(`/api/parent-teacher/threads/${selected.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: input.trim() }),
    });
    setInput('');
    setSending(false);
  }

  async function sendInHouseMessage() {
    if (!recipientId || !input.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: recipientId, subject: subject.trim() || null, message: input.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to send message');
      setInput('');
      setSubject('');
      await loadDirectChannels();
      toast.success('In-house message sent');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  async function sendChannelEmail() {
    const rec = recipients.find((r) => r.id === recipientId);
    if (!rec?.email || !input.trim() || !subject.trim()) {
      toast.error('Recipient, subject and message are required for email');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/inbox/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: rec.email,
          to_name: rec.full_name,
          subject: subject.trim(),
          body: input.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Email failed');
      toast.success('Email sent via SendPulse channel');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  }

  const getThreadTitle = (t: Thread) => {
    if (profile?.role === 'parent') return t.portal_users_teacher?.full_name ?? 'Teacher';
    return t.portal_users_parent?.full_name ?? 'Parent';
  };

  const selectedRecipient = recipients.find((r) => r.id === recipientId) ?? null;
  const filteredRecipients = recipients.filter((r) => {
    if (!recipientSearch.trim()) return true;
    const q = recipientSearch.toLowerCase();
    return (
      r.full_name.toLowerCase().includes(q) ||
      r.role.toLowerCase().includes(q) ||
      (r.school_name ?? '').toLowerCase().includes(q)
    );
  });

  if (isParentOrStudent) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="bg-card border border-border rounded-xl p-6 space-y-3">
            <h1 className="text-xl font-black">Opening Guarded Inbox...</h1>
            <p className="text-sm text-muted-foreground">
              Student/parent messaging now uses the WhatsApp-style guarded inbox as the primary experience.
            </p>
            <Link
              href="/dashboard/inbox"
              className="inline-flex px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest"
            >
              Open Guarded Inbox
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <ChatBubbleLeftRightIcon className="w-5 h-5 text-primary" />
          <h1 className="text-3xl font-black">Parent-Teacher Messages</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px]">
          {/* Thread list */}
          <div className="lg:col-span-1 bg-card border border-border rounded-xl overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
            ) : threads.length === 0 ? (
              <div className="text-center py-10 px-4">
                <ChatBubbleLeftRightIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">No conversations yet</p>
                {profile?.role === 'parent' && <p className="text-xs text-muted-foreground mt-1">Find a teacher from your child's class page to start a conversation</p>}
              </div>
            ) : (
              threads.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border hover:bg-muted transition-colors ${selected?.id === t.id ? 'bg-muted' : ''}`}
                >
                  <div className="w-9 h-9 rounded-full bg-primary/30 flex items-center justify-center text-xs font-black text-primary flex-shrink-0">
                    {getThreadTitle(t)[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{getThreadTitle(t)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      Re: {t.portal_users_student?.full_name ?? 'Student'}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Chat area */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl flex flex-col">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <ChatBubbleLeftRightIcon className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">Select a conversation</p>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-border px-4 py-3">
                  <p className="font-bold text-sm">{getThreadTitle(selected)}</p>
                  <p className="text-xs text-muted-foreground">Re: {selected.portal_users_student?.full_name}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map(msg => {
                    const isOwn = msg.sender_id === profile?.id;
                    return (
                      <div key={msg.id} className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                        <div className="w-7 h-7 rounded-full bg-primary/30 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                          {(msg.portal_users?.full_name ?? '?')[0]}
                        </div>
                        <div className={`max-w-[70%] space-y-1 ${isOwn ? 'items-end' : ''}`}>
                          {!isOwn && <p className="text-xs font-bold text-muted-foreground">{msg.portal_users?.full_name}</p>}
                          <div className={`px-3 py-2 rounded-xl text-sm ${isOwn ? 'bg-primary/90 text-white' : 'bg-muted border border-border text-foreground'}`}>
                            {msg.body}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
                <div className="border-t border-border p-3 flex gap-2">
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder="Type a message…"
                    className="flex-1 bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm placeholder-muted-foreground focus:outline-none focus:border-primary"
                  />
                  <button onClick={sendMessage} disabled={!input.trim() || sending} className="px-4 py-2.5 bg-primary hover:bg-primary disabled:opacity-40 text-white rounded-xl transition-colors">
                    <PaperAirplaneIcon className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
