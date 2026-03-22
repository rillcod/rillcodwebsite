'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send } from 'lucide-react';

interface StudyAssistantProps {
  lessonTitle: string;
  lessonType?: string;
  courseTitle?: string;
  programName?: string;
  gradeLevel?: string;
  lessonObjectives?: string[];
  externalMessage?: string; // When set, auto-opens and submits this message
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const MAX_HISTORY = 20;

export default function StudyAssistant({ lessonTitle, lessonType, courseTitle, programName, gradeLevel, lessonObjectives, externalMessage }: StudyAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastExternalMessage = useRef<string | undefined>(undefined);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Auto-open and submit when an external explain request arrives
  // externalMessage may have a __timestamp suffix (e.g. "Explain X__1712345678") — strip it before sending
  useEffect(() => {
    if (!externalMessage || externalMessage === lastExternalMessage.current) return;
    lastExternalMessage.current = externalMessage;
    const cleanMessage = externalMessage.replace(/__\d+$/, '');

    // Ensure welcome message exists
    if (!hasOpened) {
      const contextHint = courseTitle ? ` (${courseTitle})` : '';
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `Hi! I'm your AI tutor for "${lessonTitle}"${contextHint}. Ask me anything — I'll explain it clearly and show you real examples! 🚀`,
      }]);
      setHasOpened(true);
    }

    setIsOpen(true);
    setInput(cleanMessage);
    // Submit after a short delay so the panel has time to open
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
        .catch(() => {
          setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant' as const, content: 'Something went wrong. Please try again.' }].slice(-MAX_HISTORY));
        })
        .finally(() => setIsLoading(false));
    }, 350);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalMessage]);

  const handleOpen = () => {
    if (!hasOpened) {
      const contextHint = courseTitle ? ` (${courseTitle})` : '';
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `Hi! I'm your AI tutor for "${lessonTitle}"${contextHint}. Ask me anything — I'll explain it clearly and show you real examples! 🚀`,
        },
      ]);
      setHasOpened(true);
    }
    setIsOpen(true);
  };

  const handleClose = () => setIsOpen(false);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    const updatedMessages = [...messages, userMessage].slice(-MAX_HISTORY);
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    const conversationHistory = updatedMessages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/ai/study-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          lessonTitle,
          lessonType,
          courseTitle,
          programName,
          gradeLevel,
          lessonObjectives,
          conversationHistory,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      const data = await res.json();
      const reply = data.reply ?? data.message ?? data.content ?? 'Sorry, I could not generate a response.';

      setMessages((prev) =>
        [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'assistant' as const,
            content: reply,
          },
        ].slice(-MAX_HISTORY)
      );
    } catch (err) {
      setMessages((prev) =>
        [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant' as const,
            content: 'Sorry, something went wrong. Please try again.',
          },
        ].slice(-MAX_HISTORY)
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-[350px] h-[480px] bg-card border border-border rounded-none shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-start justify-between px-4 py-3 border-b border-border bg-card shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-none bg-orange-500 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">Study Assistant</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[220px]" title={`${lessonTitle}${courseTitle ? ` · ${courseTitle}` : ''}`}>
                    {lessonTitle}{courseTitle ? ` · ${courseTitle}` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="shrink-0 ml-2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-none bg-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                      AI
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] px-3 py-2 text-sm leading-relaxed rounded-none ${
                      msg.role === 'user'
                        ? 'bg-orange-500 text-white'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isLoading && (
                <div className="flex gap-2 justify-start">
                  <div className="w-6 h-6 rounded-none bg-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                    AI
                  </div>
                  <div className="bg-muted rounded-none px-3 py-2.5 flex items-center gap-1">
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
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question…"
                  rows={1}
                  className="flex-1 resize-none bg-card border border-border rounded-none px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 transition-colors max-h-24 overflow-y-auto"
                  style={{ lineHeight: '1.5' }}
                  disabled={isLoading}
                />
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim() || isLoading}
                  className="shrink-0 w-9 h-9 flex items-center justify-center bg-orange-500 text-white rounded-none disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-600 transition-colors"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Press Enter to send · Shift+Enter for new line
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating trigger button */}
      <motion.button
        onClick={isOpen ? handleClose : handleOpen}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-none shadow-lg transition-colors border border-orange-500"
        aria-label="Open study assistant"
      >
        <Sparkles className="w-4 h-4" />
        Ask AI
      </motion.button>
    </div>
  );
}
