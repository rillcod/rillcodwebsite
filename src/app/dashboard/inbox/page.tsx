"use client";

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Search, Send, Phone, MoreVertical, Check, CheckCheck, Loader2, X } from 'lucide-react';

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
          
          // Check if this message belongs to the currently active conversation
          const newMessage = payload.new as Message;
          setActiveConv(current => {
            if (current && newMessage.conversation_id === current.id) {
              setMessages(prev => {
                // Prevent duplicates from optimistic updates
                if (prev.some(m => m.id === newMessage.id)) return prev;
                return [...prev, newMessage];
              });
            }
            return current;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []); // Only run once on mount

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

    // Reset unread count if needed
    const currentConv = conversations.find(c => c.id === convId);
    if (currentConv && currentConv.unread_count > 0) {
        await supabase.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', convId);
        setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c));
    }
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
  const [showSidebar, setShowSidebar] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveContact, setShowSaveContact] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [students, setStudents] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [filterSchool, setFilterSchool] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [contactToSave, setContactToSave] = useState<{ phone: string; name: string } | null>(null);
  const [savingContact, setSavingContact] = useState(false);

  // Fetch metadata for filters
  useEffect(() => {
    const fetchMetadata = async () => {
      const { data: schoolsData } = await supabase.from('schools').select('id, name').order('name');
      const { data: classesData } = await supabase.from('classes').select('id, name').order('name');
      if (schoolsData) setSchools(schoolsData);
      if (classesData) setClasses(classesData);
    };
    fetchMetadata();
  }, []);

  // Search students
  useEffect(() => {
    if (!showNewChat) return;
    const searchStudents = async () => {
      setLoadingStudents(true);
      
      let query = supabase
        .from('portal_users')
        .select(`
          id, 
          full_name, 
          phone, 
          school_id,
          schools (name),
          classes (name)
        `)
        .eq('is_active', true);

      if (filterSchool) query = query.eq('school_id', filterSchool);
      if (filterClass) query = query.eq('class_id', filterClass);
      if (studentSearch) query = query.ilike('full_name', `%${studentSearch}%`);
      
      const { data } = await (query as any)
        .limit(20)
        .returns<{
          id: string;
          full_name: string;
          phone: string | null;
          schools: { name: string } | null;
          classes: { name: string } | null;
        }[]>();
      
      setStudents(data || []);
      setLoadingStudents(false);
    };
    
    const timer = setTimeout(searchStudents, 300);
    return () => clearTimeout(timer);
  }, [studentSearch, filterSchool, filterClass, showNewChat]);

  const startChatWithStudent = async (student: any) => {
    if (!student.phone) {
      alert("This student doesn't have a phone number linked.");
      return;
    }

    const cleanPhone = student.phone.replace(/\+/g, '').replace(/\D/g, '');
    
    // Check if conversation exists
    let { data: existing } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('phone_number', cleanPhone)
      .maybeSingle();

    if (!existing) {
      // Create new conversation
      const { data: created, error } = await supabase
        .from('whatsapp_conversations')
        .insert({
          phone_number: cleanPhone,
          contact_name: student.full_name,
          portal_user_id: student.id,
          last_message_at: new Date().toISOString(),
          last_message_preview: 'New chat started'
        })
        .select()
        .single();
      
      if (error) {
        console.error(error);
        alert("Failed to start chat.");
        return;
      }
      existing = created;
    }

    setShowNewChat(false);
    fetchConversations();
    setActiveConv(existing as any);
  };

  // Quick response templates
  const templates = [
    { label: 'Welcome', text: 'Hello! Welcome to Rillcod Technologies. How can I assist you today?' },
    { label: 'Assignment Help', text: 'I can help you with your assignment. Which topic are you working on?' },
    { label: 'Payment Query', text: 'For payment inquiries, please check your invoice in the dashboard or contact our finance team.' },
    { label: 'Technical Support', text: 'I understand you\'re having technical issues. Can you describe what\'s happening?' },
    { label: 'Schedule Info', text: 'Our classes run Monday to Friday, 9 AM - 3 PM. Check your timetable in the dashboard for your specific schedule.' },
    { label: 'Thank You', text: 'Thank you for reaching out! We\'re here to help anytime. Have a great day! 🎉' },
  ];

  // Auto-hide sidebar on mobile when conversation is selected
  useEffect(() => {
    if (activeConv && window.innerWidth < 768) {
      setShowSidebar(false);
    }
  }, [activeConv]);

  const handleSaveContact = async () => {
    if (!contactToSave) return;
    setSavingContact(true);
    try {
      // Save to students table as a prospective contact
      const res = await fetch('/api/contacts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: contactToSave.phone,
          name: contactToSave.name,
          source: 'whatsapp',
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      alert(`Contact saved: ${contactToSave.name}`);
      setShowSaveContact(false);
      setContactToSave(null);
      fetchConversations(); // Refresh to show updated contact name
    } catch (err: any) {
      alert(err.message ?? 'Failed to save contact');
    } finally {
      setSavingContact(false);
    }
  };

  const openInWhatsApp = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}`, '_blank');
  };

  const useTemplate = (text: string) => {
    setNewMessage(text);
    setShowTemplates(false);
  };

  return (
    <div className="flex h-[calc(100vh-100px)] overflow-hidden rounded-none md:rounded-2xl border-0 md:border border-gray-200 shadow-none md:shadow-xl bg-white max-w-7xl mx-auto my-0 md:my-6">
      
      {/* Sidebar - Conversation List */}
      <div className={`${showSidebar ? 'flex' : 'hidden'} md:flex w-full md:w-[380px] border-r border-gray-200 flex-col bg-white shrink-0`}>
        <div className="h-16 px-4 bg-gray-50 flex items-center justify-between border-b border-gray-200 shrink-0">
          <h2 className="text-xl font-bold text-gray-800 tracking-tight">Inbox</h2>
          <div className="flex gap-3 text-gray-500">
            <button 
              onClick={() => setShowNewChat(true)}
              className="p-1.5 hover:bg-emerald-500/10 hover:text-emerald-600 rounded-lg transition-all"
              title="Start New Chat"
            >
              <Search className="w-5 h-5" />
            </button>
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
      <div className={`${showSidebar ? 'hidden' : 'flex'} md:flex flex-1 flex-col ${WA_BACKGROUND} relative`}>
        {/* Chat Background Pattern (Subtle) */}
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: 'url("https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png")', backgroundSize: '400px' }}></div>

        {activeConv ? (
          <>
            {/* Chat Header */}
            <div className="h-16 px-4 bg-gray-50 flex items-center justify-between border-b border-gray-200 shrink-0 z-10 shadow-sm">
              {/* Back button for mobile */}
              <button 
                onClick={() => {
                  setShowSidebar(true);
                  setActiveConv(null);
                }}
                className="md:hidden mr-3 text-gray-600 hover:text-gray-900"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex items-center min-w-0 flex-1">
                <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold shadow-sm mr-3 shrink-0">
                  {(activeConv.contact_name || 'U')[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 text-[15px] truncate">{activeConv.contact_name || activeConv.phone_number}</h3>
                  <p className="text-xs text-gray-500 truncate">{activeConv.phone_number}</p>
                </div>
              </div>
              <div className="flex gap-2 md:gap-3 text-gray-500 shrink-0">
                {/* Open in WhatsApp */}
                <button
                  onClick={() => openInWhatsApp(activeConv.phone_number)}
                  className="p-2 hover:bg-emerald-500/10 rounded-lg transition-colors group"
                  title="Open in WhatsApp"
                >
                  <svg className="w-5 h-5 group-hover:text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
              </button>
              {/* Save Contact */}
              {!activeConv.contact_name && (
                <button
                  onClick={() => {
                    setContactToSave({ phone: activeConv.phone_number, name: '' });
                    setShowSaveContact(true);
                  }}
                  className="p-2 hover:bg-blue-500/10 rounded-lg transition-colors group"
                  title="Save Contact"
                >
                  <svg className="w-5 h-5 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </button>
              )}
              <Search className="w-5 h-5 cursor-pointer hover:text-gray-700" />
              <Phone className="w-5 h-5 cursor-pointer hover:text-gray-700" />
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-3 md:p-6 z-10 custom-scrollbar flex flex-col gap-2">
            {messages.map((msg, idx) => {
              const isOutbound = msg.direction === 'outbound';
              const showTail = idx === 0 || messages[idx - 1].direction !== msg.direction;

              return (
                <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} w-full relative`}>
                   <div 
                    className={`max-w-[85%] md:max-w-[70%] px-3 pt-2 pb-2 rounded-lg text-[14.5px] shadow-sm relative ${
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
          <div className="p-2 md:p-3 bg-[#f0f2f5] z-10 shrink-0">
            <form onSubmit={handleSend} className="flex items-end gap-2 max-w-4xl mx-auto">
              {/* Quick Templates Button */}
              <button
                type="button"
                onClick={() => setShowTemplates(!showTemplates)}
                className="p-2.5 hover:bg-gray-200 rounded-full transition-colors shrink-0"
                title="Quick responses"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </button>
              
              <textarea 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); }
                }}
                placeholder="Type a message..." 
                className="flex-1 max-h-32 min-h-[44px] bg-white rounded-xl px-3 md:px-4 py-2 md:py-3 outline-none resize-none shadow-sm text-sm md:text-[15px] custom-scrollbar focus:ring-1 focus:ring-emerald-500 border-none"
                rows={1}
              />
              <button 
                type="submit" 
                disabled={!newMessage.trim() || isSending}
                className="w-11 h-11 md:w-12 md:h-[44px] bg-emerald-500 text-white flex items-center justify-center rounded-full hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:hover:bg-emerald-500 shrink-0 shadow-md"
              >
                {isSending ? <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <Send className="w-4 h-4 md:w-5 md:h-5 ml-0.5 md:ml-1" />}
              </button>
            </form>

            {/* Quick Templates Dropdown */}
            {showTemplates && (
              <div className="mt-2 bg-white border border-gray-200 rounded-xl shadow-lg max-w-4xl mx-auto overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Quick Responses</p>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {templates.map((template, idx) => (
                    <button
                      key={idx}
                      onClick={() => useTemplate(template.text)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
                    >
                      <p className="text-xs font-bold text-emerald-600 mb-1">{template.label}</p>
                      <p className="text-sm text-gray-700">{template.text}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
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

    {/* Save Contact Modal */}
    {showSaveContact && contactToSave && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-900">Save Contact</h2>
            <button onClick={() => setShowSaveContact(false)} className="text-gray-500 hover:text-gray-900 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest block mb-1.5">Phone Number</label>
              <input
                type="text"
                value={contactToSave.phone}
                disabled
                className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 text-sm text-gray-600 rounded-lg"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest block mb-1.5">Contact Name *</label>
              <input
                type="text"
                value={contactToSave.name}
                onChange={e => setContactToSave({ ...contactToSave, name: e.target.value })}
                placeholder="Enter name..."
                className="w-full px-4 py-2.5 bg-white border border-gray-300 text-sm text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />
            </div>
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
            <button
              onClick={() => setShowSaveContact(false)}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-[10px] font-black uppercase tracking-widest text-gray-600 hover:text-gray-900 rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveContact}
              disabled={!contactToSave.name.trim() || savingContact}
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
            >
              {savingContact ? 'Saving...' : 'Save Contact'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* New Chat / Student Directory Modal */}
    {showNewChat && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm">
        <div className="w-full h-full md:h-auto md:max-w-xl bg-white rounded-none md:rounded-2xl shadow-2xl flex flex-col max-h-screen md:max-h-[85vh]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
            <div>
              <h2 className="text-lg font-black text-gray-900 leading-tight">Student Directory</h2>
              <p className="text-xs text-gray-500">Search students by school or class</p>
            </div>
            <button 
              onClick={() => setShowNewChat(false)} 
              className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="p-4 bg-gray-50 border-b border-gray-200 space-y-3 shrink-0">
            {/* Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Type student name..." 
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                className="w-full bg-white border border-gray-300 text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>

            {/* Filters */}
            <div className="grid grid-cols-2 gap-3">
              <select 
                value={filterSchool}
                onChange={e => setFilterSchool(e.target.value)}
                className="bg-white border border-gray-300 text-xs rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="">All Schools</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select
                value={filterClass}
                onChange={e => setFilterClass(e.target.value)}
                className="bg-white border border-gray-300 text-xs rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="">All Classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {loadingStudents ? (
              <div className="flex flex-col items-center justify-center p-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                <p className="text-sm text-gray-400">Filtering student records...</p>
              </div>
            ) : students.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 gap-3 text-center">
                <Search className="w-12 h-12 text-gray-300" />
                <p className="text-sm text-gray-500 font-semibold">No students found</p>
                <p className="text-xs text-gray-400">Try adjusting your filters or search term</p>
              </div>
            ) : (
              <div className="space-y-1">
                {students.map((student) => (
                  <button 
                    key={student.id}
                    onClick={() => startChatWithStudent(student)}
                    className="w-full flex items-center p-3 hover:bg-emerald-50 rounded-xl transition-all group"
                  >
                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-black text-lg mr-4 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                      {student.full_name[0]}
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="font-bold text-gray-900 group-hover:text-emerald-700 transition-colors truncate">{student.full_name}</p>
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="text-[10px] text-gray-400 truncate">{student.schools?.name || 'No School'}</span>
                        <span className="text-gray-300">•</span>
                        <span className="text-[10px] text-gray-400 truncate">
                          {student.classes?.name || 'General Admission'}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-emerald-500 p-2 rounded-full text-white">
                        <Send className="w-4 h-4" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="p-4 border-t border-gray-100 text-center bg-gray-50 md:rounded-b-2xl">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-black">Directory shows top 20 matches</p>
          </div>
        </div>
      </div>
    )}
  );
}
