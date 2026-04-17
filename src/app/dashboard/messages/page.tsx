'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { ChatBubbleLeftRightIcon, PaperAirplaneIcon, ArrowLeftIcon, UserIcon, AcademicCapIcon } from '@/lib/icons';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

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

export default function MessagesPage() {
  const { profile } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadThreads(); }, []);

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

  const getThreadTitle = (t: Thread) => {
    if (profile?.role === 'parent') return t.portal_users_teacher?.full_name ?? 'Teacher';
    return t.portal_users_parent?.full_name ?? 'Parent';
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-6">
          <ChatBubbleLeftRightIcon className="w-5 h-5 text-orange-400" />
          <h1 className="text-3xl font-black">Parent-Teacher Messages</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px]">
          {/* Thread list */}
          <div className="lg:col-span-1 bg-card border border-border rounded-none overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
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
                  <div className="w-9 h-9 rounded-full bg-orange-600/30 flex items-center justify-center text-xs font-black text-orange-400 flex-shrink-0">
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
          <div className="lg:col-span-2 bg-card border border-border rounded-none flex flex-col">
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
                        <div className="w-7 h-7 rounded-full bg-orange-600/30 flex items-center justify-center text-xs font-bold text-orange-400 flex-shrink-0">
                          {(msg.portal_users?.full_name ?? '?')[0]}
                        </div>
                        <div className={`max-w-[70%] space-y-1 ${isOwn ? 'items-end' : ''}`}>
                          {!isOwn && <p className="text-xs font-bold text-muted-foreground">{msg.portal_users?.full_name}</p>}
                          <div className={`px-3 py-2 rounded-none text-sm ${isOwn ? 'bg-orange-600/90 text-white' : 'bg-muted border border-border text-foreground'}`}>
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
                    className="flex-1 bg-background border border-border text-foreground px-4 py-2.5 rounded-none text-sm placeholder-muted-foreground focus:outline-none focus:border-orange-500"
                  />
                  <button onClick={sendMessage} disabled={!input.trim() || sending} className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-none transition-colors">
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
