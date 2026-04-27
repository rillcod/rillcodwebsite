'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Download, 
  Settings2,
  Maximize2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Zap,
  Activity,
  Layers,
  CircleDot
} from 'lucide-react';
import { toPng } from 'html-to-image';
import VisualizationControls from './VisualizationControls';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Types for Visualization
export type VisualizationType = 'sorting' | 'physics' | 'turtle' | 'loops' | 'stateMachine';

export interface CodeData {
  step: number;
  totalSteps: number;
  currentLine?: number;
  variables: Record<string, any>;
  visualizationState: any;
}

interface CodeVisualizerProps {
  visualizationType: VisualizationType;
  codeData: CodeData;
  className?: string;
  onStepChange?: (step: number) => void;
  onSpeedChange?: (speed: number) => void;
  speed?: number;
}

// Dynamic import of P5 with no SSR
const P5Wrapper = dynamic<any>(() => import('./P5Wrapper'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[500px] flex items-center justify-center bg-zinc-950/50 backdrop-blur-xl border border-zinc-800 animate-pulse">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-cyan-500 font-bold uppercase tracking-widest text-xs">Initializing Quantum Canvas...</span>
      </div>
    </div>
  )
});

/**
 * CodeVisualizer - A premium educational component for visualizing code execution logic.
 */
export default function CodeVisualizer({
  visualizationType,
  codeData,
  className,
  onStepChange,
  onSpeedChange,
  speed = 1
}: CodeVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(codeData.step);
  const [playbackSpeed, setPlaybackSpeed] = useState(speed);
  const [showMetrics, setShowMetrics] = useState(true);
  // Stable ref so the interval closure never captures a stale callback
  const onStepChangeRef = useRef(onStepChange);
  onStepChangeRef.current = onStepChange;

  // Synchronize internal step with prop step
  useEffect(() => {
    setCurrentStep(codeData.step);
  }, [codeData.step]);

  // Playback loop — uses functional setState so currentStep is NOT a dependency,
  // which means the interval is NOT recreated on every tick.
  useEffect(() => {
    if (!isPlaying) return;
    const totalSteps = codeData.totalSteps;
    const interval = setInterval(() => {
      setCurrentStep(prev => {
        if (prev >= totalSteps - 1) {
          setIsPlaying(false);
          return prev;
        }
        const next = prev + 1;
        onStepChangeRef.current?.(next);
        return next;
      });
    }, 1000 / playbackSpeed);
    return () => clearInterval(interval);
  }, [isPlaying, codeData.totalSteps, playbackSpeed]);

  const handleExport = async () => {
    if (!containerRef.current) return;
    try {
      const dataUrl = await toPng(containerRef.current, { cacheBust: true });
      const link = document.createElement('a');
      link.download = `drillcod-${visualizationType}-snapshot.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Export failed', err);
    }
  };

  const getVisualTitle = (type: VisualizationType) => {
    switch (type) {
      case 'sorting': return 'Algorithmic Complexity';
      case 'physics': return 'Vector Dynamics';
      case 'turtle': return 'Geometric Logic';
      case 'loops': return 'Iterative Expansion';
      case 'stateMachine': return 'Logic Transitions';
      default: return 'Code Visualizer';
    }
  };

  const getVisualIcon = (type: VisualizationType) => {
    switch (type) {
      case 'sorting': return <Activity className="w-4 h-4 text-cyan-400" />;
      case 'physics': return <Zap className="w-4 h-4 text-purple-400" />;
      case 'turtle': return <Sparkles className="w-4 h-4 text-lime-400" />;
      case 'loops': return <Layers className="w-4 h-4 text-pink-400" />;
      case 'stateMachine': return <CircleDot className="w-4 h-4 text-primary" />;
      default: return null;
    }
  };

  return (
    <Card className={cn(
      "relative flex flex-col overflow-hidden bg-zinc-950 border-zinc-800 rounded-xl shadow-2xl group/visualizer",
      className
    )}>
      {/* Premium Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800/50 z-20">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-8 h-8 rounded-xl bg-zinc-800 flex items-center justify-center border border-white/10 shadow-lg group-hover/visualizer:border-cyan-500/50 transition-all duration-500">
            {getVisualIcon(visualizationType)}
          </div>
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 leading-none mb-1">Drillcod Visual Engine</h3>
            <h2 className="text-xs font-black uppercase text-white tracking-widest leading-none drop-shadow-sm flex items-center gap-2">
              {getVisualTitle(visualizationType)}
              <Badge variant="outline" className="rounded-xl h-4 text-[8px] border-zinc-700 text-muted-foreground bg-transparent uppercase tracking-widest font-black">
                P5.v2
              </Badge>
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setShowMetrics(!showMetrics)}
            className="w-8 h-8 text-muted-foreground/70 hover:text-white hover:bg-white/5 transition-all"
          >
            <Settings2 className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleExport}
            className="w-8 h-8 text-muted-foreground/70 hover:text-white hover:bg-white/5 transition-all"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div ref={containerRef} className="relative w-full aspect-video sm:h-[400px] md:h-[500px] bg-background overflow-hidden group/canvas">
        <P5Wrapper 
          type={visualizationType} 
          data={codeData} 
          isPlaying={isPlaying} 
          speed={playbackSpeed}
        />

        {/* HUD Elements */}
        {showMetrics && (
          <AnimatePresence>
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute left-6 top-6 z-10 flex flex-col gap-3 pointer-events-none"
            >
              <div className="p-3 bg-zinc-950/80 backdrop-blur-xl border border-white/5 shadow-2xl border-l-2 border-l-cyan-500 space-y-1">
                <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Execution Registry</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-black text-white tabular-nums">
                    {String(currentStep + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[10px] text-white/30 font-black">/ {String(codeData.totalSteps).padStart(2, '0')} STPS</span>
                </div>
              </div>

              {Object.entries(codeData.variables).length > 0 && (
                <div className="p-3 bg-zinc-950/80 backdrop-blur-xl border border-white/5 shadow-2xl border-l-2 border-l-purple-500 space-y-2">
                  <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Memory Heap</p>
                  <div className="grid grid-cols-1 gap-1">
                    {Object.entries(codeData.variables).map(([key, val]) => (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-white/50">{key}:</span>
                        <span className="text-[10px] font-black text-white px-1.5 py-0.5 bg-white/5 border border-white/10 tabular-nums">
                          {typeof val === 'number'
                            ? (Number.isInteger(val) ? String(val) : val.toFixed(1))
                            : String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Execution Pointer Overlay (Minimal) */}
        {codeData.currentLine !== undefined && (
          <div className="absolute right-6 top-6 px-3 py-1.5 bg-rose-500/10 border border-rose-500/30 backdrop-blur-md">
            <p className="text-[9px] font-black text-rose-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              Line {codeData.currentLine} Active
            </p>
          </div>
        )}
      </div>

      {/* Control Surface */}
      <VisualizationControls
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        onNext={() => {
          const next = Math.min(currentStep + 1, codeData.totalSteps - 1);
          setCurrentStep(next);
          onStepChange?.(next);
        }}
        onPrev={() => {
          const prev = Math.max(currentStep - 1, 0);
          setCurrentStep(prev);
          onStepChange?.(prev);
        }}
        onRestart={() => {
          setCurrentStep(0);
          onStepChange?.(0);
          setIsPlaying(false);
        }}
        onSpeedChange={(val: number) => {
          setPlaybackSpeed(val);
          onSpeedChange?.(val);
        }}
        currentStep={currentStep}
        totalSteps={codeData.totalSteps}
        speed={playbackSpeed}
      />
    </Card>
  );
}

/**
 * Usage Example (in comments as requested):
 * 
 * ```tsx
 * import CodeVisualizer from '@/components/visualizer/CodeVisualizer';
 * 
 * const [step, setStep] = useState(0);
 * const data = {
 *   step: step,
 *   totalSteps: 10,
 *   currentLine: 4,
 *   variables: { i: 5, pivot: 24, temp: 12 },
 *   visualizationState: { array: [24, 12, 5, 42, 1, 9], comparing: [0, 1] }
 * };
 * 
 * <CodeVisualizer 
 *    visualizationType="sorting" 
 *    codeData={data} 
 *    onStepChange={(s) => setStep(s)}
 * />
 * ```
 */
