'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { LightBulbIcon, PaperAirplaneIcon, ArrowPathIcon, ChatBubbleLeftRightIcon, BookOpenIcon, CodeBracketIcon } from '@/lib/icons';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
}

const STARTERS = [
  { label: 'Explain a concept', prompt: 'Can you explain how a for loop works in Python with a simple example?', emoji: '💡' },
  { label: 'Debug my code', prompt: 'My code has a bug and I cannot figure out why. Here it is:\n\n```python\nfor i in range(10:\n    print(i)\n```', emoji: '🐛' },
  { label: 'Maths help', prompt: 'I do not understand how to find the area of a circle. Can you show me step by step?', emoji: '📐' },
  { label: 'Essay outline', prompt: 'Can you help me write an outline for an essay about the impact of technology in Nigeria?', emoji: '✍️' },
];

export default function HomeworkHelperPage() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: `👋 Hi${profile?.full_name ? ' ' + profile.full_name.split(' ')[0] : ''}! I'm your AI Homework Helper. I'm here to help you understand concepts, debug code, work through maths problems, and more.\n\nWhat are you working on today?` }
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function sendMessage(text?: string) {
    const msg = (text || input).trim();
    if (!msg || sending) return;
    setInput('');

    const userMessage: Message = { role: 'user', content: msg };
    const loadingMessage: Message = { role: 'assistant', content: '...', loading: true };

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setSending(true);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    // Build context from recent messages (last 5 turns)
    const history = messages.slice(-10).map(m => ({
      role: m.role,
      content: m.content
    }));

    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'custom',
        topic: msg,
        prompt: `You are a brilliant, patient AI homework helper for Nigerian secondary school and university students. 

Rules:
- Be friendly, encouraging, and supportive  
- Never give direct homework answers — instead, guide the student to find the answer themselves using hints and questions
- Show step-by-step working for maths and science
- For coding, explain what's happening and why, don't just give the fixed code
- Keep responses clear and concise — not too long
- Use British English
- If the student seems stuck, offer a hint rather than the full answer
- Acknowledge when a student does something right

Conversation history:
${history.map(h => `${h.role === 'user' ? 'Student' : 'Helper'}: ${h.content}`).join('\n')}

Student's latest message: ${msg}

Respond in helpful, conversational markdown (use headers, lists, and code blocks where appropriate).

Return ONLY this JSON:
{
  "content": "your helpful response in markdown"
}`,
      }),
    });

    const json = await res.json();
    const reply = json.content || json.data?.content || (res.ok ? 'I could not process that. Please try again.' : 'Something went wrong. Please try again.');

    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: 'assistant', content: reply };
      return updated;
    });
    setSending(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-none bg-orange-600/20 border border-orange-600/30 flex items-center justify-center">
            <LightBulbIcon className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="font-black text-foreground text-lg">AI Homework Helper</h1>
            <p className="text-xs text-muted-foreground">Powered by Rillcod AI · Your personal study companion</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-none flex items-center justify-center flex-shrink-0 text-sm font-black ${msg.role === 'user' ? 'bg-orange-600 text-white' : 'bg-indigo-600/20 border border-indigo-600/30 text-indigo-400'}`}>
                {msg.role === 'user'
                  ? (profile?.full_name?.[0] ?? 'U')
                  : <LightBulbIcon className="w-4 h-4" />}
              </div>

              {/* Bubble */}
              <div className={`max-w-[80%] rounded-none px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                ? 'bg-orange-600 text-white'
                : 'bg-card border border-border text-foreground'
              } ${msg.loading ? 'animate-pulse' : ''}`}>
                {msg.loading ? (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:0.15s]" />
                    <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:0.3s]" />
                  </span>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none [&_pre]:bg-black/40 [&_code]:text-orange-300 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm">
                    {msg.content.split('\n').map((line, li) => <p key={li}>{line}</p>)}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Starters (shown when only the greeting is visible) */}
      {messages.length === 1 && (
        <div className="max-w-3xl mx-auto w-full px-4 pb-4">
          <p className="text-xs text-muted-foreground mb-3 text-center">Quick starters</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {STARTERS.map(s => (
              <button
                key={s.label}
                onClick={() => sendMessage(s.prompt)}
                className="flex flex-col items-start gap-1.5 p-3 bg-card border border-border hover:border-orange-500/40 rounded-none text-left transition-all"
              >
                <span className="text-lg">{s.emoji}</span>
                <span className="text-xs font-bold text-foreground">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
            placeholder="Ask anything — maths, science, coding, essays…"
            rows={2}
            className="flex-1 bg-card border border-border text-foreground px-4 py-2.5 rounded-none text-sm placeholder-muted-foreground focus:outline-none focus:border-orange-500 resize-none"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || sending}
            className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white rounded-none transition-colors flex-shrink-0"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
          </button>
        </div>
        <p className="text-center text-[10px] text-muted-foreground pb-3">AI can make mistakes · Always verify answers with your teacher</p>
      </div>
    </div>
  );
}
