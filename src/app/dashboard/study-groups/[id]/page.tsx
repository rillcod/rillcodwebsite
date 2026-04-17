'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { PaperAirplaneIcon, CodeBracketIcon, ChatBubbleLeftRightIcon, ArrowLeftIcon, TrashIcon } from '@/lib/icons';
import Link from 'next/link';

interface Message {
  id: string;
  content: string;
  sender_id: string;
  sent_at?: string;
  created_at: string;
  portal_users?: { full_name: string; avatar_url?: string; role: string };
}

export default function StudyGroupChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = useAuth();
  const [groupId, setGroupId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [codepad, setCodepad] = useState('');
  const [tab, setTab] = useState<'chat' | 'code'>('chat');
  const [group, setGroup] = useState<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isModerator = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    // Messages channel
    const msgChannel = supabase
      .channel(`study-group-msgs-${groupId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'study_group_messages', filter: `group_id=eq.${groupId}` },
        async (payload) => {
          const { data: userData } = await supabase.from('portal_users').select('full_name, avatar_url, role').eq('id', payload.new.sender_id).single();
          const newMessage = { ...payload.new, portal_users: userData } as Message;
          setMessages(prev => {
            if (prev.find(m => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'study_group_messages' },
        (payload) => {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        }
      )
      .subscribe();

    // Code pad channel
    const codeChannel = supabase
      .channel(`study-group-code-${groupId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'study_groups', filter: `id=eq.${groupId}` },
        (payload) => {
          if (payload.new.code_content !== undefined) {
            setCodepad(payload.new.code_content ?? '');
          }
        }
      )
      .subscribe();

    return () => { 
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(codeChannel);
    };
  }, [groupId]);

  async function loadGroup(id: string) {
    const supabase = createClient();
    const { data: g } = await supabase.from('study_groups').select('*').eq('id', id).single();
    if (g) {
      setGroup(g);
      setCodepad(g.code_content ?? '');
    }
  }

  async function loadMessages(id: string) {
    const res = await fetch(`/api/study-groups/${id}/messages`);
    const json = await res.json();
    setMessages(json.data ?? []);
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100);
  }

  async function sendMessage() {
    if (!input.trim() || sending || !profile?.id) return;
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.from('study_group_messages').insert({
      group_id: groupId,
      sender_id: profile.id,
      content: input.trim()
    });
    if (error) console.error('Error sending message:', error);
    setInput('');
    setSending(false);
  }

  async function deleteMessage(id: string) {
    if (!isModerator) return;
    const supabase = createClient();
    await supabase.from('study_group_messages').delete().eq('id', id);
  }

  function handleCodeChange(val: string) {
    setCodepad(val);
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(async () => {
      const supabase = createClient();
      await supabase.from('study_groups').update({ code_content: val }).eq('id', groupId);
    }, 1000);
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
          <p className="text-[10px] text-muted-foreground uppercase tracking-tight">Active Session</p>
        </div>
        {isModerator && (
          <button
            onClick={async () => {
              if (confirm('Are you sure you want to delete this group? All messages and code will be lost.')) {
                const supabase = createClient();
                await supabase.from('study_groups').delete().eq('id', groupId);
                window.location.href = '/dashboard/study-groups';
              }
            }}
            className="p-1.5 text-muted-foreground hover:text-rose-400 transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase"
          >
            <TrashIcon className="w-3.5 h-3.5" /> Delete Group
          </button>
        )}
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
                <div key={msg.id} className={`flex gap-2 group/msg ${isOwn ? 'flex-row-reverse' : ''}`}>
                  <div className="w-7 h-7 rounded-full bg-orange-600/30 flex items-center justify-center text-xs font-bold text-orange-400 flex-shrink-0">
                    {(msg.portal_users?.full_name ?? '?')[0]}
                  </div>
                  <div className={`max-w-[70%] space-y-1 ${isOwn ? 'flex flex-col items-end' : ''}`}>
                    {!isOwn && (
                      <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                        {msg.portal_users?.full_name}
                        {['teacher', 'admin', 'school'].includes(msg.portal_users?.role ?? '') && (
                          <span className="bg-orange-500/10 text-orange-400 text-[9px] px-1.5 py-0.5 rounded-none border border-orange-500/20">STAFF</span>
                        )}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <div className={`px-3 py-2 rounded-none text-sm ${isOwn ? 'bg-orange-600/90 text-white' : 'bg-card border border-border text-foreground'}`}>
                        {msg.content}
                      </div>
                      {isModerator && (
                        <button 
                          onClick={() => deleteMessage(msg.id)}
                          className="opacity-0 group-hover/msg:opacity-100 p-1.5 text-muted-foreground hover:text-rose-400 transition-all"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
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
          <div className="border-t border-border p-3 flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={isModerator ? "Post as moderator…" : "Type a message…"}
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
        </>
      ) : (
        /* Code Pad */
        <div className="flex-1 flex flex-col">
          <div className="bg-[#0d1117] border-b border-border px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <CodeBracketIcon className="w-3.5 h-3.5 text-orange-400" />
            Shared Code Pad — Syncs in real time with all members
          </div>
          <textarea
            value={codepad}
            onChange={e => handleCodeChange(e.target.value)}
            spellCheck={false}
            className="flex-1 bg-[#0d1117] text-orange-400 font-mono text-sm p-4 focus:outline-none resize-none border-0"
            placeholder="// Paste logic or notes here for everyone to see…"
          />
        </div>
      )}
    </div>
  );
}
