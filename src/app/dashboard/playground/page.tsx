// @refresh reset
'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
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
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { LAB_EXAMPLES } from '@/data/lab-examples';

import StudioUI from './StudioUI';

// ─── Constants ───────────────────────────────────────────────
const LANGUAGES = [
  { id: 'python',     name: 'Python',      emoji: '🐍', color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    desc: 'Powerful & Readable' },
  { id: 'javascript', name: 'JavaScript',  emoji: '⚡', color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30',  desc: 'Web & Beyond' },
  { id: 'html',       name: 'HTML/CSS',    emoji: '🌐', color: 'text-primary',  bg: 'bg-primary/10',  border: 'border-primary/30',  desc: 'UI & Web Design' },
  { id: 'blockly',    name: 'Blockly',     emoji: '🧩', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', desc: 'Visual Logic' },
  { id: 'scratch',    name: 'Scratch Lab', emoji: '🎮', color: 'text-pink-400',    bg: 'bg-pink-500/10',    border: 'border-pink-500/30',    desc: 'Drag-Drop Blocks' },
  { id: 'robotics',   name: 'Robotics',    emoji: '🤖', color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30',    desc: 'Simulate & Code' },
];

const STARTER_CODE: Record<string, string> = {
  python:     `print("Hello, Rillcod! 🚀")\n\nfor i in range(5):\n    print(f"Step {i+1}: Keep coding! 💪")`,
  javascript: `console.log("Hello from Rillcod! 🚀");\n\nconst greet = (name) => console.log(\`Hey \${name}, you're awesome! 🌟\`);\ngreet("Coder");`,
  html:       `<!DOCTYPE html>\n<html>\n<head><style>\nbody{background:#0f172a;color:white;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}\n.card{background:rgba(255,255,255,.05);padding:2rem;border-radius:1.5rem;border:1px solid rgba(255,255,255,.1);text-align:center}\nh1{color:#8b5cf6;margin:0 0 .5rem}\n.btn{background:#8b5cf6;color:white;border:none;padding:.75rem 2rem;border-radius:.75rem;font-weight:bold;cursor:pointer;margin-top:1rem}\n</style></head>\n<body><div class="card">\n  <h1>🚀 Rillcod Studio</h1>\n  <p>Edit this code to see changes live!</p>\n  <button class="btn" onclick="this.textContent='🎉 Clicked!'">Click Me!</button>\n</div></body></html>`,
  robotics:   `# 🤖 Control your robot!\nrobot.forward(100)\nrobot.turnRight(90)\nrobot.forward(100)\nrobot.turnRight(90)\nrobot.forward(100)\nrobot.turnRight(90)\nrobot.forward(100)\nrobot.turnRight(90)`,
  blockly:    '',
};

const HTML_SNIPPETS = [
  { name: 'Navbar',     cat: 'UI',  code: '<nav style="background:#1e293b;padding:1rem;color:white;display:flex;justify-content:space-between;align-items:center;border-radius:.5rem;margin-bottom:1rem"><div style="font-weight:bold">🚀 Rillcod</div><div style="display:flex;gap:1rem;font-size:.8rem"><a>Home</a><a>Lessons</a></div></nav>' },
  { name: 'Button',     cat: 'UI',  code: '<button style="background:linear-gradient(to right,#8b5cf6,#6366f1);color:white;padding:.75rem 1.5rem;border:none;border-radius:.75rem;font-weight:bold;cursor:pointer;transition:transform .2s" onmouseover="this.style.transform=\'scale(1.05)\'" onmouseout="this.style.transform=\'scale(1)\'">✨ Get Started</button>' },
  { name: 'Glass Card', cat: 'UX',  code: '<div style="background:rgba(255,255,255,.05);backdrop-filter:blur(10px);padding:2rem;border-radius:1.5rem;border:1px solid rgba(255,255,255,.1);color:white"><h3 style="margin-top:0;color:#a78bfa">🎯 Title</h3><p style="opacity:.7">Master coding with Rillcod.</p></div>' },
  { name: 'Input',      cat: 'UI',  code: '<div style="margin-bottom:1rem"><label style="display:block;font-size:.75rem;color:#94a3b8;margin-bottom:.25rem">Email</label><input type="email" placeholder="you@example.com" style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:.5rem;padding:.5rem;color:white;outline:none"/></div>' },
  { name: 'Grid',       cat: 'UX',  code: '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem"><div style="background:#1e293b;padding:1rem;border-radius:1rem;text-align:center">📚 Item 1</div><div style="background:#1e293b;padding:1rem;border-radius:1rem;text-align:center">🎯 Item 2</div></div>' },
  { name: 'Footer',     cat: 'UI',  code: '<footer style="margin-top:3rem;padding-top:2rem;border-top:1px solid rgba(255,255,255,.1);text-align:center;color:rgba(255,255,255,.4);font-size:.8rem"><p>© 2026 Rillcod Technologies 🚀</p></footer>' },
];

const XP = { run_code: 5, save_project: 10, submit_assignment: 25, first_run: 20 };

interface LabProject { id: string; title: string; language: string; code: string; blocks_xml?: string; updated_at: string; }
interface UserPoints  { total_points: number; achievement_level: string; }
interface Leader      { portal_user_id: string; total_points: number; portal_users: { full_name: string }; }

// ─── XP Toast ────────────────────────────────────────────────
function XPToast({ xp, reason }: { xp: number; reason: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-amber-500/20 to-primary/20 border border-amber-500/30 rounded-xl shadow-xl">
      <span className="text-2xl animate-bounce">⚡</span>
      <div><p className="text-xs font-black text-amber-400 uppercase tracking-widest">+{xp} XP</p><p className="text-[10px] text-amber-300/70">{reason}</p></div>
    </div>
  );
}

// ─── Robot Simulator ─────────────────────────────────────────
function RobotSimulator({ code, isRunning, onFinish, commands: propCmds }: { code: string; isRunning: boolean; onFinish: () => void; commands?: any[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let raf: number;
    const robot = { x: 300, y: 300, angle: 0, path: [] as { x: number; y: number; color: string; pen: boolean }[] };
    const cmds: any[] = propCmds && propCmds.length ? propCmds : [];
    if (!cmds.length) {
      code.split('\n').forEach(l => {
        const mv = l.match(/robot\.forward\(\s*([\d.]+)\s*\)/);
        const tr = l.match(/robot\.turnRight\(\s*([\d.-]+)\s*\)/);
        const tl = l.match(/robot\.turnLeft\(\s*([\d.-]+)\s*\)/);
        const pd = l.match(/robot\.penDown\(\)/);
        const pu = l.match(/robot\.penUp\(\)/);
        const cl = l.match(/robot\.setColor\(['"](.+)['"]\)/);
        if (mv) cmds.push({ type: 'move',  val: parseFloat(mv[1]) });
        if (tr) cmds.push({ type: 'turn',  val: parseFloat(tr[1]) });
        if (tl) cmds.push({ type: 'turn',  val: -parseFloat(tl[1]) });
        if (pd) cmds.push({ type: 'pen',   val: true });
        if (pu) cmds.push({ type: 'pen',   val: false });
        if (cl) cmds.push({ type: 'color', val: cl[1] });
      });
    }
    let ci = 0, prog = 0, pen = true, col = '#8b5cf6', sx = 300, sy = 300, sa = 0;
    robot.x = 300; robot.y = 300; robot.angle = 0; robot.path = [];
    const draw = () => {
      ctx.clearRect(0, 0, 600, 600);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
      for (let i = 0; i < 600; i += 40) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,600); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(600,i); ctx.stroke(); }
      ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (let i = 1; i < robot.path.length; i++) {
        if (robot.path[i].pen) { ctx.strokeStyle = robot.path[i].color; ctx.beginPath(); ctx.moveTo(robot.path[i-1].x, robot.path[i-1].y); ctx.lineTo(robot.path[i].x, robot.path[i].y); ctx.stroke(); }
      }
      ctx.save(); ctx.translate(robot.x, robot.y); ctx.rotate(robot.angle * Math.PI / 180);
      ctx.shadowBlur = 20; ctx.shadowColor = col; ctx.fillStyle = '#1e293b'; ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-20,-20,40,40,8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(10,-5); ctx.lineTo(20,0); ctx.lineTo(10,5); ctx.fill();
      ctx.beginPath(); ctx.arc(-6,0,4,0,Math.PI*2); ctx.fillStyle = (isRunning && ci < cmds.length) ? '#10b981' : '#f43f5e'; ctx.fill();
      ctx.restore();
    };
    const tick = () => {
      if (!isRunning) { draw(); return; }
      if (ci >= cmds.length) { onFinish(); draw(); return; }
      const c = cmds[ci]; draw();
      if (c.type === 'move') {
        prog += 4; const r = robot.angle * Math.PI / 180;
        robot.x = sx + Math.cos(r) * prog; robot.y = sy + Math.sin(r) * prog;
        if (prog >= c.val) { robot.path.push({ x: robot.x, y: robot.y, color: col, pen }); ci++; prog = 0; sx = robot.x; sy = robot.y; }
      } else if (c.type === 'turn') {
        prog += 4; robot.angle = sa + prog * (c.val > 0 ? 1 : -1);
        if (Math.abs(prog) >= Math.abs(c.val)) { ci++; prog = 0; sa = robot.angle; }
      } else if (c.type === 'pen') { pen = c.val; ci++; }
      else if (c.type === 'color') { col = c.val; ci++; }
      raf = requestAnimationFrame(tick);
    };
    if (isRunning) { if (!cmds.length) { onFinish(); draw(); } else raf = requestAnimationFrame(tick); } else draw();
    return () => cancelAnimationFrame(raf);
  }, [isRunning, code, onFinish, propCmds]);
  return (
    <div className="relative w-full bg-[#0d1526] overflow-hidden border border-border rounded-xl shadow-2xl" style={{ aspectRatio: '1/1', maxHeight: 320 }}>
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-1 bg-black/60 backdrop-blur rounded-lg border border-white/10">
        <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
        <span className="text-[8px] font-black text-white/50 uppercase tracking-widest">{isRunning ? 'Running' : 'Ready'}</span>
      </div>
      <canvas ref={canvasRef} width={600} height={600} className="w-full h-full" />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function CodeStudioPage() {
  const { profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const lessonId     = searchParams.get('lessonId');
  const assignmentId = searchParams.get('assignmentId');

  // ── Editor ──
  const [lang, setLang]               = useState('python');
  const [editorMode, setEditorMode]   = useState<'code'|'blocks'>('code');
  const [code, setCode]               = useState(STARTER_CODE.python);
  const [blocksXml, setBlocksXml]     = useState('');
  const [running, setRunning]         = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [robotCmds, setRobotCmds]     = useState<any[]>([]);

  // ── Projects ──
  const [projects, setProjects]           = useState<LabProject[]>([]);
  const [activeProject, setActiveProject] = useState<LabProject|null>(null);
  const [isSaving, setIsSaving]           = useState(false);

  // ── Assignment ──
  const [assignmentData, setAssignmentData]             = useState<any>(null);
  const [mySubmission, setMySubmission]                 = useState<any>(null);
  const [submittingAssignment, setSubmittingAssignment] = useState(false);
  const [assignmentSubmitted, setAssignmentSubmitted]   = useState(false);
  const [pendingTasks, setPendingTasks]                 = useState<any[]>([]);

  // ── Gamification ──
  const [userPoints, setUserPoints]         = useState<UserPoints|null>(null);
  const [leaderboard, setLeaderboard]       = useState<Leader[]>([]);
  const [runStreak, setRunStreak]           = useState(0);
  const [totalRuns, setTotalRuns]           = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const hasRunOnce = useRef(false);

  // ── UI ──
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [view, setView]                   = useState<'editor'|'output'|'explorer'|'canvas'>('editor');
  const [device, setDevice]               = useState<'desktop'|'mobile'>('desktop');
  const [liveUpdate, setLiveUpdate]       = useState(true);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [showAIModal, setShowAIModal]     = useState(false);
  const [aiPrompt, setAiPrompt]           = useState('');
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [isPyodideLoading, setIsPyodideLoading] = useState(false);
  const [copiedCode, setCopiedCode]       = useState(false);
  const isResizing = useRef(false);
  const pyodideRef = useRef<any>(null);

  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin';

  // ── XP award ──
  const awardXP = useCallback(async (activity_type: string, description: string, xp: number) => {
    if (!profile) return;
    try {
      await fetch('/api/user-points', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal_user_id: profile.id, points: xp, activity_type, description }),
      });
      setUserPoints(prev => prev ? { ...prev, total_points: prev.total_points + xp } : { total_points: xp, achievement_level: 'Bronze' });
      toast.custom(() => <XPToast xp={xp} reason={description} />, { duration: 2500 });
    } catch { /* silent */ }
  }, [profile]);

  // ── Load user points ──
  useEffect(() => {
    if (!profile) return;
    fetch('/api/user-points').then(r => r.json()).then(d => { if (d.points) setUserPoints(d.points); }).catch(() => {});
  }, [profile]);

  // ── Load leaderboard when panel opens ──
  useEffect(() => {
    if (!showLeaderboard) return;
    fetch('/api/user-points?leaderboard=true&limit=10').then(r => r.json()).then(d => setLeaderboard(d.data ?? [])).catch(() => {});
  }, [showLeaderboard]);

  // ── Streak from localStorage ──
  useEffect(() => {
    if (!profile) return;
    const sk = `rillcod_streak_${profile.id}`;
    const rk = `rillcod_runs_${profile.id}`;
    const stored = localStorage.getItem(sk);
    if (stored) {
      const { streak, lastDate } = JSON.parse(stored);
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      setRunStreak(lastDate === today || lastDate === yesterday ? streak : 0);
    }
    setTotalRuns(parseInt(localStorage.getItem(rk) || '0', 10));
  }, [profile]);

  // ── Terminal resize ──
  const handleResize = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isResizing.current) return;
    const y = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
    const h = window.innerHeight - y;
    if (h > 60 && h < window.innerHeight * 0.7) setTerminalHeight(h);
  }, []);
  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResizing);
    document.removeEventListener('touchmove', handleResize);
    document.removeEventListener('touchend', stopResizing);
  }, [handleResize]);
  const startResizing = useCallback(() => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResizing);
    document.addEventListener('touchmove', handleResize);
    document.addEventListener('touchend', stopResizing);
  }, [handleResize, stopResizing]);

  // ── Pyodide ──
  const initPyodide = useCallback(async () => {
    if (pyodideRef.current || isPyodideLoading) return;
    setIsPyodideLoading(true);
    try {
      if (!(window as any).loadPyodide) {
        await new Promise<void>((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js';
          s.onload = () => res(); s.onerror = () => rej(new Error('Python engine failed'));
          document.head.appendChild(s);
        });
      }
      pyodideRef.current = await (window as any).loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/' });
    } catch (e: any) { toast.error(e.message || 'Python engine failed'); }
    finally { setIsPyodideLoading(false); }
  }, [isPyodideLoading]);

  useEffect(() => { if (lang === 'python' || lang === 'robotics') initPyodide(); }, [lang, initPyodide]);

  // ── JS Worker ──
  const runJS = useCallback((src: string): Promise<string[]> => new Promise((res, rej) => {
    const blob = new Blob([`self.onmessage=(e)=>{const L=[];const C={log:(...a)=>L.push(a.map(String).join(' ')),error:(...a)=>L.push('❌ '+a.map(String).join(' '))};try{new Function('console',e.data.code)(C);self.postMessage({ok:true,L});}catch(err){self.postMessage({ok:false,error:err.message,L});}};`], { type: 'application/javascript' });
    const w = new Worker(URL.createObjectURL(blob));
    const t = setTimeout(() => { w.terminate(); rej(new Error('Timed out after 5s')); }, 5000);
    w.onmessage = ev => {
      clearTimeout(t);
      w.terminate();
      if (ev.data.ok) res(ev.data.L); else rej(new Error(ev.data.error));
    };
    w.onerror   = () => { clearTimeout(t); w.terminate(); rej(new Error('Worker error')); };
    w.postMessage({ code: src });
  }), []);

  // ── Load projects ──
  useEffect(() => {
    if (!profile) return;
    fetch('/api/lab/projects').then(r => r.json()).then(d => setProjects(d.data ?? [])).catch(() => {});
  }, [profile]);

  // ── Load assignment ──
  useEffect(() => {
    if (!assignmentId || !profile) return;
    const staff = profile.role === 'admin' || profile.role === 'teacher';
    fetch(staff ? `/api/assignments/${assignmentId}` : `/api/assignments/${assignmentId}/student`)
      .then(r => r.json()).then(d => {
        if (!d.data) return;
        setAssignmentData(d.data);
        if (d.data.starter_code) setCode(d.data.starter_code);
        if (d.data.assignment_type === 'coding') setLang('python');
        const sub = d.data.assignment_submissions?.[0] ?? null;
        setMySubmission(sub);
        if (sub?.submission_text) { const m = sub.submission_text.match(/```[\s\S]*?\n([\s\S]*?)```/); if (m) setCode(m[1]); }
      }).catch(() => {});
  }, [assignmentId, profile]);

  // ── Load pending tasks ──
  useEffect(() => {
    if (!profile || profile.role !== 'student') return;
    const db = createClient();
    db.from('assignments').select('id,title,due_date,max_points,assignment_type,assignment_submissions(id,status)')
      .eq('is_active', true).order('due_date', { ascending: true }).limit(8)
      .then(({ data }) => {
        if (!data) return;
        setPendingTasks(data.filter((a: any) => { const s = a.assignment_submissions?.[0]; return !s || s.status === 'missing'; }).slice(0, 5));
      });
  }, [profile]);

  // ── Run code ──
  const runCode = useCallback(async () => {
    setRunning(true); setConsoleLogs([]);
    if (view === 'editor') setView('output');
    // streak
    if (profile) {
      const today = new Date().toDateString();
      const sk = `rillcod_streak_${profile.id}`;
      const stored = localStorage.getItem(sk);
      let streak = 1;
      if (stored) { const { streak: s, lastDate } = JSON.parse(stored); if (lastDate === today) streak = s; else if (lastDate === new Date(Date.now()-86400000).toDateString()) streak = s+1; }
      localStorage.setItem(sk, JSON.stringify({ streak, lastDate: today }));
      setRunStreak(streak);
      const rk = `rillcod_runs_${profile.id}`;
      const nr = totalRuns + 1; localStorage.setItem(rk, String(nr)); setTotalRuns(nr);
    }
    if (lang === 'html') { setRunning(false); return; }
    if (lang === 'python' || lang === 'robotics') {
      if (!pyodideRef.current) { toast.error('Python engine loading…'); setRunning(false); return; }
      const py = pyodideRef.current; const lines: string[] = [];
      py.setStdout({ batched: (t: string) => t.split('\n').filter(Boolean).forEach((l: string) => lines.push(l)) });
      py.setStderr({ batched: (t: string) => t.split('\n').filter(Boolean).forEach((l: string) => lines.push(`❌ ${l}`)) });
      if (lang === 'robotics') {
        py.runPython(`
class Robot:
    def __init__(self): self.commands=[]
    def forward(self,v): self.commands.append({'type':'move','val':float(v)})
    def turnRight(self,v): self.commands.append({'type':'turn','val':float(v)})
    def turnLeft(self,v): self.commands.append({'type':'turn','val':-float(v)})
    def penDown(self): self.commands.append({'type':'pen','val':True})
    def penUp(self): self.commands.append({'type':'pen','val':False})
    def setColor(self,c): self.commands.append({'type':'color','val':c})
import json; robot=Robot()`);
        setRobotCmds([]);
      }
      try { await py.runPythonAsync(code); } catch (e: any) { lines.push(`❌ ${e.message ?? e}`); }
      if (!lines.length) lines.push('✅ Executed (no output)');
      setConsoleLogs(lines);
      py.setStdout({ batched: () => {} }); py.setStderr({ batched: () => {} });
      if (lang === 'robotics') {
        try { const c = JSON.parse(py.runPython('import json; json.dumps(robot.commands)')); setRobotCmds(c); if (!c.length) setRunning(false); }
        catch { setRunning(false); }
      } else setRunning(false);
    } else if (lang === 'javascript') {
      try { setConsoleLogs(await runJS(code)); } catch (e: any) { setConsoleLogs([`❌ ${e.message}`]); }
      setRunning(false);
    }
    if (!hasRunOnce.current) { hasRunOnce.current = true; await awardXP('first_run', '🎉 First code run!', XP.first_run); }
    else await awardXP('run_code', `Ran ${lang} code`, XP.run_code);
  }, [lang, code, view, profile, totalRuns, runJS, awardXP]);

  // ── Submit assignment ──
  const submitToAssignment = useCallback(async () => {
    if (!assignmentId || !profile || !code.trim()) return;
    setSubmittingAssignment(true);
    try {
      const r = await fetch(`/api/assignments/${assignmentId}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portal_user_id: profile.id, submission_text: `\`\`\`${lang}\n${code}\n\`\`\`\n\nOutput:\n${consoleLogs.join('\n')}` }),
      });
      if (r.ok) { setMySubmission((await r.json()).data); setAssignmentSubmitted(true); toast.success('Submitted! 🎉'); await awardXP('submit_assignment', '📝 Assignment submitted', XP.submit_assignment); }
      else toast.error((await r.json()).error || 'Submission failed');
    } catch { toast.error('Submission failed'); }
    finally { setSubmittingAssignment(false); }
  }, [assignmentId, profile, code, lang, consoleLogs, awardXP]);

  // ── Save project ──
  const saveProject = useCallback(async () => {
    if (!profile) { toast.error('Login to save!'); return; }
    setIsSaving(true);
    const payload: any = { title: activeProject?.title || (lessonId ? 'Lesson Project' : assignmentId ? 'Assignment' : `Untitled ${lang}`), language: lang, code, blocks_xml: editorMode === 'blocks' ? blocksXml : undefined };
    if (lessonId) payload.lesson_id = lessonId;
    if (assignmentId) payload.assignment_id = assignmentId;
    try {
      if (activeProject) {
        const r = await fetch(`/api/lab/projects/${activeProject.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (r.ok) { toast.success('Saved ✅'); await awardXP('save_project', '💾 Project saved', XP.save_project); }
      } else {
        const r = await fetch('/api/lab/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const d = await r.json();
        if (r.ok) { setActiveProject(d.data); setProjects(p => [d.data, ...p]); toast.success('Project created! 🚀'); await awardXP('save_project', '🆕 New project', XP.save_project); }
      }
    } catch { toast.error('Save failed'); }
    setIsSaving(false);
  }, [profile, activeProject, lessonId, assignmentId, lang, code, editorMode, blocksXml, awardXP]);

  const createNew    = useCallback(() => { setActiveProject(null); setCode(STARTER_CODE[lang] || ''); setBlocksXml(''); setEditorMode('code'); }, [lang]);
  const loadProject  = useCallback((p: LabProject) => { setActiveProject(p); setLang(p.language); setCode(p.code); setBlocksXml(p.blocks_xml || ''); setEditorMode(p.blocks_xml ? 'blocks' : 'code'); }, []);
  const deleteProject = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); if (!confirm('Delete this project?')) return;
    const r = await fetch(`/api/lab/projects/${id}`, { method: 'DELETE' });
    if (r.ok) { setProjects(p => p.filter(x => x.id !== id)); if (activeProject?.id === id) setActiveProject(null); toast.success('Deleted'); }
  }, [activeProject]);

  const handleLangChange = useCallback((id: string) => {
    if (id === 'blockly') { setLang('python'); setEditorMode('blocks'); }
    else { setLang(id); if (!activeProject) setCode(STARTER_CODE[id] || ''); setEditorMode('code'); }
  }, [activeProject]);

  const insertSnippet = useCallback((s: string) => { setCode(prev => prev + '\n' + s); toast.success('Component added! ✨'); }, []);

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); toast.success('Code copied!'); });
  }, [code]);

  const generateWithAI = useCallback(async () => {
    if (!isTeacher || !aiPrompt.trim()) return;
    setIsAIGenerating(true);
    try {
      const r = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'code-generation', topic: aiPrompt, subject: lang }) });
      const d = await r.json();
      if (r.ok && d.data?.code) { setCode(d.data.code); toast.success('AI code generated! 🤖'); setShowAIModal(false); setAiPrompt(''); }
      else { setCode((LAB_EXAMPLES as any)[lang]?.[0]?.code || STARTER_CODE[lang]); toast.info('Using template example'); }
    } catch { toast.error('AI failed'); }
    setIsAIGenerating(false);
  }, [isTeacher, aiPrompt, lang]);

  // ── Level info ──
  const levelInfo = useMemo(() => {
    const pts = userPoints?.total_points ?? 0;
    const next = pts >= 5000 ? 10000 : pts >= 2000 ? 5000 : pts >= 500 ? 2000 : 500;
    const prev = pts >= 5000 ? 5000 : pts >= 2000 ? 2000 : pts >= 500 ? 500 : 0;
    const pct  = Math.min(100, Math.round(((pts - prev) / (next - prev)) * 100));
    if (pts >= 5000) return { label: 'Platinum', color: 'text-cyan-300',   bar: 'bg-cyan-400',   emoji: '💎', pts, pct };
    if (pts >= 2000) return { label: 'Gold',     color: 'text-amber-300',  bar: 'bg-amber-400',  emoji: '🥇', pts, pct };
    if (pts >= 500)  return { label: 'Silver',   color: 'text-slate-300',  bar: 'bg-slate-400',  emoji: '🥈', pts, pct };
    return               { label: 'Bronze',   color: 'text-primary', bar: 'bg-primary', emoji: '🥉', pts, pct };
  }, [userPoints]);

  const activeLang = useMemo(() => LANGUAGES.find(l => l.id === lang) || LANGUAGES[0], [lang]);

  if (authLoading) return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-muted-foreground font-black uppercase tracking-widest">Loading Studio…</p>
      </div>
    </div>
  );

  return (
    <StudioUI
      profile={profile}
      isTeacher={isTeacher}
      lang={lang}
      activeLang={activeLang}
      editorMode={editorMode}
      code={code}
      blocksXml={blocksXml}
      running={running}
      consoleLogs={consoleLogs}
      robotCmds={robotCmds}
      isPyodideLoading={isPyodideLoading}
      copiedCode={copiedCode}
      projects={projects}
      activeProject={activeProject}
      isSaving={isSaving}
      assignmentId={assignmentId}
      lessonId={lessonId}
      assignmentData={assignmentData}
      mySubmission={mySubmission}
      submittingAssignment={submittingAssignment}
      assignmentSubmitted={assignmentSubmitted}
      pendingTasks={pendingTasks}
      userPoints={userPoints}
      levelInfo={levelInfo}
      leaderboard={leaderboard}
      runStreak={runStreak}
      totalRuns={totalRuns}
      showLeaderboard={showLeaderboard}
      sidebarOpen={sidebarOpen}
      view={view}
      device={device}
      liveUpdate={liveUpdate}
      terminalHeight={terminalHeight}
      showAIModal={showAIModal}
      aiPrompt={aiPrompt}
      isAIGenerating={isAIGenerating}
      LANGUAGES={LANGUAGES}
      LAB_EXAMPLES={LAB_EXAMPLES}
      HTML_SNIPPETS={HTML_SNIPPETS}
      setCode={setCode}
      setBlocksXml={setBlocksXml}
      setEditorMode={setEditorMode}
      setLang={setLang}
      setSidebarOpen={setSidebarOpen}
      setView={setView}
      setDevice={setDevice}
      setLiveUpdate={setLiveUpdate}
      setShowLeaderboard={setShowLeaderboard}
      setShowAIModal={setShowAIModal}
      setAiPrompt={setAiPrompt}
      setConsoleLogs={setConsoleLogs}
      handleLangChange={handleLangChange}
      runCode={runCode}
      saveProject={saveProject}
      createNew={createNew}
      loadProject={loadProject}
      deleteProject={deleteProject}
      submitToAssignment={submitToAssignment}
      insertSnippet={insertSnippet}
      copyCode={copyCode}
      generateWithAI={generateWithAI}
      startResizing={startResizing}
      initPyodide={initPyodide}
      onRobotFinish={() => setRunning(false)}
      RobotSimulator={RobotSimulator}
    />
  );
}
