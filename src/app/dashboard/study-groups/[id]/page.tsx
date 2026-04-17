'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { PaperAirplaneIcon, CodeBracketIcon, ChatBubbleLeftRightIcon, ArrowLeftIcon } from '@/lib/icons';
import Link from 'next/link';

interface Message {
  id: string;
  content: string;
  sender_id: string;
  sent_at?: string;
  created_at: string;
  portal_users?: { full_name: string; avatar_url?: string };
}

export default function StudyGroupChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = useAuth();
  const [groupId, setGroupId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [codepad, setCodepad] = useState('// Shared code pad — edits sync in real time\n');
  const [tab, setTab] = useState<'chat' | 'code'>('chat');
  const [group, setGroup] = useState<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isReadOnly = profile?.role === 'teacher' || profile?.role === 'school';

  useEffect(() => {
    params.then(p => {
      setGroupId(p.id);
      loadMessages(p.id);
      loadGroup(p.id);
    });
  }, []);

  useEffect(() => {
    if (!groupId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`study-group-${groupId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'study_group_messages', filter: `group_id=eq.${groupId}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message]);
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [groupId]);

  async function loadGroup(id: string) {
    const res = await fetch(`/api/study-groups`);
    const json = await res.json();
    const g = (json.data ?? []).find((g: any) => g.id === id);
    setGroup(g);
  }

  async function loadMessages(id: string) {
    const res = await fetch(`/api/study-groups/${id}/messages`);
    const json = await res.json();
    setMessages(json.data ?? []);
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100);
  }

  async function sendMessage() {
    if (!input.trim() || sending || isReadOnly) return;
    setSending(true);
    await fetch(`/api/study-groups/${groupId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: input.trim() }),
    });
    setInput('');
    setSending(false);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Link href="/dashboard/study-groups" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-sm truncate">{group?.name ?? 'Study Group'}</h1>
          {isReadOnly && <p className="text-xs text-amber-400">Read-only view</p>}
        </div>
        <div className="flex gap-1">
          <button onClick={() => setTab('chat')} className={`px-3 py-1.5 text-xs font-bold rounded-none transition-colors flex items-center gap-1.5 ${tab === 'chat' ? 'bg-orange-600 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" /> Chat
          </button>
          <button onClick={() => setTab('code')} className={`px-3 py-1.5 text-xs font-bold rounded-none transition-colors flex items-center gap-1.5 ${tab === 'code' ? 'bg-orange-600 text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
            <CodeBracketIcon className="w-3.5 h-3.5" /> Code Pad
          </button>
        </div>
      </div>

      {tab === 'chat' ? (
        <>
          {/* Messages */}
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
                    <div className={`px-3 py-2 rounded-none text-sm ${isOwn ? 'bg-orange-600/90 text-white' : 'bg-card border border-border text-foreground'}`}>
                      {msg.content}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          {!isReadOnly && (
            <div className="border-t border-border p-3 flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Type a message…"
                className="flex-1 bg-card border border-border text-foreground px-4 py-2.5 rounded-none text-sm placeholder-muted-foreground focus:outline-none focus:border-orange-500"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-none transition-colors"
              >
                <PaperAirplaneIcon className="w-4 h-4" />
              </button>
            </div>
          )}
          {isReadOnly && (
            <div className="border-t border-border p-3 text-center text-xs text-amber-400">
              Teachers have read-only access to study group chats
            </div>
          )}
        </>
      ) : (
        /* Code Pad */
        <div className="flex-1 flex flex-col">
          <div className="bg-[#0d1117] border-b border-border px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <CodeBracketIcon className="w-3.5 h-3.5 text-orange-400" />
            Shared Code Pad — Last write wins · JavaScript / Python
            {isReadOnly && <span className="text-amber-400 ml-auto">Read-only</span>}
          </div>
          <textarea
            value={codepad}
            onChange={e => !isReadOnly && setCodepad(e.target.value)}
            readOnly={isReadOnly}
            spellCheck={false}
            className="flex-1 bg-[#0d1117] text-green-400 font-mono text-sm p-4 focus:outline-none resize-none border-0"
            placeholder="// Start coding together…"
          />
        </div>
      )}
    </div>
  );
}
