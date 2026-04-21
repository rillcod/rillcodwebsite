'use client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CodeBracketIcon, PlayIcon, TrashIcon, PlusIcon,
  CloudArrowUpIcon, Squares2X2Icon, CommandLineIcon,
  BeakerIcon, RocketLaunchIcon, SparklesIcon,
  ArrowPathIcon, XMarkIcon,
  EyeIcon, DocumentTextIcon, CheckCircleIcon,
  ArrowUpTrayIcon, StarIcon, CalendarIcon,
  TrophyIcon, FireIcon, BoltIcon,
} from '@/lib/icons';
import dynamic from 'next/dynamic';
import IntegratedCodeRunner from '@/components/studio/IntegratedCodeRunner';

const BlocklyEditor       = dynamic(() => import('@/components/studio/BlocklyEditor'),       { ssr: false });
const ScratchSynthesisLab = dynamic(() => import('@/components/studio/ScratchSynthesisLab'), { ssr: false });

export interface StudioUIProps {
  profile: any; isTeacher: boolean;
  lang: string; activeLang: any; editorMode: 'code'|'blocks';
  code: string; blocksXml: string; running: boolean;
  consoleLogs: string[]; robotCmds: any[];
  isPyodideLoading: boolean; copiedCode: boolean;
  projects: any[]; activeProject: any; isSaving: boolean;
  assignmentId: string|null; lessonId: string|null;
  assignmentData: any; mySubmission: any;
  submittingAssignment: boolean; assignmentSubmitted: boolean;
  pendingTasks: any[];
  userPoints: any; levelInfo: any; leaderboard: any[];
  runStreak: number; totalRuns: number; showLeaderboard: boolean;
  sidebarOpen: boolean;
  view: 'editor'|'output'|'explorer'|'canvas';
  device: 'desktop'|'mobile'; liveUpdate: boolean;
  terminalHeight: number; showAIModal: boolean;
  aiPrompt: string; isAIGenerating: boolean;
  LANGUAGES: any[]; LAB_EXAMPLES: any; HTML_SNIPPETS: any[];
  setCode: (c: string | ((prev: string) => string)) => void;
  setBlocksXml: (x: string) => void;
  setEditorMode: (m: 'code'|'blocks') => void;
  setLang: (l: string) => void;
  setSidebarOpen: (o: boolean) => void;
  setView: (v: 'editor'|'output'|'explorer'|'canvas') => void;
  setDevice: (d: 'desktop'|'mobile') => void;
  setLiveUpdate: (v: boolean) => void;
  setShowLeaderboard: (v: boolean) => void;
  setShowAIModal: (v: boolean) => void;
  setAiPrompt: (v: string) => void;
  setConsoleLogs: (l: string[]) => void;
  handleLangChange: (id: string) => void;
  runCode: () => void; saveProject: () => void;
  createNew: () => void; loadProject: (proj: any) => void;
  deleteProject: (id: string, e: React.MouseEvent) => void;
  submitToAssignment: () => void;
  insertSnippet: (s: string) => void;
  copyCode: () => void; generateWithAI: () => void;
  startResizing: () => void; initPyodide: () => void;
  onRobotFinish: () => void;
  RobotSimulator: React.ComponentType<any>;
}

export default function StudioUI(p: StudioUIProps) {
  const {
    profile, isTeacher, lang, activeLang, editorMode, code, blocksXml,
    running, consoleLogs, robotCmds, isPyodideLoading, copiedCode,
    projects, activeProject, isSaving,
    assignmentId, assignmentData, mySubmission,
    submittingAssignment, assignmentSubmitted, pendingTasks,
    levelInfo, leaderboard, runStreak, totalRuns, showLeaderboard,
    sidebarOpen, view, device, liveUpdate, terminalHeight,
    showAIModal, aiPrompt, isAIGenerating,
    LANGUAGES, LAB_EXAMPLES, HTML_SNIPPETS,
    setCode, setBlocksXml, setEditorMode, setSidebarOpen, setView,
    setDevice, setLiveUpdate, setShowLeaderboard, setShowAIModal,
    setAiPrompt, setConsoleLogs,
    handleLangChange, runCode, saveProject, createNew, loadProject,
    deleteProject, submitToAssignment, insertSnippet, copyCode,
    generateWithAI, startResizing, initPyodide, onRobotFinish, RobotSimulator,
  } = p;

  return (
    <div className="h-[100dvh] bg-background text-foreground flex flex-col overflow-hidden">
      {/* XP bar */}
      <div className="h-1 w-full bg-muted/20 shrink-0">
        <motion.div className={`h-full ${levelInfo.bar}`} initial={{ width: 0 }} animate={{ width: `${levelInfo.pct}%` }} transition={{ duration: 1.2, ease: 'easeOut' }} />
      </div>

      {/* TOP NAV */}
      <header className="shrink-0 bg-card/95 backdrop-blur-xl border-b border-border z-40">
        <div className="flex items-center h-12 px-2 sm:px-3 gap-1.5">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-xl hover:bg-muted active:scale-95 transition-all text-muted-foreground touch-manipulation shrink-0">
            <Squares2X2Icon className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-xl leading-none shrink-0">{activeLang.emoji}</span>
            <div className="min-w-0 hidden sm:block">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none truncate max-w-[120px]">{activeProject ? activeProject.title : 'Playground'}</p>
              <p className={`text-[9px] font-black uppercase leading-none mt-0.5 ${activeLang.color}`}>{activeLang.name}</p>
            </div>
          </div>
          {/* Lang pills desktop */}
          <div className="hidden lg:flex items-center gap-0.5 bg-muted/30 rounded-xl p-1 shrink-0">
            {LANGUAGES.map(l => (
              <button key={l.id} onClick={() => handleLangChange(l.id)} title={l.name}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all touch-manipulation ${lang === l.id ? `${l.bg} ${l.color} ${l.border} border` : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
                <span className="text-sm leading-none">{l.emoji}</span>
                <span className="hidden xl:inline">{l.name}</span>
              </button>
            ))}
          </div>
          {/* Right actions */}
          <div className="flex items-center gap-1 shrink-0">
            {runStreak > 0 && <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-orange-500/10 border border-orange-500/20 rounded-lg text-orange-400 text-[9px] font-black"><FireIcon className="w-3 h-3" />{runStreak}d</div>}
            <button onClick={() => setShowLeaderboard(true)} className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 text-[9px] font-black transition-all touch-manipulation">
              <span>{levelInfo.emoji}</span><span className={levelInfo.color}>{levelInfo.pts}</span>
            </button>
            {(lang === 'python' || lang === 'robotics') && (
              <button onClick={initPyodide} className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-[9px] font-black transition-all hover:bg-muted touch-manipulation">
                {isPyodideLoading ? <><ArrowPathIcon className="w-3 h-3 animate-spin text-blue-400" /><span className="text-blue-400">Loading</span></> : <><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-emerald-400">Python</span></>}
              </button>
            )}
            {isTeacher && (
              <button onClick={() => setShowAIModal(true)} className="flex items-center gap-1 px-2 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-lg text-orange-400 text-[9px] font-black transition-all touch-manipulation">
                <SparklesIcon className="w-3.5 h-3.5" /><span className="hidden sm:inline">AI</span>
              </button>
            )}
            <button onClick={copyCode} className="p-2 rounded-lg hover:bg-muted border border-border text-muted-foreground hover:text-foreground transition-all touch-manipulation" title="Copy code">
              {copiedCode ? <CheckCircleIcon className="w-4 h-4 text-emerald-400" /> : <DocumentTextIcon className="w-4 h-4" />}
            </button>
            <button onClick={saveProject} disabled={isSaving} className="flex items-center gap-1 px-2 py-1.5 bg-card border border-border hover:bg-muted rounded-lg text-muted-foreground text-[9px] font-black transition-all disabled:opacity-50 touch-manipulation">
              {isSaving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <CloudArrowUpIcon className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isSaving ? 'Saving…' : 'Save'}</span>
            </button>
            {assignmentId && profile?.role === 'student' && !assignmentSubmitted && mySubmission?.status !== 'graded' && (
              <button onClick={submitToAssignment} disabled={submittingAssignment || !code.trim()} className="flex items-center gap-1 px-2 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-[9px] font-black transition-all touch-manipulation">
                {submittingAssignment ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpTrayIcon className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Submit</span>
              </button>
            )}
            {(assignmentSubmitted || mySubmission?.status === 'submitted' || mySubmission?.status === 'graded') && (
              <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-[8px] font-black">
                <CheckCircleIcon className="w-3 h-3" /><span className="hidden sm:inline">{mySubmission?.status === 'graded' ? 'Graded' : 'Submitted'}</span>
              </div>
            )}
            <button onClick={runCode} disabled={running || lang === 'scratch'} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-wide transition-all shadow-lg shadow-emerald-900/30 active:scale-95 touch-manipulation">
              {running ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <PlayIcon className="w-4 h-4" />}
              <span className="hidden sm:inline">{running ? '…' : 'Run'}</span>
            </button>
          </div>
        </div>
        {/* Mobile stats strip */}
        <div className="sm:hidden flex items-center gap-2 px-3 pb-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {runStreak > 0 && <span className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 rounded-full text-orange-400 text-[8px] font-black shrink-0"><FireIcon className="w-3 h-3" />{runStreak}d streak</span>}
          <button onClick={() => setShowLeaderboard(true)} className="flex items-center gap-1 px-2 py-0.5 bg-muted/20 border border-border rounded-full text-[8px] font-black shrink-0 touch-manipulation">
            <span>{levelInfo.emoji}</span><span className={levelInfo.color}>{levelInfo.pts} XP</span>
          </button>
          <span className="flex items-center gap-1 px-2 py-0.5 bg-muted/20 border border-border rounded-full text-muted-foreground text-[8px] font-black shrink-0"><BoltIcon className="w-3 h-3" />{totalRuns} runs</span>
          {(lang === 'python' || lang === 'robotics') && (
            <button onClick={initPyodide} className="flex items-center gap-1 px-2 py-0.5 bg-muted/20 border border-border rounded-full text-[8px] font-black shrink-0 touch-manipulation">
              {isPyodideLoading ? <><ArrowPathIcon className="w-3 h-3 animate-spin text-blue-400" /><span className="text-blue-400">Loading Python…</span></> : <><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-emerald-400">Python ready</span></>}
            </button>
          )}
        </div>
      </header>

      {/* MAIN BODY */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Backdrop */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-[55] md:hidden" onClick={() => setSidebarOpen(false)} />
          )}
        </AnimatePresence>

        {/* SIDEBAR */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside initial={{ x: -300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -300, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed top-0 left-0 h-full w-[280px] sm:w-72 bg-card border-r border-border flex flex-col z-[60] shadow-2xl md:relative md:top-auto md:left-auto md:h-auto md:shadow-none md:z-auto md:shrink-0 md:w-64 lg:w-72">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10 shrink-0">
                <div className="flex items-center gap-2"><BeakerIcon className="w-4 h-4 text-orange-400" /><span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Explorer</span></div>
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors touch-manipulation"><XMarkIcon className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-4" style={{ scrollbarWidth: 'thin' }}>

                {/* Assignment */}
                {assignmentId && assignmentData && (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-2">
                    <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">📋 Assignment</p>
                    <p className="text-sm font-black text-foreground leading-tight">{assignmentData.title}</p>
                    {assignmentData.description && <p className="text-[10px] text-foreground/50 leading-relaxed line-clamp-3">{assignmentData.description}</p>}
                    {assignmentData.instructions && (
                      <div className="p-2 bg-amber-500/10 rounded-lg">
                        <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">Instructions</p>
                        <p className="text-[10px] text-foreground/50 leading-relaxed">{assignmentData.instructions}</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[9px] font-black text-foreground/30 uppercase">
                      {assignmentData.due_date && <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" />Due {new Date(assignmentData.due_date).toLocaleDateString()}</span>}
                      <span className="flex items-center gap-1"><StarIcon className="w-3 h-3 text-amber-400" />{assignmentData.max_points || 100}pts</span>
                    </div>
                    {mySubmission?.status === 'graded' && mySubmission.grade != null && (
                      <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-center">
                        <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Your Score</p>
                        <p className="text-2xl font-black text-emerald-400">{mySubmission.grade}<span className="text-sm opacity-50">/{assignmentData.max_points || 100}</span></p>
                        {mySubmission.feedback && <p className="text-[9px] text-foreground/40 mt-1 italic">"{mySubmission.feedback}"</p>}
                      </div>
                    )}
                    <a href={`/dashboard/assignments/${assignmentId}`} className="block text-center text-[9px] font-black text-amber-400/60 hover:text-amber-400 uppercase tracking-widest transition-colors">View Assignment →</a>
                  </div>
                )}

                {/* Pending tasks */}
                {!assignmentId && pendingTasks.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest px-1">📋 Pending Tasks</p>
                    {pendingTasks.map((task: any) => {
                      const overdue = task.due_date && new Date(task.due_date) < new Date();
                      return (
                        <a key={task.id} href={`/dashboard/playground?assignmentId=${task.id}`}
                          className="flex items-start gap-2 p-2.5 bg-card border border-border hover:border-amber-500/30 hover:bg-amber-500/5 rounded-xl transition-all group touch-manipulation">
                          <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${overdue ? 'bg-rose-500' : 'bg-amber-500'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-muted-foreground group-hover:text-amber-400 truncate">{task.title}</p>
                            <p className={`text-[8px] font-black uppercase ${overdue ? 'text-rose-400' : 'text-muted-foreground/40'}`}>{overdue ? '⚠ Overdue' : task.due_date ? `Due ${new Date(task.due_date).toLocaleDateString()}` : ''} · {task.max_points}pts</p>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* Language grid */}
                <div>
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest px-1 mb-2">🛠 Environments</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {LANGUAGES.map(l => (
                      <button key={l.id} onClick={() => { handleLangChange(l.id); setSidebarOpen(false); }}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all text-center touch-manipulation active:scale-95 ${lang === l.id ? `${l.bg} ${l.border} border` : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30 opacity-60 hover:opacity-100'}`}>
                        <span className="text-xl leading-none">{l.emoji}</span>
                        <p className={`text-[8px] font-black uppercase leading-none ${lang === l.id ? l.color : 'text-muted-foreground'}`}>{l.name}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Projects */}
                {profile && (
                  <div>
                    <div className="flex items-center justify-between px-1 mb-2">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">📁 Projects</p>
                      <button onClick={createNew} className="p-1.5 rounded-lg hover:bg-muted text-orange-400 transition-colors touch-manipulation"><PlusIcon className="w-4 h-4" /></button>
                    </div>
                    {projects.length === 0 ? (
                      <div className="p-5 text-center border-2 border-dashed border-border rounded-xl">
                        <BeakerIcon className="w-7 h-7 mx-auto text-muted-foreground/20 mb-2" />
                        <p className="text-[10px] text-muted-foreground font-bold">No projects yet</p>
                        <button onClick={createNew} className="mt-1.5 text-[9px] text-orange-400 font-black uppercase tracking-widest hover:underline touch-manipulation">Create one →</button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {projects.map(proj => (
                          <div key={proj.id} onClick={() => { loadProject(proj); setSidebarOpen(false); }}
                            className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all touch-manipulation ${activeProject?.id === proj.id ? 'bg-orange-500/10 border border-orange-500/20' : 'hover:bg-muted/50 border border-transparent'}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-base leading-none shrink-0">{LANGUAGES.find(l => l.id === proj.language)?.emoji || '📄'}</span>
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold truncate">{proj.title}</p>
                                <p className="text-[8px] text-muted-foreground">{new Date(proj.updated_at).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <button onClick={(e) => deleteProject(proj.id, e)} className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400 rounded-lg transition-all touch-manipulation">
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Examples */}
                <div>
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest px-1 mb-2">⚡ Examples</p>
                  <div className="space-y-1.5">
                    {((LAB_EXAMPLES as any)[lang] || []).map((ex: any) => (
                      <button key={ex.name} onClick={() => { setCode(ex.code); setSidebarOpen(false); }}
                        className="w-full text-left p-2.5 rounded-xl bg-card border border-border hover:border-orange-500/30 hover:bg-orange-500/5 transition-all group touch-manipulation active:scale-[0.98]">
                        <p className="text-[10px] font-bold text-muted-foreground group-hover:text-orange-400 transition-colors">{ex.name}</p>
                        <p className="text-[8px] text-muted-foreground/60 mt-0.5 line-clamp-1">{ex.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* HTML snippets */}
                {lang === 'html' && (
                  <div>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest px-1 mb-2">🎨 UI Components</p>
                    <div className="space-y-1.5">
                      {HTML_SNIPPETS.map(s => (
                        <button key={s.name} onClick={() => insertSnippet(s.code)}
                          className="w-full text-left p-2.5 rounded-xl bg-card border border-border hover:border-orange-500/30 hover:bg-orange-500/5 transition-all group touch-manipulation">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-bold text-muted-foreground group-hover:text-orange-400">{s.name}</p>
                            <span className="text-[7px] font-black text-muted-foreground/40 uppercase">{s.cat}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Robotics commands */}
                {lang === 'robotics' && (
                  <div>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest px-1 mb-2">🤖 Commands</p>
                    <div className="space-y-1.5">
                      {[
                        { cmd: 'robot.forward(50)',     desc: 'Move forward 50px' },
                        { cmd: 'robot.turnRight(90)',   desc: 'Turn right 90°' },
                        { cmd: 'robot.turnLeft(90)',    desc: 'Turn left 90°' },
                        { cmd: 'robot.penDown()',       desc: 'Start drawing' },
                        { cmd: 'robot.penUp()',         desc: 'Stop drawing' },
                        { cmd: 'robot.setColor("red")', desc: 'Set color' },
                      ].map(h => (
                        <button key={h.cmd} onClick={() => setCode((prev: string) => prev + '\n' + h.cmd)}
                          className="w-full text-left p-2 rounded-xl bg-card border border-border hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all group touch-manipulation">
                          <p className="font-mono text-[9px] text-cyan-400 group-hover:text-cyan-300">{h.cmd}</p>
                          <p className="text-[8px] text-muted-foreground/60 mt-0.5">{h.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* EDITOR AREA */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Mobile robotics canvas */}
          {view === 'canvas' && lang === 'robotics' && (
            <div className="flex-1 flex flex-col p-3 gap-3 overflow-y-auto md:hidden">
              <div className="flex items-center gap-2"><RocketLaunchIcon className="w-4 h-4 text-cyan-400" /><p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">Robot Simulator</p></div>
              <RobotSimulator code={code} isRunning={running} onFinish={onRobotFinish} commands={robotCmds} />
              <div className="p-3 bg-muted/20 border border-border rounded-xl">
                <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-2">Quick Commands</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {['robot.forward(50)', 'robot.turnRight(90)', 'robot.penDown()', 'robot.setColor("blue")'].map(cmd => (
                    <button key={cmd} onClick={() => setCode((prev: string) => prev + '\n' + cmd)}
                      className="p-2 bg-card border border-border rounded-lg hover:border-cyan-500/30 text-left touch-manipulation active:scale-95 transition-all">
                      <p className="font-mono text-[8px] text-cyan-400 truncate">{cmd}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Editor — hidden on mobile when output/canvas active */}
          <div className={`flex-1 flex flex-col min-h-0 overflow-hidden ${(view === 'output' || view === 'canvas') ? 'hidden md:flex' : 'flex'}`}>
            {/* Editor tabs */}
            <div className="h-9 bg-card/60 border-b border-border flex items-center px-3 justify-between shrink-0">
              <div className="flex gap-0.5">
                {lang !== 'scratch' && (
                  <button onClick={() => setEditorMode('code')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all touch-manipulation ${editorMode === 'code' ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
                    {'</>'} Code
                  </button>
                )}
                {(lang === 'python' || lang === 'javascript') && (
                  <button onClick={() => setEditorMode('blocks')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all touch-manipulation ${editorMode === 'blocks' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
                    🧩 Blocks
                  </button>
                )}
                {lang === 'scratch' && <span className="px-2.5 py-1.5 text-[9px] font-black text-pink-400 uppercase tracking-wide flex items-center gap-1">🎮 Scratch Lab</span>}
              </div>
              <div className="flex items-center gap-2">
                {lang === 'html' && (
                  <div className="flex items-center gap-0.5 bg-muted/30 rounded-lg p-0.5">
                    <button onClick={() => setDevice('desktop')} className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase transition-all touch-manipulation ${device === 'desktop' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>🖥</button>
                    <button onClick={() => setDevice('mobile')}  className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase transition-all touch-manipulation ${device === 'mobile'  ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>📱</button>
                  </div>
                )}
                <span className="hidden sm:block text-[8px] font-mono text-muted-foreground/30 uppercase tracking-widest">
                  {lang === 'scratch' ? 'drag & drop' : `${code.split('\n').length} lines`}
                </span>
              </div>
            </div>

            {/* Editor + preview split */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              <div className="flex-1 relative min-w-0">
                {lang === 'scratch' ? (
                  <ScratchSynthesisLab onChange={(blocks: any[]) => setCode(blocks.map((b: any) => b.label).join('\n'))} />
                ) : editorMode === 'blocks' ? (
                  <BlocklyEditor xml={blocksXml} language={lang} onChange={(xml: string, gen: string) => { setBlocksXml(xml); setCode(gen); }} />
                ) : (
                  <IntegratedCodeRunner
                    height="100%"
                    language={(lang === 'robotics' ? 'python' : lang) as any}
                    value={code}
                    onChange={(v: string | undefined) => { if (v !== undefined) setCode(v); }}
                    title={activeProject?.title || 'Open Workspace'}
                    onRun={runCode}
                    showHeader={false}
                  />
                )}
              </div>

              {/* HTML live preview desktop */}
              {lang === 'html' && (
                <div className="hidden md:flex w-[45%] flex-col border-l border-border bg-slate-50 dark:bg-slate-900">
                  <div className="h-9 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center px-3 justify-between shrink-0">
                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /><span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Live Preview</span></div>
                    <button onClick={() => setLiveUpdate(!liveUpdate)} className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border transition-all touch-manipulation ${liveUpdate ? 'border-orange-500/30 text-orange-500 bg-orange-50 dark:bg-orange-500/10' : 'border-slate-300 text-slate-400'}`}>{liveUpdate ? 'Live: ON' : 'Live: OFF'}</button>
                  </div>
                  <div className="flex-1 flex items-center justify-center p-3 overflow-hidden bg-slate-200 dark:bg-slate-800">
                    <div className={`bg-white shadow-2xl overflow-hidden transition-all duration-500 ${device === 'mobile' ? 'w-[375px] h-[667px] rounded-[2.5rem] border-[10px] border-slate-900' : 'w-full h-full rounded-lg border border-slate-200'}`}>
                      <iframe srcDoc={liveUpdate ? code : undefined} className="w-full h-full border-0" title="Live Preview" sandbox="allow-scripts" />
                    </div>
                  </div>
                </div>
              )}

              {/* Robotics simulator desktop */}
              {lang === 'robotics' && (
                <div className="hidden lg:flex w-72 flex-col border-l border-border bg-card/30">
                  <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2"><RocketLaunchIcon className="w-4 h-4 text-cyan-400" /><span className="text-[9px] font-black uppercase tracking-widest text-cyan-400">Simulator</span></div>
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black ${running ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-muted/30 text-muted-foreground border border-border'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'}`} />{running ? 'Active' : 'Standby'}
                    </div>
                  </div>
                  <div className="flex-1 p-3 overflow-y-auto space-y-3" style={{ scrollbarWidth: 'thin' }}>
                    <RobotSimulator code={code} isRunning={running} onFinish={onRobotFinish} commands={robotCmds} />
                    <div className="p-2 bg-muted/20 border border-border rounded-xl">
                      <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-2">Quick Insert</p>
                      <div className="grid grid-cols-2 gap-1">
                        {['robot.forward(50)', 'robot.turnRight(90)', 'robot.penDown()', 'robot.setColor("red")'].map(cmd => (
                          <button key={cmd} onClick={() => setCode((prev: string) => prev + '\n' + cmd)}
                            className="p-1.5 bg-card border border-border rounded-lg hover:border-cyan-500/30 hover:bg-cyan-500/5 text-left transition-all touch-manipulation">
                            <p className="font-mono text-[7px] text-cyan-400 truncate">{cmd}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CONSOLE */}
          <div className={`border-t border-border flex flex-col bg-[#020617] relative shrink-0 ${view === 'output' ? 'flex flex-1 md:flex-none' : 'hidden md:flex'}`}
            style={{ height: view === 'output' ? undefined : `${terminalHeight}px` }}>
            <div onMouseDown={startResizing} className="hidden md:flex absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize items-center justify-center group z-10">
              <div className="w-10 h-1 bg-border rounded-full group-hover:bg-orange-500 transition-colors" />
            </div>
            <div className="h-9 border-b border-border/50 flex items-center px-3 justify-between bg-muted/10 shrink-0 mt-1">
              <div className="flex items-center gap-2">
                <CommandLineIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400/80">{lang === 'html' ? 'Preview' : 'Console'}</span>
                {consoleLogs.length > 0 && <span className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[7px] font-black text-emerald-400">{consoleLogs.length}</span>}
              </div>
              <div className="flex items-center gap-2">
                {running && <span className="flex items-center gap-1 text-[8px] text-emerald-400 font-black animate-pulse"><ArrowPathIcon className="w-3 h-3 animate-spin" />Running…</span>}
                {lang !== 'html' && consoleLogs.length > 0 && (
                  <button onClick={() => setConsoleLogs([])} className="p-1 hover:bg-muted/50 rounded-lg transition-colors touch-manipulation"><TrashIcon className="w-3.5 h-3.5 text-muted-foreground hover:text-rose-400" /></button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs" style={{ scrollbarWidth: 'thin' }}>
              {lang === 'html' ? (
                <div className="w-full h-full min-h-[200px] bg-white rounded-xl overflow-hidden border border-border">
                  <iframe srcDoc={code} className="w-full h-full border-0" title="Output Preview" sandbox="allow-scripts" />
                </div>
              ) : (
                <div className="space-y-1">
                  {consoleLogs.length === 0 && !running && <p className="text-muted-foreground/40 italic text-[11px]">▶ Run your code to see output here…</p>}
                  {consoleLogs.map((log, i) => (
                    <div key={i} className={`py-0.5 pl-3 border-l-2 text-[11px] leading-relaxed ${log.startsWith('❌') ? 'border-rose-500 text-rose-400' : log.startsWith('✅') ? 'border-emerald-500 text-emerald-400' : 'border-emerald-500/30 text-foreground/80'}`}>{log}</div>
                  ))}
                  {running && (
                    <div className="flex items-center gap-2 text-emerald-400/60 text-[10px] animate-pulse">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />executing…
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <nav className="md:hidden shrink-0 border-t border-border bg-card/95 backdrop-blur-xl z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center justify-around px-2 h-16">
          <button onClick={() => setSidebarOpen(true)} className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all touch-manipulation active:scale-95 ${sidebarOpen ? 'text-orange-400 bg-orange-500/10' : 'text-muted-foreground'}`}>
            <Squares2X2Icon className="w-5 h-5" /><span className="text-[7px] font-black uppercase tracking-widest">Menu</span>
          </button>
          <button onClick={() => setView('editor')} className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all touch-manipulation active:scale-95 ${view === 'editor' ? 'text-orange-400 bg-orange-500/10' : 'text-muted-foreground'}`}>
            <CodeBracketIcon className="w-5 h-5" /><span className="text-[7px] font-black uppercase tracking-widest">Code</span>
          </button>
          <button onClick={runCode} disabled={running || lang === 'scratch'}
            className="flex flex-col items-center justify-center w-14 h-14 -mt-5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-2xl shadow-xl shadow-emerald-900/40 border-4 border-background transition-all active:scale-95 touch-manipulation">
            {running ? <ArrowPathIcon className="w-6 h-6 text-white animate-spin" /> : <PlayIcon className="w-6 h-6 text-white" />}
          </button>
          <button onClick={() => setView('output')} className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all touch-manipulation active:scale-95 ${view === 'output' ? 'text-orange-400 bg-orange-500/10' : 'text-muted-foreground'}`}>
            {lang === 'html' ? <EyeIcon className="w-5 h-5" /> : <CommandLineIcon className="w-5 h-5" />}
            <span className="text-[7px] font-black uppercase tracking-widest">{lang === 'html' ? 'Preview' : 'Output'}</span>
          </button>
          {lang === 'robotics' ? (
            <button onClick={() => setView('canvas')} className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all touch-manipulation active:scale-95 ${view === 'canvas' ? 'text-cyan-400 bg-cyan-500/10' : 'text-muted-foreground'}`}>
              <RocketLaunchIcon className="w-5 h-5" /><span className="text-[7px] font-black uppercase tracking-widest">Robot</span>
            </button>
          ) : (
            <button onClick={() => setShowLeaderboard(true)} className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all touch-manipulation active:scale-95 text-muted-foreground hover:text-amber-400">
              <TrophyIcon className="w-5 h-5" /><span className="text-[7px] font-black uppercase tracking-widest">Ranks</span>
            </button>
          )}
        </div>
      </nav>

      {/* LEADERBOARD MODAL */}
      <AnimatePresence>
        {showLeaderboard && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowLeaderboard(false)}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="w-full sm:max-w-sm bg-card border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col">
              <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 bg-muted-foreground/30 rounded-full" /></div>
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-amber-500/10 to-orange-500/10 shrink-0">
                <div className="flex items-center gap-3"><TrophyIcon className="w-5 h-5 text-amber-400" /><div><h3 className="text-sm font-black uppercase tracking-widest">Leaderboard</h3><p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">Top Coders 🏆</p></div></div>
                <button onClick={() => setShowLeaderboard(false)} className="p-2 hover:bg-muted rounded-xl text-muted-foreground transition-colors touch-manipulation"><XMarkIcon className="w-4 h-4" /></button>
              </div>
              <div className="px-5 py-3 border-b border-border bg-muted/5 shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2"><span className="text-2xl">{levelInfo.emoji}</span><div><p className="text-xs font-black">{profile?.full_name || 'You'}</p><p className={`text-[9px] font-black uppercase tracking-widest ${levelInfo.color}`}>{levelInfo.label}</p></div></div>
                  <div className="text-right"><p className={`text-2xl font-black ${levelInfo.color}`}>{levelInfo.pts}</p><p className="text-[8px] text-muted-foreground font-black uppercase">XP Total</p></div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div className={`h-full ${levelInfo.bar} rounded-full`} initial={{ width: 0 }} animate={{ width: `${levelInfo.pct}%` }} transition={{ duration: 0.8 }} />
                </div>
                <p className="text-[8px] text-muted-foreground mt-1">{levelInfo.pct}% to next level</p>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border border-b border-border shrink-0">
                {[{ label: 'Runs', value: totalRuns, icon: '⚡' }, { label: 'Streak', value: `${runStreak}d`, icon: '🔥' }, { label: 'Projects', value: p.projects.length, icon: '📁' }].map(s => (
                  <div key={s.label} className="flex flex-col items-center py-3 gap-0.5"><span className="text-lg">{s.icon}</span><p className="text-sm font-black">{s.value}</p><p className="text-[7px] text-muted-foreground font-black uppercase tracking-widest">{s.label}</p></div>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5" style={{ scrollbarWidth: 'thin' }}>
                {leaderboard.length === 0 ? (
                  <div className="text-center py-8"><ArrowPathIcon className="w-6 h-6 mx-auto text-muted-foreground/30 animate-spin mb-2" /><p className="text-[10px] text-muted-foreground">Loading rankings…</p></div>
                ) : leaderboard.map((entry, i) => {
                  const medals = ['🥇', '🥈', '🥉'];
                  const isMe = entry.portal_user_id === profile?.id;
                  return (
                    <div key={entry.portal_user_id} className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${isMe ? 'bg-orange-500/10 border border-orange-500/20' : 'hover:bg-muted/30'}`}>
                      <span className="text-lg w-7 text-center shrink-0">{medals[i] || `${i + 1}`}</span>
                      <p className={`flex-1 text-[11px] font-bold truncate ${isMe ? 'text-orange-400' : ''}`}>{entry.portal_users?.full_name || 'Coder'}{isMe ? ' 👈' : ''}</p>
                      <p className={`text-[11px] font-black shrink-0 ${isMe ? 'text-orange-400' : 'text-muted-foreground'}`}>{entry.total_points} XP</p>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 pb-5 pt-2 shrink-0">
                <a href="/dashboard/leaderboard" className="block w-full text-center py-3 bg-muted/30 hover:bg-muted/50 border border-border rounded-xl text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all touch-manipulation">Full Leaderboard →</a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI MODAL */}
      <AnimatePresence>
        {showAIModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAIModal(false)}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="w-full sm:max-w-lg bg-card border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 bg-muted-foreground/30 rounded-full" /></div>
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-orange-500/10 to-pink-500/10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-orange-500/20 rounded-xl flex items-center justify-center border border-orange-500/30"><SparklesIcon className="w-5 h-5 text-orange-400" /></div>
                  <div><h3 className="text-sm font-black uppercase tracking-widest">AI Code Generator</h3><p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">for {p.activeLang?.name}</p></div>
                </div>
                <button onClick={() => setShowAIModal(false)} className="p-2 hover:bg-muted rounded-xl text-muted-foreground transition-colors touch-manipulation"><XMarkIcon className="w-4 h-4" /></button>
              </div>
              <div className="p-5 space-y-4">
                <textarea autoFocus value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generateWithAI(); }}
                  placeholder="Describe what you want to build…"
                  className="w-full h-28 bg-muted/30 border border-border hover:border-orange-500/30 focus:border-orange-500/50 rounded-xl p-3 text-sm text-foreground outline-none resize-none transition-all placeholder:text-muted-foreground/40" />
                <div className="flex flex-wrap gap-1.5">
                  {['Fibonacci', 'Bubble sort', 'Calculator', 'Animated button', 'Guess the number', 'Robot square'].map(q => (
                    <button key={q} onClick={() => setAiPrompt(q)} className="px-2.5 py-1 bg-muted/30 hover:bg-orange-500/10 border border-border hover:border-orange-500/30 rounded-full text-[9px] font-bold text-muted-foreground hover:text-orange-400 transition-all touch-manipulation">{q}</button>
                  ))}
                </div>
                <button onClick={generateWithAI} disabled={isAIGenerating || !aiPrompt.trim()}
                  className="w-full h-12 bg-gradient-to-r from-orange-600 to-pink-600 hover:from-orange-500 hover:to-pink-500 disabled:opacity-50 text-white rounded-xl font-black uppercase tracking-widest text-xs transition-all shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] touch-manipulation">
                  {isAIGenerating ? <><ArrowPathIcon className="w-4 h-4 animate-spin" />Generating…</> : <><SparklesIcon className="w-4 h-4" />Generate Code</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:10px}
        ::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.2)}
      `}</style>
    </div>
  );
}
