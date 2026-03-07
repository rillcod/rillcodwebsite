'use client';

import { useState, useRef } from 'react';
import {
  PhotoIcon,
  SpeakerWaveIcon,
  MicrophoneIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';

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
}

/* ── helpers ─────────────────────────────────────────────── */
function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/* ── sub-components ──────────────────────────────────────── */
function ToolCard({ icon: Icon, title, color, children }: {
  icon: React.ElementType;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <p className="font-bold text-white text-sm">{title}</p>
      </div>
      {children}
    </div>
  );
}

function Spinner() {
  return <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />;
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
function ImageGenerator({ lessonTitle, lessonSubject, lessonGrade }: Pick<LessonAIToolsProps, 'lessonTitle' | 'lessonSubject' | 'lessonGrade'>) {
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
    <ToolCard icon={PhotoIcon} title="Generate Cover Image" color="bg-pink-600">
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Custom Prompt (optional)</p>
        <input
          value={customPrompt}
          onChange={e => setCustomPrompt(e.target.value)}
          placeholder={`Auto: illustration for "${lessonTitle || 'lesson'}"`}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 outline-none focus:border-pink-500"
        />
      </div>

      {error && <ErrorMsg msg={error} />}

      {result && (
        <div className="space-y-3">
          <img src={result.dataUrl} alt="Generated thumbnail" className="w-full rounded-xl object-cover max-h-48" />
          <p className="text-[10px] text-white/30 line-clamp-2">Prompt: {result.prompt}</p>
          <div className="flex gap-2">
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

/* ── Text-to-Speech ──────────────────────────────────────── */
function TextToSpeech({ lessonText, lessonTitle }: Pick<LessonAIToolsProps, 'lessonText' | 'lessonTitle'>) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');

  const MAX = 1000;
  const textToUse = customText.trim() || lessonText.trim();
  const charCount = textToUse.length;

  const handleGenerate = async () => {
    if (!textToUse) { setError('Add a lesson description or type text to convert.'); return; }
    setGenerating(true);
    setError(null);
    setAudioUrl(null);
    try {
      const res = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToUse.slice(0, MAX) }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'TTS failed');
      setAudioUrl(payload.data.dataUrl);
    } catch (e: any) {
      setError(e.message ?? 'Failed to generate audio');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ToolCard icon={SpeakerWaveIcon} title="Text to Speech" color="bg-cyan-600">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Text to read aloud</p>
          <span className={`text-[10px] font-bold ${charCount > MAX ? 'text-rose-400' : 'text-white/30'}`}>
            {Math.min(charCount, MAX)}/{MAX} chars
          </span>
        </div>
        <textarea
          value={customText}
          onChange={e => setCustomText(e.target.value)}
          placeholder={lessonText ? `Using lesson description (${lessonText.length} chars)…` : 'Enter text to convert to audio…'}
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 outline-none focus:border-cyan-500 resize-none"
        />
      </div>

      {error && <ErrorMsg msg={error} />}

      {audioUrl && (
        <div className="space-y-2">
          <audio controls src={audioUrl} className="w-full h-10 rounded-xl" />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => downloadDataUrl(audioUrl, `lesson-audio-${Date.now()}.wav`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white/10 hover:bg-white/15 rounded-lg text-white transition-colors"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Download
            </button>
            <button
              type="button"
              onClick={() => setAudioUrl(null)}
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
        disabled={generating || !textToUse}
        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all"
      >
        {generating ? <Spinner /> : <SpeakerWaveIcon className="w-4 h-4" />}
        {generating ? 'Generating audio...' : 'Convert to Speech'}
      </button>
    </ToolCard>
  );
}

/* ── Speech-to-Text ──────────────────────────────────────── */
function SpeechToText({ onTranscript }: Pick<LessonAIToolsProps, 'onTranscript'>) {
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
      fd.append('audio', file);
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
    <ToolCard icon={MicrophoneIcon} title="Transcribe Recording" color="bg-amber-600">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-white/10 hover:border-amber-500/40 rounded-xl p-5 text-center cursor-pointer transition-colors"
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
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 max-h-40 overflow-y-auto">
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

/* ── Main export ─────────────────────────────────────────── */
export default function LessonAITools({
  lessonTitle,
  lessonSubject,
  lessonGrade,
  lessonText,
  onTranscript,
}: LessonAIToolsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-white/5" />
        <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Hugging Face AI Tools</p>
        <div className="h-px flex-1 bg-white/5" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ImageGenerator lessonTitle={lessonTitle} lessonSubject={lessonSubject} lessonGrade={lessonGrade} />
        <TextToSpeech lessonText={lessonText} lessonTitle={lessonTitle} />
        <SpeechToText onTranscript={onTranscript} />
      </div>
    </div>
  );
}
