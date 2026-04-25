'use client';

import React from 'react';
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  RotateCcw,
  FastForward,
  Rewind,
  Zap,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface VisualizationControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onRestart: () => void;
  onSpeedChange: (speed: number) => void;
  currentStep: number;
  totalSteps: number;
  speed: number;
  className?: string;
}

/**
 * VisualizationControls - Reusable surface for controlling the flow of a p5 visualization.
 */
export default function VisualizationControls({
  isPlaying,
  onTogglePlay,
  onNext,
  onPrev,
  onRestart,
  onSpeedChange,
  currentStep,
  totalSteps,
  speed,
  className
}: VisualizationControlsProps) {
  const progress = (currentStep / (totalSteps - 1 || 1)) * 100;

  return (
    <div className={cn(
      "flex flex-col gap-3 p-3 sm:p-5 bg-zinc-900 border-t border-zinc-800 z-30",
      className
    )}>
      {/* Visual Timeline (Shadcn-like Slider alternative) */}
      <div className="relative w-full h-1 bg-zinc-800 hover:h-2 transition-all group/timeline cursor-pointer overflow-hidden rounded-none">
        <motion.div 
          className="absolute left-0 top-0 h-full bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.6)]"
          style={{ width: `${progress}%` }}
          initial={false}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
        <div className="absolute inset-0 z-10 opacity-0 group-hover/timeline:opacity-100 transition-opacity bg-white/5" />
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
        {/* Core Control Group */}
        <div className="flex items-center gap-1.5 p-1 bg-black/40 border border-white/5 rounded-none shadow-inner">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onRestart}
            className="w-9 h-9 text-muted-foreground/70 hover:text-white hover:bg-white/5 transition-all rounded-none"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onPrev}
            disabled={currentStep === 0}
            className="w-9 h-9 text-muted-foreground/70 hover:text-white hover:bg-white/5 transition-all rounded-none disabled:opacity-20"
          >
            <SkipBack className="w-4 h-4" />
          </Button>

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onTogglePlay}
            className={cn(
              "w-12 h-10 transition-all rounded-none border border-transparent active:translate-y-0.5",
              isPlaying 
                ? "bg-rose-500/10 text-rose-500 border-rose-500/30 hover:bg-rose-500/20" 
                : "bg-cyan-500/10 text-cyan-500 border-cyan-500/30 hover:bg-cyan-500/20"
            )}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-rose-500/20" />
            ) : (
              <Play className="w-5 h-5 fill-cyan-500/20" />
            )}
          </Button>

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onNext}
            disabled={currentStep === totalSteps - 1}
            className="w-9 h-9 text-muted-foreground/70 hover:text-white hover:bg-white/5 transition-all rounded-none disabled:opacity-20"
          >
            <SkipForward className="w-4 h-4" />
          </Button>
        </div>

        {/* Informative Stats (Mobile Hidden sometimes depending on width) */}
        <div className="hidden lg:flex items-center gap-6">
          <div className="flex flex-col items-center">
            <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Status</span>
            <div className="flex items-center gap-2">
              <span className={cn(
                "w-1.5 h-1.5 rounded-none",
                isPlaying ? "bg-cyan-500 animate-pulse" : "bg-zinc-600"
              )} />
              <span className="text-[10px] font-black text-white uppercase tracking-widest leading-none">
                {isPlaying ? 'EXECUTING' : 'IDLE_WAIT'}
              </span>
            </div>
          </div>

          <div className="w-px h-6 bg-white/5" />

          <div className="flex flex-col items-center">
            <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em] mb-1">Interpolation</span>
            <span className="text-[10px] font-black text-muted-foreground/70 uppercase tracking-widest leading-none">Next.Step()</span>
          </div>
        </div>

        {/* Playback Configuration */}
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="flex items-center gap-2 flex-1 sm:w-40">
            <div className="p-1.5 bg-black/40 border border-white/5">
               <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            
            <div className="flex flex-col gap-2 flex-1">
              <div className="flex items-center justify-between text-[8px] font-black text-muted-foreground uppercase tracking-widest">
                <span>Speed Control</span>
                <span className="text-cyan-400">{speed.toFixed(1)}x</span>
              </div>
              <div 
                className="relative h-1.5 bg-zinc-800 rounded-none cursor-pointer group"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const ratio = x / rect.width;
                  const val = 0.5 + (ratio * 4.5);
                  onSpeedChange(Math.round(val * 10) / 10);
                }}
              >
                <div 
                  className="absolute h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                  style={{ width: `${((speed - 0.5) / 4.5) * 100}%` }}
                />
              </div>
            </div>
          </div>
          
          <Button 
            variant="outline" 
            className="rounded-none border-zinc-800 bg-black/40 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 hover:text-white text-muted-foreground/70 h-10 px-4"
            disabled
          >
            <Zap className="mr-2 h-3.5 w-3.5 text-yellow-500 fill-yellow-500/20" />
            V-Sync
          </Button>
        </div>
      </div>
    </div>
  );
}
