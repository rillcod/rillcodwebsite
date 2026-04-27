'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { ChatBubbleLeftRightIcon, PaperAirplaneIcon, UserIcon, AcademicCapIcon, PlusIcon, BuildingOfficeIcon } from '@/lib/icons';
import { createClient } from '@/lib/supabase/client';

interface Conversation {
  id: string;
  school_id: string;
  teacher_id: string;
  created_at: string;
  updated_at: string;
  school?: { full_name: string; school_name?: string };
  teacher?: { full_name: string };
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
  sender?: { full_name: string; role: string };
}

export default function SchoolTeacherMessagesPage() {
  const { profile } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { 
    loadConversations(); 
    if (profile?.role === 'school') loadTeachers();
    if (profile?.role === 'admin') loadSchools();
  }, [profile?.role]);

  useEffect(() => {
    if (!selected) return;
    loadMessages(selected.id);
    const supabase = createClient();
    const channel = supabase
      .channel(`st-messages-${selected.id}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'school_teacher_messages', 
        filter: `conversation_id=eq.${selected.id}` 
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selected?.id]);

  async function loadConversations() {
    setLoading(true);
    const res = await fetch('/api/school-teacher/conversations');
    const json = await res.json();
    setConversations(json.data ?? []);
    setLoading(false);
  }

  async function loadMessages(conversationId: string) {
    const res = await fetch(`/api/school-teacher/conversations/${conversationId}/messages`);
    const json = await res.json();
    setMessages(json.data ?? []);
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100);
  }

  async function loadTeachers() {
    const res = await fetch('/api/teachers');
    const json = await res.json();
    setTeachers(json.data ?? []);
  }

  async function loadSchools() {
    const res = await fetch('/api/schools');
    const json = await res.json();
    setSchools(json.data ?? []);
  }

  async function sendMessage() {
    if (!input.trim() || !selected || sending) return;
    setSending(true);
    await fetch(`/api/school-teacher/conversations/${selected.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: input.trim() }),
    });
    setInput('');
    setSending(false);
  }

  async function createConversation(targetId: string) {
    const body = profile?.role === 'school' 
      ? { teacher_id: targetId }
      : { school_id: targetId };
    
    const res = await fetch('/api/school-teacher/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    if (res.ok) {
      const json = await res.json();
      setConversations(prev => [json.data, ...prev]);
      setSelected(json.data);
      setShowNewConversation(false);
    }
  }

  const getConversationTitle = (conv: Conversation) => {
    if (profile?.role === 'school') {
      return conv.teacher?.full_name ?? 'Teacher';
    }
    return conv.school?.school_name ?? conv.school?.full_name ?? 'School';
  };

  const getConversationIcon = (conv: Conversation) => {
    return profile?.role === 'school' ? AcademicCapIcon : BuildingOfficeIcon;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <ChatBubbleLeftRightIcon className="w-5 h-5 text-primary" />
            <h1 className="text-3xl font-black">School-Teacher Messages</h1>
          </div>
          {(profile?.role === 'school' || profile?.role === 'admin') && (
            <button
              onClick={() => setShowNewConversation(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-white rounded-xl text-sm font-bold transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              New Conversation
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px]">
          {/* Conversation list */}
          <div className="lg:col-span-1 bg-card border border-border rounded-xl overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-10 px-4">
                <ChatBubbleLeftRightIcon className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">No conversations yet</p>
                {(profile?.role === 'school' || profile?.role === 'admin') && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Click "New Conversation" to start messaging
                  </p>
                )}
              </div>
            ) : (
              conversations.map(conv => {
                const Icon = getConversationIcon(conv);
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelected(conv)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border hover:bg-muted transition-colors ${
                      selected?.id === conv.id ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/30 flex items-center justify-center text-xs font-black text-primary flex-shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">
                        {getConversationTitle(conv)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {new Date(conv.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                );
              })
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
                  <p className="font-bold text-sm">{getConversationTitle(selected)}</p>
                  <p className="text-xs text-muted-foreground">
                    {profile?.role === 'school' ? 'Teacher Communication' : 'School Communication'}
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.map(msg => {
                    const isOwn = msg.sender_id === profile?.id;
                    return (
                      <div key={msg.id} className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                        <div className="w-7 h-7 rounded-full bg-primary/30 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                          {(msg.sender?.full_name ?? '?')[0]}
                        </div>
                        <div className={`max-w-[70%] space-y-1 ${isOwn ? 'items-end' : ''}`}>
                          {!isOwn && (
                            <p className="text-xs font-bold text-muted-foreground">
                              {msg.sender?.full_name} ({msg.sender?.role})
                            </p>
                          )}
                          <div className={`px-3 py-2 rounded-xl text-sm ${
                            isOwn 
                              ? 'bg-primary/90 text-white' 
                              : 'bg-muted border border-border text-foreground'
                          }`}>
                            {msg.content}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(msg.created_at).toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
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
                  <button 
                    onClick={sendMessage} 
                    disabled={!input.trim() || sending} 
                    className="px-4 py-2.5 bg-primary hover:bg-primary disabled:opacity-40 text-white rounded-xl transition-colors"
                  >
                    <PaperAirplaneIcon className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* New Conversation Modal */}
        {showNewConversation && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-bold mb-4">Start New Conversation</h3>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {profile?.role === 'school' ? (
                  teachers.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No teachers available</p>
                  ) : (
                    teachers.map(teacher => (
                      <button
                        key={teacher.id}
                        onClick={() => createConversation(teacher.id)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-muted border border-border rounded-xl text-left transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center text-xs font-bold text-primary">
                          <AcademicCapIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{teacher.full_name}</p>
                          <p className="text-xs text-muted-foreground">{teacher.email}</p>
                        </div>
                      </button>
                    ))
                  )
                ) : (
                  schools.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No schools available</p>
                  ) : (
                    schools.map(school => (
                      <button
                        key={school.id}
                        onClick={() => createConversation(school.id)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-muted border border-border rounded-xl text-left transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center text-xs font-bold text-primary">
                          <BuildingOfficeIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">
                            {school.school_name ?? school.full_name}
                          </p>
                          <p className="text-xs text-muted-foreground">{school.email}</p>
                        </div>
                      </button>
                    ))
                  )
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setShowNewConversation(false)}
                  className="flex-1 px-4 py-2 border border-border text-foreground hover:bg-muted rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}