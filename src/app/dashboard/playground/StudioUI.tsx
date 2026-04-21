'use client';
// ─── StudioUI — full playground render ───────────────────────
// Props are passed down from page.tsx (CodeStudioPage)
import { motion, AnimatePresence } from 'framer-motion';
import {
  CodeBracketIcon, PlayIcon, TrashIcon, PlusIcon,
  CloudArrowUpIcon, Squares2X2Icon, CommandLineIcon,
  BeakerIcon, RocketLaunchIcon, SparklesIcon,
  ArrowPathIcon, XMarkIcon, ChevronLeftIcon,
  ChevronRightIcon, ClockIcon, BookOpenIcon,
  ClipboardDocumentListIcon, EyeIcon, GlobeAltIcon,
  PuzzlePieceIcon, DocumentTextIcon, CheckCircleIcon,
  ArrowUpTrayIcon, StarIcon, CalendarIcon,
  TrophyIcon, FireIcon, BoltIcon, ChartBarIcon,
} from '@/lib/icons';
import dynamic from 'next/dynamic';
import IntegratedCodeRunner from '@/components/studio/IntegratedCodeRunner';

const BlocklyEditor     = dynamic(() => import('@/components/studio/BlocklyEditor'),     { ssr: false });
const ScratchSynthesisLab = dynamic(() => import('@/components/studio/ScratchSynthesisLab'), { ssr: false });

export interface StudioUIProps {
  // identity
  profile: any;
  isTeacher: boolean;
  // lang / editor
  lang: string;
  activeLang: any;
  editorMode: 'code' | 'blocks';
  code: string;
  blocksXml: string;
  running: boolean;
  consoleLogs: string[];
  robotCmds: any[];
  isPyodideLoading: boolean;
  copiedCode: boolean;
  // projects
  projects: any[];
  activeProject: any;
  isSaving: boolean;
  // assignment
  assignmentId: string | null;
  lessonId: string | null;
  assignmentData: any;
  mySubmission: any;
  submittingAssignment: boolean;
  assignmentSubmitted: boolean;
  pendingTasks: any[];
  // gamification
  userPoints: any;
  levelInfo: any;
  leaderboard: any[];
  runStreak: number;
  totalRuns: number;
  showLeaderboard: boolean;
  // ui
  sidebarOpen: boolean;
  view: 'editor' | 'output' | 'explorer' | 'canvas';
  device: 'desktop' | 'mobile';
  liveUpdate: boolean;
  terminalHeight: number;
  showAIModal: boolean;
  aiPrompt: string;
  isAIGenerating: boolean;
  // data
  LANGUAGES: any[];
  LAB_EXAMPLES: any;
  HTML_SNIPPETS: any[];
  // handlers
  setCode: (c: string | ((prev: string) => string)) => void;
  setBlocksXml: (x: string) => void;
  setEditorMode: (m: 'code' | 'blocks') => void;
  setLang: (l: string) => void;
  setSidebarOpen: (o: boolean) => void;
  setView: (v: 'editor' | 'output' | 'explorer' | 'canvas') => void;
  setDevice: (d: 'desktop' | 'mobile') => void;
  setLiveUpdate: (v: boolean) => void;
  setShowLeaderboard: (v: boolean) => void;
  setShowAIModal: (v: boolean) => void;
  setAiPrompt: (v: string) => void;
  setConsoleLogs: (l: string[]) => void;
  handleLangChange: (id: string) => void;
  runCode: () => void;
  saveProject: () => void;
  createNew: () => void;
  loadProject: (p: any) => void;
  deleteProject: (id: string, e: React.MouseEvent) => void;
  submitToAssignment: () => void;
  insertSnippet: (s: string) => void;
  copyCode: () => void;
  generateWithAI: () => void;
  startResizing: () => void;
  initPyodide: () => void;
  onRobotFinish: () => void;
  RobotSimulator: React.ComponentType<any>;
}

export default function StudioUI(p: StudioUIProps) {
  const {
    profile, isTeacher, lang, activeLang, editorMode, code, blocksXml, running,
    consoleLogs, robotCmds, isPyodideLoading, copiedCode,
    projects, activeProject, isSaving,
    assignmentId, lessonId, assignmentData, mySubmission, submittingAssignment, assignmentSubmitted, pendingTasks,
    userPoints, levelInfo, leaderboard, runStreak, totalRuns, showLeaderboard,
    sidebarOpen, view, device, liveUpdate, terminalHeight, showAIModal, aiPrompt, isAIGenerating,
    LANGUAGES, LAB_EXAMPLES, HTML_SNIPPETS,
    setCode, setBlocksXml, setEditorMode, setSidebarOpen, setView, setDevice, setLiveUpdate,
    setShowLeaderboard, setShowAIModal, setAiPrompt, setConsoleLogs,
    handleLangChange, runCode, saveProject, createNew, loadProject, deleteProject,
    submitToAssignment, insertSnippet, copyCode, generateWithAI, startResizing, initPyodide,
    onRobotFinish, RobotSimulator,
  } = p;

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">

      {/* ══════════════════════════════════════════════════════
          TOP NAV — rich, interactive, no dead buttons
      ══════════════════════════════════════════════════════ */}
      <header className="shrink-0 border-b border-border bg-card/90 backdrop-blur-xl z-50">

        {/* ── Row 1: XP bar + level ── */}
        <div className="h-1.5 w-full bg-muted/30 relative overflow-hidden">
          <motion.div
            className={`h-full ${levelInfo.bar} transition-all`}
            initial={{ width: 0 }}
            animate={{ width: `${levelInfo.pct}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </div>

        {/* ── Row 2: main toolbar ── */}
        <div className="flex items-center justify-between px-3 h-11 gap-2">

          {/* Left: toggle sidebar + title */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
              title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              {sidebarOpen ? <ChevronLeftIcon className="w-4 h-4" /> : <Squares2X2Icon className="w-4 h-4" />}
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg leading-none">{activeLang.emoji}</span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none">
                  {activeProject ? activeProject.title : 'Playground'}
                </p>
                <p className={`text-[9px] font-black uppercase tracking-widest leading-none mt-0.5 ${activeLang.color}`}>
                  {activeLang.name}
                </p>
              </div>
            </div>

            {/* Lesson / Assignment badge */}
            {lessonId && (
              <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400 text-[8px] font-black uppercase tracking-widest">
                <BookOpenIcon className="w-3 h-3" /> Lesson
              </div>
            )}
            {assignmentId && assignmentData && (
              <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 rounded-full text-violet-400 text-[8px] font-black uppercase tracking-widest max-w-[140px]">
                <ClipboardDocumentListIcon className="w-3 h-3 shrink-0" />
                <span className="truncate">{assignmentData.title}</span>
              </div>
            )}
          </div>

          {/* Centre: language quick-switch pills (desktop) */}
          <div className="hidden lg:flex items-center gap-1 bg-muted/30 rounded-xl p-1">
            {LANGUAGES.map(l => (
              <button
                key={l.id}
                onClick={() => handleLangChange(l.id)}
                title={l.name}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                  lang === l.id
                    ? `${l.bg} ${l.color} ${l.border} border shadow-sm`
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <span className="text-sm leading-none">{l.emoji}</span>
                <span className="hidden xl:inline">{l.name}</span>
              </button>
            ))}
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">

            {/* Python engine status */}
            {(lang === 'python' || lang === 'robotics') && (
              <button
                onClick={initPyodide}
                disabled={!!isPyodideLoading || !!((window as any).__pyodideLoaded)}
                className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border border-border hover:bg-muted"
                title="Python engine status"
              >
                {isPyodideLoading
                  ? <><ArrowPathIcon className="w-3 h-3 animate-spin text-blue-400" /><span className="text-blue-400">Loading</span></>
                  : <><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-emerald-400">Python</span></>
                }
              </button>
            )}

            {/* Streak */}
            {runStreak > 0 && (
              <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-orange-500/10 border border-orange-500/20 rounded-lg text-orange-400 text-[9px] font-black">
                <FireIcon className="w-3 h-3" /> {runStreak}d
              </div>
            )}

            {/* XP / Level */}
            <button
              onClick={() => setShowLeaderboard(true)}
              className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all hover:scale-105 ${levelInfo.bar.replace('bg-', 'border-').replace('400', '500/30')} bg-muted/20`}
              title="View leaderboard"
            >
              <span>{levelInfo.emoji}</span>
              <span className={levelInfo.color}>{levelInfo.pts} XP</span>
            </button>

            {/* AI Draft (teacher only) */}
            {isTeacher && (
              <button
                onClick={() => setShowAIModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-600/20 to-pink-600/20 hover:from-orange-600/30 hover:to-pink-600/30 border border-orange-500/30 rounded-lg text-orange-400 text-[9px] font-black uppercase tracking-widest transition-all"
              >
                <SparklesIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">AI Draft</span>
              </button>
            )}

            {/* Copy */}
            <button
              onClick={copyCode}
              className="p-1.5 rounded-lg hover:bg-muted border border-border text-muted-foreground hover:text-foreground transition-all"
              title="Copy code"
            >
              {copiedCode
                ? <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                : <DocumentTextIcon className="w-4 h-4" />
              }
            </button>

            {/* Save */}
            <button
              onClick={saveProject}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border hover:bg-muted rounded-lg text-muted-foreground text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
            >
              {isSaving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CloudArrowUpIcon className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isSaving ? 'Saving…' : 'Save'}</span>
            </button>

            {/* Submit assignment */}
            {assignmentId && profile?.role === 'student' && !assignmentSubmitted && mySubmission?.status !== 'graded' && (
              <button
                onClick={submitToAssignment}
                disabled={submittingAssignment || !code.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
              >
                {submittingAssignment ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpTrayIcon className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Submit</span>
              </button>
            )}
            {(assignmentSubmitted || mySubmission?.status === 'submitted' || mySubmission?.status === 'graded') && (
              <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-[8px] font-black uppercase">
                <CheckCircleIcon className="w-3 h-3" />
                {mySubmission?.status === 'graded' ? 'Graded' : 'Submitted'}
              </div>
            )}

            {/* RUN */}
            <button
              onClick={runCode}
              disabled={running || lang === 'scratch'}
              className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/30 active:scale-95"
            >
              {running
                ? <ArrowPathIcon className="w-4 h-4 animate-spin" />
                : <PlayIcon className="w-4 h-4" />
              }
              <span className="hidden sm:inline">{running ? 'Running…' : 'Run'}</span>
            </button>
          </div>
        </div>

        {/* ── Row 3: stats strip (mobile-visible) ── */}
        <div className="flex items-center gap-3 px-3 pb-2 overflow-x-auto scrollbar-none sm:hidden">
          {runStreak > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 rounded-full text-orange-400 text-[8px] font-black shrink-0">
              <FireIcon className="w-3 h-3" /> {runStreak}d streak
            </div>
          )}
          <button onClick={() => setShowLeaderboard(true)} className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[8px] font-black shrink-0 ${levelInfo.bar.replace('bg-','border-').replace('400','500/30')} bg-muted/20`}>
            <span>{levelInfo.emoji}</span><span className={levelInfo.color}>{levelInfo.pts} XP · {levelInfo.label}</span>
          </button>
          <div className="flex items-center gap-1 px-2 py-0.5 bg-muted/20 border border-border rounded-full text-muted-foreground text-[8px] font-black shrink-0">
            <BoltIcon className="w-3 h-3" /> {totalRuns} runs
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════
          MAIN BODY
      ══════════════════════════════════════════════════════ */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* ── SIDEBAR ── */}
        <AnimatePresence>
          {(sidebarOpen || view === 'explorer') && (
            <motion.aside
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className={`
                fixed inset-y-0 left-0 w-72 border-r border-border bg-card/95 backdrop-blur-xl
                flex flex-col z-[60] shadow-2xl
                md:relative md:shadow-none md:z-auto
                ${view !== 'explorer' ? 'hidden md:flex' : 'flex'}
              `}
            >
              {/* Sidebar header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10 shrink-0">
                <div className="flex items-center gap-2">
                  <BeakerIcon className="w-4 h-4 text-orange-400" />
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Studio Explorer</span>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors md:hidden">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-5" style={{ scrollbarWidth: 'thin' }}>

                {/* ── Assignment context ── */}
                {assignmentId && assignmentData && (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <ClipboardDocumentListIcon className="w-4 h-4 text-amber-400 shrink-0" />
                      <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Active Assignment</p>
                    </div>
                    <h3 className="text-sm font-black text-foreground leading-tight">{assignmentData.title}</h3>
                    {assignmentData.description && (
                      <p className="text-[10px] text-foreground/50 leading-relaxed line-clamp-3">{assignmentData.description}</p>
                    )}
                    {assignmentData.instructions && (
                      <div className="p-2 bg-amber-500/10 border border-amber-500/10 rounded-lg">
                        <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">Instructions</p>
                        <p className="text-[10px] text-foreground/50 leading-relaxed">{assignmentData.instructions}</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[9px] font-black text-foreground/30 uppercase tracking-widest">
                      {assignmentData.due_date && (
                        <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" />Due {new Date(assignmentData.due_date).toLocaleDateString()}</span>
                      )}
                      <span className="flex items-center gap-1"><StarIcon className="w-3 h-3 text-amber-400" />{assignmentData.max_points || 100} pts</span>
                    </div>
                    {mySubmission?.status === 'graded' && mySubmission.grade != null && (
                      <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-center">
                        <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Your Score</p>
                        <p className="text-2xl font-black text-emerald-400">{mySubmission.grade}<span className="text-sm text-emerald-400/50">/{assignmentData.max_points || 100}</span></p>
                        {mySubmission.feedback && <p className="text-[9px] text-foreground/40 mt-1 italic">"{mySubmission.feedback}"</p>}
                      </div>
                    )}
                    <a href={`/dashboard/assignments/${assignmentId}`} className="block text-center text-[9px] font-black text-amber-400/60 hover:text-amber-400 uppercase tracking-widest transition-colors">
                      View Full Assignment →
                    </a>
                  </div>
                )}

                {/* ── Pending tasks (student) ── */}
                {!assignmentId && pendingTasks.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest px-1">📋 Pending Tasks</p>
                    {pendingTasks.map((task: any) => {
                      const overdue = task.due_date && new Date(task.due_date) < new Date();
                      return (
                        <a key={task.id} href={`/dashboard/playground?assignmentId=${task.id}`}
                          className="flex items-start gap-2 p-2.5 bg-card border border-border hover:border-amber-500/30 hover:bg-amber-500/5 rounded-xl transition-all group">
                          <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${overdue ? 'bg-rose-500' : 'bg-amber-500'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-muted-foreground group-hover:text-amber-400 truncate transition-colors">{task.title}</p>
                            <p className={`text-[8px] font-black uppercase tracking-widest ${overdue ? 'text-rose-400' : 'text-muted-foreground/40'}`}>
                              {overdue ? '⚠ Overdue' : task.due_date ? `Due ${new Date(task.due_date).toLocaleDateString()}` : ''} · {task.max_points}pts
                            </p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* ── Language selector ── */}
                <div>
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest px-1 mb-2">🛠 Environments</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {LANGUAGES.map(l => (
                      <button key={l.id} onClick={() => handleLangChange(l.id)}
                        className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all text-center ${
                          lang === l.id
                            ? `${l.bg} ${l.border} border shadow-sm`
                            : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <span className="text-xl leading-none">{l.emoji}</span>
                        <p className={`text-[9px] font-black uppercase tracking-tight leading-none ${lang === l.id ? l.color : 'text-muted-foreground'}`}>{l.name}</p>
                        <p className="text-[7px] text-muted-foreground/60 leading-none">{l.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Projects ── */}
                {profile && (
                  <div>
                    <div className="flex items-center justify-between px-1 mb-2">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">📁 My Projects</p>
                      <button onClick={createNew} className="p-1 rounded-lg hover:bg-muted text-orange-400 transition-colors" title="New project">
                        <PlusIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {projects.length === 0 && (
                        <div className="p-6 text-center border-2 border-dashed border-border rounded-xl">
                          <BeakerIcon className="w-8 h-8 mx-auto text-muted-foreground/20 mb-2" />
                          <p className="text-[10px] text-muted-foreground font-bold">No projects yet</p>
                          <button onClick={createNew} className="mt-2 text-[9px] text-orange-400 font-black uppercase tracking-widest hover:underline">Create one →</button>
                        </div>
                      )}
                      {projects.map(proj => (
                        <div key={proj.id} onClick={() => loadProject(proj)}
                          className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                            activeProject?.id === proj.id ? 'bg-orange-500/10 border border-orange-500/20' : 'hover:bg-muted/50 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <ClockIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold truncate">{proj.title}</p>
                              <p className="text-[8px] text-muted-foreground">{new Date(proj.updated_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <button onClick={(e) => deleteProject(proj.id, e)}
                            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400 rounded-lg transition-all">
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Starter examples ── */}
                <div>
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest px-1 mb-2">⚡ Starter Examples</p>
                  <div className="space-y-1.5">
                    {((LAB_EXAMPLES as any)[lang] || []).map((ex: any) => (
                        <button key={ex.name} onClick={() => { p.setCode(ex.code); }}
                        className="w-full text-left p-2.5 rounded-xl bg-card border border-border hover:border-orange-500/30 hover:bg-orange-500/5 transition-all group">
                        <p className="text-[10px] font-bold text-muted-foreground group-hover:text-orange-400 transition-colors">{ex.name}</p>
                        <p className="text-[8px] text-muted-foreground/60 mt-0.5 line-clamp-1">{ex.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── HTML UI Builder ── */}
                {lang === 'html' && (
                  <div>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest px-1 mb-2">🎨 UI Components</p>
                    <div className="space-y-1.5">
                      {HTML_SNIPPETS.map(s => (
                        <button key={s.name} onClick={() => insertSnippet(s.code)}
                          className="w-full text-left p-2.5 rounded-xl bg-card border border-border hover:border-orange-500/30 hover:bg-orange-500/5 transition-all group">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-bold text-muted-foreground group-hover:text-orange-400 transition-colors">{s.name}</p>
                            <span className="text-[7px] font-black text-muted-foreground/40 uppercase">{s.cat}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Robotics command reference ── */}
                {lang === 'robotics' && (
                  <div>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest px-1 mb-2">🤖 Commands</p>
                    <div className="space-y-1.5">
                      {[
                        { cmd: 'robot.forward(n)',   desc: 'Move forward n pixels' },
                        { cmd: 'robot.turnRight(d)', desc: 'Rotate right d degrees' },
                        { cmd: 'robot.turnLeft(d)',  desc: 'Rotate left d degrees' },
                        { cmd: 'robot.penDown()',    desc: 'Start drawing path' },
                        { cmd: 'robot.penUp()',      desc: 'Stop drawing path' },
                        { cmd: 'robot.setColor(c)', desc: 'Set path color' },
                      ].map(h => (
                        <button key={h.cmd} onClick={() => p.setCode((prev: string) => prev + '\n' + h.cmd)}
                          className="w-full text-left p-2 rounded-xl bg-card border border-border hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all group">
                          <p className="font-mono text-[9px] text-cyan-400 group-hover:text-cyan-300">{h.cmd}</p>                          <p className="text-[8px] text-muted-foreground/60 mt-0.5">{h.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── EDITOR CANVAS ── */}
        <div className={`flex-1 flex flex-col min-w-0 overflow-hidden ${view !== 'editor' && view !== 'canvas' ? 'hidden md:flex' : 'flex'}`}>

          {/* Mobile canvas view (robotics) */}
          {view === 'canvas' && lang === 'robotics' && (
            <div className="flex-1 p-4 flex flex-col gap-4 md:hidden overflow-y-auto">
              <div className="flex items-center gap-2">
                <RocketLaunchIcon className="w-4 h-4 text-cyan-400" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Robot Simulator</h3>
              </div>
              <RobotSimulator code={code} isRunning={running} onFinish={onRobotFinish} commands={robotCmds} />
            </div>
          )}

          {/* Editor tabs */}
          <div className="h-9 bg-card/50 border-b border-border flex items-center px-3 justify-between shrink-0">
            <div className="flex gap-0.5">
              {lang !== 'scratch' && (
                <button onClick={() => setEditorMode('code')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${editorMode === 'code' ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
                  <span className="flex items-center gap-1"><CodeBracketIcon className="w-3 h-3" />Code</span>
                </button>
              )}
              {(lang === 'python' || lang === 'javascript') && (
                <button onClick={() => setEditorMode('blocks')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${editorMode === 'blocks' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
                  <span className="flex items-center gap-1"><PuzzlePieceIcon className="w-3 h-3" />Blocks</span>
                </button>
              )}
              {lang === 'scratch' && (
                <span className="px-3 py-1.5 text-[10px] font-black text-pink-400 uppercase tracking-widest flex items-center gap-1">🎮 Scratch Lab</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {lang === 'html' && (
                <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-0.5">
                  <button onClick={() => setDevice('desktop')} className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase transition-all ${device === 'desktop' ? 'bg-white/10 text-foreground' : 'text-muted-foreground'}`}>Desktop</button>
                  <button onClick={() => setDevice('mobile')}  className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase transition-all ${device === 'mobile'  ? 'bg-white/10 text-foreground' : 'text-muted-foreground'}`}>Mobile</button>
                </div>
              )}
              <span className="hidden sm:block text-[9px] font-mono text-muted-foreground/40 uppercase tracking-widest">
                {lang === 'scratch' ? 'drag & drop' : 'UTF-8 · active'}
              </span>
            </div>
          </div>

          {/* Editor + preview split */}
          <div className="flex-1 flex overflow-hidden min-h-0">

            {/* Code editor */}
            <div className="flex-1 relative min-w-0">
              {lang === 'scratch' ? (
                <ScratchSynthesisLab onChange={(blocks: any[]) => p.setCode(blocks.map((b: any) => b.label).join('\n'))} />
              ) : editorMode === 'blocks' ? (
                <BlocklyEditor xml={blocksXml} language={lang} onChange={(xml, gen) => { p.setBlocksXml(xml); p.setCode(gen); }} />
              ) : (
                <IntegratedCodeRunner
                  height="100%"
                  language={(lang === 'robotics' ? 'python' : lang) as any}
                  value={code}
                  onChange={v => { if (v !== undefined) p.setCode(v); }}
                  title={activeProject?.title || 'Open Workspace'}
                  onRun={runCode}
                  showHeader={false}
                />
              )}
            </div>

            {/* HTML live preview (desktop) */}
            {lang === 'html' && (
              <div className="hidden md:flex w-[45%] flex-col border-l border-border bg-slate-100 dark:bg-slate-900">
                <div className="h-9 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center px-3 justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Live Preview</span>
                  </div>
                  <button onClick={() => setLiveUpdate(!liveUpdate)}
                    className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border transition-all ${liveUpdate ? 'border-orange-500/30 text-orange-500 bg-orange-50 dark:bg-orange-500/10' : 'border-slate-300 text-slate-400'}`}>
                    {liveUpdate ? 'Live: ON' : 'Live: OFF'}
                  </button>
                </div>
                <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
                  <div className={`bg-white shadow-2xl overflow-hidden transition-all duration-500 ${device === 'mobile' ? 'w-[375px] h-[667px] rounded-[2.5rem] border-[10px] border-slate-900' : 'w-full h-full rounded-lg border border-slate-200'}`}>
                    <iframe srcDoc={liveUpdate ? code : undefined} className="w-full h-full border-0" title="Live Preview" sandbox="allow-scripts" />
                  </div>
                </div>
              </div>
            )}

            {/* Robotics simulator (desktop right panel) */}
            {lang === 'robotics' && (
              <div className="hidden lg:flex w-80 flex-col border-l border-border bg-card/30">
                <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <RocketLaunchIcon className="w-4 h-4 text-cyan-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Simulator</span>
                  </div>
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black ${running ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-muted/30 text-muted-foreground border border-border'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'}`} />
                    {running ? 'Active' : 'Standby'}
                  </div>
                </div>
                <div className="flex-1 p-3 overflow-y-auto space-y-3">
                  <RobotSimulator code={code} isRunning={running} onFinish={onRobotFinish} commands={robotCmds} />
                  <div className="p-3 bg-muted/20 border border-border rounded-xl">
                    <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-2">Quick Commands</p>
                    <div className="grid grid-cols-2 gap-1">
                      {['robot.forward(50)', 'robot.turnRight(90)', 'robot.penDown()', 'robot.setColor("red")'].map(cmd => (
                        <button key={cmd} onClick={() => p.setCode((prev: string) => prev + '\n' + cmd)}
                          className="text-left p-1.5 bg-card border border-border rounded-lg hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all">
                          <p className="font-mono text-[8px] text-cyan-400 truncate">{cmd}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── CONSOLE / OUTPUT ── */}
          <div
            className={`border-t border-border flex flex-col bg-[#020617] relative shrink-0 ${view !== 'output' ? 'hidden md:flex' : 'flex'}`}
            style={{ height: view === 'output' ? (lang === 'html' ? '100%' : `${terminalHeight}px`) : `${terminalHeight}px` }}
          >
            {/* Resize handle */}
            <div onMouseDown={startResizing} onTouchStart={startResizing}
              className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize group z-10 flex items-center justify-center">
              <div className="w-12 h-1 bg-border rounded-full group-hover:bg-orange-500 transition-colors" />
            </div>

            {/* Console header */}
            <div className="h-8 border-b border-border/50 flex items-center px-3 justify-between bg-muted/10 shrink-0 mt-1">
              <div className="flex items-center gap-2">
                <CommandLineIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400/80">
                  {lang === 'html' ? 'Live Preview' : 'Console Output'}
                </span>
                {consoleLogs.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[7px] font-black text-emerald-400">
                    {consoleLogs.length} lines
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {running && (
                  <div className="flex items-center gap-1 text-[8px] text-emerald-400 font-black animate-pulse">
                    <ArrowPathIcon className="w-3 h-3 animate-spin" /> Running…
                  </div>
                )}
                {lang !== 'html' && consoleLogs.length > 0 && (
                  <button onClick={() => p.setConsoleLogs([])} className="p-1 hover:bg-muted/50 rounded-lg transition-colors" title="Clear console">
                    <TrashIcon className="w-3.5 h-3.5 text-muted-foreground hover:text-rose-400" />
                  </button>
                )}
              </div>
            </div>

            {/* Console body */}
            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs" style={{ scrollbarWidth: 'thin' }}>
              {lang === 'html' ? (
                <div className="w-full h-full bg-slate-900 rounded-xl overflow-hidden border border-border">
                  <div className="w-full h-full bg-white rounded-[0.75rem] overflow-hidden">
                    <iframe srcDoc={code} className="w-full h-full border-0" title="Mobile Preview" sandbox="allow-scripts" />
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {consoleLogs.length === 0 && !running && (
                    <p className="text-muted-foreground/40 italic text-[11px]">▶ Run your code to see output here…</p>
                  )}
                  {consoleLogs.map((log, i) => (
                    <div key={i} className={`py-0.5 pl-3 border-l-2 text-[11px] ${log.startsWith('❌') ? 'border-rose-500 text-rose-400' : 'border-emerald-500/30 text-foreground/80'}`}>
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          LEADERBOARD MODAL
      ══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showLeaderboard && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-background/80 backdrop-blur-xl"
            onClick={() => p.setShowLeaderboard(false)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-amber-500/10 to-orange-500/10">
                <div className="flex items-center gap-3">
                  <TrophyIcon className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest">Leaderboard</h3>
                    <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">Top Coders</p>
                  </div>
                </div>
                <button onClick={() => p.setShowLeaderboard(false)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground transition-colors">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              {/* My stats */}
              <div className="px-5 py-3 border-b border-border bg-muted/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{levelInfo.emoji}</span>
                    <div>
                      <p className="text-xs font-black">{profile?.full_name || 'You'}</p>
                      <p className={`text-[9px] font-black uppercase tracking-widest ${levelInfo.color}`}>{levelInfo.label}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-black ${levelInfo.color}`}>{levelInfo.pts}</p>
                    <p className="text-[8px] text-muted-foreground font-black uppercase">XP</p>
                  </div>
                </div>
                <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div className={`h-full ${levelInfo.bar} rounded-full`} initial={{ width: 0 }} animate={{ width: `${levelInfo.pct}%` }} transition={{ duration: 0.8 }} />
                </div>
                <p className="text-[8px] text-muted-foreground mt-1">{levelInfo.pct}% to next level</p>
              </div>
              {/* Stats row */}
              <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
                {[
                  { label: 'Total Runs', value: totalRuns, icon: '⚡' },
                  { label: 'Streak',     value: `${runStreak}d`, icon: '🔥' },
                  { label: 'Projects',   value: p.projects.length, icon: '📁' },
                ].map(s => (
                  <div key={s.label} className="flex flex-col items-center py-3 gap-0.5">
                    <span className="text-lg">{s.icon}</span>
                    <p className="text-sm font-black">{s.value}</p>
                    <p className="text-[7px] text-muted-foreground font-black uppercase tracking-widest">{s.label}</p>
                  </div>
                ))}
              </div>
              {/* Leaderboard list */}
              <div className="p-3 space-y-1.5 max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {leaderboard.length === 0 && (
                  <div className="text-center py-6">
                    <ArrowPathIcon className="w-6 h-6 mx-auto text-muted-foreground/30 animate-spin mb-2" />
                    <p className="text-[10px] text-muted-foreground">Loading…</p>
                  </div>
                )}
                {leaderboard.map((entry, i) => {
                  const medals = ['🥇', '🥈', '🥉'];
                  const isMe = entry.portal_user_id === profile?.id;
                  return (
                    <div key={entry.portal_user_id}
                      className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${isMe ? 'bg-orange-500/10 border border-orange-500/20' : 'hover:bg-muted/30'}`}>
                      <span className="text-lg w-6 text-center shrink-0">{medals[i] || `${i + 1}`}</span>
                      <p className={`flex-1 text-[11px] font-bold truncate ${isMe ? 'text-orange-400' : 'text-foreground'}`}>
                        {entry.portal_users?.full_name || 'Coder'}{isMe ? ' (You)' : ''}
                      </p>
                      <p className={`text-[11px] font-black ${isMe ? 'text-orange-400' : 'text-muted-foreground'}`}>{entry.total_points} XP</p>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 pb-4">
                <a href="/dashboard/leaderboard" className="block w-full text-center py-2 bg-muted/30 hover:bg-muted/50 border border-border rounded-xl text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all">
                  View Full Leaderboard →
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════
          AI MODAL (teacher only)
      ══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showAIModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-background/80 backdrop-blur-xl"
            onClick={() => p.setShowAIModal(false)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-orange-500/10 to-pink-500/10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-orange-500/20 rounded-xl flex items-center justify-center border border-orange-500/30">
                    <SparklesIcon className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest">AI Code Generator</h3>
                    <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">Powered by OpenRouter</p>
                  </div>
                </div>
                <button onClick={() => p.setShowAIModal(false)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground transition-colors">
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-2">
                    Describe what you want to build in {p.activeLang?.name}
                  </label>
                  <textarea
                    autoFocus
                    value={aiPrompt}
                    onChange={e => p.setAiPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) p.generateWithAI(); }}
                    placeholder={`e.g. "A function that sorts a list of numbers" or "A colourful card with a button"`}
                    className="w-full h-32 bg-muted/30 border border-border hover:border-orange-500/30 focus:border-orange-500/50 rounded-xl p-3 text-sm text-foreground outline-none resize-none transition-all placeholder:text-muted-foreground/40"
                  />
                  <p className="text-[8px] text-muted-foreground mt-1">Tip: Press Ctrl+Enter to generate</p>
                </div>
                {/* Quick prompts */}
                <div>
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2">Quick prompts</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Fibonacci sequence', 'Bubble sort', 'Simple calculator',
                      'Animated button', 'Guess the number game', 'Robot square pattern',
                    ].map(q => (
                      <button key={q} onClick={() => p.setAiPrompt(q)}
                        className="px-2.5 py-1 bg-muted/30 hover:bg-orange-500/10 border border-border hover:border-orange-500/30 rounded-full text-[9px] font-bold text-muted-foreground hover:text-orange-400 transition-all">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={p.generateWithAI} disabled={isAIGenerating || !aiPrompt.trim()}
                  className="w-full h-12 bg-gradient-to-r from-orange-600 to-pink-600 hover:from-orange-500 hover:to-pink-500 disabled:opacity-50 text-white rounded-xl font-black uppercase tracking-widest text-xs transition-all shadow-lg shadow-orange-900/20 flex items-center justify-center gap-2 active:scale-[0.98]">
                  {isAIGenerating
                    ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Generating…</>
                    : <><SparklesIcon className="w-4 h-4" /> Generate Code</>
                  }
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════
          MOBILE BOTTOM TAB BAR
      ══════════════════════════════════════════════════════ */}
      <nav className="md:hidden shrink-0 h-16 border-t border-border bg-card/95 backdrop-blur-xl flex items-center justify-around px-2 z-50 pb-[env(safe-area-inset-bottom)]">
        <button onClick={() => p.setView('explorer')}
          className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${view === 'explorer' ? 'text-orange-400 bg-orange-500/10' : 'text-muted-foreground'}`}>
          <Squares2X2Icon className="w-5 h-5" />
          <span className="text-[7px] font-black uppercase tracking-widest">Explorer</span>
        </button>
        <button onClick={() => p.setView('editor')}
          className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${view === 'editor' ? 'text-orange-400 bg-orange-500/10' : 'text-muted-foreground'}`}>
          <CodeBracketIcon className="w-5 h-5" />
          <span className="text-[7px] font-black uppercase tracking-widest">Editor</span>
        </button>

        {/* Big run button */}
        <button onClick={runCode} disabled={running || lang === 'scratch'}
          className="flex flex-col items-center justify-center w-14 h-14 -mt-6 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-2xl shadow-xl shadow-emerald-900/40 border-4 border-background transition-all active:scale-95">
          {running ? <ArrowPathIcon className="w-6 h-6 text-white animate-spin" /> : <PlayIcon className="w-6 h-6 text-white" />}
        </button>

        <button onClick={() => p.setView('output')}
          className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${view === 'output' ? 'text-orange-400 bg-orange-500/10' : 'text-muted-foreground'}`}>
          {lang === 'html' ? <EyeIcon className="w-5 h-5" /> : <CommandLineIcon className="w-5 h-5" />}
          <span className="text-[7px] font-black uppercase tracking-widest">{lang === 'html' ? 'Preview' : 'Console'}</span>
        </button>

        {lang === 'robotics' ? (
          <button onClick={() => p.setView('canvas')}
            className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${view === 'canvas' ? 'text-cyan-400 bg-cyan-500/10' : 'text-muted-foreground'}`}>
            <RocketLaunchIcon className="w-5 h-5" />
            <span className="text-[7px] font-black uppercase tracking-widest">Robot</span>
          </button>
        ) : (
          <button onClick={() => p.setShowLeaderboard(true)}
            className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all text-muted-foreground hover:text-amber-400">
            <TrophyIcon className="w-5 h-5" />
            <span className="text-[7px] font-black uppercase tracking-widest">Ranks</span>
          </button>
        )}
      </nav>

      <style>{`
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}
