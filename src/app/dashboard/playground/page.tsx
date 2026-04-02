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
  DocumentTextIcon, CheckCircleIcon, ArrowUpTrayIcon,
  StarIcon, CalendarIcon, ExclamationTriangleIcon
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

// Safe dynamic imports
const BlocklyEditor = dynamic(() => import('@/components/studio/BlocklyEditor'), { ssr: false });
const ScratchSynthesisLab = dynamic(() => import('@/components/studio/ScratchSynthesisLab'), { ssr: false });
import IntegratedCodeRunner from '@/components/studio/IntegratedCodeRunner';

import { LAB_EXAMPLES } from '@/data/lab-examples';

// ─── Constants ──────────────────────────────────────────────
const LANGUAGES = [
  { id: 'python', name: 'Python', icon: '/icons/python.svg', color: 'text-blue-400', desc: 'Powerful & Readable' },
  { id: 'javascript', name: 'JavaScript', icon: '/icons/javascript.svg', color: 'text-yellow-400', desc: 'Web & Beyond' },
  { id: 'blockly', name: 'Blockly Studio', icon: '/icons/puzzle.svg', color: 'text-emerald-400', desc: 'Visual Logic Engine' },
  { id: 'scratch', name: 'Scratch Lab', icon: '/icons/puzzle.svg', color: 'text-yellow-300', desc: 'Drag-Drop Blocks 🧩' },
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
function RobotSimulator({ code, isRunning, onFinish, commands: propCommands }: { code: string; isRunning: boolean; onFinish: () => void; commands?: any[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let requestRef: number;
    let robot = { x: 300, y: 300, angle: 0, color: '#8b5cf6', path: [] as {x: number, y: number, color: string, pen: boolean}[] };
    let commands: any[] = [];
    
    if (propCommands && propCommands.length > 0) {
      commands = propCommands;
    } else {
      const lines = code.split('\n');
      lines.forEach(line => {
        const move = line.match(/robot\.forward\(\s*([\d.]+)\s*\)/);
        const turn = line.match(/robot\.turnRight\(\s*([\d.-]+)\s*\)/);
        const turnL = line.match(/robot\.turnLeft\(\s*([\d.-]+)\s*\)/);
        const penD = line.match(/robot\.penDown\(\)/);
        const penU = line.match(/robot\.penUp\(\)/);
        const color = line.match(/robot\.setColor\(['"](.+)['"]\)/);

        if (move) commands.push({ type: 'move', val: parseFloat(move[1]) });
        if (turn) commands.push({ type: 'turn', val: parseFloat(turn[1]) });
        if (turnL) commands.push({ type: 'turn', val: -parseFloat(turnL[1]) });
        if (penD) commands.push({ type: 'pen', val: true });
        if (penU) commands.push({ type: 'pen', val: false });
        if (color) commands.push({ type: 'color', val: color[1] });
      });
    }

    let currentCmdIdx = 0;
    let progress = 0;
    let isPenDown = true;
    let currentColor = '#8b5cf6';
    let startX = robot.x;
    let startY = robot.y;
    let startAngle = robot.angle;
    
    // reset state
    robot.x = 300; robot.y = 300; robot.angle = 0; robot.path = [];
    isPenDown = true;
    currentColor = '#8b5cf6';

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
      ctx.fillStyle = (isRunning && currentCmdIdx < commands.length) ? '#10b981' : '#f43f5e';
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
      if (commands.length === 0) {
        onFinish();
        render();
      } else {
        requestRef = requestAnimationFrame(animate);
      }
    } else {
      render(); // Static render
    }
    
    return () => cancelAnimationFrame(requestRef);
  }, [isRunning, code, onFinish, propCommands]);

  return (
    <div className="relative w-full h-[220px] sm:h-[300px] bg-[#0d1526] rounded-none overflow-hidden border border-border group shadow-2xl">
      <div className="absolute top-4 left-4 z-10">
        <div className="flex items-center gap-2 px-3 py-1 bg-black/60 backdrop-blur-xl rounded-none border border-border shadow-xl">
          <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'}`} />
          <span className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.2em]">{isRunning ? 'Active' : 'Standby'}</span>
        </div>
      </div>
      <canvas ref={canvasRef} width={600} height={600} className="w-full h-full" />
      <div className="absolute bottom-4 right-4 text-[7px] text-muted-foreground font-mono uppercase tracking-widest bg-card shadow-sm px-2 py-0.5 rounded-none">
        Sim v2.5 // 60FPS
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

  // Assignment mode state
  const [assignmentData, setAssignmentData] = useState<any>(null);
  const [mySubmission, setMySubmission] = useState<any>(null);
  const [submittingAssignment, setSubmittingAssignment] = useState(false);
  const [assignmentSubmitted, setAssignmentSubmitted] = useState(false);

  // My Tasks (pending assignments)
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);

  const htmlSnippets = [
    { name: 'Navbar', category: 'UI', code: '<nav style="background: #1e293b; padding: 1rem; color: white; display: flex; justify-content: space-between; align-items: center; border-radius: 0.5rem; margin-bottom: 1rem;">\n  <div style="font-weight: bold;">Rillcod Technologies</div>\n  <div style="display: flex; gap: 1rem; font-size: 0.8rem;">\n    <a>Home</a>\n    <a>Lessons</a>\n    <a>Profile</a>\n  </div>\n</nav>' },
    { name: 'Button', category: 'UI', code: '<button style="background: linear-gradient(to right, #8b5cf6, #6366f1); color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 0.75rem; font-weight: bold; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform=\'scale(1.05)\'" onmouseout="this.style.transform=\'scale(1)\'">Get Started</button>' },
    { name: 'Glass Card', category: 'UX', code: '<div style="background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); padding: 2rem; border-radius: 1.5rem; border: 1px solid rgba(255, 255, 255, 0.1); color: white; box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);">\n  <h3 style="margin-top: 0; color: #a78bfa;">Lesson Title</h3>\n  <p style="opacity: 0.7; font-size: 0.9rem;">Master the art of coding with Rillcod Studio.</p>\n</div>' },
    { name: 'Input Field', category: 'UI', code: '<div style="margin-bottom: 1rem;">\n  <label style="display: block; font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.25rem;">Email Address</label>\n  <input type="email" placeholder="you@example.com" style="width: 100%; background: #0f172a; border: 1px solid #334155; border-radius: 0.5rem; padding: 0.5rem; color: white; outline: none; focus: border-orange-500;" />\n</div>' },
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
  const [view, setView] = useState<'editor' | 'output' | 'explorer' | 'canvas'>('editor');
  const [isPyodideLoading, setIsPyodideLoading] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [liveUpdate, setLiveUpdate] = useState(true);
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [robotCommands, setRobotCommands] = useState<any[]>([]);
  const [terminalHeight, setTerminalHeight] = useState(240);
  const isResizing = useRef(false);

  // ── Terminal Resizing ──
  const startResizing = useCallback((e: any) => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResizing);
    document.addEventListener('touchmove', handleResize);
    document.addEventListener('touchend', stopResizing);
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResizing);
    document.removeEventListener('touchmove', handleResize);
    document.removeEventListener('touchend', stopResizing);
  }, []);

  const handleResize = useCallback((e: any) => {
    if (!isResizing.current) return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const newHeight = window.innerHeight - clientY;
    if (newHeight > 40 && newHeight < window.innerHeight * 0.7) {
      setTerminalHeight(newHeight);
    }
  }, []);

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

  // ── Load Assignment (when assignmentId in URL) ──
  useEffect(() => {
    if (!assignmentId || !profile) return;
    const isStaff = profile.role === 'admin' || profile.role === 'teacher';
    const url = isStaff ? `/api/assignments/${assignmentId}` : `/api/assignments/${assignmentId}/student`;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setAssignmentData(d.data);
          // Load starter code if provided in assignment description
          const starter = d.data.starter_code;
          if (starter) setCode(starter);
          // Set language based on assignment
          if (d.data.assignment_type === 'coding') setLang('python');
          // Student: get their existing submission
          const sub = d.data.assignment_submissions?.[0] ?? null;
          setMySubmission(sub);
          if (sub?.submission_text) {
            // Extract code from submission_text if it has code fences
            const match = sub.submission_text.match(/```[\s\S]*?\n([\s\S]*?)```/);
            if (match) setCode(match[1]);
          }
        }
      })
      .catch(() => {});
  }, [assignmentId, profile]);

  // ── Load Pending Tasks (student's unsubmitted assignments) ──
  useEffect(() => {
    if (!profile || profile.role !== 'student') return;
    const db = createClient();
    db.from('assignments')
      .select('id, title, due_date, max_points, assignment_type, assignment_submissions(id, status)')
      .eq('is_active', true)
      .order('due_date', { ascending: true })
      .limit(8)
      .then(({ data }) => {
        if (!data) return;
        const pending = data.filter((a: any) => {
          const mySub = a.assignment_submissions?.find((s: any) => true); // student-scoped via RLS
          return !mySub || mySub.status === 'missing';
        }).slice(0, 5);
        setPendingTasks(pending);
      });
  }, [profile]);

  // ── Submit Code to Assignment ──
  const submitToAssignment = async () => {
    if (!assignmentId || !profile || !code.trim()) return;
    setSubmittingAssignment(true);
    try {
      const submissionText = `\`\`\`python\n${code}\n\`\`\`\n\nOutput:\n${consoleLogs.join('\n')}`;
      const res = await fetch(`/api/assignments/${assignmentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portal_user_id: profile.id,
          submission_text: submissionText,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        setMySubmission(d.data);
        setAssignmentSubmitted(true);
        toast.success('Assignment submitted successfully!');
      } else {
        const j = await res.json();
        toast.error(j.error || 'Submission failed');
      }
    } catch {
      toast.error('Submission failed. Check connection.');
    } finally {
      setSubmittingAssignment(false);
    }
  };

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
import json
sys.stdout = io.StringIO()
`);

        if (lang === 'robotics') {
          // Define mock robot in Python to collect commands
          pyodideRef.current.runPython(`
class Robot:
    def __init__(self):
        self.commands = []
    def forward(self, val):
        self.commands.append({'type': 'move', 'val': float(val)})
    def turnRight(self, val):
        self.commands.append({'type': 'turn', 'val': float(val)})
    def turnLeft(self, val):
        self.commands.append({'type': 'turn', 'val': -float(val)})
    def penDown(self):
        self.commands.append({'type': 'pen', 'val': True})
    def penUp(self):
        self.commands.append({'type': 'pen', 'val': False})
    def setColor(self, color):
        self.commands.append({'type': 'color', 'val': color})

robot = Robot()
`);
          setRobotCommands([]);
        }
        
        await pyodideRef.current.runPythonAsync(code);
        
        const stdout = pyodideRef.current.runPython("sys.stdout.getvalue()");
        setConsoleLogs(stdout.split('\n').filter(Boolean));

        if (lang === 'robotics') {
          const cmdsJson = pyodideRef.current.runPython("json.dumps(robot.commands)");
          const parse = JSON.parse(cmdsJson);
          setRobotCommands(parse);
          if (parse.length === 0) setRunning(false); // Stop if no robot commands
        }
      } catch (err: any) {
        console.error("Execution Error:", err);
        setConsoleLogs([`Error: ${err.message}`]);
        toast.error("Execution failed. Check console for details.");
        setRunning(false);
      } finally {
        // Only set running to false here if NOT robotics (robotics finishes via onFinish)
        if (lang !== 'robotics') setRunning(false);
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
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden selection:bg-orange-500/30">
      
      {/* ─── Top Bar ─── */}
      <header className="h-8 border-b border-border flex items-center justify-between px-3 bg-card/80 backdrop-blur-xl z-[45] sticky top-0">
        <div className="flex items-center gap-2">
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} className="p-1 hover:bg-card shadow-sm rounded-none text-muted-foreground">
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <h1 className="text-[9px] font-black tracking-tighter uppercase text-muted-foreground truncate max-w-[100px]">{activeProject ? activeProject.title : 'Playground'}</h1>
            <div className="h-2 w-[1px] bg-muted" />
            <p className="text-[8px] text-orange-400/80 font-black uppercase tracking-widest">{lang}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 font-black uppercase text-[9px] tracking-widest">
            {/* Action buttons hidden on very small screens if needed, or condensed */}
          {lessonId && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/10 rounded-none text-amber-500/60">
              <BookOpenIcon className="w-3 h-3" />
              <span className="hidden sm:inline">Lesson</span>
            </div>
          )}
          {assignmentId && assignmentData && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-none text-amber-400 max-w-[160px]">
                <ClipboardDocumentListIcon className="w-3 h-3 shrink-0" />
                <span className="text-[8px] font-black truncate">{assignmentData.title}</span>
              </div>
              {profile?.role === 'student' && !assignmentSubmitted && mySubmission?.status !== 'graded' && (
                <button
                  onClick={submitToAssignment}
                  disabled={submittingAssignment || !code.trim()}
                  className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-none text-[9px] font-black uppercase tracking-widest transition-all"
                >
                  {submittingAssignment ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : <ArrowUpTrayIcon className="w-3 h-3" />}
                  Submit
                </button>
              )}
              {(assignmentSubmitted || mySubmission?.status === 'submitted' || mySubmission?.status === 'graded') && (
                <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-none text-emerald-400 text-[8px] font-black uppercase">
                  <CheckCircleIcon className="w-3 h-3" />
                  {mySubmission?.status === 'graded' ? 'Graded' : 'Submitted'}
                </div>
              )}
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
              className="flex items-center gap-1.5 px-3 py-1 bg-orange-600/10 hover:bg-orange-600/20 border border-orange-500/20 rounded-none text-orange-400 transition-all">
              <SparklesIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">AI Draft</span>
            </button>
          )}
          <button onClick={saveProject} disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1 bg-card shadow-sm hover:bg-muted border border-border rounded-none text-muted-foreground transition-all">
            <CloudArrowUpIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isSaving ? 'Saving' : 'Save'}</span>
          </button>
          <button onClick={runCode} disabled={running || lang === 'scratch'}
            className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-none text-foreground transition-all shadow-lg shadow-emerald-900/40">
            {running ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <PlayIcon className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Execute</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex min-h-0 relative">
        
        {/* ─── Sidebar: Projects & Languages ─── */}
        <AnimatePresence>
          {(sidebarOpen || view === 'explorer') && (
            <motion.aside
              initial={{ x: -400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -400, opacity: 0 }}
              className={`
                fixed inset-y-0 left-0 w-full sm:w-80 md:relative md:w-72 
                border-r border-border bg-card md:bg-card/95 backdrop-blur-xl 
                flex flex-col z-[60] md:z-[50]
                ${view !== 'explorer' && 'hidden md:flex'}
              `}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Studio Explorer</span>
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-card shadow-sm rounded-none text-muted-foreground transition-all">
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-6 flex-1 overflow-y-auto custom-scrollbar">

                {/* Assignment Context Panel */}
                {assignmentId && assignmentData && (
                  <div className="bg-amber-500/5 border border-amber-500/20 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <ClipboardDocumentListIcon className="w-4 h-4 text-amber-400 shrink-0" />
                      <p className="text-[9px] font-black text-amber-400 uppercase tracking-[0.3em]">Active Assignment</p>
                    </div>
                    <h3 className="text-sm font-black text-foreground leading-tight">{assignmentData.title}</h3>
                    {assignmentData.description && (
                      <p className="text-[10px] text-foreground/40 font-medium leading-relaxed line-clamp-3">{assignmentData.description}</p>
                    )}
                    {assignmentData.instructions && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/10">
                        <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">Instructions</p>
                        <p className="text-[10px] text-foreground/50 leading-relaxed">{assignmentData.instructions}</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[9px] font-black text-foreground/30 uppercase tracking-widest">
                      {assignmentData.due_date && (
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="w-3 h-3" />
                          Due {new Date(assignmentData.due_date).toLocaleDateString()}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <StarIcon className="w-3 h-3 text-amber-400" />
                        {assignmentData.max_points || 100} pts
                      </span>
                    </div>
                    {mySubmission?.status === 'graded' && mySubmission.grade != null && (
                      <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-center">
                        <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Score</p>
                        <p className="text-xl font-black text-emerald-400">{mySubmission.grade}/{assignmentData.max_points || 100}</p>
                        {mySubmission.feedback && <p className="text-[9px] text-foreground/40 mt-1 italic">"{mySubmission.feedback}"</p>}
                      </div>
                    )}
                    <a href={`/dashboard/assignments/${assignmentId}`} className="block text-center text-[9px] font-black text-amber-400/50 hover:text-amber-400 uppercase tracking-widest transition-colors">
                      View Assignment →
                    </a>
                  </div>
                )}

                {/* My Tasks panel (student, no assignmentId) */}
                {!assignmentId && pendingTasks.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] block px-1">Pending Tasks</label>
                    {pendingTasks.map((task: any) => {
                      const overdue = task.due_date && new Date(task.due_date) < new Date();
                      return (
                        <a
                          key={task.id}
                          href={`/dashboard/playground?assignmentId=${task.id}`}
                          className="group flex items-start gap-3 p-3 bg-card shadow-sm border border-border hover:border-amber-500/30 hover:bg-amber-500/5 rounded-none transition-all"
                        >
                          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${overdue ? 'bg-rose-500' : 'bg-amber-500'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-muted-foreground group-hover:text-amber-400 truncate transition-colors">{task.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {task.due_date && (
                                <span className={`text-[8px] font-black uppercase tracking-widest ${overdue ? 'text-rose-400' : 'text-muted-foreground/40'}`}>
                                  {overdue ? '⚠ Overdue' : `Due ${new Date(task.due_date).toLocaleDateString()}`}
                                </span>
                              )}
                              <span className="text-[8px] font-black text-muted-foreground/30 uppercase">{task.max_points}pts</span>
                            </div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* Mode Selector */}
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] block mb-4 pl-1">Engineering Environments</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {LANGUAGES.map(l => (
                      <button 
                        key={l.id} 
                        onClick={() => handleLangChange(l.id)}
                        className={`group flex items-center gap-3 p-2.5 rounded-none transition-all relative ${lang === l.id ? 'bg-orange-600/10 ring-1 ring-orange-500/30' : 'hover:bg-card shadow-sm opacity-40 hover:opacity-100'}`}
                      >
                        <div className={`w-8 h-8 rounded-none flex items-center justify-center transition-all ${lang === l.id ? 'bg-orange-600 text-foreground' : 'bg-card shadow-sm text-muted-foreground'}`}>
                           {l.id === 'python' && <CodeBracketIcon className="w-4 h-4" />}
                           {l.id === 'javascript' && <SparklesIcon className="w-4 h-4" />}
                           {l.id === 'html' && <GlobeAltIcon className="w-4 h-4" />}
                           {l.id === 'blockly' && <PuzzlePieceIcon className="w-4 h-4" />}
                           {l.id === 'scratch' && <span className="text-base leading-none">🧩</span>}
                           {l.id === 'robotics' && <RocketLaunchIcon className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-[10px] font-black tracking-tight uppercase ${lang === l.id ? 'text-foreground' : 'text-muted-foreground'}`}>{l.name}</p>
                          <p className="text-[7px] text-muted-foreground font-black uppercase tracking-widest leading-none mt-0.5">{l.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Projects List */}
                {profile && (
                  <div>
                    <div className="flex items-center justify-between mb-3 px-1">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">My Projects</label>
                      <button onClick={createNew} className="p-1 hover:bg-muted rounded text-orange-400 group">
                        <PlusIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {projects.length === 0 && (
                        <div className="p-8 text-center border-2 border-dashed border-border rounded-none">
                          <BeakerIcon className="w-8 h-8 mx-auto text-white/5 mb-2" />
                          <p className="text-[10px] text-muted-foreground font-bold uppercase">No projects yet</p>
                        </div>
                      )}
                      {projects.map(p => (
                        <div 
                          key={p.id}
                          onClick={() => loadProject(p)}
                          className={`group flex items-center justify-between p-3 rounded-none cursor-pointer transition-all ${activeProject?.id === p.id ? 'bg-muted ring-1 ring-white/10' : 'hover:bg-card shadow-sm opacity-60 hover:opacity-100'}`}
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <ClockIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <div className="truncate">
                              <p className="text-xs font-bold truncate">{p.title}</p>
                              <p className="text-[9px] text-muted-foreground tracking-wider">Lately: {new Date(p.updated_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <button onClick={(e) => deleteProject(p.id, e)} className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400 rounded-none transition-all">
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lab Examples */}
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] block mb-3 pl-1">Starter Examples</label>
                  <div className="grid grid-cols-1 gap-2">
                    {((LAB_EXAMPLES as any)[lang] || []).map((ex: any) => (
                      <button 
                        key={ex.name} 
                        onClick={() => { setCode(ex.code); toast.info(`Loaded: ${ex.name}`); }}
                        className="text-left p-3 rounded-none bg-card shadow-sm border border-border hover:border-orange-500/30 hover:bg-orange-500/5 transition-all group"
                      >
                        <p className="text-[11px] font-bold text-muted-foreground group-hover:text-orange-400 transition-colors">{ex.name}</p>
                        <p className="text-[9px] text-muted-foreground font-medium mt-0.5 line-clamp-1">{ex.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ─── Editor Canvas ─── */}
        <div className={`flex-1 flex flex-col min-w-0 bg-background relative ${view !== 'editor' && view !== 'canvas' && 'hidden md:flex'}`}>
          {view === 'canvas' && lang === 'robotics' && (
            <div className="flex-1 p-4 sm:p-6 flex flex-col bg-background md:hidden">
              <div className="flex items-center gap-2 mb-4">
                <RocketLaunchIcon className="w-4 h-4 text-emerald-400" />
                <h3 className="text-[10px] font-black uppercase tracking-widest italic text-emerald-400/80">Flight Dynamics</h3>
              </div>
              <RobotSimulator code={code} isRunning={running} onFinish={() => setRunning(false)} commands={robotCommands} />
              <div className="mt-4 p-4 bg-card border border-border">
                <p className="text-[8px] text-muted-foreground uppercase font-black leading-relaxed">Visualizing kinematic trace on mobile uplink. Switch to terminal for logs.</p>
              </div>
            </div>
          )}
          <div className="flex-1 flex flex-col overflow-hidden">
             {/* Tab Headers */}
            <div className="h-8 bg-card/50 border-b border-border flex items-center px-4 justify-between">
              <div className="flex gap-1">
                {lang !== 'scratch' && (
                  <button onClick={() => setEditorMode('code')}
                    className={`px-3 py-1 rounded-none text-xs font-bold transition-all ${editorMode === 'code' ? 'bg-orange-600/20 text-orange-400' : 'text-muted-foreground hover:text-foreground'}`}>
                    Text Editor
                  </button>
                )}
                {(lang === 'python' || lang === 'javascript') && (
                  <button onClick={() => setEditorMode('blocks')}
                    className={`px-3 py-1 rounded-none text-xs font-bold transition-all ${editorMode === 'blocks' ? 'bg-emerald-600/20 text-emerald-400' : 'text-muted-foreground hover:text-foreground'}`}>
                    Blockly Mode
                  </button>
                )}
                {lang === 'scratch' && (
                  <span className="px-3 py-1 text-xs font-black text-yellow-400 uppercase tracking-widest flex items-center gap-1.5">
                    🧩 Scratch Lab
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                 <span className="hidden sm:inline text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                   {lang === 'scratch' ? 'drag & drop // blocks' : 'UTF-8 // active'}
                 </span>
              </div>
            </div>

            {/* Editor Component */}
            <div className="flex-1 flex relative overflow-hidden">
              <div className="flex-1 relative">
                {lang === 'scratch' ? (
                  <ScratchSynthesisLab onChange={(blocks) => setCode(blocks.map(b => b.label).join('\n'))} />
                ) : editorMode === 'blocks' ? (
                  <BlocklyEditor xml={blocksXml} language={lang} onChange={(xml, genCode) => { setBlocksXml(xml); setCode(genCode); }} />
                ) : (
                  <IntegratedCodeRunner
                    height="100%"
                    language={(lang === 'robotics' ? 'python' : lang) as any}
                    value={code}
                    onChange={(v) => { if (v !== undefined) setCode(v); }}
                    title={activeProject?.title || 'Open Workspace'}
                    onRun={runCode}
                  />
                )}
              </div>

              {lang === 'html' && (
                 <div className="hidden md:flex flex-[1.5] flex-col border-l border-border bg-[#f8fafc] group min-w-[300px] transition-all relative">
                   <div className="h-12 bg-white border-b border-slate-200 flex items-center px-4 md:px-6 justify-between shadow-sm">
                      <div className="flex items-center gap-2 md:gap-4">
                         <div className="hidden sm:flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                           <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Live Server</span>
                         </div>
                         <div className="hidden sm:block h-4 w-px bg-slate-200" />
                         <div className="flex bg-slate-100 p-1 rounded-none">
                           <button onClick={() => setDevice('desktop')} className={`px-2 md:px-3 py-1 rounded-none text-[9px] font-black uppercase transition-all ${device === 'desktop' ? 'bg-white shadow-sm text-orange-600' : 'text-slate-400'}`}>Desktop</button>
                           <button onClick={() => setDevice('mobile')} className={`px-2 md:px-3 py-1 rounded-none text-[9px] font-black uppercase transition-all ${device === 'mobile' ? 'bg-white shadow-sm text-orange-600' : 'text-slate-400'}`}>Mobile</button>
                         </div>
                      </div>
                      <div className="flex items-center gap-2">
                         <button onClick={() => setLiveUpdate(!liveUpdate)} className={`text-[9px] font-black uppercase px-2 md:px-3 py-1 rounded-full border transition-all ${liveUpdate ? 'border-orange-500/30 text-orange-600 bg-orange-50' : 'border-slate-200 text-slate-400'}`}>
                           {liveUpdate ? 'Live: ON' : 'Live: OFF'}
                         </button>
                      </div>
                   </div>
                   <div className="flex-1 bg-slate-200/50 p-4 md:p-8 flex items-center justify-center overflow-hidden">
                     <div className={`bg-white shadow-2xl transition-all duration-500 overflow-hidden relative ${device === 'mobile' ? 'w-[320px] h-[568px] sm:w-[375px] sm:h-[667px] rounded-[2.5rem] border-[10px] sm:border-[12px] border-slate-900' : 'w-full h-full rounded-none border border-slate-200'}`}>
                       <iframe srcDoc={code} className="w-full h-full border-0" title="Live Preview" />
                     </div>
                   </div>
                 </div>
              )}

              {lang === 'html' && (
                <div className="hidden xl:block w-56 border-l border-border bg-card/40 p-3 overflow-y-auto">
                  <div className="flex items-center gap-2 mb-4 pl-1">
                    <SparklesIcon className="w-4 h-4 text-orange-400" />
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">UI Builder</p>
                  </div>
                  <div className="space-y-4">
                     {['UI', 'UX'].map(cat => (
                       <div key={cat}>
                         <label className="text-[9px] font-bold text-muted-foreground uppercase mb-2 block">{cat} Elements</label>
                         <div className="space-y-1.5">
                            {htmlSnippets.filter(s => s.category === cat).map(s => (
                              <button key={s.name} onClick={() => insertSnippet(s.code)}
                                className="w-full p-2 bg-card shadow-sm hover:bg-muted border border-border rounded-none text-left transition-all group/item">
                                <p className="text-[10px] font-bold text-muted-foreground group-hover/item:text-orange-500">{s.name}</p>
                                <div className="mt-1 flex gap-0.5">
                                   <div className="h-1 flex-1 bg-orange-500/10 rounded-full" />
                                   <div className="h-1 w-2 bg-card shadow-sm rounded-full" />
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
           <div
             className={`
               border-t border-border flex flex-col bg-[#020617] relative
               ${view !== 'output' && 'hidden md:flex'} transition-all
             `}
             style={{ height: view === 'output' ? (lang === 'html' ? '100%' : `${terminalHeight}px`) : 'auto' }}
           >
             {/* Resize Handle */}
             <div 
               onMouseDown={startResizing}
               onTouchStart={startResizing}
               className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-orange-500 transition-colors z-[60] flex items-center justify-center group"
             >
               <div className="w-16 h-1 bg-border rounded-full group-hover:bg-orange-600 transition-colors opacity-0 group-hover:opacity-100" />
             </div>

             <div className="h-7 border-b border-border flex items-center px-3 justify-between bg-muted/20 shrink-0">
              <div className="flex items-center gap-2">
                <CommandLineIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-emerald-400/80">
                  {lang === 'html' ? 'Live Stream' : 'Console'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                 {lang !== 'html' && (
                   <button onClick={() => setConsoleLogs([])} className="p-1 hover:bg-card shadow-sm rounded transition-colors" title="Clear console">
                      <TrashIcon className="w-3.5 h-3.5 text-muted-foreground hover:text-rose-400" />
                   </button>
                 )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar bg-background/60 font-mono text-[10px] sm:text-xs">
               <div className="space-y-1 h-full">
                  {lang === 'html' ? (
                    <div className="w-full h-full bg-slate-900 rounded-none overflow-hidden relative border-2 border-border shadow-2xl p-2 sm:p-4">
                      <div className="w-full h-full bg-white rounded-[1rem] sm:rounded-[2rem] overflow-hidden border-8 border-slate-950 shadow-inner">
                        <iframe srcDoc={code} className="w-full h-full border-0" title="Html Mobile Preview" />
                      </div>
                    </div>
                  ) : (
                    <>
                      {consoleLogs.length === 0 && (
                        <p className="text-muted-foreground italic">Process standby. Transmit code to begin.</p>
                      )}
                      {consoleLogs.map((log, i) => (
                        <div key={i} className={`py-0.5 border-l-2 pl-3 ${log.startsWith('Error') || log.startsWith('Runtime Error') ? 'border-rose-500 text-rose-400 font-bold' : 'border-emerald-500/30 text-foreground/90'}`}>
                          {log}
                        </div>
                      ))}
                      {running && <div className="animate-pulse flex items-center gap-2 text-muted-foreground italic">Processing neural code...</div>}
                    </>
                  )}
                </div>
            </div>
          </div>
        </div>

        {/* ─── Right Sidebar: Robotics Simulator ─── */}
        {lang === 'robotics' && (
          <aside className={`
            hidden lg:flex w-80 lg:w-96 border-l border-border bg-card/30 flex flex-col
            ${view !== 'output' && 'hidden lg:flex'}
          `}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RocketLaunchIcon className="w-5 h-5 text-emerald-400" />
                <h3 className="text-xs font-black uppercase tracking-wider italic">Kinematic Field</h3>
              </div>
              <span className="text-[10px] font-bold text-emerald-500/50 bg-emerald-500/5 px-2 py-0.5 rounded-full border border-emerald-500/10">Active Simulation</span>
            </div>
            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
              <RobotSimulator code={code} isRunning={running} onFinish={() => setRunning(false)} commands={robotCommands} />
              
              <div className="mt-8 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                   <DocumentTextIcon className="w-4 h-4 text-muted-foreground" />
                   <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest uppercase">Instruction Manifest</label>
                </div>
                <div className="space-y-2">
                  {[
                    { cmd: 'robot.forward(val)', desc: 'Translate forward along vector' },
                    { cmd: 'robot.turnRight(deg)', desc: 'Rotate clockwise by degrees' },
                    { cmd: 'robot.penDown()', desc: 'Enable trace path' },
                    { cmd: 'robot.setColor(hex)', desc: 'Update laser signature color' },
                  ].map(h => (
                    <div key={h.cmd} className="p-4 bg-card shadow-sm border border-border rounded-none hover:bg-muted transition-all cursor-help group/doc">
                      <p className="font-mono text-[10px] text-emerald-400 mb-1 group-hover/doc:translate-x-1 transition-transform">{h.cmd}</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed font-medium">{h.desc}</p>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xl">
             <motion.div 
               initial={{ y: 20, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               exit={{ y: 20, opacity: 0 }}
               className="w-full max-w-lg bg-card border border-border rounded-none p-8 shadow-2xl relative overflow-hidden"
             >
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-orange-500 to-transparent" />
                <button onClick={() => setShowAIModal(false)} className="absolute top-6 right-6 p-2 hover:bg-card shadow-sm rounded-full text-muted-foreground transition-all">
                  <XMarkIcon className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 bg-orange-600/20 rounded-none flex items-center justify-center border border-orange-500/20">
                    <SparklesIcon className="w-6 h-6 text-orange-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black italic tracking-tighter uppercase">AI Pulse</h3>
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-0.5">Neural assistance for {lang}</p>
                  </div>
                </div>

                <div className="space-y-6">
                   <div className="relative group">
                     <textarea
                       autoFocus
                       value={aiPrompt}
                       onChange={(e) => setAiPrompt(e.target.value)}
                       placeholder={`Describe the ${lang} module logic...`}
                       className="w-full h-40 bg-muted/30 border border-border group-hover:border-orange-500/30 rounded-[2rem] p-5 text-sm font-medium text-foreground focus:ring-2 focus:ring-orange-500/40 outline-none resize-none transition-all"
                     />
                     <div className="absolute bottom-5 right-5 text-[9px] text-muted-foreground font-mono uppercase tracking-[0.3em]">Synapse-2.4</div>
                   </div>

                   <button 
                     onClick={generateWithAI}
                     disabled={isAIGenerating || !aiPrompt.trim()}
                     className="w-full h-14 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-foreground rounded-none font-black uppercase tracking-[0.2em] text-xs transition-all shadow-xl shadow-orange-900/20 flex items-center justify-center gap-3"
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
 
      {/* ─── Mobile Bottom Tab Bar ─── */}
      <div className="md:hidden h-20 border-t border-border bg-card flex items-center justify-around px-4 z-[70] pb-[env(safe-area-inset-bottom)]">
        <button 
          onClick={() => setView('explorer')}
          className={`flex flex-col items-center gap-1.5 transition-all ${view === 'explorer' ? 'text-orange-500' : 'text-muted-foreground'}`}
        >
          <Squares2X2Icon className="w-5 h-5" />
          <span className="text-[8px] font-black uppercase tracking-widest">Explorer</span>
        </button>
        <button 
          onClick={() => setView('editor')}
          className={`flex flex-col items-center gap-1.5 transition-all ${view === 'editor' ? 'text-orange-500' : 'text-muted-foreground'}`}
        >
          <CodeBracketIcon className="w-5 h-5" />
          <span className="text-[8px] font-black uppercase tracking-widest">Editor</span>
        </button>
        <button
          onClick={() => setView('output')}
          className={`flex flex-col items-center gap-1.5 transition-all ${view === 'output' ? 'text-orange-500' : 'text-muted-foreground'}`}
        >
          {lang === 'html' ? <EyeIcon className="w-5 h-5" /> : <CommandLineIcon className="w-5 h-5" />}
          <span className="text-[8px] font-black uppercase tracking-widest">{lang === 'html' ? 'Preview' : 'Terminal'}</span>
        </button>
        {lang === 'robotics' && (
          <button 
            onClick={() => setView('canvas')}
            className={`flex flex-col items-center gap-1.5 transition-all ${view === 'canvas' ? 'text-orange-500' : 'text-muted-foreground'}`}
          >
            <RocketLaunchIcon className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase tracking-widest">Simulation</span>
          </button>
        )}
        <div className="relative">
          <button 
            onClick={runCode}
            disabled={running}
            className="w-14 h-14 bg-orange-600 flex items-center justify-center -mt-12 border-4 border-[#020617] shadow-2xl relative transition-transform active:scale-95"
          >
            {running ? <ArrowPathIcon className="w-7 h-7 animate-spin" /> : <PlayIcon className="w-7 h-7" />}
          </button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(var(--muted) / 0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(var(--muted) / 0.35); border-radius: 10px; }
      `}} />
    </div>
  );
}
