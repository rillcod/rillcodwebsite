// @refresh reset
'use client';

import { useState, useRef } from 'react';
import {
  PhotoIcon,
  MicrophoneIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  ExclamationCircleIcon,
  SparklesIcon,
  Maximize2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  FilmIcon,
  ChartBarIcon,
  PlayIcon,
} from '@/lib/icons';

/* ── types ──────────────────────────────────────────────── */
interface LessonAIToolsProps {
  /** Current lesson title — used as default prompt for image gen */
  lessonTitle: string;
  lessonSubject?: string;
  lessonGrade?: string;
  /** Plain-text summary of the lesson for TTS */
  lessonText: string;
  /** Called when STT transcript is ready — teacher can insert it */
  onTranscript: (text: string) => void;
  onImageGenerated: (url: string) => void;
  onVideoGenerated: (url: string) => void;
  onGraphicGenerated: (type: string, data: any) => void;
}

/* ── helpers ─────────────────────────────────────────────── */
function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/* ── sub-components ──────────────────────────────────────── */
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
            title="Maximize Interface"
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

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
      <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      {msg}
    </div>
  );
}

/* ── Image Generator ─────────────────────────────────────── */
function ImageGenerator({ lessonTitle, lessonSubject, lessonGrade, onMaximize, onInsert }: Pick<LessonAIToolsProps, 'lessonTitle' | 'lessonSubject' | 'lessonGrade'> & { onMaximize?: () => void; onInsert?: (url: string) => void }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ dataUrl: string; prompt: string } | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: lessonTitle || 'STEM lesson',
          subject: lessonSubject,
          gradeLevel: lessonGrade,
          prompt: customPrompt.trim() || undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Generation failed');
      setResult({ dataUrl: payload.data.dataUrl, prompt: payload.data.prompt });
    } catch (e: any) {
      setError(e.message ?? 'Failed to generate image');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ToolCard icon={PhotoIcon} title="Generate Cover Image" color="bg-pink-600" onMaximize={onMaximize}>
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Custom Prompt (optional)</p>
        <input
          value={customPrompt}
          onChange={e => setCustomPrompt(e.target.value)}
          placeholder={`Auto: illustration for "${lessonTitle || 'lesson'}"`}
          className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 outline-none focus:border-pink-500"
        />
      </div>

      {error && <ErrorMsg msg={error} />}

      {result && (
        <div className="space-y-3">
          <img src={result.dataUrl} alt="Generated thumbnail" className="w-full rounded-xl object-cover max-h-48" />
          <p className="text-[10px] text-white/30 line-clamp-2">Prompt: {result.prompt}</p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onInsert?.(result.dataUrl)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-pink-500/20 text-pink-300 border border-pink-500/30 hover:bg-pink-500/30 rounded-lg transition-colors"
            >
              <SparklesIcon className="w-3.5 h-3.5" /> Use as Cover
            </button>
            <button
              type="button"
              onClick={() => downloadDataUrl(result.dataUrl, `lesson-thumbnail-${Date.now()}.jpg`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white/10 hover:bg-white/15 rounded-lg text-white transition-colors"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Download
            </button>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white/5 hover:bg-white/10 rounded-lg text-white/40 transition-colors"
            >
              <XMarkIcon className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating}
        className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-60 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all"
      >
        {generating ? <Spinner /> : <PhotoIcon className="w-4 h-4" />}
        {generating ? 'Generating image...' : 'Generate'}
      </button>
    </ToolCard>
  );
}



/* ── Speech-to-Text ──────────────────────────────────────── */
function SpeechToText({ onTranscript, onMaximize }: Pick<LessonAIToolsProps, 'onTranscript'> & { onMaximize?: () => void }) {
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setFilename(file.name);
    setTranscribing(true);
    setError(null);
    setTranscript(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/ai/stt', { method: 'POST', body: fd });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Transcription failed');
      setTranscript(payload.data.transcript);
    } catch (e: any) {
      setError(e.message ?? 'Transcription failed');
    } finally {
      setTranscribing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <ToolCard icon={MicrophoneIcon} title="Transcribe Recording" color="bg-emerald-600" onMaximize={onMaximize}>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-border hover:border-amber-500/40 rounded-xl p-5 text-center cursor-pointer transition-colors"
      >
        <MicrophoneIcon className="w-6 h-6 text-white/20 mx-auto mb-2" />
        <p className="text-xs text-white/40">
          {transcribing ? 'Transcribing...' : filename || 'Drop an audio file or click to upload'}
        </p>
        <p className="text-[10px] text-white/20 mt-1">MP3, WAV, M4A, OGG · Max 25 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {transcribing && (
        <div className="flex items-center gap-2 text-xs text-amber-400">
          <Spinner />
          Whisper is transcribing — this may take up to 30 seconds…
        </div>
      )}

      {error && <ErrorMsg msg={error} />}

      {transcript && (
        <div className="space-y-3">
          <div className="bg-white/5 border border-border rounded-xl p-4 max-h-40 overflow-y-auto">
            <p className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap">{transcript}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => { onTranscript(transcript); setTranscript(null); setFilename(''); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 rounded-lg transition-colors"
            >
              Insert into lesson
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(transcript)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white/10 hover:bg-white/15 rounded-lg text-white transition-colors"
            >
              Copy text
            </button>
            <button
              type="button"
              onClick={() => { setTranscript(null); setFilename(''); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white/5 hover:bg-white/10 rounded-lg text-white/40 transition-colors"
            >
              <XMarkIcon className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>
      )}
    </ToolCard>
  );
}

/* ── Video Generator ─────────────────────────────────────── */
function VideoGenerator({ onMaximize, onInsert }: { onMaximize?: () => void; onInsert?: (url: string) => void }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');

  const handleGenerate = async () => {
    if (!prompt.trim()) { setError('Enter a visual prompt'); return; }
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/ai/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Video generation failed');
      setResult(payload.data.url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ToolCard icon={FilmIcon} title="AI Video Lab" color="bg-rose-600" onMaximize={onMaximize}>
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Scene Description</p>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="e.g. A 3D orbital path of planets around the sun, cinematic lighting..."
          rows={2}
          className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 outline-none focus:border-rose-500 resize-none"
        />
      </div>

      {error && <ErrorMsg msg={error} />}

      {result && (
        <div className="space-y-3">
          <video src={result} controls className="w-full rounded-xl aspect-video bg-black shadow-2xl" />
          <div className="flex gap-2">
             <button
              type="button"
              onClick={() => onInsert?.(result)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 rounded-lg transition-colors"
            >
              <SparklesIcon className="w-3.5 h-3.5" /> Use in Lesson
            </button>
            <button
               type="button"
               onClick={() => downloadDataUrl(result, `ai-video-${Date.now()}.mp4`)}
               className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white/10 hover:bg-white/15 rounded-lg text-white transition-colors"
             >
               <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Download
             </button>
          </div>
        </div>
      )}

      {!result && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-rose-900/40"
        >
          {generating ? <Spinner /> : <PlayIcon className="w-4 h-4" />}
          {generating ? 'Processing Neural Video...' : 'Generate AI Video'}
        </button>
      )}
    </ToolCard>
  );
}

/* ── Graphic Synthesizer ─────────────────────────────────── */
function GraphicSynthesizer({ onMaximize, onInsert }: { onMaximize?: () => void; onInsert?: (type: string, data: any) => void }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [prompt, setPrompt] = useState('');
  const [targetType, setTargetType] = useState('d3-chart');

  const handleGenerate = async () => {
    if (!prompt.trim()) { setError('Enter data requirements'); return; }
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/ai/graphics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, type: targetType }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Synthesis failed');
      setResult(payload.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ToolCard icon={ChartBarIcon} title="Graphic Synth" color="bg-indigo-600" onMaximize={onMaximize}>
      <div className="flex gap-2 p-1 bg-white/5 rounded-lg border border-white/10">
        <button 
           onClick={() => setTargetType('d3-chart')}
           className={`flex-1 py-1 text-[9px] font-black uppercase transition-all ${targetType === 'd3-chart' ? 'bg-indigo-500 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
        >Data Chart</button>
        <button 
           onClick={() => setTargetType('motion-graphics')}
           className={`flex-1 py-1 text-[9px] font-black uppercase transition-all ${targetType === 'motion-graphics' ? 'bg-indigo-500 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
        >Motion</button>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Graphic Requirements</p>
        <input
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={targetType === 'd3-chart' ? "Growth of AI from 2020 to 2025..." : "A rotating molecule with 8 atoms..."}
          className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 outline-none focus:border-indigo-500"
        />
      </div>

      {error && <ErrorMsg msg={error} />}

      {result && (
        <div className="space-y-3">
          <div className="p-3 bg-black/40 border border-indigo-500/20 rounded-xl">
             <p className="text-[10px] font-mono text-indigo-400">Structure Synthesized:</p>
             <pre className="text-[8px] text-white/60 overflow-hidden mt-1">{JSON.stringify(result, null, 2)}</pre>
          </div>
          <button
            type="button"
            onClick={() => onInsert?.(targetType, result)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold bg-indigo-500 text-white rounded-lg hover:bg-indigo-400 transition-colors"
          >
            <SparklesIcon className="w-3.5 h-3.5" /> Inject into Builder
          </button>
        </div>
      )}

      {!result && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all"
        >
          {generating ? <Spinner /> : <SparklesIcon className="w-3.5 h-3.5" />}
          {generating ? 'Synthesizing...' : 'Build Neural Graphic'}
        </button>
      )}
    </ToolCard>
  );
}

/* ── Main export ─────────────────────────────────────────── */
export default function LessonAITools({
  lessonTitle,
  lessonSubject,
  lessonGrade,
  lessonText,
  onTranscript,
  onImageGenerated,
  onVideoGenerated,
  onGraphicGenerated,
}: LessonAIToolsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [maximizedTool, setMaximizedTool] = useState<'image' | 'stt' | 'video' | 'graphic' | null>(null);

  return (
    <div className="space-y-4">
      {/* Expandable Panel Header */}
      <div className="bg-gradient-to-br from-indigo-950/20 to-indigo-900/10 border border-indigo-500/20 rounded-none overflow-hidden transition-all shadow-2xl">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-6 py-5 text-left group"
        >
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-none bg-indigo-500/10 flex items-center justify-center border border-indigo-500/30 transition-all ${isOpen ? 'scale-110 border-indigo-500' : 'group-hover:border-indigo-400'}`}>
              <SparklesIcon className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-[0.1em] italic">Hugging Face Neural Suite</h3>
              <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest mt-0.5">
                {isOpen ? 'INTERFACE MAXIMISED' : 'Deep-Tech Synthesis: FLUX.1 & Whisper V3'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             {!isOpen && <span className="text-[9px] font-black text-white/20 uppercase tracking-widest hidden sm:block">Ready for Deployment</span>}
             {isOpen ? <ChevronUpIcon className="w-5 h-5 text-indigo-400" /> : <ChevronDownIcon className="w-5 h-5 text-white/20" />}
          </div>
        </button>

        {isOpen && (
          <div className="px-6 pb-6 pt-2 space-y-6 animate-in slide-in-from-top-4 duration-500">
            <div className="h-px bg-indigo-500/20 w-full" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <ImageGenerator 
                lessonTitle={lessonTitle} 
                lessonSubject={lessonSubject} 
                lessonGrade={lessonGrade} 
                onMaximize={() => setMaximizedTool('image')}
                onInsert={onImageGenerated}
              />
              <VideoGenerator
                onMaximize={() => setMaximizedTool('video')}
                onInsert={onVideoGenerated}
              />
              <GraphicSynthesizer
                onMaximize={() => setMaximizedTool('graphic')}
                onInsert={onGraphicGenerated}
              />
              <SpeechToText 
                onTranscript={onTranscript} 
                onMaximize={() => setMaximizedTool('stt')}
              />
            </div>
            <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-none flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <SparklesIcon className="w-4 h-4" />
              </div>
              <p className="text-[11px] text-white/30 leading-relaxed font-medium uppercase tracking-tight">
                Utilising the <span className="text-white">Hugging Face Inference API</span> for low-latency neural processing. FLUX.1 (schnell) provides high-fidelity educational illustrations, while Whisper V3 handles global-standard speech transcription.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Maximized Modal Overlay */}
      {maximizedTool && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-6 sm:p-12 animate-in fade-in duration-300">
          <div className="w-full max-w-5xl relative">
            <button 
              onClick={() => setMaximizedTool(null)}
              className="absolute -top-12 right-0 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all"
            >
              <XMarkIcon className="w-5 h-5" /> Close Terminal
            </button>
            <div className="bg-[#0a0a0f] border border-indigo-500/30 p-8 sm:p-12 shadow-[0_0_100px_rgba(99,102,241,0.2)] max-h-[85vh] overflow-y-auto">
               <div className="mb-8">
                  <h2 className="text-2xl font-black text-white uppercase italic tracking-tight">
                    {maximizedTool === 'image' && 'Neural Image Generator'}
                    {maximizedTool === 'video' && 'AI Video Laboratory'}
                    {maximizedTool === 'graphic' && 'Graphic Synthesis Core'}
                    {maximizedTool === 'stt' && 'Voice Synthesis Terminal'}
                  </h2>
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">Full-Scale Interface Maximised</p>
               </div>
               
               {maximizedTool === 'image' && (
                 <ImageGenerator 
                   lessonTitle={lessonTitle} 
                   lessonSubject={lessonSubject} 
                   lessonGrade={lessonGrade} 
                   onInsert={onImageGenerated}
                 />
               )}
               {maximizedTool === 'video' && (
                 <VideoGenerator 
                   onInsert={onVideoGenerated}
                 />
               )}
               {maximizedTool === 'graphic' && (
                 <GraphicSynthesizer 
                   onInsert={onGraphicGenerated}
                 />
               )}
               {maximizedTool === 'stt' && (
                 <SpeechToText 
                   onTranscript={onTranscript} 
                 />
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
