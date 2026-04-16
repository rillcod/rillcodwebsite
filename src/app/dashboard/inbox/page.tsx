"use client";

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Search, Send, Phone, MoreVertical, Check, CheckCheck, Loader2 } from 'lucide-react';

interface Conversation {
  id: string;
  phone_number: string;
  contact_name: string | null;
  last_message_at: string;
  last_message_preview: string;
  unread_count: number;
}

interface Message {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  created_at: string;
  status: string;
}

export default function WhatsAppInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    fetchConversations();
    
    // Subscribe to incoming messages
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_messages' },
        (payload) => {
          fetchConversations(); // Update side panel
          if (activeConv && (payload.new as Message).conversation_id === activeConv.id) {
            setMessages(prev => [...prev, payload.new as Message]);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeConv]);

  useEffect(() => {
    if (activeConv) fetchMessages(activeConv.id);
  }, [activeConv]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchConversations = async () => {
    const { data } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .order('last_message_at', { ascending: false });
    
    if (data) setConversations(data as any);
    setIsLoading(false);
  };

  const fetchMessages = async (convId: string) => {
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    
    if (data) setMessages(data as any);

    // Reset unread count locally (and in DB ideally)
    await supabase.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', convId);
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c));
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConv) return;

    setIsSending(true);
    const msgText = newMessage.trim();
    setNewMessage('');

    try {
      const res = await fetch('/api/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: activeConv.id, message: msgText })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      
      // Local optimistic append (Supabase realtime will also catch it, but this is faster)
      if (json.data) {
        setMessages(prev => [...prev, json.data]);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (ts: string) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const WA_BACKGROUND = "bg-[#efeae2]"; // Official WhatsApp Web background color

  return (
    <div className="flex h-[calc(100vh-100px)] overflow-hidden rounded-2xl border border-gray-200 shadow-xl bg-white max-w-7xl mx-auto my-6">
      
      {/* Sidebar - Conversation List */}
      <div className="w-[380px] border-r border-gray-200 flex flex-col bg-white shrink-0">
        <div className="h-16 px-4 bg-gray-50 flex items-center justify-between border-b border-gray-200 shrink-0">
          <h2 className="text-xl font-bold text-gray-800 tracking-tight">Inbox</h2>
          <div className="flex gap-3 text-gray-500">
            <MoreVertical className="w-5 h-5 cursor-pointer hover:text-gray-700" />
          </div>
        </div>

        <div className="p-3 border-b border-gray-100 shrink-0 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search or start a new chat" 
              className="w-full bg-gray-100 text-sm rounded-lg pl-10 pr-4 py-2 outline-none focus:ring-1 focus:ring-emerald-500 transition-all border-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto w-full custom-scrollbar">
          {isLoading ? (
            <div className="flex justify-center p-10"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>
          ) : conversations.length === 0 ? (
            <div className="text-center p-10 text-gray-400 text-sm">No conversations yet.<br/>Wait for students to message you!</div>
          ) : (
            conversations.map((conv) => (
              <div 
                key={conv.id} 
                onClick={() => setActiveConv(conv)}
                className={`flex items-center px-3 py-3 cursor-pointer transition-colors border-b border-gray-50 hover:bg-gray-50 ${activeConv?.id === conv.id ? 'bg-gray-100' : ''}`}
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-lg shrink-0 mr-3 shadow-inner">
                  {(conv.contact_name || 'U')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-gray-900 truncate text-[15px]">{conv.contact_name || conv.phone_number}</span>
                    <span className={`text-xs ${conv.unread_count > 0 ? 'text-emerald-600 font-semibold' : 'text-gray-400'}`}>
                      {new Date(conv.last_message_at).toLocaleDateString([], { month: 'short', day: 'numeric'})}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500 truncate mr-2">{conv.last_message_preview || 'Media message'}</span>
                    {conv.unread_count > 0 && (
                      <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
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

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col ${WA_BACKGROUND} relative`}>
        {/* Chat Background Pattern (Subtle) */}
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: 'url("https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png")', backgroundSize: '400px' }}></div>

        {activeConv ? (
          <>
            {/* Chat Header */}
            <div className="h-16 px-4 bg-gray-50 flex items-center justify-between border-b border-gray-200 shrink-0 z-10 shadow-sm">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold shadow-sm mr-3">
                  {(activeConv.contact_name || 'U')[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-[15px]">{activeConv.contact_name || activeConv.phone_number}</h3>
                  <p className="text-xs text-gray-500">{activeConv.phone_number}</p>
                </div>
              </div>
              <div className="flex gap-4 text-gray-500">
                <Search className="w-5 h-5 cursor-pointer hover:text-gray-700" />
                <Phone className="w-5 h-5 cursor-pointer hover:text-gray-700" />
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 z-10 custom-scrollbar flex flex-col gap-2">
              {messages.map((msg, idx) => {
                const isOutbound = msg.direction === 'outbound';
                const showTail = idx === 0 || messages[idx - 1].direction !== msg.direction;

                return (
                  <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} w-full relative`}>
                     <div 
                      className={`max-w-[70%] px-3 pt-2 pb-2 rounded-lg text-[14.5px] shadow-sm relative ${
                        isOutbound 
                          ? 'bg-[#d9fdd3] text-gray-900 rounded-tr-none' 
                          : 'bg-white text-gray-900 rounded-tl-none border border-gray-100'
                      }`}
                    >
                      {/* Tail SVG */}
                      {showTail && (
                        <svg viewBox="0 0 8 13" width="8" height="13" className={`absolute top-0 ${isOutbound ? '-right-2 text-[#d9fdd3]' : '-left-2 text-white'}`}>
                          <path opacity="0.13" fill="currentColor" d={isOutbound ? "M5.188 1H0v11.19" : "M1.533 3.118L8 12.193V1z"}></path>
                          <path fill="currentColor" d={isOutbound ? "M5.188 0H0v11.19" : "M1.533 2.118L8 11.193V0z"}></path>
                        </svg>
                      )}
                      
                      <div className="break-words leading-relaxed whitespace-pre-wrap">{msg.body}</div>
                      
                      {/* Metadata row (time + tick) */}
                      <div className="flex items-center justify-end gap-1 mt-1 -mb-1">
                        <span className="text-[11px] text-gray-500/80">{formatTime(msg.created_at)}</span>
                        {isOutbound && (
                          <span className="text-gray-400">
                            {msg.status === 'read' ? <CheckCheck className="w-[14px] h-[14px] text-blue-500" /> :
                             msg.status === 'delivered' ? <CheckCheck className="w-[14px] h-[14px]" /> :
                             <Check className="w-[14px] h-[14px]" />}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Footer */}
            <div className="p-3 bg-[#f0f2f5] z-10 shrink-0">
              <form onSubmit={handleSend} className="flex items-end gap-2 max-w-4xl mx-auto">
                <textarea 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); }
                  }}
                  placeholder="Type a message to the student..." 
                  className="flex-1 max-h-32 min-h-[44px] bg-white rounded-xl px-4 py-3 outline-none resize-none shadow-sm text-[15px] custom-scrollbar focus:ring-1 focus:ring-emerald-500 border-none"
                  rows={1}
                />
                <button 
                  type="submit" 
                  disabled={!newMessage.trim() || isSending}
                  className="w-12 h-[44px] bg-emerald-500 text-white flex items-center justify-center rounded-full hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:hover:bg-emerald-500 shrink-0 shadow-md"
                >
                  {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1" />}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center z-10">
            <div className="w-80 text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                <Phone className="w-10 h-10 text-emerald-500" />
              </div>
              <h1 className="text-2xl font-light text-gray-800 mb-3">Rillcod Academy Inbox</h1>
              <p className="text-gray-500 text-sm leading-relaxed">
                Connect directly with your students via official Meta WhatsApp API. Select a chat on the left to review assignments and reply instantly.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
