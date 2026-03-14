// @refresh reset
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { fetchStudentAssignments, fetchLessons } from '@/services/dashboard.service';
import {
  PlayIcon, ArrowPathIcon, DocumentDuplicateIcon, TrashIcon,
  ChevronDownIcon, BeakerIcon, CodeBracketIcon, BookOpenIcon,
  ClipboardDocumentListIcon, XMarkIcon, ArrowsPointingOutIcon,
  CheckCircleIcon, CubeIcon, ClockIcon, AcademicCapIcon,
} from '@heroicons/react/24/outline';

// ── Monaco (code editor) ───────────────────────────────────────
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 bg-[#1e1e2e] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

// ── Blockly toolbox ────────────────────────────────────────────
const BLOCKLY_TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: 'Logic', colour: '#5C81A6',
      contents: [
        { kind: 'block', type: 'controls_if' },
        { kind: 'block', type: 'logic_compare' },
        { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_negate' },
        { kind: 'block', type: 'logic_boolean' },
      ],
    },
    {
      kind: 'category', name: 'Loops', colour: '#5CA65C',
      contents: [
        { kind: 'block', type: 'controls_repeat_ext' },
        { kind: 'block', type: 'controls_whileUntil' },
        { kind: 'block', type: 'controls_for' },
        { kind: 'block', type: 'controls_forEach' },
      ],
    },
    {
      kind: 'category', name: 'Math', colour: '#5C68A6',
      contents: [
        { kind: 'block', type: 'math_number' },
        { kind: 'block', type: 'math_arithmetic' },
        { kind: 'block', type: 'math_single' },
        { kind: 'block', type: 'math_round' },
        { kind: 'block', type: 'math_random_int' },
        { kind: 'block', type: 'math_modulo' },
      ],
    },
    {
      kind: 'category', name: 'Text', colour: '#A6745C',
      contents: [
        { kind: 'block', type: 'text' },
        { kind: 'block', type: 'text_print' },
        { kind: 'block', type: 'text_join' },
        { kind: 'block', type: 'text_length' },
        { kind: 'block', type: 'text_isEmpty' },
      ],
    },
    {
      kind: 'category', name: 'Lists', colour: '#745CA6',
      contents: [
        { kind: 'block', type: 'lists_create_empty' },
        { kind: 'block', type: 'lists_create_with' },
        { kind: 'block', type: 'lists_length' },
        { kind: 'block', type: 'lists_getIndex' },
        { kind: 'block', type: 'lists_setIndex' },
      ],
    },
    { kind: 'category', name: 'Variables', colour: '#A65C81', custom: 'VARIABLE' },
    { kind: 'category', name: 'Functions', colour: '#9A5CA6', custom: 'PROCEDURE' },
  ],
};

// ── Blockly Python workspace ───────────────────────────────────
function BlocklyPython({ onCodeChange }: { onCodeChange: (c: string) => void }) {
  const divRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<any>(null);
  const cbRef = useRef(onCodeChange);
  cbRef.current = onCodeChange;

  useEffect(() => {
    if (!divRef.current) return;
    let disposed = false;

    async function init() {
      const Blockly = await import('blockly');
      const { pythonGenerator } = await import('blockly/python');
      if (disposed || !divRef.current) return;

      const ws = (Blockly as any).inject(divRef.current, {
        toolbox: BLOCKLY_TOOLBOX,
        scrollbars: true,
        trashcan: true,
        zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 2, minScale: 0.3 },
        move: { scrollbars: { horizontal: true, vertical: true }, drag: true, wheel: true },
        sounds: false,
      });
      wsRef.current = ws;

      ws.addChangeListener((e: any) => {
        if (e.isUiEvent) return;
        const code = (pythonGenerator as any).workspaceToCode(ws);
        cbRef.current(code || '# Drag blocks from the left panel to start!\n');
      });

      cbRef.current('# Drag blocks from the left panel to start!\n');
    }

    init();
    return () => {
      disposed = true;
      wsRef.current?.dispose();
      wsRef.current = null;
    };
  }, []); // eslint-disable-line

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-1.5 bg-violet-900/30 border-b border-white/10 text-[10px] text-violet-300 font-bold uppercase tracking-widest flex items-center gap-2 flex-shrink-0">
        <CubeIcon className="w-3.5 h-3.5" />
        Block Editor — drag blocks to build Python code
      </div>
      <div ref={divRef} className="flex-1 min-h-0" />
    </div>
  );
}

// ── Robot simulator ────────────────────────────────────────────
function RobotSimulator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [robotState, setRobotState] = useState({ x: 150, y: 150, angle: 0 });
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);

  const resetRobot = useCallback(() => {
    setRobotState({ x: 150, y: 150, angle: 0 });
    setTrail([]);
  }, []);

  useEffect(() => {
    (window as any).moveRobotForward = (steps: number) => {
      setRobotState(prev => {
        const rad = (prev.angle - 90) * (Math.PI / 180);
        const x = Math.max(10, Math.min(290, prev.x + Math.cos(rad) * steps));
        const y = Math.max(10, Math.min(290, prev.y + Math.sin(rad) * steps));
        setTrail(t => [...t, { x, y }]);
        return { ...prev, x, y };
      });
    };
    (window as any).rotateRobot = (deg: number) => {
      setRobotState(prev => ({ ...prev, angle: prev.angle + deg }));
    };
    (window as any).resetRobot = resetRobot;
  }, [resetRobot]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 300, 300);
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, 300, 300);
    ctx.strokeStyle = '#334155'; ctx.setLineDash([5, 5]);
    for (let i = 0; i < 300; i += 30) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 300); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(300, i); ctx.stroke();
    }
    ctx.setLineDash([]);
    if (trail.length > 0) {
      ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(150, 150);
      trail.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(robotState.x, robotState.y);
    ctx.rotate(robotState.angle * Math.PI / 180);
    ctx.fillStyle = '#7c3aed'; ctx.fillRect(-12, -12, 24, 24);
    ctx.fillStyle = '#f59e0b'; ctx.fillRect(-8, -15, 16, 5);
    ctx.fillStyle = '#000';
    ctx.fillRect(-15, -8, 5, 16); ctx.fillRect(10, -8, 5, 16);
    ctx.restore();
  }, [robotState, trail]);

  return (
    <div className="flex flex-col items-center bg-[#070b14] h-full p-4">
      <div className="relative border-4 border-violet-500/20 rounded-2xl overflow-hidden shadow-2xl">
        <canvas ref={canvasRef} width={300} height={300} className="w-full h-auto bg-black" />
        <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-md rounded text-[10px] font-black uppercase text-violet-400">
          Rillcod Lab 01
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 w-full max-w-[300px]">
        <button onClick={resetRobot} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold uppercase hover:bg-white/10 transition-colors">
          Reset
        </button>
        <div className="flex items-center justify-center text-[10px] font-mono text-white/40">
          X:{Math.round(robotState.x)} Y:{Math.round(robotState.y)}
        </div>
      </div>
    </div>
  );
}

// ── Homework panel ─────────────────────────────────────────────
function HomeworkPanel({ profile, onClose }: { profile: any; onClose: () => void }) {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [tab, setTab] = useState<'hw' | 'lessons'>('hw');

  useEffect(() => {
    if (!profile?.id) return;
    async function load() {
      setLoading(true);
      try {
        const [asgns, lsns] = await Promise.all([
          fetchStudentAssignments(profile.id),
          fetchLessons({ portalUserId: profile.id, role: 'student' }),
        ]);
        setAssignments(asgns.filter((a: any) => a.status !== 'graded'));
        setLessons(lsns.slice(0, 20));
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    }
    load();
  }, [profile?.id]);

  const statusColor: Record<string, string> = {
    missing: 'text-rose-400 bg-rose-500/10',
    pending: 'text-amber-400 bg-amber-500/10',
    submitted: 'text-blue-400 bg-blue-500/10',
    graded: 'text-emerald-400 bg-emerald-500/10',
  };

  const items = tab === 'hw' ? assignments : lessons;

  return (
    <div className="flex flex-col h-full bg-[#0a0f1e] border-l border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 flex-shrink-0">
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          {(['hw', 'lessons'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setSelected(null); }}
              className={`px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all ${tab === t ? 'bg-violet-600 text-white' : 'text-white/40 hover:text-white'}`}>
              {t === 'hw' ? 'Homework' : 'Lessons'}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="p-1 text-white/30 hover:text-white transition-colors">
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Detail view */}
      {selected ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <button onClick={() => setSelected(null)} className="text-violet-400 text-xs hover:text-violet-300">
            ← Back to list
          </button>
          <h3 className="text-white font-bold text-sm leading-tight">
            {selected.assignments?.title ?? selected.title}
          </h3>
          {(selected.assignments?.due_date ?? selected.due_date) && (
            <div className="flex items-center gap-1.5 text-xs text-white/40">
              <ClockIcon className="w-3.5 h-3.5" />
              Due {new Date(selected.assignments?.due_date ?? selected.due_date).toLocaleDateString()}
            </div>
          )}
          {selected.status && (
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor[selected.status] ?? 'text-white/40 bg-white/5'}`}>
              {selected.status}
            </span>
          )}
          {(selected.assignments?.description ?? selected.description) && (
            <div className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap bg-white/5 rounded-xl p-3">
              {selected.assignments?.description ?? selected.description}
            </div>
          )}
          {(selected.assignments?.instructions ?? selected.instructions) && (
            <div>
              <p className="text-[10px] text-violet-400 font-bold uppercase mb-1.5">Instructions</p>
              <div className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap bg-violet-500/10 border border-violet-500/20 rounded-xl p-3">
                {selected.assignments?.instructions ?? selected.instructions}
              </div>
            </div>
          )}
          {selected.feedback && (
            <div>
              <p className="text-[10px] text-emerald-400 font-bold uppercase mb-1.5">Teacher Feedback</p>
              <div className="text-xs text-white/70 leading-relaxed bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                {selected.feedback}
              </div>
            </div>
          )}
          {selected.video_url && (
            <a href={selected.video_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-400 hover:bg-blue-500/20 transition-colors">
              <AcademicCapIcon className="w-4 h-4" /> Watch Lesson Video
            </a>
          )}
        </div>
      ) : (
        /* List view */
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center px-4">
              <CheckCircleIcon className="w-8 h-8 text-emerald-500/40 mb-2" />
              <p className="text-xs text-white/30">
                {tab === 'hw' ? 'No pending homework!' : 'No lessons yet'}
              </p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {items.map((item: any) => {
                const title = item.assignments?.title ?? item.title ?? 'Untitled';
                const due = item.assignments?.due_date ?? item.due_date;
                const course = item.assignments?.courses?.title ?? item.courses?.title;
                const isOverdue = due && new Date(due) < new Date() && item.status === 'missing';
                return (
                  <button key={item.id} onClick={() => setSelected(item)}
                    className="w-full text-left p-3 bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] rounded-xl transition-all group">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-white/80 font-medium group-hover:text-white transition-colors leading-tight">
                        {title}
                      </span>
                      {item.status && (
                        <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${statusColor[item.status] ?? 'text-white/30 bg-white/5'}`}>
                          {item.status}
                        </span>
                      )}
                    </div>
                    {course && <p className="text-[10px] text-white/30 mt-1">{course}</p>}
                    {due && (
                      <p className={`text-[10px] mt-1 flex items-center gap-1 ${isOverdue ? 'text-rose-400' : 'text-white/30'}`}>
                        <ClockIcon className="w-3 h-3" />
                        {isOverdue ? 'Overdue · ' : ''}Due {new Date(due).toLocaleDateString()}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="p-3 border-t border-white/10 flex-shrink-0">
        <Link href="/dashboard/results"
          className="block w-full text-center px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-bold text-white/50 hover:text-white uppercase tracking-wider transition-colors">
          View All Progress
        </Link>
      </div>
    </div>
  );
}

// ── Starter code ───────────────────────────────────────────────
const STARTER_CODE: Record<string, string> = {
  javascript: `// Welcome to the Rillcod Code Playground!
// Write your JavaScript code here and click Run (Ctrl+Enter)

function greet(name) {
  return "Hello, " + name + "! Welcome to coding!";
}

console.log(greet("Coder"));

for (let i = 1; i <= 5; i++) {
  console.log("Count: " + i);
}`,

  python: `# Welcome to the Rillcod Python Playground!
# Switch to BLOCKS mode above to use drag-and-drop blocks.

def greet(name):
    return f"Hello, {name}! Welcome to coding!"

print(greet("Coder"))

for i in range(1, 6):
    print(f"Count: {i}")`,

  html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Page</title>
  <style>
    body { font-family: Arial, sans-serif; background: #1a1a2e; color: white; padding: 20px; }
    h1 { color: #a78bfa; }
    button { background: #7c3aed; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 16px; }
    button:hover { background: #6d28d9; }
    #output { margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px; }
  </style>
</head>
<body>
  <h1>My First Web Page!</h1>
  <button onclick="showMessage()">Click Me!</button>
  <div id="output"></div>
  <script>
    function showMessage() {
      document.getElementById('output').innerHTML =
        '<p>You just ran JavaScript! You are a coder!</p>';
    }
  </script>
</body>
</html>`,

  scratch: `// 🎮 SCRATCH 3 MODE
// A full Scratch blocks editor is open on the right.
// You can drag blocks there to build your games!
// 
// 💡 To load a specific project by ID, type it below:
// Project ID: 60917032
`,

  robotics: `# 🤖 Rillcod Robotics Lab
# Control the robot using commands:
#   robot.move_forward(steps)
#   robot.turn_right(degrees)
#   robot.turn_left(degrees)

print("Starting mission...")

robot.move_forward(50)
robot.turn_right(90)
robot.move_forward(50)
robot.turn_right(90)
robot.move_forward(50)
robot.turn_right(90)
robot.move_forward(50)

print("Square complete!")
`,
};

const CHALLENGES = [
  { label: 'Hello World', code: `console.log("Hello, World!");`, lang: 'javascript' },
  { label: 'Count to 10', code: `for (let i = 1; i <= 10; i++) {\n  console.log(i);\n}`, lang: 'javascript' },
  { label: 'FizzBuzz', code: `for (let i = 1; i <= 20; i++) {\n  if (i % 15 === 0) console.log("FizzBuzz");\n  else if (i % 3 === 0) console.log("Fizz");\n  else if (i % 5 === 0) console.log("Buzz");\n  else console.log(i);\n}`, lang: 'javascript' },
  { label: 'Robot Square', code: `for i in range(4):\n    robot.move_forward(100)\n    robot.turn_right(90)`, lang: 'robotics' },
  { label: 'Robot Spiral', code: `length = 10\nfor i in range(20):\n    robot.move_forward(length)\n    robot.turn_right(45)\n    length += 10`, lang: 'robotics' },
  { label: 'Scratch: Cat Chase', code: `// Scratch Challenge: Cat Chase\nProject ID: 60917032`, lang: 'scratch' },
  { label: 'Scratch: Platformer', code: `// Scratch Challenge: Platformer\nProject ID: 10128407`, lang: 'scratch' },
];

type Lang = 'javascript' | 'python' | 'html' | 'scratch' | 'robotics';
type MobileTab = 'editor' | 'output' | 'homework';

function storageKey(userId: string | undefined, l: Lang) {
  return `playground_code_${userId ?? 'guest'}_${l}`;
}

// ── Main page ──────────────────────────────────────────────────
export default function PlaygroundPage() {
  const { profile } = useAuth();
  const [lang, setLang] = useState<Lang>('javascript');
  const [code, setCode] = useState(STARTER_CODE.javascript);
  const [blockCode, setBlockCode] = useState('# Drag blocks from the left panel to start!\n');
  const [blockMode, setBlockMode] = useState(false);
  const [output, setOutput] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'output' | 'preview'>('output');
  const [showChallenges, setShowChallenges] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scratchUrl, setScratchUrl] = useState('https://turbowarp.org/editor');
  const [hwOpen, setHwOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('editor');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved code on mount
  useEffect(() => {
    const stored = localStorage.getItem(storageKey(profile?.id, 'javascript'));
    if (stored) setCode(stored);
  }, [profile?.id]); // eslint-disable-line

  // Auto-save 1s after keystroke
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(storageKey(profile?.id, lang), code);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 1000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [code, lang, profile?.id]); // eslint-disable-line

  function changeLang(l: Lang) {
    setLang(l);
    const stored = localStorage.getItem(storageKey(profile?.id, l));
    setCode(stored ?? STARTER_CODE[l]);
    setOutput([]);
    setBlockMode(false);
    if (l === 'scratch') {
      setActiveTab('preview');
      setMobileTab('output');
      const c = stored ?? STARTER_CODE[l];
      const match = c.match(/\b(\d{7,12})\b/);
      setScratchUrl(match ? `https://turbowarp.org/${match[1]}/editor` : 'https://turbowarp.org/editor');
    } else if (l === 'robotics') {
      setActiveTab('preview');
      setMobileTab('output');
    } else {
      setActiveTab('output');
    }
  }

  // When in block mode for Python, run the Blockly-generated code; otherwise run Monaco code
  const effectiveCode = lang === 'python' && blockMode ? blockCode : code;

  const runCode = useCallback(async () => {
    setRunning(true);
    setOutput([]);

    if (lang === 'html' || lang === 'scratch') {
      setActiveTab('preview');
      setMobileTab('output');
      if (lang === 'html' && iframeRef.current) iframeRef.current.srcdoc = code;
      if (lang === 'scratch') {
        const match = code.match(/\b(\d{7,12})\b/);
        const target = match ? `https://turbowarp.org/${match[1]}/editor` : 'https://turbowarp.org/editor';
        if (scratchUrl !== target) setScratchUrl(target);
      }
      setRunning(false);
      return;
    }

    if (lang === 'javascript') {
      setActiveTab('output');
      setMobileTab('output');
      const logs: string[] = [];
      const origLog = console.log;
      const origErr = console.error;
      const origWarn = console.warn;
      (console as any).log = (...args: any[]) => {
        logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
      };
      (console as any).error = (...args: any[]) => { logs.push('ERROR: ' + args.join(' ')); };
      (console as any).warn = (...args: any[]) => { logs.push('WARN: ' + args.join(' ')); };
      try {
        // eslint-disable-next-line no-new-func
        new Function(effectiveCode)();
      } catch (e: any) {
        logs.push(`Error: ${e.message}`);
      } finally {
        (console as any).log = origLog;
        (console as any).error = origErr;
        (console as any).warn = origWarn;
      }
      setOutput(logs.length ? logs : ['(no output)']);
      setRunning(false);
      return;
    }

    if (lang === 'python' || lang === 'robotics') {
      setActiveTab('output');
      setMobileTab('output');
      const isRobotics = lang === 'robotics';
      setOutput([`Loading ${isRobotics ? 'Robotics Engine' : 'Python engine'}...`]);
      try {
        if (!(window as any).pyodide) {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
          await new Promise<void>(res => { script.onload = () => res(); document.head.appendChild(script); });
          (window as any).pyodide = await (window as any).loadPyodide();
        }
        const pyodide = (window as any).pyodide;
        let captured = '';
        pyodide.setStdout({ batched: (s: string) => { captured += s + '\n'; } });
        pyodide.setStderr({ batched: (s: string) => { captured += 'Error: ' + s + '\n'; } });
        if (isRobotics) {
          if ((window as any).resetRobot) (window as any).resetRobot();
          await pyodide.runPythonAsync(`
import js
class Robot:
    def move_forward(self, steps): js.window.moveRobotForward(steps)
    def turn_right(self, deg): js.window.rotateRobot(deg)
    def turn_left(self, deg): js.window.rotateRobot(-deg)
robot = Robot()
          `);
        }
        await pyodide.runPythonAsync(effectiveCode);
        setOutput(captured ? captured.split('\n').filter(Boolean) : ['(no output)']);
      } catch (e: any) {
        setOutput([`Error: ${e.message}`]);
      }
      setRunning(false);
    }
  }, [lang, code, blockCode, blockMode, effectiveCode, scratchUrl]);

  // Ctrl+Enter to run
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCode(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runCode]);

  // ── Shared panels ──────────────────────────────────────────
  const editorPanel = (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Python blocks/code toggle */}
      {lang === 'python' && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0d1526] border-b border-white/10 flex-shrink-0">
          <button onClick={() => setBlockMode(false)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all ${!blockMode ? 'bg-violet-600 text-white' : 'text-white/40 hover:text-white'}`}>
            <CodeBracketIcon className="w-3.5 h-3.5" /> Code
          </button>
          <button onClick={() => setBlockMode(true)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all ${blockMode ? 'bg-violet-600 text-white' : 'text-white/40 hover:text-white'}`}>
            <CubeIcon className="w-3.5 h-3.5" /> Blocks
          </button>
          {blockMode && (
            <span className="ml-auto text-[10px] text-violet-400/50 font-mono">
              {blockCode.split('\n').filter(l => l.trim() && !l.startsWith('#')).length} lines generated
            </span>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">
        {lang === 'python' && blockMode ? (
          <BlocklyPython onCodeChange={setBlockCode} />
        ) : (
          <MonacoEditor
            height="100%"
            language={lang === 'html' ? 'html' : lang === 'robotics' ? 'python' : lang === 'scratch' ? 'javascript' : lang}
            value={code}
            onChange={v => setCode(v ?? '')}
            theme="vs-dark"
            options={{
              fontSize: 14,
              fontFamily: '"Fira Code", "Cascadia Code", monospace',
              fontLigatures: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              padding: { top: 16 },
              lineNumbersMinChars: 3,
              folding: true,
              wordWrap: 'on',
            }}
          />
        )}
      </div>
    </div>
  );

  const outputPanel = (
    <div className="flex flex-col bg-[#0a0f1e] h-full overflow-hidden">
      <div className="flex border-b border-white/10 flex-shrink-0">
        {(['output', 'preview'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === t ? 'text-white border-b-2 border-violet-400' : 'text-white/30 hover:text-white'}`}>
            {t === 'output' ? 'Console' : 'Preview'}
          </button>
        ))}
        {lang === 'scratch' && (
          <a href={scratchUrl} target="_blank" rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1.5 px-3 py-2 text-white/40 hover:text-white transition-colors text-[10px] font-bold uppercase"
            title="Open in fullscreen — recommended on mobile">
            <ArrowsPointingOutIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Fullscreen</span>
          </a>
        )}
        <button onClick={() => setOutput([])} className="p-2 text-white/20 hover:text-white/50 ml-auto">
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {activeTab === 'output' ? (
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1">
          {/* Show generated block code preview when in blocks mode and nothing has run yet */}
          {lang === 'python' && blockMode && output.length === 0 && (
            <div className="mb-3 p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl">
              <p className="text-violet-400 text-[10px] font-bold uppercase mb-2">Generated Python:</p>
              <pre className="text-violet-200/70 text-[11px] leading-relaxed whitespace-pre-wrap">{blockCode}</pre>
              <p className="text-white/30 text-[10px] mt-2">Press Run to execute</p>
            </div>
          )}
          {output.length === 0 && !(lang === 'python' && blockMode) && (
            <p className="text-white/20 text-center mt-8">Click Run to see output</p>
          )}
          {output.map((line, i) => (
            <div key={i} className={`leading-relaxed ${line.startsWith('Error') ? 'text-rose-400' : line.startsWith('WARN') ? 'text-yellow-400' : line.startsWith('Loading') ? 'text-blue-400' : 'text-emerald-300'}`}>
              {line}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          {lang === 'robotics' ? (
            <RobotSimulator />
          ) : (
            <iframe
              ref={iframeRef}
              src={lang === 'scratch' ? scratchUrl : undefined}
              className={`w-full h-full border-0 ${lang === 'html' ? 'bg-white' : 'bg-black'}`}
              sandbox="allow-scripts allow-modals allow-popups allow-forms allow-same-origin allow-downloads"
              title={lang === 'scratch' ? 'Scratch 3 Editor' : 'HTML Preview'}
              allow="camera; microphone"
              allowFullScreen
            />
          )}
        </div>
      )}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="h-screen bg-[#0f0f1a] flex flex-col overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#0d1526] border-b border-white/10 flex-shrink-0 flex-wrap gap-y-1.5">
        <div className="flex items-center gap-2">
          <CodeBracketIcon className="w-5 h-5 text-violet-400" />
          <span className="text-white font-black text-sm hidden sm:inline">Playground</span>
        </div>

        {/* Language tabs */}
        <div className="flex bg-white/5 rounded-lg p-0.5 gap-0.5 overflow-x-auto max-w-full">
          {(['javascript', 'python', 'html', 'scratch', 'robotics'] as Lang[]).map(l => (
            <button key={l} onClick={() => changeLang(l)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase whitespace-nowrap transition-all ${lang === l ? 'bg-violet-600 text-white' : 'text-white/40 hover:text-white'}`}>
              {l === 'javascript' ? 'JS' : l === 'python' ? 'Python' : l === 'scratch' ? 'Scratch 3' : l === 'robotics' ? 'Robot' : l}
            </button>
          ))}
        </div>

        {/* Challenges dropdown */}
        <div className="relative hidden sm:block">
          <button onClick={() => setShowChallenges(!showChallenges)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-bold rounded-lg hover:bg-yellow-500/20 transition-colors">
            <BeakerIcon className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Challenges</span>
            <ChevronDownIcon className="w-3 h-3" />
          </button>
          {showChallenges && (
            <div className="absolute top-full left-0 mt-1 bg-[#1a2b54] border border-white/10 rounded-xl shadow-xl z-20 w-48">
              {CHALLENGES.map(c => (
                <button key={c.label}
                  onClick={() => { setCode(c.code); changeLang(c.lang as Lang); setShowChallenges(false); }}
                  className="block w-full text-left px-4 py-2.5 text-xs text-white/70 hover:text-white hover:bg-white/5 transition-colors">
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {saved && <span className="text-emerald-400 text-[10px] font-bold hidden sm:inline">Saved</span>}

          {/* Homework toggle */}
          <button
            onClick={() => { setHwOpen(o => !o); if (!hwOpen) setMobileTab('homework'); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${hwOpen ? 'bg-violet-600 border-violet-500 text-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'}`}>
            <ClipboardDocumentListIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Homework</span>
          </button>

          <button
            onClick={() => { setCode(STARTER_CODE[lang]); setOutput([]); localStorage.removeItem(storageKey(profile?.id, lang)); }}
            className="p-1.5 text-white/30 hover:text-white transition-colors" title="Reset">
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          <button onClick={() => navigator.clipboard.writeText(effectiveCode)}
            className="p-1.5 text-white/30 hover:text-white transition-colors hidden sm:block" title="Copy code">
            <DocumentDuplicateIcon className="w-4 h-4" />
          </button>
          <button onClick={runCode} disabled={running}
            className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black rounded-lg transition-colors">
            <PlayIcon className="w-3.5 h-3.5" />
            {running ? '...' : 'Run'}
            <span className="text-emerald-300/60 text-[10px] hidden sm:inline">Ctrl+Enter</span>
          </button>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="flex-1 min-h-0 hidden md:flex overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {editorPanel}
        </div>
        <div className="w-80 lg:w-96 border-l border-white/10 flex-shrink-0 flex flex-col overflow-hidden">
          {outputPanel}
        </div>
        {hwOpen && (
          <div className="w-72 lg:w-80 flex-shrink-0 border-l border-white/10 overflow-hidden flex flex-col">
            <HomeworkPanel profile={profile} onClose={() => setHwOpen(false)} />
          </div>
        )}
      </div>

      {/* Mobile layout */}
      <div className="flex-1 min-h-0 md:hidden flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-hidden">
          {mobileTab === 'editor' && editorPanel}
          {mobileTab === 'output' && <div className="h-full">{outputPanel}</div>}
          {mobileTab === 'homework' && (
            <HomeworkPanel profile={profile} onClose={() => setMobileTab('editor')} />
          )}
        </div>

        {/* Mobile bottom tabs */}
        <div className="flex-shrink-0 flex border-t border-white/10 bg-[#0d1526]">
          {[
            { id: 'editor' as MobileTab, Icon: CodeBracketIcon, label: 'Editor' },
            { id: 'output' as MobileTab, Icon: BookOpenIcon, label: activeTab === 'preview' ? 'Preview' : 'Console' },
            { id: 'homework' as MobileTab, Icon: ClipboardDocumentListIcon, label: 'Homework' },
          ].map(({ id, Icon, label }) => (
            <button key={id} onClick={() => setMobileTab(id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-bold uppercase transition-colors ${mobileTab === id ? 'text-violet-400' : 'text-white/30'}`}>
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
          <button onClick={runCode} disabled={running}
            className="flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-black uppercase text-emerald-400 disabled:opacity-50 transition-colors">
            <PlayIcon className="w-5 h-5" />
            {running ? '...' : 'Run'}
          </button>
        </div>
      </div>
    </div>
  );
}
