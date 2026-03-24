// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/auth-context';
import {
  CommandLineIcon,
  SparklesIcon,
  BookOpenIcon,
  CheckBadgeIcon,
  LockClosedIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CodeBracketIcon,
  BeakerIcon,
  CpuChipIcon,
  BoltIcon,
  RocketLaunchIcon,
  StarIcon,
  ArrowPathIcon,
  XMarkIcon,
} from '@/lib/icons';

const CodeEditor = dynamic(() => import('@/components/studio/IntegratedCodeRunner'), {
  ssr: false,
  loading: () => <div className="h-[350px] bg-black/20 animate-pulse rounded-none" />,
});

import { PROTOCOL_PHASES, type RunnerLanguage, type ProtocolModule, type ProtocolPhase } from '@/data/protocol';

type ModuleStatus = 'locked' | 'available' | 'completed';
type LangFilter = 'all' | 'javascript' | 'python' | 'html' | 'robotics';

const MODULE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  code: CodeBracketIcon,
  beaker: BeakerIcon,
  cpu: CpuChipIcon,
  bolt: BoltIcon,
  rocket: RocketLaunchIcon,
  star: StarIcon,
  book: BookOpenIcon,
};

function getModuleStatus(moduleId: string, completed: Set<string>): ModuleStatus {
  if (completed.has(moduleId)) return 'completed';
  return 'available';
}

export default function ProtocolPage() {
  const { profile, loading: authLoading } = useAuth();

  const [completedModules, setCompletedModules] = useState<Set<string>>(new Set());
  const [langFilter, setLangFilter] = useState<LangFilter>('all');
  const [activeModule, setActiveModule] = useState<{ phaseId: number; moduleId: string } | null>(null);
  const [studyTip, setStudyTip] = useState<string>('');
  const [tipLoading, setTipLoading] = useState(true);
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set([1]));

  // AI concept explanations
  const [aiExplaining, setAiExplaining] = useState<string | null>(null);
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [showExplanations, setShowExplanations] = useState<Set<string>>(new Set());

  // Code per module
  const [moduleCode, setModuleCode] = useState<Record<string, string>>({});

  useEffect(() => {
    // Load completed modules from localStorage
    try {
      const stored = localStorage.getItem('completed_protocols');
      if (stored) {
        setCompletedModules(new Set(JSON.parse(stored) as string[]));
      }
    } catch {
      // ignore
    }

    // Fetch AI study tip
    fetchStudyTip();
  }, []);

  async function fetchStudyTip() {
    setTipLoading(true);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom',
          prompt:
            'Give a short (2 sentences max) motivational study tip for a STEM student learning to code. Be encouraging and practical.',
        }),
      });
      const data = await res.json();
      if (data?.content) setStudyTip(data.content);
    } catch {
      setStudyTip('Every line of code you write is progress. Stay curious, keep building!');
    } finally {
      setTipLoading(false);
    }
  }

  function markModuleComplete(moduleId: string) {
    const next = new Set([...completedModules, moduleId]);
    setCompletedModules(next);
    try {
      localStorage.setItem('completed_protocols', JSON.stringify([...next]));
    } catch {
      // ignore
    }
    setActiveModule(null);
  }

  async function explainConcept(module: ProtocolModule) {
    setAiExplaining(module.id);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'custom',
          prompt: module.aiPrompt,
        }),
      });
      const data = await res.json();
      if (data?.content) {
        setAiExplanations((prev) => ({ ...prev, [module.id]: data.content }));
        setShowExplanations((prev) => new Set([...prev, module.id]));
      }
    } catch {
      // silent
    } finally {
      setAiExplaining(null);
    }
  }

  function toggleExplanation(id: string) {
    setShowExplanations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePhase(phaseId: number) {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  }

  const allModules = PROTOCOL_PHASES.flatMap((p) => p.modules);
  const totalModules = allModules.length;
  const completedCount = completedModules.size;
  const overallProgress = totalModules > 0 ? (completedCount / totalModules) * 100 : 0;

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/30 via-background to-background text-foreground overflow-hidden">
      
      {/* Background Orbs */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-600/10 blur-[120px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/2" />
      <div className="absolute top-40 left-0 w-[300px] h-[300px] bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none -translate-x-1/2" />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-10 sm:py-16">
        
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-10">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(6,182,212,0.3)] border border-white/10 flex-shrink-0">
              <CommandLineIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-1 drop-shadow-md">Rillcod Academy</p>
              <h1 className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70 uppercase tracking-tight mb-2 drop-shadow-sm">Protocol</h1>
              <p className="text-sm text-white/50 font-medium max-w-sm mt-1">Your structured path to mastery. Complete modules, earn XP, and level up.</p>
            </div>
          </div>
        </motion.div>

        {/* AI Study Tip Banner & Progress Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          
          {/* AI Tip */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="md:col-span-2 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/10 border border-violet-500/30 p-5 sm:p-6 rounded-3xl relative overflow-hidden backdrop-blur-xl group hover:border-violet-500/50 transition-colors shadow-[0_0_30px_rgba(139,92,246,0.1)] flex items-start gap-4">
            <div className="w-12 h-12 bg-violet-500/20 rounded-2xl flex items-center justify-center flex-shrink-0 border border-violet-500/30 shadow-inner">
              <SparklesIcon className="w-6 h-6 text-violet-400" />
            </div>
            <div className="flex-1 min-w-0 pr-8">
              <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-1.5 drop-shadow-md">AI Study Mentor</p>
              {tipLoading ? (
                <div className="space-y-2 mt-2">
                  <div className="h-3 bg-white/10 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-white/10 rounded animate-pulse w-1/2" />
                </div>
              ) : (
                <p className="text-sm text-white/80 leading-relaxed font-medium">{studyTip}</p>
              )}
            </div>
            <button
              onClick={fetchStudyTip}
              className="absolute top-5 right-5 p-2 bg-white/5 hover:bg-white/10 rounded-xl text-violet-400 transition-colors border border-transparent hover:border-violet-500/30"
              title="Get a new tip"
            >
              <ArrowPathIcon className={`w-4 h-4 ${tipLoading ? 'animate-spin' : ''}`} />
            </button>
          </motion.div>

          {/* Overall progress */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="bg-white/[0.02] border border-white/10 p-6 rounded-3xl backdrop-blur-xl flex flex-col justify-center relative overflow-hidden group shadow-sm hover:border-cyan-500/30 transition-colors">
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-cyan-500/10 blur-3xl rounded-full group-hover:bg-cyan-500/20 transition-colors pointer-events-none" />
            <div className="flex items-end justify-between mb-5 relative z-10">
              <div>
                <span className="text-[10px] font-black text-white/50 uppercase tracking-widest block mb-1">Overall Core</span>
                <span className="text-3xl font-black text-white tracking-tighter drop-shadow-md">
                  {overallProgress.toFixed(0)}<span className="text-lg text-cyan-400 ml-0.5">%</span>
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest block mb-1.5">Modules</span>
                <span className="text-xs font-bold text-white/70 bg-white/5 px-2.5 py-1 rounded-md border border-white/10">{completedCount} / {totalModules}</span>
              </div>
            </div>
            <div className="h-2.5 bg-black/50 rounded-full overflow-hidden border border-white/5 relative z-10 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(6,182,212,0.8)] rounded-full"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </motion.div>

        </div>

        {/* Language filter */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex gap-2 flex-wrap mb-10 pb-6 border-b border-white/10">
          {([
            { value: 'all', label: 'All Protocols' },
            { value: 'javascript', label: 'JavaScript' },
            { value: 'python', label: 'Python' },
            { value: 'html', label: 'HTML/CSS' },
            { value: 'robotics', label: 'Robotics' },
          ] as { value: LangFilter; label: string }[]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setLangFilter(value)}
              className={`px-5 py-2.5 text-[11px] font-black tracking-widest uppercase transition-all rounded-xl ${
                langFilter === value
                  ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                  : 'bg-white/[0.02] border border-white/5 text-white/40 hover:text-white/80 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </motion.div>

        {/* Phases */}
        <div className="space-y-4">
          {PROTOCOL_PHASES.map((phase) => {
            const phaseModules = phase.modules.filter(
              (m) => langFilter === 'all' || m.language === langFilter,
            );
            if (phaseModules.length === 0) return null;
            const phaseCompleted = phaseModules.filter((m) => completedModules.has(m.id)).length;
            const phaseProgress = (phaseCompleted / phaseModules.length) * 100;
            const isExpanded = expandedPhases.has(phase.id);

            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * phase.id }}
                key={phase.id}
                className={`bg-white/[0.02] backdrop-blur-md rounded-2xl border ${phase.color} shadow-sm overflow-hidden group hover:border-opacity-50 transition-colors`}
              >
                {/* Phase header */}
                <button
                  className="w-full flex items-center gap-4 sm:gap-6 p-5 sm:p-6 text-left transition-colors hover:bg-white/[0.02]"
                  onClick={() => togglePhase(phase.id)}
                >
                  {/* Phase number */}
                  <div
                    className={`w-14 h-14 flex-shrink-0 flex items-center justify-center rounded-2xl border ${phase.color} bg-black/40 text-2xl font-black ${phase.accentColor} shadow-inner group-hover:scale-105 transition-transform`}
                  >
                    {phase.id}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className={`text-lg sm:text-xl font-black uppercase tracking-tight ${phase.accentColor} drop-shadow-md`}>
                        Phase {phase.id}: {phase.name}
                      </h2>
                      {phaseCompleted === phaseModules.length && (
                        <CheckBadgeIcon className="w-5 h-5 text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-white/50 font-medium mb-3">{phase.subtitle}</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/5 shadow-inner relative">
                        <div
                          className={`h-full transition-all duration-1000 ease-out rounded-full shadow-[0_0_10px_currentColor] ${
                            phase.id === 1
                              ? 'bg-emerald-500'
                              : phase.id === 2
                              ? 'bg-blue-500'
                              : phase.id === 3
                              ? 'bg-violet-500'
                              : phase.id === 4
                              ? 'bg-amber-500'
                              : phase.id === 5
                              ? 'bg-orange-500'
                              : phase.id === 6
                              ? 'bg-rose-500'
                              : 'bg-fuchsia-500'
                          }`}
                          style={{ width: `${phaseProgress}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/40 flex-shrink-0">
                        {phaseModules.length > 0 ? `${phaseCompleted}/${phaseModules.length}` : '0/0'}
                      </span>
                    </div>
                  </div>

                  <ChevronRightIcon
                    className={`w-5 h-5 text-white/30 transition-transform duration-300 flex-shrink-0 group-hover:text-white/60 ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {/* Phase modules */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-white/5 bg-black/20 origin-top overflow-hidden">
                      {phaseModules.map((module, moduleIndex) => {

                        const status = getModuleStatus(module.id, completedModules);
                        const isActive =
                          activeModule?.phaseId === phase.id &&
                          activeModule?.moduleId === module.id;
                        const IconComponent = MODULE_ICONS[module.icon] || CodeBracketIcon;

                        return (
                          <div key={module.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.01] transition-colors">
                            {/* Module row */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 sm:px-6 py-4">
                              <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div
                                  className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl border ${
                                    status === 'completed'
                                      ? 'bg-emerald-500/10 border-emerald-500/30'
                                      : status === 'locked'
                                      ? 'bg-white/5 border-white/10'
                                      : 'bg-violet-500/10 border-violet-500/30'
                                  }`}
                                >
                                  {status === 'completed' ? (
                                    <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
                                  ) : status === 'locked' ? (
                                    <LockClosedIcon className="w-5 h-5 text-white/20" />
                                  ) : (
                                    <IconComponent className={`w-5 h-5 ${phase.accentColor}`} />
                                  )}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <p
                                    className={`text-sm sm:text-base font-black uppercase tracking-wider ${
                                      status === 'locked' ? 'text-white/30' : 'text-white/90 drop-shadow-sm'
                                    }`}
                                  >
                                    Module {moduleIndex + 1}: {module.title}
                                  </p>
                                  <p className="text-xs text-white/50 font-medium leading-snug mt-1">{module.description}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 flex-shrink-0 ml-14 sm:ml-0 mt-2 sm:mt-0">
                                {status === 'completed' && (
                                  <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-[10px] uppercase font-black tracking-widest">
                                    Done
                                  </span>
                                )}
                                {status !== 'locked' && (
                                  <button
                                    onClick={() =>
                                      setActiveModule(
                                        isActive
                                          ? null
                                          : { phaseId: phase.id, moduleId: module.id }
                                      )
                                    }
                                    className={`flex items-center gap-2 px-6 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border ${
                                      isActive
                                        ? 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                                        : 'bg-gradient-to-r from-violet-600 to-indigo-600 border-indigo-500/50 text-white shadow-[0_0_15px_rgba(139,92,246,0.3)] hover:from-violet-500 hover:to-indigo-500 hover:-translate-y-0.5 transform active:translate-y-0'
                                    }`}
                                  >
                                    {isActive ? (
                                      <>
                                        <XMarkIcon className="w-3 h-3" />
                                        Close
                                      </>
                                    ) : (
                                      <>
                                        <CodeBracketIcon className="w-3 h-3" />
                                        Practice
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Expanded practice panel */}
                            <AnimatePresence>
                              {isActive && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-white/5 bg-black/60 overflow-hidden shadow-inner">
                                  {/* Code editor */}
                                  <div className="p-4 sm:p-6 pb-0">
                                    <div className="border border-white/10 rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                                      <CodeEditor
                                        value={moduleCode[module.id] ?? module.starterCode}
                                        onChange={(v) =>
                                          setModuleCode((prev) => ({
                                            ...prev,
                                            [module.id]: v || '',
                                          }))
                                        }
                                        language={module.language}
                                        height={350}
                                        title={module.title}
                                        showHeader={true}
                                      />
                                    </div>
                                  </div>

                                  {/* Actions */}
                                  <div className="px-4 sm:px-6 py-5 flex flex-wrap items-center gap-4">
                                    <button
                                      onClick={() =>
                                        aiExplanations[module.id]
                                          ? toggleExplanation(module.id)
                                          : explainConcept(module)
                                      }
                                      disabled={aiExplaining === module.id}
                                      className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-violet-400 bg-violet-500/10 border border-violet-500/30 hover:bg-violet-500/20 hover:border-violet-500/50 hover:text-violet-300 transition-all rounded-xl disabled:opacity-50"
                                    >
                                      <SparklesIcon className="w-4 h-4" />
                                      {aiExplaining === module.id
                                        ? 'Thinking...'
                                        : aiExplanations[module.id]
                                        ? showExplanations.has(module.id)
                                          ? 'Hide AI Intel'
                                          : 'Show AI Intel'
                                        : 'Analyze Code with AI'}
                                    </button>

                                    {status !== 'completed' && (
                                      <button
                                        onClick={() => markModuleComplete(module.id)}
                                        className="flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-widest bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)] rounded-xl transition-all ml-auto transform hover:-translate-y-0.5 active:translate-y-0"
                                      >
                                        <CheckBadgeIcon className="w-4 h-4" />
                                        Complete Module
                                      </button>
                                    )}
                                  </div>

                                  {/* AI Explanation */}
                                  <AnimatePresence>
                                    {aiExplanations[module.id] &&
                                      showExplanations.has(module.id) && (
                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mx-4 sm:mx-6 mb-6 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 border border-violet-500/20 p-5 rounded-2xl shadow-inner backdrop-blur-sm relative overflow-hidden">
                                          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 blur-2xl rounded-full pointer-events-none" />
                                          <div className="flex items-center gap-3 mb-3 relative z-10">
                                            <div className="w-8 h-8 flex items-center justify-center bg-violet-500/20 border border-violet-500/30 rounded-lg">
                                              <SparklesIcon className="w-4 h-4 text-violet-400" />
                                            </div>
                                            <span className="text-[11px] font-black text-violet-300 uppercase tracking-widest drop-shadow-md">
                                              AI Diagnostics
                                            </span>
                                          </div>
                                          <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap font-medium relative z-10">
                                            {aiExplanations[module.id]}
                                          </p>
                                        </motion.div>
                                      )}
                                  </AnimatePresence>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Completion celebration */}
        {completedCount === totalModules && totalModules > 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-8 bg-gradient-to-r from-violet-600/10 to-amber-500/10 border border-amber-500/30 p-8 text-center rounded-3xl backdrop-blur-xl shadow-[0_0_30px_rgba(245,158,11,0.1)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-3xl rounded-full" />
            <CheckBadgeIcon className="w-16 h-16 text-amber-400 mx-auto mb-4 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]" />
            <h2 className="text-2xl font-black text-white mb-2 tracking-tight uppercase">Protocol Complete!</h2>
            <p className="text-white/60 font-medium max-w-lg mx-auto leading-relaxed">
              You have mastered all {totalModules} modules! You now possess the core knowledge required to build modern, scalable engineering solutions.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
