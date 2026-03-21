// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
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
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-cyan-500/15 flex items-center justify-center rounded-none">
            <CommandLineIcon className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Protocol</h1>
            <p className="text-sm text-muted-foreground">Your structured path to mastery</p>
          </div>
        </div>

        {/* AI Study Tip Banner */}
        <div className="bg-violet-500/5 border border-violet-500/20 px-4 py-3 mb-6 flex items-start gap-3">
          <SparklesIcon className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            {tipLoading ? (
              <div className="h-4 bg-white/5 animate-pulse rounded w-3/4" />
            ) : (
              <p className="text-sm text-violet-200 leading-relaxed">{studyTip}</p>
            )}
          </div>
          <button
            onClick={fetchStudyTip}
            className="flex-shrink-0 p-1 text-violet-400 hover:text-violet-300 transition-colors"
            title="New tip"
          >
            <ArrowPathIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Overall progress */}
        <div className="bg-card border border-border p-4 mb-8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-sm font-black text-foreground">Overall Progress</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {completedCount} / {totalModules} modules
              </span>
            </div>
            <span className="text-sm font-black text-violet-400">
              {overallProgress.toFixed(0)}%
            </span>
          </div>
          <div className="h-2 bg-white/5 rounded-none overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-600 to-cyan-500 transition-all duration-700"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        {/* Language filter */}
        <div className="flex gap-1 flex-wrap mb-6">
          {([
            { value: 'all', label: 'All Languages' },
            { value: 'javascript', label: 'JavaScript' },
            { value: 'python', label: 'Python' },
            { value: 'html', label: 'HTML' },
            { value: 'robotics', label: 'Robotics' },
          ] as { value: LangFilter; label: string }[]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setLangFilter(value)}
              className={`px-3 py-2 text-xs font-bold transition-colors rounded-none border ${
                langFilter === value
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

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
              <div
                key={phase.id}
                className={`bg-card border ${phase.color}`}
              >
                {/* Phase header */}
                <button
                  className="w-full flex items-center gap-4 p-5 text-left"
                  onClick={() => togglePhase(phase.id)}
                >
                  {/* Phase number */}
                  <div
                    className={`w-12 h-12 flex-shrink-0 flex items-center justify-center border ${phase.color} text-2xl font-black ${phase.accentColor}`}
                  >
                    {phase.id}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h2 className={`text-base font-black ${phase.accentColor}`}>
                        Phase {phase.id}: {phase.name}
                      </h2>
                      {phaseCompleted === phaseModules.length && (
                        <CheckBadgeIcon className="w-4 h-4 text-emerald-400" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{phase.subtitle}</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-white/5 rounded-none overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            phase.id === 1
                              ? 'bg-emerald-500'
                              : phase.id === 2
                              ? 'bg-blue-500'
                              : phase.id === 3
                              ? 'bg-violet-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${phaseProgress}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {phaseCompleted}/{phaseModules.length}
                      </span>
                    </div>
                  </div>

                  <ChevronRightIcon
                    className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {/* Phase modules */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {phaseModules.map((module, moduleIndex) => {

                      const status = getModuleStatus(module.id, completedModules);
                      const isActive =
                        activeModule?.phaseId === phase.id &&
                        activeModule?.moduleId === module.id;
                      const IconComponent = MODULE_ICONS[module.icon] || CodeBracketIcon;

                      return (
                        <div key={module.id} className="border-b border-border last:border-b-0">
                          {/* Module row */}
                          <div className="flex items-center gap-3 px-5 py-3">
                            <div
                              className={`w-8 h-8 flex-shrink-0 flex items-center justify-center ${
                                status === 'completed'
                                  ? 'bg-emerald-500/15'
                                  : status === 'locked'
                                  ? 'bg-white/5'
                                  : 'bg-violet-500/10'
                              }`}
                            >
                              {status === 'completed' ? (
                                <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                              ) : status === 'locked' ? (
                                <LockClosedIcon className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <IconComponent className={`w-4 h-4 ${phase.accentColor}`} />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm font-bold ${
                                  status === 'locked' ? 'text-muted-foreground' : 'text-foreground'
                                }`}
                              >
                                {moduleIndex + 1}. {module.title}
                              </p>
                              <p className="text-xs text-muted-foreground">{module.description}</p>
                            </div>

                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {status === 'completed' && (
                                <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-400 text-xs font-bold">
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
                                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-none transition-all ${
                                    isActive
                                      ? 'bg-white/5 border border-border text-muted-foreground'
                                      : `bg-violet-600 hover:bg-violet-500 text-white`
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
                          {isActive && (
                            <div className="border-t border-border bg-background/50">
                              {/* Code editor */}
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

                              {/* Actions */}
                              <div className="px-4 py-3 border-t border-border flex flex-wrap items-center gap-3">
                                <button
                                  onClick={() =>
                                    aiExplanations[module.id]
                                      ? toggleExplanation(module.id)
                                      : explainConcept(module)
                                  }
                                  disabled={aiExplaining === module.id}
                                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-violet-400 border border-violet-500/30 hover:bg-violet-500/5 transition-all rounded-none disabled:opacity-50"
                                >
                                  <SparklesIcon className="w-3.5 h-3.5" />
                                  {aiExplaining === module.id
                                    ? 'Thinking...'
                                    : aiExplanations[module.id]
                                    ? showExplanations.has(module.id)
                                      ? 'Hide Explanation'
                                      : 'Show Explanation'
                                    : 'AI Explain This Concept'}
                                </button>

                                {status !== 'completed' && (
                                  <button
                                    onClick={() => markModuleComplete(module.id)}
                                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-none transition-all ml-auto"
                                  >
                                    <CheckBadgeIcon className="w-3.5 h-3.5" />
                                    Mark Complete
                                  </button>
                                )}
                                {status === 'completed' && (
                                  <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                                    <CheckBadgeIcon className="w-4 h-4" />
                                    Module Complete!
                                  </span>
                                )}
                              </div>

                              {/* AI Explanation */}
                              {aiExplanations[module.id] &&
                                showExplanations.has(module.id) && (
                                  <div className="mx-4 mb-4 bg-violet-500/5 border border-violet-500/20 px-4 py-3">
                                    <div className="flex items-center gap-2 mb-2">
                                      <SparklesIcon className="w-4 h-4 text-violet-400" />
                                      <span className="text-xs font-bold text-violet-400 uppercase tracking-wider">
                                        AI Explanation
                                      </span>
                                    </div>
                                    <p className="text-sm text-violet-200 leading-relaxed whitespace-pre-wrap">
                                      {aiExplanations[module.id]}
                                    </p>
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Completion celebration */}
        {completedCount === totalModules && totalModules > 0 && (
          <div className="mt-8 bg-gradient-to-r from-violet-500/10 to-amber-500/10 border border-amber-500/30 p-6 text-center">
            <CheckBadgeIcon className="w-12 h-12 text-amber-400 mx-auto mb-3" />
            <h2 className="text-xl font-black text-foreground mb-1">Protocol Complete!</h2>
            <p className="text-muted-foreground text-sm">
              You have mastered all {totalModules} modules. You are ready to build the future!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
