'use client';

import { useState, useEffect, useRef } from 'react';
import { SpeakerWaveIcon, XMarkIcon, PlayIcon, PauseIcon, SparklesIcon } from '@/lib/icons';

interface NeuralVoiceReaderProps {
  content: string;
  title?: string;
}

export default function NeuralVoiceReader({ content, title }: NeuralVoiceReaderProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [supported, setSupported] = useState(false);
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setSupported(true);
    }
  }, []);

  const stop = () => {
    if (synth) {
      synth.cancel();
      setIsPlaying(false);
      setIsPaused(false);
      setProgress(0);
    }
  };

  const togglePlay = () => {
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

    // Start fresh
    stop();
    const plainText = content.replace(/<[^>]*>?/gm, '').replace(/[\#\*\_]/g, ''); // Basic markdown/html strip
    const utterance = new SpeechSynthesisUtterance(plainText);
    
    // Premium Voice Selection if available
    const voices = synth.getVoices();
    const preferredVoice = voices.find(v => v.name.includes('Google US English') || v.name.includes('Premium')) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;
    
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => {
      setIsPlaying(false);
      setProgress(100);
    };
    utterance.onboundary = (event) => {
      const charIndex = event.charIndex;
      const totalChars = plainText.length;
      setProgress((charIndex / totalChars) * 100);
    };

    utteranceRef.current = utterance;
    synth.speak(utterance);
  };

  if (!supported) return null;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] group">
       <div className={`p-4 bg-black/80 backdrop-blur-3xl border border-white/10 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-4 transition-all duration-500 ${isPlaying ? 'w-[320px] sm:w-[400px]' : 'w-[180px] hover:w-[200px]'}`}>
         <button 
           onClick={togglePlay}
           className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all bg-gradient-to-br ${isPlaying ? 'from-primary to-primary border-primary/30' : 'from-indigo-600 to-cyan-500 border-cyan-400/30'} border shadow-xl active:scale-95`}
         >
           {isPlaying && !isPaused ? (
             <PauseIcon className="w-5 h-5 text-white" />
           ) : (
             <PlayIcon className="w-5 h-5 text-white" />
           )}
         </button>

         <div className="flex-1 overflow-hidden">
           <div className="flex items-center justify-between mb-1.5 px-1">
             <div className="flex items-center gap-2">
               <SparklesIcon className="w-3 h-3 text-primary" />
               <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] truncate">
                 {isPlaying ? 'Neural Voice Sync' : 'Text-to-Speech'}
               </span>
             </div>
             {isPlaying && (
               <button onClick={stop} className="p-1 hover:bg-white/5 rounded-md transition-colors">
                 <XMarkIcon className="w-3.5 h-3.5 text-white/40" />
               </button>
             )}
           </div>
           
           {isPlaying ? (
             <div className="h-1 bg-white/5 rounded-full overflow-hidden relative">
                <div 
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
             </div>
           ) : (
             <div className="text-[10px] font-bold text-white/90 px-1 truncate italic">
               Listen to Lesson
             </div>
           )}
         </div>

         {!isPlaying && (
           <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center opacity-40 group-hover:opacity-100 transition-opacity">
              <SpeakerWaveIcon className="w-4 h-4 text-white" />
           </div>
         )}
       </div>
    </div>
  );
}
