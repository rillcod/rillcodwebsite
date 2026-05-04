'use client';

import { useState, useEffect, useRef } from 'react';
import { SpeakerWaveIcon, XMarkIcon, PlayIcon, PauseIcon, StopIcon } from '@/lib/icons';

interface NeuralVoiceReaderProps {
  content: string;
  title?: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function NeuralVoiceReader({ content, title, isOpen, onClose }: NeuralVoiceReaderProps) {
  const [supported, setSupported] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
      setSupported(true);
    }
    return () => { synthRef.current?.cancel(); };
  }, []);

  // Stop playback when panel is closed
  useEffect(() => {
    if (!isOpen) stop();
  }, [isOpen]); // eslint-disable-line

  const stop = () => {
    synthRef.current?.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setProgress(0);
  };

  const handleClose = () => {
    stop();
    onClose();
  };

  const togglePlay = () => {
    const synth = synthRef.current;
    if (!synth) return;

    if (isPlaying && !isPaused) {
      synth.pause();
      setIsPaused(true);
      return;
    }
    if (isPaused) {
      synth.resume();
      setIsPaused(false);
      return;
    }

    stop();
    const plainText = content.replace(/<[^>]*>?/gm, '').replace(/[#*_`>]/g, '');
    const utterance = new SpeechSynthesisUtterance(plainText);
    const voices = synth.getVoices();
    const preferred = voices.find(v =>
      v.name.includes('Google US English') || v.name.includes('Premium')
    ) || voices[0];
    if (preferred) utterance.voice = preferred;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onstart = () => { setIsPlaying(true); setIsPaused(false); };
    utterance.onend = () => { setIsPlaying(false); setProgress(100); };
    utterance.onboundary = (e) => setProgress((e.charIndex / plainText.length) * 100);
    utteranceRef.current = utterance;
    synth.speak(utterance);
  };

  if (!supported || !isOpen) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 sm:bottom-6 sm:left-6 sm:right-auto sm:w-[300px] z-50">
      <div className="bg-zinc-900/98 backdrop-blur-xl border border-white/10 sm:rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
            <SpeakerWaveIcon className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-none mb-0.5">Neural Voice</p>
            <p className="text-xs font-bold text-white truncate">{title || 'Lesson Audio'}</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors shrink-0"
            aria-label="Close reader"
          >
            <XMarkIcon className="w-4 h-4 text-white/50" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-4 pt-3 pb-1">
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all duration-300 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-white/20 font-bold mt-1">
            <span>{isPlaying ? (isPaused ? 'Paused' : 'Playing…') : 'Ready to play'}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-[10px] text-white/30 italic truncate max-w-[140px]">
            {title ? `"${title}"` : 'Full lesson audio'}
          </p>
          <div className="flex items-center gap-2">
            {isPlaying && (
              <button
                onClick={stop}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                aria-label="Stop"
                title="Stop"
              >
                <StopIcon className="w-4 h-4 text-white/40" />
              </button>
            )}
            <button
              onClick={togglePlay}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 min-w-[90px] justify-center ${
                isPlaying && !isPaused
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30'
              }`}
            >
              {isPlaying && !isPaused ? (
                <><PauseIcon className="w-4 h-4" /> Pause</>
              ) : (
                <><PlayIcon className="w-4 h-4" /> {isPaused ? 'Resume' : 'Play'}</>
              )}
            </button>
          </div>
        </div>

        {/* Safe area bottom padding for mobile */}
        <div className="h-[env(safe-area-inset-bottom)] sm:hidden" />
      </div>
    </div>
  );
}
