'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/auth-context';
import {
  PlayIcon, ArrowPathIcon, DocumentDuplicateIcon, TrashIcon,
  ChevronDownIcon, BeakerIcon, CodeBracketIcon,
} from '@heroicons/react/24/outline';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false, loading: () => (
  <div className="flex-1 bg-[#1e1e2e] flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
  </div>
) });

function RobotSimulator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [robotState, setRobotState] = useState({ x: 150, y: 150, angle: 0 });
  const [trail, setTrail] = useState<{ x: number, y: number }[]>([]);

  const resetRobot = useCallback(() => {
    setRobotState({ x: 150, y: 150, angle: 0 });
    setTrail([]);
  }, []);

  useEffect(() => {
    (window as any).moveRobotForward = (steps: number) => {
      setRobotState(prev => {
        const rad = (prev.angle - 90) * (Math.PI / 180);
        const nx = prev.x + Math.cos(rad) * steps;
        const ny = prev.y + Math.sin(rad) * steps;
        // Keep in bounds
        const x = Math.max(10, Math.min(290, nx));
        const y = Math.max(10, Math.min(290, ny));
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

    // Draw arena
    ctx.clearRect(0, 0, 300, 300);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 300, 300);
    
    // Grid lines
    ctx.strokeStyle = '#334155';
    ctx.setLineDash([5, 5]);
    for(let i=0; i<300; i+=30) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 300); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(300, i); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw trail
    if (trail.length > 0) {
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(150, 150);
      trail.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }

    // Draw Robot
    ctx.save();
    ctx.translate(robotState.x, robotState.y);
    ctx.rotate(robotState.angle * Math.PI / 180);
    
    // Body
    ctx.fillStyle = '#7c3aed';
    ctx.fillRect(-12, -12, 24, 24);
    // Head/Front
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-8, -15, 16, 5);
    // Wheels
    ctx.fillStyle = '#000';
    ctx.fillRect(-15, -8, 5, 16);
    ctx.fillRect(10, -8, 5, 16);
    
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
        <button onClick={resetRobot} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold uppercase hover:bg-white/10 transition-colors">Reset Pos</button>
        <div className="flex items-center justify-center text-[10px] font-mono text-white/40">
           X: {Math.round(robotState.x)} Y: {Math.round(robotState.y)}
        </div>
      </div>
    </div>
  );
}

const STARTER_CODE: Record<string, string> = {
  javascript: `// 🚀 Welcome to the Rillcod Code Playground!
// Write your JavaScript code here and click Run

function greet(name) {
  return "Hello, " + name + "! Welcome to coding!";
}

console.log(greet("Coder"));

// Try a loop
for (let i = 1; i <= 5; i++) {
  console.log("Count: " + i);
}`,

  python: `# 🚀 Welcome to the Rillcod Code Playground!
# Python runs in your browser via Pyodide

def greet(name):
    return f"Hello, {name}! Welcome to coding!"

print(greet("Coder"))

# Try a loop
for i in range(1, 6):
    print(f"Count: {i}")

# FizzBuzz challenge
for n in range(1, 21):
    if n % 15 == 0:
        print("FizzBuzz")
    elif n % 3 == 0:
        print("Fizz")
    elif n % 5 == 0:
        print("Buzz")
    else:
        print(n)`,

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
  <h1>🚀 My First Web Page!</h1>
  <p>Click the button to see magic happen!</p>
  <button onclick="showMessage()">Click Me!</button>
  <div id="output"></div>
  <script>
    function showMessage() {
      document.getElementById('output').innerHTML =
        '<p>🎉 You just ran JavaScript! You are a coder!</p>';
    }
  </script>
</body>
</html>`,

  scratch: `// SCRATCH MODE
// Use the visual block interface below to create your games.
// If you want to use Python for Scratch-like logic, switch to Robotics mode.
`,

  robotics: `# 🤖 Welcome to Rillcod Robotics Lab!
# Control the robot below using simple commands:
# robot.move_forward(100)
# robot.turn_left(90)
# robot.move_forward(100)
# robot.turn_right(45)

print("Starting Robotic Mission...")

robot.move_forward(50)
robot.turn_right(90)
robot.move_forward(50)
robot.turn_right(90)
robot.move_forward(50)
robot.turn_right(90)
robot.move_forward(50)

print("Square Complete!")
`,
};

const CHALLENGES = [
  { label: '🌟 Hello World', code: `console.log("Hello, World!");`, lang: 'javascript' },
  { label: '🔢 Count to 10', code: `for (let i = 1; i <= 10; i++) {\n  console.log(i);\n}`, lang: 'javascript' },
  { label: '🎯 FizzBuzz', code: `for (let i = 1; i <= 20; i++) {\n  if (i % 15 === 0) console.log("FizzBuzz");\n  else if (i % 3 === 0) console.log("Fizz");\n  else if (i % 5 === 0) console.log("Buzz");\n  else console.log(i);\n}`, lang: 'javascript' },
  { label: '🤖 Robot Square', code: `# Mission: Draw a Square\nfor i in range(4):\n    robot.move_forward(100)\n    robot.turn_right(90)`, lang: 'robotics' },
  { label: '🌀 Robot Spiral', code: `# Mission: Creative Spiral\nlength = 10\nfor i in range(20):\n    robot.move_forward(length)\n    robot.turn_right(45)\n    length += 10`, lang: 'robotics' },
];

type Lang = 'javascript' | 'python' | 'html' | 'scratch' | 'robotics';

function storageKey(userId: string | undefined, l: Lang) {
  return `playground_code_${userId ?? 'guest'}_${l}`;
}

export default function PlaygroundPage() {
  const { profile } = useAuth();
  const [lang, setLang] = useState<Lang>('javascript');
  const [code, setCode] = useState(STARTER_CODE.javascript);
  const [output, setOutput] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'output' | 'preview'>('output');
  const [showChallenges, setShowChallenges] = useState(false);
  const [saved, setSaved] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved code for initial language on mount
  useEffect(() => {
    const stored = localStorage.getItem(storageKey(profile?.id, 'javascript'));
    if (stored) setCode(stored);
  }, [profile?.id]); // eslint-disable-line

  // Auto-save code to localStorage 1s after last keystroke
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
    if (l === 'scratch') setActiveTab('preview');
    else if (l === 'robotics') setActiveTab('preview');
    else setActiveTab('output');
  }

  const runCode = useCallback(async () => {
    setRunning(true);
    setOutput([]);

    if (lang === 'html' || lang === 'scratch') {
      setActiveTab('preview');
      if (iframeRef.current) {
        if (lang === 'html') iframeRef.current.srcdoc = code;
        // Scratch is handled by a direct iframe src change for embedding
      }
      setRunning(false);
      return;
    }

    if (lang === 'javascript') {
      setActiveTab('output');
      const logs: string[] = [];
      const origLog = console.log;
      const origErr = console.error;
      const origWarn = console.warn;

      // Intercept console
      (console as any).log = (...args: any[]) => {
        logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
      };
      (console as any).error = (...args: any[]) => { logs.push('❌ ' + args.join(' ')); };
      (console as any).warn = (...args: any[]) => { logs.push('⚠️ ' + args.join(' ')); };

      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function(code);
        fn();
      } catch (e: any) {
        logs.push(`❌ Error: ${e.message}`);
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
      const isRobotics = lang === 'robotics';
      setOutput([`⏳ Loading ${isRobotics ? 'Robotics Engine' : 'Python engine'}...`]);
      try {
        // Dynamically load Pyodide
        if (!(window as any).pyodide) {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
          await new Promise<void>(res => { script.onload = () => res(); document.head.appendChild(script); });
          (window as any).pyodide = await (window as any).loadPyodide();
        }
        const pyodide = (window as any).pyodide;
        let captured = '';
        pyodide.setStdout({ batched: (s: string) => { captured += s + '\n'; } });
        pyodide.setStderr({ batched: (s: string) => { captured += '❌ ' + s + '\n'; } });
        
        if (isRobotics) {
          // Reset simulator
          if ((window as any).resetRobot) (window as any).resetRobot();
          
          // Inject robot API into Python
          await pyodide.runPythonAsync(`
import js
class Robot:
    def move_forward(self, steps):
        js.window.moveRobotForward(steps)
    def turn_right(self, deg):
        js.window.rotateRobot(deg)
    def turn_left(self, deg):
        js.window.rotateRobot(-deg)
robot = Robot()
          `);
        }

        await pyodide.runPythonAsync(code);
        setOutput(captured ? captured.split('\n').filter(Boolean) : ['(no output)']);
      } catch (e: any) {
        setOutput([`❌ Error: ${e.message}`]);
      }
      setRunning(false);
    }
  }, [lang, code]);

  // Keyboard shortcut Ctrl+Enter to run
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCode(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runCode]);

  return (
    <div className="min-h-screen bg-[#0f0f1a] flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#0d1526] border-b border-white/10 flex-wrap">
        <div className="flex items-center gap-2">
          <CodeBracketIcon className="w-5 h-5 text-violet-400" />
          <span className="text-white font-black text-sm">Code Playground</span>
        </div>

        {/* Language tabs */}
        <div className="flex bg-white/5 rounded-lg p-0.5 gap-0.5">
          {(['javascript', 'python', 'html', 'scratch', 'robotics'] as Lang[]).map(l => (
            <button
              key={l}
              onClick={() => changeLang(l)}
              className={`px-3 py-1 rounded-md text-[10px] font-black uppercase transition-all ${lang === l ? 'bg-violet-600 text-white' : 'text-white/40 hover:text-white'}`}
            >
              {l === 'javascript' ? 'JS' : l === 'python' ? 'Python' : l}
            </button>
          ))}
        </div>

        {/* Challenges dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowChallenges(!showChallenges)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-bold rounded-lg hover:bg-yellow-500/20 transition-colors"
          >
            <BeakerIcon className="w-3.5 h-3.5" /> Challenges <ChevronDownIcon className="w-3 h-3" />
          </button>
          {showChallenges && (
            <div className="absolute top-full left-0 mt-1 bg-[#1a2b54] border border-white/10 rounded-xl shadow-xl z-10 w-48">
              {CHALLENGES.map(c => (
                <button
                  key={c.label}
                  onClick={() => { setCode(c.code); setLang(c.lang as Lang); setShowChallenges(false); }}
                  className="block w-full text-left px-4 py-2.5 text-xs text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {saved && <span className="text-emerald-400 text-[10px] font-bold">Saved</span>}
          <button
            onClick={() => { setCode(STARTER_CODE[lang]); setOutput([]); localStorage.removeItem(storageKey(profile?.id, lang)); }}
            className="p-1.5 text-white/30 hover:text-white transition-colors" title="Reset to starter code">
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(code)}
            className="p-1.5 text-white/30 hover:text-white transition-colors" title="Copy">
            <DocumentDuplicateIcon className="w-4 h-4" />
          </button>
          <button
            onClick={runCode}
            disabled={running}
            className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black rounded-lg transition-colors"
          >
            <PlayIcon className="w-3.5 h-3.5" /> {running ? 'Running...' : 'Run'} <span className="text-emerald-300/60 text-[10px]">⌘↵</span>
          </button>
        </div>
      </div>

      {/* Editor + Output */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden" style={{ height: 'calc(100vh - 120px)' }}>
        {/* Editor */}
        <div className="flex-1 min-h-[300px] md:min-h-0">
          <MonacoEditor
            height="100%"
            language={lang === 'html' ? 'html' : lang}
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
        </div>

        {/* Output panel */}
        <div className="w-full md:w-80 lg:w-96 border-t md:border-t-0 md:border-l border-white/10 flex flex-col bg-[#0a0f1e]">
          {/* Output tabs */}
          <div className="flex border-b border-white/10">
            {(['output', 'preview'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === tab ? 'text-white border-b-2 border-violet-400' : 'text-white/30 hover:text-white'}`}
              >
                {tab === 'output' ? '📟 Console' : '🖥 Preview'}
              </button>
            ))}
            <button onClick={() => setOutput([])} className="ml-auto p-2 text-white/20 hover:text-white/50">
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeTab === 'output' ? (
            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1">
              {output.length === 0 && (
                <p className="text-white/20 text-center mt-8">Click Run to see output</p>
              )}
              {output.map((line, i) => (
                <div key={i} className={`${line.startsWith('❌') ? 'text-rose-400' : line.startsWith('⚠️') ? 'text-yellow-400' : 'text-emerald-300'} leading-relaxed`}>
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
                  src={lang === 'scratch' ? 'https://turbowarp.org/editor?embed' : undefined}
                  className={`w-full h-full border-0 ${lang === 'html' ? 'bg-white' : 'bg-black'}`}
                  sandbox="allow-scripts allow-modals allow-popups allow-forms allow-same-origin"
                  title={lang === 'scratch' ? 'Scratch Preview' : 'HTML Preview'}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
