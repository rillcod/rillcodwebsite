"use client";

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { 
  Search, 
  Send, 
  Phone, 
  MoreVertical, 
  Check, 
  CheckCheck, 
  Loader2, 
  X, 
  MessageSquare, 
  Users, 
  Building2,
  Plus
} from 'lucide-react';
import Link from 'next/link';

type InboxCategory = 'students' | 'parents' | 'school';

interface Conversation {
  id: string;
  type: InboxCategory;
  phone_number?: string;
  contact_name: string;
  avatar_url?: string;
  last_message_at: string;
  last_message_preview: string;
  unread_count: number;
  // Metadata for specific types
  subject?: string; // For school-teacher
  student_name?: string; // For parent-teacher
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id?: string;
  direction?: 'inbound' | 'outbound'; // for WhatsApp
  body: string;
  created_at: string;
  status?: string;
  is_read?: boolean;
}

export default function UnifiedInbox() {
  const { profile, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<InboxCategory>('students');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [directorySearch, setDirectorySearch] = useState('');
  const [directoryResults, setDirectoryResults] = useState<any[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const hasAccess = ['teacher', 'admin', 'school', 'staff'].includes(profile?.role ?? '');

  // Initialize and Real-time subscriptions
  useEffect(() => {
    if (!profile) return;

    fetchConversations(activeTab);

    // Subscribe to all relevant message tables
    const channels = [
      supabase.channel('whatsapp_messages_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' }, 
          (payload) => handleRealtimeMessage('students', payload.new as any))
        .subscribe(),
      
      supabase.channel('parent_teacher_messages_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'parent_teacher_messages' },
          (payload) => handleRealtimeMessage('parents', payload.new as any))
        .subscribe(),

      supabase.channel('school_teacher_messages_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'school_teacher_messages' },
          (payload) => handleRealtimeMessage('school', payload.new as any))
        .subscribe(),
    ];

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [profile, activeTab]);

  const handleRealtimeMessage = (type: InboxCategory, newMessage: any) => {
    // Refresh conversation list to update previews/unread counts
    fetchConversations(type, false);

    // If it belongs to currently active conversation, append it
    const convId = newMessage.conversation_id || newMessage.thread_id || newMessage.id;
    if (activeConv && activeConv.id === convId) {
      setMessages(prev => {
        if (prev.some(m => m.id === newMessage.id)) return prev;
        return [...prev, {
          id: newMessage.id,
          conversation_id: convId,
          sender_id: newMessage.sender_id,
          direction: newMessage.direction,
          body: newMessage.body,
          created_at: newMessage.created_at || newMessage.sent_at,
          status: newMessage.status,
          is_read: newMessage.is_read
        }];
      });
    }
  };

  const fetchConversations = async (category: InboxCategory, setLoadState = true) => {
    if (setLoadState) setIsLoading(true);
    
    try {
      if (category === 'students') {
        const { data } = await supabase
          .from('whatsapp_conversations')
          .select('*')
          .order('last_message_at', { ascending: false });
          
        if (data) {
          setConversations(data.map(c => ({
            id: c.id,
            type: 'students',
            phone_number: c.phone_number,
            contact_name: c.contact_name || c.phone_number,
            last_message_at: c.last_message_at || '',
            last_message_preview: c.last_message_preview || '',
            unread_count: c.unread_count || 0
          })));
        }
      } 
      else if (category === 'parents') {
        const { data } = await supabase
          .from('parent_teacher_threads')
          .select(`
            *,
            parent:portal_users!parent_id(full_name, avatar_url),
            student:portal_users!student_id(full_name),
            messages:parent_teacher_messages(body, sent_at, is_read, sender_id)
          `)
          .order('created_at', { ascending: false });

        if (data) {
          setConversations(data.map(t => {
            const lastMsg = t.messages?.sort((a: any, b: any) => 
              new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0];
            
            return {
              id: t.id,
              type: 'parents',
              contact_name: (t.parent as any)?.full_name || 'Parent',
              student_name: (t.student as any)?.full_name,
              avatar_url: (t.parent as any)?.avatar_url,
              last_message_at: lastMsg?.sent_at || t.created_at,
              last_message_preview: lastMsg?.body || 'No messages yet',
              unread_count: t.messages?.filter((m: any) => !m.is_read && m.sender_id !== profile?.id).length || 0
            };
          }));
        }
      } 
      else if (category === 'school') {
        const res = await fetch('/api/school-teacher/conversations');
        const json = await res.json();
        if (json.data) {
          setConversations(json.data.map((c: any) => ({
            id: c.id,
            type: 'school',
            contact_name: c.school?.name || 'School Office',
            subject: c.subject,
            last_message_at: c.last_message_at,
            last_message_preview: c.last_message_preview,
            unread_count: c.unread_count
          })));
        }
      }
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      if (setLoadState) setIsLoading(false);
    }
  };

  const fetchMessages = async (conv: Conversation) => {
    try {
      if (conv.type === 'students') {
        const { data } = await supabase
          .from('whatsapp_messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true });
        if (data) setMessages(data as any);
      } 
      else if (conv.type === 'parents') {
        const { data } = await supabase
          .from('parent_teacher_messages')
          .select('*')
          .eq('thread_id', conv.id)
          .order('sent_at', { ascending: true });
        if (data) {
          setMessages(data.map(m => ({
            id: m.id,
            conversation_id: m.thread_id,
            sender_id: m.sender_id,
            body: m.body,
            created_at: m.sent_at,
            is_read: m.is_read
          })));
        }
      } 
      else if (conv.type === 'school') {
        const { data } = await supabase
          .from('school_teacher_messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true });
        if (data) setMessages(data as any);
      }

      // Mark unread as read
      if (conv.unread_count > 0) {
        if (conv.type === 'students') {
          await supabase.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', conv.id);
        } else if (conv.type === 'parents') {
          await supabase.from('parent_teacher_messages').update({ is_read: true }).eq('thread_id', conv.id).neq('sender_id', profile?.id);
        } else if (conv.type === 'school') {
          await supabase.from('school_teacher_messages').update({ is_read: true }).eq('conversation_id', conv.id).neq('sender_id', profile?.id);
        }
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c));
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  useEffect(() => {
    if (activeConv) fetchMessages(activeConv);
  }, [activeConv]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConv || !profile) return;

    setIsSending(true);
    const body = newMessage.trim();
    setNewMessage('');

    try {
      if (activeConv.type === 'students') {
        const res = await fetch('/api/inbox/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: activeConv.id, message: body })
        });
        const json = await res.json();
        if (json.data) setMessages(prev => [...prev, json.data]);
      } 
      else if (activeConv.type === 'parents') {
        const { data, error } = await supabase
          .from('parent_teacher_messages')
          .insert({
            thread_id: activeConv.id,
            sender_id: profile.id,
            body: body
          })
          .select()
          .single();
        if (error) throw error;
        if (data) {
          setMessages(prev => [...prev, {
            id: data.id,
            conversation_id: data.thread_id,
            sender_id: data.sender_id,
            body: data.body,
            created_at: data.sent_at
          }]);
        }
      } 
      else if (activeConv.type === 'school') {
        const { data, error } = await supabase
          .from('school_teacher_messages')
          .insert({
            conversation_id: activeConv.id,
            sender_id: profile.id,
            body: body
          })
          .select()
          .single();
        if (error) throw error;
        if (data) setMessages(prev => [...prev, data as any]);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  // Search directory (students/parents/staff)
  useEffect(() => {
    if (!showNewChat) return;
    const searchDirectory = async () => {
      setLoadingDirectory(true);
      
      let query;
      if (activeTab === 'students') {
        query = supabase.from('portal_users').select('id, full_name, phone, role').eq('is_active', true).eq('role', 'student');
      } else if (activeTab === 'parents') {
        query = supabase.from('portal_users').select('id, full_name, role').eq('is_active', true).eq('role', 'parent');
      } else {
        query = supabase.from('schools').select('id, name').order('name');
      }

      if (directorySearch) {
        if (activeTab === 'school') {
          query = (query as any).ilike('name', `%${directorySearch}%`);
        } else {
          query = (query as any).ilike('full_name', `%${directorySearch}%`);
        }
      }

      const { data } = await (query.limit(20) as any);
      setDirectoryResults(data || []);
      setLoadingDirectory(false);
    };

    const timer = setTimeout(searchDirectory, 300);
    return () => clearTimeout(timer);
  }, [directorySearch, showNewChat, activeTab]);

  const startNewConversation = async (item: any) => {
    try {
      if (activeTab === 'students') {
        // WhatsApp flow
        const cleanPhone = item.phone?.replace(/\+/g, '').replace(/\D/g, '');
        if (!cleanPhone) return alert("No phone number");
        
        const { data: existing } = await supabase.from('whatsapp_conversations').select('*').eq('phone_number', cleanPhone).maybeSingle();
        if (existing) {
          setActiveConv({ ...existing, type: 'students', contact_name: existing.contact_name || cleanPhone } as any);
        } else {
          const { data: created } = await supabase.from('whatsapp_conversations').insert({
            phone_number: cleanPhone,
            contact_name: item.full_name,
            portal_user_id: item.id,
            last_message_at: new Date().toISOString(),
            last_message_preview: 'Conversation started'
          }).select().single();
          if (created) setActiveConv({ ...created, type: 'students', contact_name: item.full_name } as any);
        }
      } 
      else if (activeTab === 'parents') {
        // Parent thread needs student context - for now just pick first or ask?
        // Let's assume teacher initiating with parent
        alert("Select a student to discuss first.");
      }
      else if (activeTab === 'school') {
        // Start school conversation
        const subject = prompt("Enter subject for this discussion:");
        if (!subject) return;
        
        const res = await fetch('/api/school-teacher/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            school_id: item.id, 
            teacher_id: profile?.id,
            subject: subject 
          })
        });
        const json = await res.json();
        if (json.data) fetchConversations('school');
      }
      setShowNewChat(false);
    } catch (err) {
      console.error(err);
    }
  };

  const formatTime = (ts: string) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <X className="w-16 h-16 text-rose-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-6">Messaging is restricted to staff members.</p>
          <Link href="/dashboard" className="px-6 py-2 bg-orange-600 text-white font-bold">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-100px)] overflow-hidden bg-white max-w-7xl mx-auto md:my-6 md:border md:shadow-xl md:rounded-2xl">
      
      {/* Sidebar */}
      <div className={`${showSidebar ? 'flex' : 'hidden'} md:flex w-full md:w-[380px] border-r border-gray-200 flex-col bg-white shrink-0`}>
        {/* Header & Tabs */}
        <div className="bg-gray-50 border-b border-gray-200 shrink-0">
          <div className="h-16 px-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800 tracking-tight">Communications</h2>
            <button onClick={() => setShowNewChat(true)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <Plus className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          
          <div className="flex px-1 pb-1">
            {[
              { id: 'students', label: 'Students', icon: MessageSquare },
              { id: 'parents', label: 'Parents', icon: Users },
              { id: 'school', label: 'School', icon: Building2 },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as InboxCategory);
                  setActiveConv(null);
                }}
                className={`flex-1 flex flex-col items-center py-2 transition-all border-b-2 gap-1 ${
                  activeTab === tab.id 
                    ? 'border-orange-500 text-orange-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-gray-100 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              className="w-full bg-gray-100 text-sm rounded-lg pl-10 pr-4 py-2 outline-none border-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto w-full custom-scrollbar">
          {isLoading ? (
            <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
          ) : conversations.length === 0 ? (
            <div className="text-center p-10 text-gray-400 text-sm">
              No conversations in this channel yet.
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setActiveConv(conv)}
                className={`flex items-center px-4 py-4 cursor-pointer transition-colors border-b border-gray-50 hover:bg-gray-50 ${activeConv?.id === conv.id ? 'bg-orange-50/50' : ''}`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0 mr-3 shadow-inner ${
                  conv.type === 'students' ? 'bg-emerald-500' : 
                  conv.type === 'parents' ? 'bg-orange-500' : 'bg-blue-600'
                }`}>
                  {conv.contact_name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="font-bold text-gray-900 truncate text-[15px]">{conv.contact_name}</span>
                    <span className="text-[11px] text-gray-400">
                      {new Date(conv.last_message_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  {conv.subject && <p className="text-[11px] text-orange-600 font-bold uppercase tracking-tight mb-1">{conv.subject}</p>}
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-500 truncate mr-2">{conv.last_message_preview}</p>
                    {conv.unread_count > 0 && (
                      <span className="bg-orange-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat */}
      <div className={`${showSidebar ? 'hidden' : 'flex'} md:flex flex-1 flex-col bg-[#f0f2f5] relative`}>
        {activeConv ? (
          <>
            {/* Header */}
            <div className="h-16 px-4 bg-white flex items-center justify-between border-b border-gray-200 shrink-0 z-10">
              <div className="flex items-center flex-1 min-w-0">
                <button onClick={() => { setShowSidebar(true); setActiveConv(null); }} className="md:hidden mr-3"><X /></button>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold mr-3 ${
                   activeConv.type === 'students' ? 'bg-emerald-500' : 
                   activeConv.type === 'parents' ? 'bg-orange-500' : 'bg-blue-600'
                }`}>
                  {activeConv.contact_name[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-900 text-[15px] truncate">{activeConv.contact_name}</h3>
                  <p className="text-[11px] text-gray-500 uppercase font-black tracking-widest">
                    {activeConv.type} {activeConv.student_name ? `• ${activeConv.student_name}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-4 text-gray-500">
                {activeConv.phone_number && (
                   <button onClick={() => window.open(`https://wa.me/${activeConv.phone_number}`)} className="hover:text-emerald-600">
                     <Phone className="w-5 h-5" />
                   </button>
                )}
                <MoreVertical className="w-5 h-5 cursor-pointer" />
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-3 custom-scrollbar">
              {messages.map((msg, idx) => {
                const isMine = msg.sender_id === profile?.id || msg.direction === 'outbound';
                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] md:max-w-[70%] px-4 py-2 shadow-sm rounded-2xl relative ${
                      isMine ? 'bg-orange-600 text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none'
                    }`}>
                      <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                      <div className={`flex items-center justify-end gap-1 mt-1 -mb-1 ${isMine ? 'text-orange-100' : 'text-gray-400'}`}>
                        <span className="text-[10px]">{formatTime(msg.created_at)}</span>
                        {isMine && (
                          <span>{msg.is_read || msg.status === 'read' ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-white border-t border-gray-100">
              <form onSubmit={handleSend} className="flex gap-2 max-w-5xl mx-auto">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                  placeholder="Type your message..."
                  className="flex-1 min-h-[48px] max-h-32 bg-gray-100 rounded-2xl px-4 py-3 outline-none resize-none text-[15px] focus:ring-2 focus:ring-orange-500/20"
                  rows={1}
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || isSending}
                  className="w-12 h-12 bg-orange-600 text-white rounded-full flex items-center justify-center hover:bg-orange-700 disabled:opacity-50 transition-all shadow-lg shadow-orange-600/20"
                >
                  {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1" />}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-xl mb-8">
              <MessageSquare className="w-12 h-12 text-orange-600" />
            </div>
            <h1 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">Unified Messaging</h1>
            <p className="text-gray-500 max-w-md leading-relaxed">
              Manage all your Student (WhatsApp), Parent, and School administrative communications in one powerful interface.
            </p>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-gray-900">New {activeTab} Chat</h2>
                <p className="text-sm text-gray-500">Select a recipient to start messaging</p>
              </div>
              <button onClick={() => setShowNewChat(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            
            <div className="p-4 bg-gray-50 border-b border-gray-200">
               <div className="relative">
                 <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                 <input
                   type="text"
                   placeholder={`Search ${activeTab}...`}
                   value={directorySearch}
                   onChange={e => setDirectorySearch(e.target.value)}
                   className="w-full bg-white border-2 border-transparent rounded-2xl pl-12 pr-4 py-3 outline-none focus:border-orange-500 transition-all shadow-sm"
                 />
               </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2 custom-scrollbar">
              {loadingDirectory ? (
                <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-orange-600" /></div>
              ) : directoryResults.map((item) => (
                <button
                  key={item.id}
                  onClick={() => startNewConversation(item)}
                  className="w-full flex items-center p-4 hover:bg-orange-50 rounded-2xl transition-all group text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center font-black text-gray-600 group-hover:bg-orange-600 group-hover:text-white transition-all">
                    {(item.full_name || item.name || 'U')[0].toUpperCase()}
                  </div>
                  <div className="ml-4">
                    <p className="font-bold text-gray-900">{item.full_name || item.name}</p>
                    <p className="text-xs text-gray-500">{item.role || 'Partner School'}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
