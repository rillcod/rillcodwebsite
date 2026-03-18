// @refresh reset
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  CodeBracketIcon, PlayIcon, TrashIcon, PlusIcon,
  DocumentDuplicateIcon, CloudArrowUpIcon,
  Squares2X2Icon, CommandLineIcon,
  BeakerIcon, RocketLaunchIcon, SparklesIcon,
  ArrowPathIcon, XMarkIcon, ChevronLeftIcon,
  ChevronRightIcon, ClockIcon, InformationCircleIcon,
  BookOpenIcon, ClipboardDocumentListIcon,
  EyeIcon, ShareIcon, GlobeAltIcon, PuzzlePieceIcon,
  DocumentTextIcon, CheckCircleIcon
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

// Safe dynamic imports
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });
const BlocklyEditor = dynamic(() => import('@/components/studio/BlocklyEditor'), { ssr: false });

import { LAB_EXAMPLES } from '@/data/lab-examples';

// ─── Constants ──────────────────────────────────────────────
const LANGUAGES = [
  { id: 'python', name: 'Python', icon: '/icons/python.svg', color: 'text-blue-400', desc: 'Powerful & Readable' },
  { id: 'javascript', name: 'JavaScript', icon: '/icons/javascript.svg', color: 'text-yellow-400', desc: 'Web & Beyond' },
  { id: 'blockly', name: 'Blockly Studio', icon: '/icons/puzzle.svg', color: 'text-emerald-400', desc: 'Visual Logic Engine' },
  { id: 'html', name: 'HTML/CSS', icon: '/icons/html5.svg', color: 'text-orange-400', desc: 'UI & Web Design' },
  { id: 'robotics', name: 'Robotics Lab', icon: '/icons/robot.svg', color: 'text-blue-500', desc: 'Simulate & Code' },
];

const STARTER_CODE: Record<string, string> = {
  python: 'print("Hello, Rillcod Technologies!")\n\n# Try creating a loop\nfor i in range(5):\n    print(f"Counting: {i}")',
  javascript: 'console.log("Hello from Rillcod!");\n\nconst greet = (name) => {\n  console.log(`Hello, ${name}!`);\n};\n\ngreet("Student");',
  html: '<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { background: #0f172a; color: white; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }\n    .card { background: rgba(255,255,255,0.05); padding: 2rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.1); text-align: center; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }\n    h1 { color: #8b5cf6; margin: 0; }\n  </style>\n</head>\n<body>\n  <div class="card">\n    <h1>Rillcod Web Studio</h1>\n    <p>Edit this code to see changes live!</p>\n  </div>\n</body>\n</html>',
  robotics: '# Write Python to control the robot!\n# Use commands like:\n# robot.forward(100)\n# robot.turnRight(90)\n\nrobot.forward(100)\nrobot.turnRight(90)\nrobot.forward(100)\nrobot.turnRight(90)\nrobot.forward(100)\nrobot.turnRight(90)\nrobot.forward(100)\nrobot.turnRight(90)',
  blockly: '',
};

interface LabProject {
  id: string;
  title: string;
  language: string;
  code: string;
  blocks_xml?: string;
  updated_at: string;
}

// ─── Robot Simulator ─────────────────────────────────────────
function RobotSimulator({ code, isRunning, onFinish }: { code: string; isRunning: boolean; onFinish: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let requestRef: number;
    let robot = { x: 300, y: 300, angle: 0, color: '#8b5cf6', path: [] as {x: number, y: number, color: string, pen: boolean}[] };
    let commands: any[] = [];
    
    const lines = code.split('\n');
    lines.forEach(line => {
      const move = line.match(/robot\.forward\((\d+)\)/);
      const turn = line.match(/robot\.turnRight\((\d+)\)/);
      const turnL = line.match(/robot\.turnLeft\((\d+)\)/);
      const penD = line.match(/robot\.penDown\(\)/);
      const penU = line.match(/robot\.penUp\(\)/);
      const color = line.match(/robot\.setColor\(['"](.+)['"]\)/);

      if (move) commands.push({ type: 'move', val: parseInt(move[1]) });
      if (turn) commands.push({ type: 'turn', val: parseInt(turn[1]) });
      if (turnL) commands.push({ type: 'turn', val: -parseInt(turnL[1]) });
      if (penD) commands.push({ type: 'pen', val: true });
      if (penU) commands.push({ type: 'pen', val: false });
      if (color) commands.push({ type: 'color', val: color[1] });
    });

    let currentCmdIdx = 0;
    let progress = 0;
    let isPenDown = true;
    let currentColor = '#8b5cf6';
    let startX = robot.x;
    let startY = robot.y;
    let startAngle = robot.angle;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for(let i=0; i<canvas.width; i+=40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
      }

      // Draw Path segments
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      let segments = robot.path;
      for(let i=1; i<segments.length; i++) {
        if (segments[i].pen) {
          ctx.strokeStyle = segments[i].color;
          ctx.beginPath();
          ctx.moveTo(segments[i-1].x, segments[i-1].y);
          ctx.lineTo(segments[i].x, segments[i].y);
          ctx.stroke();
        }
      }

      // Draw Robot
      ctx.save();
      ctx.translate(robot.x, robot.y);
      ctx.rotate((robot.angle * Math.PI) / 180);
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-20, -20, 40, 40, 8);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = currentColor;
      ctx.beginPath(); ctx.moveTo(10, -5); ctx.lineTo(18, 0); ctx.lineTo(10, 5); ctx.fill();
      ctx.beginPath();
      ctx.arc(-8, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = isRunning ? '#10b981' : '#f43f5e';
      ctx.fill();
      ctx.restore();
    };

    const animate = () => {
      if (!isRunning) {
        render();
        return;
      }

      if (currentCmdIdx >= commands.length) {
        onFinish();
        render(); // final frame
        return;
      }

      const cmd = commands[currentCmdIdx];
      render();

      if (cmd.type === 'move') {
        progress += 4;
        const rad = (robot.angle * Math.PI) / 180;
        robot.x = startX + Math.cos(rad) * progress;
        robot.y = startY + Math.sin(rad) * progress;
        if (progress >= cmd.val) {
          robot.path.push({ x: robot.x, y: robot.y, color: currentColor, pen: isPenDown });
          currentCmdIdx++;
          progress = 0;
          startX = robot.x;
          startY = robot.y;
        }
      } else if (cmd.type === 'turn') {
        progress += 4;
        robot.angle = startAngle + (progress * (cmd.val > 0 ? 1 : -1));
        if (Math.abs(progress) >= Math.abs(cmd.val)) {
          currentCmdIdx++;
          progress = 0;
          startAngle = robot.angle;
        }
      } else if (cmd.type === 'pen') {
        isPenDown = cmd.val;
        currentCmdIdx++;
      } else if (cmd.type === 'color') {
        currentColor = cmd.val;
        currentCmdIdx++;
      }

      requestRef = requestAnimationFrame(animate);
    };

    if (isRunning) {
      requestRef = requestAnimationFrame(animate);
    } else {
      render(); // Static render
    }
    
    return () => cancelAnimationFrame(requestRef);
  }, [isRunning, code, onFinish]);

  return (
    <div className="relative w-full h-[350px] bg-[#0d1526] rounded-[2rem] overflow-hidden border border-white/10 group shadow-2xl">
      <div className="absolute top-6 left-6 z-10">
        <div className="flex items-center gap-3 px-4 py-2 bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 shadow-xl">
          <div className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'}`} />
          <span className="text-[10px] font-black text-white/70 uppercase tracking-[0.2em]">{isRunning ? 'Neural link Active' : 'Rill-Sim Standby'}</span>
        </div>
      </div>
      <canvas ref={canvasRef} width={600} height={600} className="w-full h-full" />
      <div className="absolute bottom-6 right-6 text-[9px] text-white/10 font-mono uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full">
        Vector Core v2.4 // 60FPS
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function CodeStudioPage() {
  const { profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const lessonId = searchParams.get('lessonId');
  const assignmentId = searchParams.get('assignmentId');

  const [lang, setLang] = useState('python');
  const [editorMode, setEditorMode] = useState<'code' | 'blocks'>('code');
  const [tab, setTab] = useState<'projects' | 'browse' | 'canvas'>('projects');
  const [showBuilder, setShowBuilder] = useState(false);

  const htmlSnippets = [
    { name: 'Navbar', category: 'UI', code: '<nav style="background: #1e293b; padding: 1rem; color: white; display: flex; justify-content: space-between; align-items: center; border-radius: 0.5rem; margin-bottom: 1rem;">\n  <div style="font-weight: bold;">Rillcod Technologies</div>\n  <div style="display: flex; gap: 1rem; font-size: 0.8rem;">\n    <a>Home</a>\n    <a>Lessons</a>\n    <a>Profile</a>\n  </div>\n</nav>' },
    { name: 'Button', category: 'UI', code: '<button style="background: linear-gradient(to right, #8b5cf6, #6366f1); color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 0.75rem; font-weight: bold; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform=\'scale(1.05)\'" onmouseout="this.style.transform=\'scale(1)\'">Get Started</button>' },
    { name: 'Glass Card', category: 'UX', code: '<div style="background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); padding: 2rem; border-radius: 1.5rem; border: 1px solid rgba(255, 255, 255, 0.1); color: white; box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);">\n  <h3 style="margin-top: 0; color: #a78bfa;">Lesson Title</h3>\n  <p style="opacity: 0.7; font-size: 0.9rem;">Master the art of coding with Rillcod Studio.</p>\n</div>' },
    { name: 'Input Field', category: 'UI', code: '<div style="margin-bottom: 1rem;">\n  <label style="display: block; font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.25rem;">Email Address</label>\n  <input type="email" placeholder="you@example.com" style="width: 100%; background: #0f172a; border: 1px solid #334155; border-radius: 0.5rem; padding: 0.5rem; color: white; outline: none; focus: border-violet-500;" />\n</div>' },
    { name: 'Grid Layout', category: 'UX', code: '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">\n  <div style="background: #1e293b; padding: 1rem; border-radius: 1rem;">Item 1</div>\n  <div style="background: #1e293b; padding: 1rem; border-radius: 1rem;">Item 2</div>\n  <div style="background: #1e293b; padding: 1rem; border-radius: 1rem;">Item 3</div>\n</div>' },
    { name: 'Footer', category: 'UI', code: '<footer style="margin-top: 3rem; padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.1); text-align: center; color: rgba(255,255,255,0.4); font-size: 0.8rem;">\n  <p>&copy; 2026 Rillcod Technologies. Powered by passion.</p>\n</footer>' },
  ];

  const insertSnippet = (s: string) => {
    setCode(prev => prev + '\n' + s);
    toast.success('Component added!');
  };
  const [code, setCode] = useState(STARTER_CODE.python);
  const [blocksXml, setBlocksXml] = useState('');
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [projects, setProjects] = useState<LabProject[]>([]);
  const [activeProject, setActiveProject] = useState<LabProject | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAIModal, setShowAIModal] = useState(false);
  const [view, setView] = useState<'editor' | 'preview'>('editor');
  const [isPyodideLoading, setIsPyodideLoading] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [liveUpdate, setLiveUpdate] = useState(true);
  const [isAIGenerating, setIsAIGenerating] = useState(false);

  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin';

  const pyodideRef = useRef<any>(null);

  // ── Load Pyodide ──
  const initPyodide = useCallback(async () => {
    if (pyodideRef.current || isPyodideLoading) return;
    
    setIsPyodideLoading(true);
    try {
      if (!(window as any).loadPyodide) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error("Failed to download Python engine."));
          document.head.appendChild(script);
        });
      }
      
      if (!pyodideRef.current) {
        const py = await (window as any).loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/",
        });
        pyodideRef.current = py;
      }
    } catch (e: any) {
      console.error("Pyodide Load Error:", e);
      toast.error(e.message || "Failed to start Python environment.");
    } finally {
      setIsPyodideLoading(false);
    }
  }, [isPyodideLoading]);

  useEffect(() => {
    if (lang === 'python' || lang === 'robotics') {
      initPyodide();
    }
  }, [lang, initPyodide]);

  // ── Load Projects ──
  useEffect(() => {
    if (profile) {
      fetch('/api/lab/projects')
        .then(res => res.json())
        .then(d => setProjects(d.data ?? []));
    }
  }, [profile]);

  // ── Run Code ──
  const runCode = async () => {
    setRunning(true);
    setConsoleLogs([]);
    
    if (lang === 'html') {
      // HTML is handled by preview iframe
      setRunning(false);
      return;
    }

    if (lang === 'python' || lang === 'robotics') {
      try {
        if (!pyodideRef.current) {
          toast.error("Python environment still loading...");
          setRunning(false);
          return;
        }
        
        // Redirect stdout
        pyodideRef.current.runPython(`
import sys
import io
sys.stdout = io.StringIO()
`);
        
        await pyodideRef.current.runPythonAsync(code);
        const stdout = pyodideRef.current.runPython("sys.stdout.getvalue()");
        setConsoleLogs(stdout.split('\n').filter(Boolean));
      } catch (err: any) {
        console.error("Python Execution Error:", err);
        setConsoleLogs([`Error: ${err.message}`]);
        toast.error("Execution failed. Check console for details.");
      } finally {
        setRunning(false);
      }
    } else if (lang === 'javascript') {
      try {
        const logs: string[] = [];
        const customConsole = {
          log: (...args: any[]) => logs.push(args.map(a => String(a)).join(' ')),
          error: (...args: any[]) => logs.push(`Error: ${args.map(a => String(a)).join(' ')}`),
        };
        const run = new Function('console', code);
        run(customConsole);
        setConsoleLogs(logs);
      } catch (err: any) {
        setConsoleLogs([`Runtime Error: ${err.message}`]);
      }
    }

    setRunning(false);
  };

  const generateWithAI = async () => {
    if (!isTeacher) return;
    if (!aiPrompt.trim()) return;
    
    setIsAIGenerating(true);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          type: 'code-generation',
          topic: aiPrompt, 
          subject: lang 
        })
      });
      const d = await res.json();
      if (res.ok && d.data?.code) {
        setCode(d.data.code);
        toast.success(`Generated ${lang} code!`);
        setShowAIModal(false);
        setAiPrompt('');
      } else {
        // Fallback for demo/missing API
        toast.info("AI Service in maintenance. Defaulting to template...");
        const fallback = (LAB_EXAMPLES as any)[lang]?.[0]?.code || STARTER_CODE[lang];
        setCode(fallback);
      }
    } catch (e) {
      toast.error('AI Link failed. Check connection.');
    }
    setIsAIGenerating(false);
  };

  // ── Save Project ──
  const saveProject = async () => {
    if (!profile) {
      toast.error('Login to save your work!');
      return;
    }
    setIsSaving(true);
    
    const payload: any = {
      title: activeProject?.title || (lessonId ? `Lesson Project` : assignmentId ? `Assignment Submission` : `Untitled ${lang}`),
      language: lang,
      code,
      blocks_xml: editorMode === 'blocks' ? blocksXml : undefined,
    };

    if (lessonId) payload.lesson_id = lessonId;
    if (assignmentId) payload.assignment_id = assignmentId;

    try {
      if (activeProject) {
        const res = await fetch(`/api/lab/projects/${activeProject.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) toast.success('Changes saved');
      } else {
        const res = await fetch('/api/lab/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const d = await res.json();
        if (res.ok) {
          setActiveProject(d.data);
          setProjects(prev => [d.data, ...prev]);
          toast.success('Project created!');
        }
      }
    } catch (e) {
      toast.error('Failed to save');
    }
    setIsSaving(false);
  };

  const createNew = () => {
    setActiveProject(null);
    setCode(STARTER_CODE[lang] || '');
    setBlocksXml('');
    setEditorMode('code');
  };

  const loadProject = (p: LabProject) => {
    setActiveProject(p);
    setLang(p.language);
    setCode(p.code);
    setBlocksXml(p.blocks_xml || '');
    setEditorMode(p.blocks_xml ? 'blocks' : 'code');
  };

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this project?')) return;
    const res = await fetch(`/api/lab/projects/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setProjects(prev => prev.filter(p => p.id !== id));
      if (activeProject?.id === id) setActiveProject(null);
      toast.success('Deleted');
    }
  };

  // Handle lang change
  const handleLangChange = (id: string) => {
    if (id === 'blockly') {
      setLang('python'); // Blockly generates python by default here
      setEditorMode('blocks');
    } else {
      setLang(id);
      if (!activeProject) setCode(STARTER_CODE[id] || '');
      setEditorMode('code');
    }
  };

  if (authLoading) return null;

  return (
    <div className="h-screen bg-[#020617] text-white flex flex-col overflow-hidden selection:bg-violet-500/30">
      
      {/* ─── Top Bar ─── */}
      <header className="h-8 border-b border-white/5 flex items-center justify-between px-3 bg-[#0d1526]/80 backdrop-blur-xl z-[45] sticky top-0">
        <div className="flex items-center gap-2">
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} className="p-1 hover:bg-white/5 rounded-md text-white/40">
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <h1 className="text-[9px] font-black tracking-tighter uppercase text-white/30 truncate max-w-[100px]">{activeProject ? activeProject.title : 'Playground'}</h1>
            <div className="h-2 w-[1px] bg-white/10" />
            <p className="text-[8px] text-violet-400/80 font-black uppercase tracking-widest">{lang}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 font-black uppercase text-[9px] tracking-widest">
          {lessonId && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/10 rounded-lg text-amber-500/60">
              <BookOpenIcon className="w-3 h-3" />
              <span className="hidden sm:inline">Lesson</span>
            </div>
          )}
          {assignmentId && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-rose-500/10 border border-rose-500/10 rounded-lg text-rose-500/60">
              <ClipboardDocumentListIcon className="w-3 h-3" />
              <span className="hidden sm:inline">Homework</span>
            </div>
          )}
          {(lang === 'python' || lang === 'robotics') && !pyodideRef.current && (
             <div className="flex items-center bg-blue-500/5 rounded-full px-2 py-1">
               {isPyodideLoading ? (
                 <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
               ) : (
                 <button onClick={initPyodide} className="flex items-center gap-1 text-blue-400/60 hover:text-blue-400 transition-colors">
                   <ArrowPathIcon className="w-3 h-3" /> <span>Engine</span>
                 </button>
               )}
             </div>
          )}
          {isTeacher && (
             <button onClick={() => setShowAIModal(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-violet-600/10 hover:bg-violet-600/20 border border-violet-500/20 rounded-lg text-violet-400 transition-all">
              <SparklesIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">AI Draft</span>
            </button>
          )}
          <button onClick={saveProject} disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-white/40 transition-all">
            <CloudArrowUpIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isSaving ? 'Saving' : 'Save'}</span>
          </button>
          <button onClick={runCode} disabled={running || lang === 'scratch'}
            className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white transition-all shadow-lg shadow-emerald-900/40">
            {running ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <PlayIcon className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Execute</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex min-h-0 relative">
        
        {/* ─── Sidebar: Projects & Languages ─── */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              className="fixed inset-y-0 left-0 w-72 md:relative md:w-72 border-r border-white/10 bg-[#0d1526]/95 backdrop-blur-xl flex flex-col z-[50]"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-black/20">
                <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">Studio Explorer</span>
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-white/5 rounded-lg text-white/30 transition-all">
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                
                {/* Mode Selector */}
                <div>
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] block mb-4 pl-1">Engineering Environments</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {LANGUAGES.map(l => (
                      <button 
                        key={l.id} 
                        onClick={() => handleLangChange(l.id)}
                        className={`group flex items-center gap-3 p-2.5 rounded-2xl transition-all relative ${lang === l.id ? 'bg-violet-600/10 ring-1 ring-violet-500/30' : 'hover:bg-white/5 opacity-40 hover:opacity-100'}`}
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${lang === l.id ? 'bg-violet-600 text-white' : 'bg-white/5 text-white/30'}`}>
                           {l.id === 'python' && <CodeBracketIcon className="w-4 h-4" />}
                           {l.id === 'javascript' && <SparklesIcon className="w-4 h-4" />}
                           {l.id === 'html' && <GlobeAltIcon className="w-4 h-4" />}
                           {l.id === 'blockly' && <PuzzlePieceIcon className="w-4 h-4" />}
                           {l.id === 'robotics' && <RocketLaunchIcon className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-[10px] font-black tracking-tight uppercase ${lang === l.id ? 'text-white' : 'text-white/40'}`}>{l.name}</p>
                          <p className="text-[7px] text-white/20 font-black uppercase tracking-widest leading-none mt-0.5">{l.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Projects List */}
                {profile && (
                  <div>
                    <div className="flex items-center justify-between mb-3 px-1">
                      <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">My Projects</label>
                      <button onClick={createNew} className="p-1 hover:bg-white/10 rounded text-violet-400 group">
                        <PlusIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {projects.length === 0 && (
                        <div className="p-8 text-center border-2 border-dashed border-white/5 rounded-2xl">
                          <BeakerIcon className="w-8 h-8 mx-auto text-white/5 mb-2" />
                          <p className="text-[10px] text-white/20 font-bold uppercase">No projects yet</p>
                        </div>
                      )}
                      {projects.map(p => (
                        <div 
                          key={p.id}
                          onClick={() => loadProject(p)}
                          className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${activeProject?.id === p.id ? 'bg-white/10 ring-1 ring-white/10' : 'hover:bg-white/5 opacity-60 hover:opacity-100'}`}
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <ClockIcon className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />
                            <div className="truncate">
                              <p className="text-xs font-bold truncate">{p.title}</p>
                              <p className="text-[9px] text-white/20 tracking-wider">Lately: {new Date(p.updated_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <button onClick={(e) => deleteProject(p.id, e)} className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 text-white/20 hover:text-rose-400 rounded-lg transition-all">
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lab Examples */}
                <div>
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] block mb-3 pl-1">Starter Examples</label>
                  <div className="grid grid-cols-1 gap-2">
                    {((LAB_EXAMPLES as any)[lang] || []).map((ex: any) => (
                      <button 
                        key={ex.name} 
                        onClick={() => { setCode(ex.code); toast.info(`Loaded: ${ex.name}`); }}
                        className="text-left p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all group"
                      >
                        <p className="text-[11px] font-bold text-white/70 group-hover:text-violet-400 transition-colors">{ex.name}</p>
                        <p className="text-[9px] text-white/20 font-medium mt-0.5 line-clamp-1">{ex.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ─── Editor Canvas ─── */}
        <div className={`flex-1 flex flex-col min-w-0 bg-[#020617] relative ${view === 'preview' && 'hidden md:flex'}`}>
          <div className="flex-1 flex flex-col overflow-hidden">
             {/* Tab Headers */}
            <div className="h-8 bg-[#0d1526]/50 border-b border-white/5 flex items-center px-4 justify-between">
              <div className="flex gap-1">
                <button onClick={() => setEditorMode('code')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${editorMode === 'code' ? 'bg-violet-600/20 text-violet-400' : 'text-white/30 hover:text-white'}`}>
                  Text Editor
                </button>
                {(lang === 'python' || lang === 'javascript') && (
                  <button onClick={() => setEditorMode('blocks')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${editorMode === 'blocks' ? 'bg-emerald-600/20 text-emerald-400' : 'text-white/30 hover:text-white'}`}>
                    Blockly Mode
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                 <span className="hidden sm:inline text-[10px] font-mono text-white/20 uppercase tracking-widest">UTF-8 // active</span>
                 <button onClick={() => setView('preview')} className="md:hidden px-3 py-1 bg-violet-600 text-white text-[10px] font-black uppercase rounded-lg">View Output</button>
              </div>
            </div>

            {/* Editor Component */}
            <div className="flex-1 flex relative overflow-hidden">
              <div className="flex-1 relative">
                {editorMode === 'blocks' ? (
                  <BlocklyEditor xml={blocksXml} language={lang} onChange={(xml, genCode) => { setBlocksXml(xml); setCode(genCode); }} />
                ) : (
                  <MonacoEditor
                    height="100%"
                    language={lang === 'robotics' ? 'python' : lang}
                    theme="vs-dark"
                    value={code}
                    onChange={(v) => { if (v !== undefined) setCode(v); }}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      fontFamily: 'JetBrains Mono, Menlo, monospace',
                      padding: { top: 20 },
                      scrollBeyondLastLine: false,
                      smoothScrolling: true,
                      cursorSmoothCaretAnimation: "on",
                      roundedSelection: true,
                    }}
                  />
                )}
              </div>

              {lang === 'html' && (
                 <div className="hidden lg:flex flex-[1.5] flex-col border-l border-white/10 bg-[#f8fafc] group min-w-[300px] transition-all relative">
                   <div className="h-12 bg-white border-b border-slate-200 flex items-center px-4 md:px-6 justify-between shadow-sm">
                      <div className="flex items-center gap-2 md:gap-4">
                         <div className="hidden sm:flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                           <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Live Server</span>
                         </div>
                         <div className="hidden sm:block h-4 w-px bg-slate-200" />
                         <div className="flex bg-slate-100 p-1 rounded-xl">
                           <button onClick={() => setDevice('desktop')} className={`px-2 md:px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${device === 'desktop' ? 'bg-white shadow-sm text-violet-600' : 'text-slate-400'}`}>Desktop</button>
                           <button onClick={() => setDevice('mobile')} className={`px-2 md:px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${device === 'mobile' ? 'bg-white shadow-sm text-violet-600' : 'text-slate-400'}`}>Mobile</button>
                         </div>
                      </div>
                      <div className="flex items-center gap-2">
                         <button onClick={() => setLiveUpdate(!liveUpdate)} className={`text-[9px] font-black uppercase px-2 md:px-3 py-1 rounded-full border transition-all ${liveUpdate ? 'border-violet-500/30 text-violet-600 bg-violet-50' : 'border-slate-200 text-slate-400'}`}>
                           {liveUpdate ? 'Live: ON' : 'Live: OFF'}
                         </button>
                      </div>
                   </div>
                   <div className="flex-1 bg-slate-200/50 p-4 md:p-8 flex items-center justify-center overflow-hidden">
                     <div className={`bg-white shadow-2xl transition-all duration-500 overflow-hidden relative ${device === 'mobile' ? 'w-[320px] h-[568px] sm:w-[375px] sm:h-[667px] rounded-[2.5rem] border-[10px] sm:border-[12px] border-slate-900' : 'w-full h-full rounded-2xl border border-slate-200'}`}>
                       <iframe srcDoc={code} className="w-full h-full border-0" title="Live Preview" />
                     </div>
                   </div>
                 </div>
              )}

              {lang === 'html' && (
                <div className="hidden xl:block w-56 border-l border-white/5 bg-[#0d1526]/40 p-3 overflow-y-auto">
                  <div className="flex items-center gap-2 mb-4 pl-1">
                    <SparklesIcon className="w-4 h-4 text-violet-400" />
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">UI Builder</p>
                  </div>
                  <div className="space-y-4">
                     {['UI', 'UX'].map(cat => (
                       <div key={cat}>
                         <label className="text-[9px] font-bold text-white/10 uppercase mb-2 block">{cat} Elements</label>
                         <div className="space-y-1.5">
                            {htmlSnippets.filter(s => s.category === cat).map(s => (
                              <button key={s.name} onClick={() => insertSnippet(s.code)}
                                className="w-full p-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-left transition-all group/item">
                                <p className="text-[10px] font-bold text-white/50 group-hover/item:text-violet-300">{s.name}</p>
                                <div className="mt-1 flex gap-0.5">
                                   <div className="h-1 flex-1 bg-violet-500/10 rounded-full" />
                                   <div className="h-1 w-2 bg-white/5 rounded-full" />
                                </div>
                              </button>
                            ))}
                         </div>
                       </div>
                     ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ─── Console/Preview Area ─── */}
           <div className="h-32 lg:h-40 border-t border-white/10 flex flex-col bg-[#020617] ${view === 'editor' && 'hidden md:flex'}">
            <div className="h-8 border-b border-white/5 flex items-center px-4 justify-between bg-black/20">
              <div className="flex items-center gap-2">
                <CommandLineIcon className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400/80">
                  {lang === 'html' ? 'Mobile Live Stream' : 'Console output'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                 <button onClick={() => setView('editor')} className="md:hidden px-3 py-1 bg-white/10 text-white text-[10px] font-black uppercase rounded-lg">Code View</button>
                 {lang !== 'html' && (
                   <button onClick={() => setConsoleLogs([])} className="p-1 hover:bg-white/5 rounded transition-colors" title="Clear console">
                      <TrashIcon className="w-3.5 h-3.5 text-white/30 hover:text-rose-400" />
                   </button>
                 )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-black/40 font-mono text-xs">
               <div className="space-y-1.5 h-full">
                  {lang === 'html' ? (
                    <div className="w-full h-full bg-white rounded-xl overflow-hidden relative border-8 border-slate-900">
                      <iframe srcDoc={code} className="w-full h-full border-0" title="Html Mobile Preview" />
                    </div>
                  ) : (
                    <>
                      {consoleLogs.length === 0 && (
                        <p className="text-white/10 italic">Process standby. Transmit code to begin.</p>
                      )}
                      {consoleLogs.map((log, i) => (
                        <div key={i} className={`py-0.5 border-l-2 pl-3 ${log.startsWith('Error') || log.startsWith('Runtime Error') ? 'border-rose-500 text-rose-400 font-bold' : 'border-emerald-500/30 text-emerald-50/90'}`}>
                          {log}
                        </div>
                      ))}
                      {running && <div className="animate-pulse flex items-center gap-2 text-white/30 italic">Processing neural code...</div>}
                    </>
                  )}
                </div>
            </div>
          </div>
        </div>

        {/* ─── Right Sidebar: Robotics Simulator ─── */}
        {lang === 'robotics' && (
          <aside className={`hidden lg:flex w-80 lg:w-96 border-l border-white/10 bg-[#0d1526]/30 flex flex-col ${view === 'editor' && 'hidden lg:flex'}`}>
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RocketLaunchIcon className="w-5 h-5 text-emerald-400" />
                <h3 className="text-xs font-black uppercase tracking-wider italic">Kinematic Field</h3>
              </div>
              <span className="text-[10px] font-bold text-emerald-500/50 bg-emerald-500/5 px-2 py-0.5 rounded-full border border-emerald-500/10">Active Simulation</span>
            </div>
            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
              <RobotSimulator code={code} isRunning={running} onFinish={() => setRunning(false)} />
              
              <div className="mt-8 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                   <DocumentTextIcon className="w-4 h-4 text-white/20" />
                   <label className="text-[10px] font-black text-white/30 uppercase tracking-widest uppercase">Instruction Manifest</label>
                </div>
                <div className="space-y-2">
                  {[
                    { cmd: 'robot.forward(val)', desc: 'Translate forward along vector' },
                    { cmd: 'robot.turnRight(deg)', desc: 'Rotate clockwise by degrees' },
                    { cmd: 'robot.penDown()', desc: 'Enable trace path' },
                    { cmd: 'robot.setColor(hex)', desc: 'Update laser signature color' },
                  ].map(h => (
                    <div key={h.cmd} className="p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all cursor-help group/doc">
                      <p className="font-mono text-[10px] text-emerald-400 mb-1 group-hover/doc:translate-x-1 transition-transform">{h.cmd}</p>
                      <p className="text-[10px] text-white/40 leading-relaxed font-medium">{h.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        )}

      </main>

      {/* AI Prompt Modal (Shared) */}
      <AnimatePresence>
        {showAIModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#06060c]/80 backdrop-blur-xl">
             <motion.div 
               initial={{ y: 20, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               exit={{ y: 20, opacity: 0 }}
               className="w-full max-w-lg bg-[#0d1526] border border-white/10 rounded-[3rem] p-8 shadow-2xl relative overflow-hidden"
             >
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-violet-500 to-transparent" />
                <button onClick={() => setShowAIModal(false)} className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full text-white/30 transition-all">
                  <XMarkIcon className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-violet-600/20 rounded-2xl flex items-center justify-center border border-violet-500/20">
                    <SparklesIcon className="w-6 h-6 text-violet-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black italic tracking-tighter uppercase">AI Pulse</h3>
                    <p className="text-[10px] text-white/40 font-black uppercase tracking-widest mt-0.5">Neural assistance for {lang}</p>
                  </div>
                </div>

                <div className="space-y-6">
                   <div className="relative group">
                     <textarea
                       autoFocus
                       value={aiPrompt}
                       onChange={(e) => setAiPrompt(e.target.value)}
                       placeholder={`Describe the ${lang} module logic...`}
                       className="w-full h-40 bg-black/40 border border-white/10 group-hover:border-violet-500/30 rounded-[2rem] p-5 text-sm font-medium focus:ring-2 focus:ring-violet-500/40 outline-none resize-none transition-all"
                     />
                     <div className="absolute bottom-5 right-5 text-[9px] text-white/10 font-mono uppercase tracking-[0.3em]">Synapse-2.4</div>
                   </div>

                   <button 
                     onClick={generateWithAI}
                     disabled={isAIGenerating || !aiPrompt.trim()}
                     className="w-full h-14 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all shadow-xl shadow-violet-900/20 flex items-center justify-center gap-3"
                   >
                     {isAIGenerating ? (
                       <><ArrowPathIcon className="w-5 h-5 animate-spin" /> Synthesizing...</>
                     ) : (
                       <><RocketLaunchIcon className="w-5 h-5" /> Execute Prompt</>
                     )}
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
      `}</style>
    </div>
  );
}
