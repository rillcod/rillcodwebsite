// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const [studyTip, setStudyTip] = useState<string>('Every line of code you write is progress. Stay curious, keep building!');
  const [tipLoading, setTipLoading] = useState(true);
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set([1]));

  // AI concept explanations
  const [aiExplaining, setAiExplaining] = useState<string | null>(null);
  const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});
  const [showExplanations, setShowExplanations] = useState<Set<string>>(new Set());

  // Code per module
  const [moduleCode, setModuleCode] = useState<Record<string, string>>({});

  const fetchStudyTip = useCallback(async () => {
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
      // fallback handled by initial state
    } finally {
      setTipLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('completed_protocols');
      if (stored) {
        setCompletedModules(new Set(JSON.parse(stored) as string[]));
      }
    } catch { /* ignore */ }
    fetchStudyTip();
  }, [fetchStudyTip]);

  function markModuleComplete(moduleId: string) {
    const next = new Set([...completedModules, moduleId]);
    setCompletedModules(next);
    try {
      localStorage.setItem('completed_protocols', JSON.stringify([...next]));
    } catch { /* ignore */ }
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
    } catch { /* silent */ }
    finally { setAiExplaining(null); }
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
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-900/20 via-background to-background text-foreground overflow-hidden selection:bg-orange-500/30">
      
      {/* Background Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[10%] right-[-5%] w-[35%] h-[35%] bg-amber-500/10 blur-[100px] rounded-full" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-10 sm:py-16">
        
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(249,115,22,0.3)] border border-white/10 flex-shrink-0">
              <CommandLineIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1 drop-shadow-md">Rillcod Academy</p>
              <h1 className="text-4xl sm:text-5xl font-black text-white uppercase tracking-tight mb-2 drop-shadow-sm">Protocol</h1>
              <p className="text-sm text-white/50 font-medium max-w-sm mt-1">Industrial path to software mastery. Build the future.</p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Total Mastery</span>
              <span className="text-xl font-black text-orange-400 drop-shadow-[0_0_10px_rgba(249,115,22,0.5)]">{Math.round(overallProgress)}%</span>
            </div>
            <div className="w-48 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${overallProgress}%` }}
                className="h-full bg-gradient-to-r from-orange-500 to-amber-400 shadow-[0_0_10px_rgba(249,115,22,0.5)]"
              />
            </div>
          </div>
        </motion.div>

        {/* AI Mentor Banner */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-12 p-6 rounded-3xl bg-gradient-to-r from-orange-600/10 to-amber-500/5 border border-orange-500/20 backdrop-blur-xl relative overflow-hidden group shadow-2xl hover:border-orange-500/40 transition-all duration-500 flex items-start gap-5"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 blur-[60px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/2 group-hover:bg-orange-500/20 transition-all duration-700" />
          <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-orange-500/20 border border-orange-500/30 rounded-xl relative z-10">
            <SparklesIcon className="w-6 h-6 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0 relative z-10 pt-1 pr-8">
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="text-xs font-black text-orange-400 uppercase tracking-widest drop-shadow-md">AI Instructor</h3>
              <div className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded text-[9px] text-emerald-400 uppercase font-black tracking-widest">Active Intel</div>
            </div>
            {tipLoading ? (
              <div className="space-y-2 py-1">
                <div className="h-3 bg-white/5 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-white/5 rounded animate-pulse w-1/2" />
              </div>
            ) : (
              <p className="text-sm text-white/80 leading-relaxed font-semibold italic">"{studyTip}"</p>
            )}
          </div>
          <button
            onClick={fetchStudyTip}
            className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/40 hover:text-orange-400 transition-all border border-transparent hover:border-orange-500/30 active:scale-95"
          >
            <ArrowPathIcon className={`w-4 h-4 ${tipLoading ? 'animate-spin' : ''}`} />
          </button>
        </motion.div>

        {/* Language filters */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="flex flex-wrap gap-2 mb-10 overflow-x-auto pb-4 scrollbar-hide border-b border-white/5">
          {([
            { value: 'all', label: 'All Protocols' },
            { value: 'javascript', label: 'JS Neural' },
            { value: 'python', label: 'Python Core' },
            { value: 'html', label: 'Web Engine' },
            { value: 'robotics', label: 'Hardware Lab' },
          ] as { value: LangFilter; label: string }[]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setLangFilter(value)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                langFilter === value
                  ? 'bg-orange-500 border-orange-400 text-white shadow-[0_0_20px_rgba(249,115,22,0.4)]'
                  : 'bg-white/[0.03] border-white/5 text-white/40 hover:text-white/80 hover:border-white/20 hover:bg-white/[0.06]'
              }`}
            >
              {label}
            </button>
          ))}
        </motion.div>

        {/* Phases */}
        <div className="space-y-6">
          {PROTOCOL_PHASES.map((phase) => {
            const phaseModules = phase.modules.filter(
              (m) => langFilter === 'all' || m.language === langFilter,
            );
            if (phaseModules.length === 0) return null;
            
            const phaseCompletedCount = phaseModules.filter((m) => completedModules.has(m.id)).length;
            const phaseProgress = (phaseCompletedCount / phaseModules.length) * 100;
            const isExpanded = expandedPhases.has(phase.id);

            return (
              <motion.div
                key={phase.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`group rounded-3xl border transition-all duration-500 overflow-hidden ${
                  isExpanded ? 'bg-white/[0.03] border-white/10 shadow-2xl' : 'bg-white/[0.01] border-white/5 hover:bg-white/[0.02] hover:border-white/10'
                }`}
              >
                <button
                  className="w-full flex items-center gap-6 p-6 text-left"
                  onClick={() => togglePhase(phase.id)}
                >
                  <div className={`w-14 h-14 flex-shrink-0 flex items-center justify-center rounded-2xl border transition-all duration-500 ${
                    phaseCompletedCount === phaseModules.length
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : isExpanded ? 'bg-orange-500 border-orange-400 text-white shadow-[0_0_20px_rgba(249,115,22,0.3)]' : 'bg-white/5 border-white/10 text-white/20'
                  }`}>
                    <span className="text-xl font-black uppercase">{phase.id}</span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className={`text-xl font-black uppercase tracking-tight ${phaseCompletedCount === phaseModules.length ? 'text-emerald-400' : 'text-white'}`}>
                        Phase {phase.id}: {phase.name}
                      </h2>
                      {phaseCompletedCount === phaseModules.length && (
                        <CheckBadgeIcon className="w-5 h-5 text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-xs text-white/40 font-black uppercase tracking-widest">{phaseModules.length} Modules</p>
                      <div className="flex items-center gap-2 flex-1 max-w-[120px]">
                        <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-700 ${phaseCompletedCount === phaseModules.length ? 'bg-emerald-500' : 'bg-orange-500'}`} style={{ width: `${phaseProgress}%` }} />
                        </div>
                        <span className="text-[9px] font-black text-white/30 truncate">{Math.round(phaseProgress)}%</span>
                      </div>
                    </div>
                  </div>

                  <ChevronRightIcon className={`w-5 h-5 text-white/20 transition-transform duration-500 ${isExpanded ? 'rotate-90' : ''}`} />
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-white/5 bg-black/40"
                    >
                      {phaseModules.map((module, idx) => {
                        const status = getModuleStatus(module.id, completedModules);
                        const isActive = activeModule?.moduleId === module.id;
                        const Icon = MODULE_ICONS[module.icon] || CodeBracketIcon;

                        return (
                          <div key={module.id} className="border-b border-white/5 last:border-b-0">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 sm:px-8">
                              <div className="flex items-center gap-5 flex-1 min-w-0">
                                <div className={`w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl border transition-all ${
                                  status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/10 text-white/20'
                                }`}>
                                  {status === 'completed' ? <CheckCircleIcon className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                                </div>
                                <div>
                                  <p className="text-sm font-black uppercase tracking-wider text-white/90">
                                    {idx + 1}. {module.title}
                                  </p>
                                  <p className="text-xs text-white/40 font-medium line-clamp-1">{module.description}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 ml-16 sm:ml-0">
                                {status === 'completed' && (
                                  <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-[9px] font-black uppercase tracking-widest">
                                    Mastered
                                  </span>
                                )}
                                <button
                                  onClick={() => setActiveModule(isActive ? null : { phaseId: phase.id, moduleId: module.id })}
                                  className={`px-6 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border ${
                                    isActive
                                      ? 'bg-white/10 border-white/20 text-white'
                                      : 'bg-gradient-to-r from-orange-600 to-amber-600 border-orange-500/50 text-white shadow-xl hover:translate-x-1'
                                  }`}
                                >
                                  {isActive ? 'Close' : status === 'completed' ? 'Review' : 'Engage'}
                                </button>
                              </div>
                            </div>

                            <AnimatePresence>
                              {isActive && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-white/5 overflow-hidden">
                                  <div className="p-5 sm:p-8">
                                    <div className="rounded-2xl border border-white/10 overflow-hidden shadow-2xl mb-6">
                                      <CodeEditor
                                        value={moduleCode[module.id] ?? module.starterCode}
                                        onChange={(v) => setModuleCode(prev => ({ ...prev, [module.id]: v || '' }))}
                                        language={module.language}
                                        height={400}
                                        title={module.title}
                                        showHeader={true}
                                      />
                                    </div>

                                    <div className="flex flex-wrap items-center gap-4">
                                      <button
                                        onClick={() => aiExplanations[module.id] ? toggleExplanation(module.id) : explainConcept(module)}
                                        disabled={aiExplaining === module.id}
                                        className="flex items-center gap-2 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-orange-400 bg-orange-500/10 border border-orange-500/30 rounded-xl hover:bg-orange-500/20 transition-all disabled:opacity-50"
                                      >
                                        <SparklesIcon className="w-4 h-4" />
                                        {aiExplaining === module.id ? 'Analyzing...' : aiExplanations[module.id] ? (showExplanations.has(module.id) ? 'Hide Logic' : 'Show Logic') : 'Explain Logic'}
                                      </button>
                                      
                                      {status !== 'completed' && (
                                        <button
                                          onClick={() => markModuleComplete(module.id)}
                                          className="flex items-center gap-2 px-6 py-2.5 text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.4)] ml-auto hover:scale-105 transition-transform"
                                        >
                                          <CheckBadgeIcon className="w-4 h-4" />
                                          Master Module
                                        </button>
                                      )}
                                    </div>

                                    <AnimatePresence>
                                      {aiExplanations[module.id] && showExplanations.has(module.id) && (
                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 p-6 bg-orange-500/5 border border-orange-500/20 rounded-2xl relative overflow-hidden backdrop-blur-xl">
                                          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 blur-3xl rounded-full" />
                                          <div className="flex items-center gap-3 mb-3 relative z-10">
                                            <SparklesIcon className="w-4 h-4 text-orange-400" />
                                            <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Protocol Intelligence</span>
                                          </div>
                                          <p className="text-sm text-white/70 leading-relaxed relative z-10 whitespace-pre-wrap">{aiExplanations[module.id]}</p>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
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

        {/* Completion Milestone */}
        {completedCount === totalModules && totalModules > 0 && (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-16 p-10 bg-gradient-to-br from-orange-600/20 to-amber-600/10 border border-orange-500/30 rounded-[2.5rem] text-center backdrop-blur-3xl relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-orange-500/10 to-transparent scale-150" />
            <CheckBadgeIcon className="w-20 h-20 text-orange-400 mx-auto mb-6 drop-shadow-[0_0_20px_rgba(249,115,22,0.6)]" />
            <h2 className="text-4xl font-black text-white uppercase tracking-tight mb-4">Protocol Fully Encrypted</h2>
            <p className="text-white/60 max-w-xl mx-auto font-medium text-lg leading-relaxed">
              You have successfully navigated all industrial phases. You are now designated as a Rillcod Architect.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
