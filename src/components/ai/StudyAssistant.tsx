'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send, ChevronDown } from 'lucide-react';

interface StudyAssistantProps {
  lessonTitle: string;
  lessonType?: string;
  courseTitle?: string;
  programName?: string;
  gradeLevel?: string;
  lessonObjectives?: string[];
  externalMessage?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const MAX_HISTORY = 20;

export default function StudyAssistant({
  lessonTitle, lessonType, courseTitle, programName, gradeLevel,
  lessonObjectives, externalMessage,
}: StudyAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastExternalMessage = useRef<string | undefined>(undefined);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]);

  useEffect(() => {
    if (!externalMessage || externalMessage === lastExternalMessage.current) return;
    lastExternalMessage.current = externalMessage;
    const cleanMessage = externalMessage.replace(/__\d+$/, '');
    if (!hasOpened) {
      const contextHint = courseTitle ? ` (${courseTitle})` : '';
      setMessages([{ id: 'welcome', role: 'assistant', content: `Hi! I'm your AI tutor for "${lessonTitle}"${contextHint}. Ask me anything! 🚀` }]);
      setHasOpened(true);
    }
    setIsOpen(true);
    setInput(cleanMessage);
    setTimeout(() => {
      setInput('');
      const userMsg: Message = { id: `user-${Date.now()}`, role: 'user', content: cleanMessage };
      setMessages(prev => [...prev, userMsg].slice(-MAX_HISTORY));
      setIsLoading(true);
      const history = messages.filter(m => m.id !== 'welcome').map(m => ({ role: m.role, content: m.content }));
      fetch('/api/ai/study-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: cleanMessage, lessonTitle, lessonType, courseTitle, programName, gradeLevel, lessonObjectives, conversationHistory: history }),
      })
        .then(r => r.json())
        .then(data => {
          const reply = data.reply ?? 'Sorry, I could not generate a response.';
          setMessages(prev => [...prev, { id: `ai-${Date.now()}`, role: 'assistant' as const, content: reply }].slice(-MAX_HISTORY));
        })
        .catch(() => setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant' as const, content: 'Something went wrong. Please try again.' }].slice(-MAX_HISTORY)))
        .finally(() => setIsLoading(false));
    }, 350);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalMessage]);

  const handleOpen = () => {
    if (!hasOpened) {
      const contextHint = courseTitle ? ` (${courseTitle})` : '';
      setMessages([{ id: 'welcome', role: 'assistant', content: `Hi! I'm your AI tutor for "${lessonTitle}"${contextHint}. Ask me anything — I'll explain clearly with real examples! 🚀` }]);
      setHasOpened(true);
    }
    setIsOpen(true);
  };

  const handleClose = () => setIsOpen(false);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    const userMessage: Message = { id: `user-${Date.now()}`, role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMessage].slice(-MAX_HISTORY);
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);
    const conversationHistory = updatedMessages.filter(m => m.id !== 'welcome').map(m => ({ role: m.role, content: m.content }));
    try {
      const res = await fetch('/api/ai/study-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, lessonTitle, lessonType, courseTitle, programName, gradeLevel, lessonObjectives, conversationHistory }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      const reply = data.reply ?? data.message ?? data.content ?? 'Sorry, I could not generate a response.';
      setMessages(prev => [...prev, { id: `ai-${Date.now()}`, role: 'assistant' as const, content: reply }].slice(-MAX_HISTORY));
    } catch {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant' as const, content: 'Sorry, something went wrong. Please try again.' }].slice(-MAX_HISTORY));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const QUICK_PROMPTS = [
    'Explain this in simple terms',
    'Give me a real-world example',
    'What are the key points?',
  ];

  return (
    /* Container — bottom-right corner, full-width bottom-sheet on mobile */
    <div className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end">

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="w-full sm:w-[360px] bg-card border border-border sm:rounded-2xl rounded-xl shadow-2xl flex flex-col overflow-hidden"
            style={{ height: 'min(500px, calc(80dvh - 80px))' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
              <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-foreground leading-tight">Study Assistant</p>
                <p className="text-[11px] text-muted-foreground truncate">{lessonTitle}{courseTitle ? ` · ${courseTitle}` : ''}</p>
              </div>
              {/* Collapse on mobile (chevron) / close on desktop (X) */}
              <button onClick={handleClose} className="sm:hidden p-2 rounded-xl hover:bg-muted transition-colors" aria-label="Collapse">
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
              <button onClick={handleClose} className="hidden sm:flex p-2 rounded-xl hover:bg-muted transition-colors" aria-label="Close">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-[11px] text-muted-foreground text-center">Try a quick question:</p>
                  {QUICK_PROMPTS.map(q => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); inputRef.current?.focus(); }}
                      className="w-full text-left px-3 py-2 rounded-xl bg-muted/50 hover:bg-muted border border-border text-xs text-muted-foreground hover:text-foreground transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center text-white text-[10px] font-black shrink-0 mt-0.5">AI</div>
                  )}
                  <div className={`max-w-[80%] px-3 py-2 text-sm leading-relaxed rounded-2xl ${
                    msg.role === 'user' ? 'bg-primary text-white rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-2 justify-start">
                  <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center text-white text-[10px] font-black shrink-0 mt-0.5">AI</div>
                  <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border bg-background px-3 py-3 shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question…"
                  rows={1}
                  className="flex-1 resize-none bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors max-h-28 overflow-y-auto"
                  style={{ lineHeight: '1.5' }}
                  disabled={isLoading}
                />
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim() || isLoading}
                  className="shrink-0 w-10 h-10 flex items-center justify-center bg-primary text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity active:scale-95"
                  aria-label="Send"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">Enter to send · Shift+Enter for new line</p>
            </div>

            {/* Safe area */}
            <div className="h-[env(safe-area-inset-bottom)] sm:hidden" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB trigger button */}
      <motion.button
        onClick={isOpen ? handleClose : handleOpen}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.95 }}
        className={`flex items-center gap-2 px-4 py-3 text-white text-sm font-black rounded-xl sm:rounded-2xl shadow-xl transition-all border m-4 sm:m-0 ${
          isOpen
            ? 'bg-muted border-border text-foreground'
            : 'bg-primary border-primary/40 shadow-primary/20'
        }`}
        aria-label="Open study assistant"
      >
        <Sparkles className="w-4 h-4" />
        <span>Ask AI</span>
        {isOpen && <X className="w-3.5 h-3.5 opacity-60" />}
      </motion.button>
    </div>
  );
}
