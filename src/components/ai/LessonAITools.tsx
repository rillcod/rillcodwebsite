'use client';

import { useState, useRef } from 'react';
import {
  XMarkIcon,
  SparklesIcon,
  Maximize2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChartBarIcon,
  PhotoIcon,
  VideoCameraIcon,
  ChatBubbleLeftRightIcon,
} from '@/lib/icons';
import { isPuterAvailable, puterChat } from '@/lib/puter-ai';

interface LessonAIToolsProps {
  lessonTitle: string;
  lessonSubject?: string;
  lessonGrade?: string;
  lessonText?: string;
  onTranscript: (text: string) => void;
  onImageGenerated: (url: string) => void;
  onVideoGenerated: (url: string) => void;
  onGraphicGenerated: (type: string, data: any) => void;
}

function ToolCard({ icon: Icon, title, color, children, onMaximize }: {
  icon: React.ElementType;
  title: string;
  color: string;
  children: React.ReactNode;
  onMaximize?: () => void;
}) {
  return (
    <div className="bg-white/[0.03] border border-border rounded-2xl p-5 space-y-4 relative group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color} shadow-lg shadow-black/20`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <p className="font-bold text-white text-sm uppercase tracking-tight">{title}</p>
        </div>
        {onMaximize && (
          <button 
            onClick={onMaximize}
            className="p-2 text-white/20 hover:text-white hover:bg-white/5 rounded-lg transition-all"
          >
            <Maximize2Icon className="w-4 h-4" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Spinner() {
  return <div className="w-4 h-4 border-2 border-border border-t-transparent rounded-full animate-spin flex-shrink-0" />;
}

/* ── OpenRouter Image Synthesis ─────────────────────── */
function ImageGenerator({ lessonTitle, lessonSubject, lessonGrade, onInsert }: any) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt || lessonTitle, title: lessonTitle, subject: lessonSubject, gradeLevel: lessonGrade }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResult(data.url);
    } catch (e: any) { setError(e.message); }
    finally { setGenerating(false); }
  };

  return (
    <ToolCard icon={PhotoIcon} title="Image Synthesis" color="bg-orange-600">
      <input 
        value={prompt} 
        onChange={e => setPrompt(e.target.value)}
        placeholder="Neural prompt or title..."
        className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 outline-none focus:border-orange-500"
      />
      {error && <p className="text-[10px] text-rose-400 font-bold">{error}</p>}
      {result && (
        <div className="space-y-3">
          <img src={result} className="w-full rounded-xl border border-border shadow-xl" alt="AI Generated" />
          <button onClick={() => onInsert(result)} className="w-full py-2 bg-orange-600 text-white font-bold text-xs rounded-lg uppercase tracking-widest">Inject Asset</button>
        </div>
      )}
      {!result && (
        <button onClick={handleGenerate} disabled={generating} className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-lg transition-all border border-border">
          {generating ? <Spinner /> : <SparklesIcon className="w-3 h-3 text-orange-400" />}
          {generating ? 'Synthesizing...' : 'DALL-E 3 Synthesis'}
        </button>
      )}
    </ToolCard>
  );
}

/* ── AI Video Finder (YouTube embed) ─────────────────── */
function VideoGenerator({ lessonTitle, onInsert }: any) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ url: string; title: string; channel: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt || lessonTitle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResult(data.data);
    } catch (e: any) { setError(e.message); }
    finally { setGenerating(false); }
  };

  // Convert YouTube watch URL to embed URL
  const embedUrl = result?.url?.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/');

  return (
    <ToolCard icon={VideoCameraIcon} title="Educational Video" color="bg-cyan-600">
      <input
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Topic or lesson title..."
        className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 outline-none focus:border-cyan-500"
      />
      {error && <p className="text-[10px] text-rose-400 font-bold">{error}</p>}
      {result && embedUrl && (
        <div className="space-y-3">
          <div className="text-[10px] text-cyan-400 font-bold truncate">{result.title} — {result.channel}</div>
          <div className="aspect-video rounded-xl overflow-hidden border border-border">
            <iframe src={embedUrl} className="w-full h-full" allowFullScreen title={result.title} />
          </div>
          <button onClick={() => onInsert(result.url)} className="w-full py-2 bg-cyan-600 text-white font-bold text-xs rounded-lg uppercase tracking-widest">Inject Video</button>
        </div>
      )}
      {!result && (
        <button onClick={handleGenerate} disabled={generating} className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-lg transition-all border border-border">
          {generating ? <Spinner /> : <SparklesIcon className="w-3 h-3 text-cyan-400" />}
          {generating ? 'Finding video...' : 'Find Educational Video'}
        </button>
      )}
    </ToolCard>
  );
}

/* ── OpenRouter AI Designer (Graphics) ──────────────── */
function GraphicSynthesizer({ lessonTitle, onInsert }: any) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGraphicGen = async (type: string) => {
    setGenerating(type);
    setError(null);
    try {
      const res = await fetch('/api/ai/graphics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, prompt: prompt || lessonTitle }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed');
      
      // Normalize types for the CanvaRenderer / MermaidRenderer
      if (type === 'infographic' || type === 'flowchart') {
        onInsert('mermaid', { code: payload.data.code });
      } else if (type === 'scratch-blocks') {
        onInsert('scratch', payload.data);
      } else {
        onInsert(type, payload.data);
      }
    } catch (e: any) { setError(e.message); }
    finally { setGenerating(null); }
  };

  return (
    <ToolCard icon={ChartBarIcon} title="Architectural Designer" color="bg-purple-600">
      <input 
        value={prompt} 
        onChange={e => setPrompt(e.target.value)}
        placeholder="Concept to architect (e.g. OSI Model)"
        className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 outline-none focus:border-purple-500"
      />
      {error && <p className="text-[10px] text-rose-400 font-bold">{error}</p>}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button onClick={() => handleGraphicGen('flowchart')} disabled={!!generating} className="flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 text-white font-bold text-[9px] uppercase tracking-wider rounded-lg border border-border transition-all">
          {generating === 'flowchart' ? <Spinner /> : 'Flowchart'}
        </button>
        <button onClick={() => handleGraphicGen('illustration')} disabled={!!generating} className="flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 text-white font-bold text-[9px] uppercase tracking-wider rounded-lg border border-border transition-all">
          {generating === 'illustration' ? <Spinner /> : 'Visual'}
        </button>
        <button onClick={() => handleGraphicGen('code-map')} disabled={!!generating} className="flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 text-white font-bold text-[9px] uppercase tracking-wider rounded-lg border border-border transition-all">
          {generating === 'code-map' ? <Spinner /> : 'Code Map'}
        </button>
        <button onClick={() => handleGraphicGen('scratch-blocks')} disabled={!!generating} className="flex items-center justify-center gap-2 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 font-bold text-[9px] uppercase tracking-wider rounded-lg border border-purple-500/30 transition-all">
          {generating === 'scratch-blocks' ? <Spinner /> : 'Scratch LAB'}
        </button>
        <button onClick={() => handleGraphicGen('infographic')} disabled={!!generating} className="flex items-center justify-center gap-2 py-2 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 font-bold text-[9px] uppercase tracking-wider rounded-lg border border-orange-500/30 transition-all">
          {generating === 'infographic' ? <Spinner /> : 'Infographic Hub'}
        </button>
      </div>
    </ToolCard>
  );
}

/* ── Puter.js Free AI Assistant ─────────────────────── */
type ChatMessage = { role: 'user' | 'assistant'; text: string };

function PuterAIAssistant({ lessonTitle, lessonSubject, lessonGrade, onInsert }: {
  lessonTitle: string;
  lessonSubject?: string;
  lessonGrade?: string;
  onInsert: (text: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    { label: 'Explain topic', prompt: `Explain "${lessonTitle}" simply for ${lessonGrade || 'secondary'} students.` },
    { label: 'Quiz questions', prompt: `Write 5 quiz questions about "${lessonTitle}" for ${lessonGrade || 'secondary'} students.` },
    { label: 'Key facts', prompt: `List 5 key facts about "${lessonTitle}" that ${lessonGrade || 'secondary'} students should know.` },
    { label: 'Lesson summary', prompt: `Write a concise lesson summary for "${lessonTitle}"${lessonSubject ? ` (${lessonSubject})` : ''}.` },
  ];

  const send = async (text: string) => {
    if (!text.trim()) return;
    setError(null);
    const userMsg: ChatMessage = { role: 'user', text: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      let reply: string;
      if (isPuterAvailable()) {
        reply = await puterChat(text.trim());
      } else {
        // Fallback to server-side OpenRouter
        const res = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: text.trim(),
            lessonTitle,
            subject: lessonSubject,
            gradeLevel: lessonGrade,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        const text2 = data.content ?? data.result;
        if (!text2 || typeof text2 !== 'string') throw new Error(data.error ?? 'Unexpected response from AI');
        reply = text2;
      }
      setMessages(prev => [...prev, { role: 'assistant', text: reply }]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Quick prompts */}
      <div className="grid grid-cols-2 gap-1.5">
        {quickPrompts.map(q => (
          <button
            key={q.label}
            onClick={() => send(q.prompt)}
            disabled={loading}
            className="py-1.5 px-2 text-[9px] font-bold uppercase tracking-wider bg-white/5 hover:bg-emerald-500/10 border border-border hover:border-emerald-500/40 text-white/50 hover:text-emerald-300 rounded-lg transition-all text-left truncate"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Chat history */}
      {messages.length > 0 && (
        <div className="max-h-56 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-xl text-[11px] leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-emerald-600/20 border border-emerald-500/30 text-white'
                  : 'bg-white/5 border border-border text-white/80'
              }`}>
                {m.text}
                {m.role === 'assistant' && (
                  <button
                    onClick={() => onInsert(m.text)}
                    className="block mt-1.5 text-[9px] font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-widest transition-colors"
                  >
                    + Insert into lesson
                  </button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="px-3 py-2 bg-white/5 border border-border rounded-xl flex items-center gap-2">
                <Spinner />
                <span className="text-[10px] text-white/30">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {error && <p className="text-[10px] text-rose-400 font-bold">{error}</p>}

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
          placeholder="Ask anything about this lesson..."
          disabled={loading}
          className="flex-1 bg-white/5 border border-border rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl transition-colors"
        >
          <SparklesIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-[9px] text-white/20 text-center">
        {isPuterAvailable() ? 'Powered by Puter.js (free · no API key)' : 'Powered by OpenRouter (server-side)'}
      </p>
    </div>
  );
}

/* ── Main Export ────────────────────────────────────── */
export default function LessonAITools({
  lessonTitle, lessonSubject, lessonGrade,
  onTranscript, onImageGenerated, onVideoGenerated, onGraphicGenerated
}: LessonAIToolsProps) {
  const [isOpenRouter, setIsOpenRouter] = useState(false);
  const [isPuter, setIsPuter] = useState(false);

  return (
    <div className="space-y-4 pt-8">

      {/* ── Puter.js Free AI Assistant ── */}
      <div className="bg-gradient-to-br from-[#0B1A12] to-[#141F18] border border-emerald-500/10 rounded-[2rem] overflow-hidden transition-all shadow-2xl">
        <button
          type="button"
          onClick={() => setIsPuter(!isPuter)}
          className="w-full flex items-center justify-between px-8 py-6 text-left group"
        >
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/30 transition-all ${isPuter ? 'scale-110 border-emerald-500' : 'group-hover:border-emerald-400'}`}>
              <ChatBubbleLeftRightIcon className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-tighter italic">Puter.js AI Assistant</h3>
              <p className="text-[10px] text-emerald-400 font-black uppercase tracking-[0.4em] mt-0.5">
                Free · No API Key · Chat + Lesson Help
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[9px] font-black text-emerald-400 uppercase tracking-widest">FREE</span>
            {isPuter ? <ChevronUpIcon className="w-5 h-5 text-emerald-400" /> : <ChevronDownIcon className="w-5 h-5 text-white/20" />}
          </div>
        </button>

        {isPuter && (
          <div className="px-8 pb-8 pt-2 animate-in slide-in-from-top-4 duration-500">
            <div className="h-px bg-emerald-500/10 w-full mb-6" />
            <PuterAIAssistant
              lessonTitle={lessonTitle}
              lessonSubject={lessonSubject}
              lessonGrade={lessonGrade}
              onInsert={onTranscript}
            />
          </div>
        )}
      </div>

      {/* ── OpenRouter Premium Suite ── */}
      <div className="bg-gradient-to-br from-[#0B0B1B] to-[#161625] border border-white/5 rounded-[2rem] overflow-hidden transition-all shadow-2xl">
        <button
          type="button"
          onClick={() => setIsOpenRouter(!isOpenRouter)}
          className="w-full flex items-center justify-between px-8 py-6 text-left group"
        >
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-500/30 transition-all ${isOpenRouter ? 'scale-110 border-orange-500' : 'group-hover:border-orange-400'}`}>
              <SparklesIcon className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-tighter italic">OpenRouter Premium Suite</h3>
              <p className="text-[10px] text-orange-400 font-black uppercase tracking-[0.4em] mt-0.5">
                Multi-Model Neural Synthesis (Gemini / Llama / DALL-E)
              </p>
            </div>
          </div>
          {isOpenRouter ? <ChevronUpIcon className="w-5 h-5 text-orange-400" /> : <ChevronDownIcon className="w-5 h-5 text-white/20" />}
        </button>

        {isOpenRouter && (
          <div className="px-8 pb-8 pt-4 space-y-8 animate-in slide-in-from-top-4 duration-500">
            <div className="h-px bg-white/5 w-full" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <ImageGenerator
                lessonTitle={lessonTitle}
                lessonSubject={lessonSubject}
                lessonGrade={lessonGrade}
                onInsert={onImageGenerated}
              />
              <VideoGenerator
                lessonTitle={lessonTitle}
                onInsert={onVideoGenerated}
              />
              <GraphicSynthesizer
                lessonTitle={lessonTitle}
                onInsert={onGraphicGenerated}
              />
            </div>

            <div className="p-4 bg-orange-500/5 border border-orange-500/10 rounded-2xl flex items-center gap-4">
              <div className="px-2 py-1 bg-orange-500/10 rounded text-[9px] font-black text-orange-400 uppercase tracking-widest">Priority Engine: Active</div>
              <p className="text-[10px] text-white/20 uppercase tracking-widest font-medium">
                Unified OpenRouter Infrastructure • Gemini-Flash & DALL-E 3 Integrated
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
