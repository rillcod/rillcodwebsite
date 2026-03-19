// @refresh reset
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  PlayIcon,
  TrashIcon,
  CommandLineIcon,
  ArrowPathIcon,
  DocumentDuplicateIcon,
  CheckBadgeIcon,
  XMarkIcon,
  CpuChipIcon,
  SparklesIcon,
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

// Safe dynamic import for Monaco
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface IntegratedCodeRunnerProps {
  initialCode?: string;
  value?: string;
  onChange?: (val: string) => void;
  language?: 'python' | 'javascript' | 'html' | 'robotics';
  title?: string;
  readOnly?: boolean;
  height?: string | number;
  onRun?: () => void;
  showHeader?: boolean;
}

export default function IntegratedCodeRunner({
  initialCode = '',
  value,
  onChange,
  language = 'javascript',
  title = 'Interactive Lab',
  readOnly = false,
  height = 400,
  onRun,
  showHeader = true,
}: IntegratedCodeRunnerProps) {
  const [internalCode, setInternalCode] = useState(initialCode);
  const code = value !== undefined ? value : internalCode;
  const setCode = (val: string) => {
    if (onChange) onChange(val);
    else setInternalCode(val);
  };
  const [lang, setLang] = useState(language);
  const [running, setRunning] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [isPyodideLoading, setIsPyodideLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'editor' | 'output'>('editor');

  const generateAI = async () => {
    const prompt = window.prompt("What code should I generate?");
    if (!prompt) return;
    
    setIsGenerating(true);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'code-generation',
          prompt,
          language: lang === 'html' ? 'web' : lang
        })
      });
      const d = await res.json();
      if (d.data) {
        setCode(d.data);
        toast.success("Code generated!");
      }
    } catch (e) {
      toast.error("Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const pyodideRef = useRef<any>(null);

  // ─── Python Engine (Pyodide) ───
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
      toast.error("Failed to start Python environment locally.");
    } finally {
      setIsPyodideLoading(false);
    }
  }, [isPyodideLoading]);

  useEffect(() => {
    if (lang === 'python') {
      initPyodide();
    }
  }, [lang, initPyodide]);

  // ─── Execution Logic ───
  const runCode = async () => {
    setRunning(true);
    setConsoleLogs([]);
    setView('output');

    if (lang === 'html') {
      setRunning(false);
      return;
    }

    if (lang === 'python') {
      try {
        if (!pyodideRef.current) {
          toast.error("Python engine is still warming up...");
          setRunning(false);
          return;
        }

        const py = pyodideRef.current;
        const outputLines: string[] = [];

        // Use Pyodide's native JS-side stream interception instead of
        // Python-side sys.stdout = io.StringIO() which itself triggers [Errno 29]
        py.setStdout({
          batched: (text: string) => {
            text.split('\n').filter(Boolean).forEach((l: string) => outputLines.push(l));
          },
        });
        py.setStderr({
          batched: (text: string) => {
            text.split('\n').filter(Boolean).forEach((l: string) => outputLines.push(`Error: ${l}`));
          },
        });

        try {
          await py.runPythonAsync(code);
        } catch (pyErr: any) {
          // Catch JS-level exceptions from Pyodide (e.g. SyntaxError propagated out)
          outputLines.push(`Error: ${pyErr.message ?? String(pyErr)}`);
        }

        if (outputLines.length === 0) outputLines.push('✓ Executed successfully (no output)');
        setConsoleLogs(outputLines);

        // Restore default streams so next run is clean
        py.setStdout({ batched: () => {} });
        py.setStderr({ batched: () => {} });

      } catch (err: any) {
        setConsoleLogs([`Runtime Error: ${err.message}`]);
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
    if (onRun) onRun();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Code copied to clipboard');
  };

  return (
    <div className="flex flex-col border border-border bg-[#0a0a1a] overflow-hidden shadow-xl my-4">

      {/* ─── Row 1: Title + Editor/Output toggle ─── */}
      {showHeader && (
        <>
          <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-black/40 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5 opacity-40">
                <div className="w-2 h-2 rounded-full bg-rose-500" />
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <h3 className="text-[9px] font-black uppercase tracking-widest text-muted-foreground truncate max-w-[120px] sm:max-w-[200px]">
                {title}
              </h3>
            </div>
            <div className="flex bg-white/5 border border-white/5">
              <button
                onClick={() => setView('editor')}
                className={`px-3 py-1 text-[9px] font-black uppercase transition-all ${view === 'editor' ? 'bg-orange-600 text-white' : 'text-muted-foreground hover:text-white'}`}
              >
                Editor
              </button>
              <button
                onClick={() => setView('output')}
                className={`px-3 py-1 text-[9px] font-black uppercase transition-all ${view === 'output' ? 'bg-orange-600 text-white' : 'text-muted-foreground hover:text-white'}`}
              >
                Output
              </button>
            </div>
          </div>

          {/* ─── Row 2: AI + Copy + Run ─── */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-black/20 shrink-0 gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${lang === 'python' ? 'bg-blue-400' : lang === 'javascript' ? 'bg-yellow-400' : 'bg-orange-400'}`} />
                <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest hidden sm:block">{lang}</span>
              </div>
              {lang === 'python' && (
                <div className="flex items-center gap-1">
                  <div className={`w-1 h-1 rounded-full ${isPyodideLoading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                  <span className="text-[7px] font-black text-muted-foreground uppercase tracking-widest hidden sm:block">
                    {isPyodideLoading ? 'Loading' : 'Ready'}
                  </span>
                </div>
              )}
              <button
                onClick={generateAI}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-2 py-1 bg-orange-600/10 hover:bg-orange-600/20 text-orange-400 text-[9px] font-black uppercase border border-orange-500/20 transition-all disabled:opacity-50"
              >
                {isGenerating ? <ArrowPathIcon className="w-3 h-3 animate-spin" /> : <SparklesIcon className="w-3 h-3" />}
                <span className="hidden sm:inline">{isGenerating ? 'Generating…' : 'AI'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="p-1.5 text-muted-foreground hover:text-white transition-colors"
                title="Copy Code"
              >
                {copied ? <CheckBadgeIcon className="w-4 h-4 text-emerald-400" /> : <DocumentDuplicateIcon className="w-4 h-4" />}
              </button>

              {!readOnly && (
                <button
                  onClick={runCode}
                  disabled={running}
                  className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-black uppercase tracking-wider transition-all disabled:opacity-50 active:scale-95"
                >
                  {running ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <PlayIcon className="w-3.5 h-3.5" />}
                  {lang === 'html' ? 'Preview' : 'Run'}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── Main Content Area ─── */}
      <div className="relative min-h-[240px] sm:min-h-[320px]" style={{ height: typeof height === 'number' ? Math.min(height, window?.innerWidth < 640 ? 260 : height) : height }}>
        <AnimatePresence mode="wait">
          {view === 'editor' ? (
            <motion.div
              key="editor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0"
            >
              <MonacoEditor
                height="100%"
                language={lang}
                theme="vs-dark"
                value={code}
                onChange={(v) => setCode(v || '')}
                options={{
                  readOnly,
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, Menlo, monospace',
                  padding: { top: 12, bottom: 12 },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  lineNumbers: 'on',
                  glyphMargin: false,
                  folding: false,
                  lineDecorationsWidth: 6,
                  lineNumbersMinChars: 3,
                  renderLineHighlight: 'line',
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="output"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 flex flex-col bg-[#050510] overflow-y-auto p-4 font-mono text-xs"
            >
              <div className="flex items-center gap-2 mb-3 text-emerald-500/50 border-b border-emerald-500/10 pb-2">
                <CommandLineIcon className="w-3.5 h-3.5" />
                <span className="text-[8px] font-black uppercase tracking-widest">Console Output</span>
              </div>
              <div className="space-y-1.5">
                {consoleLogs.length === 0 && !running && (
                  <p className="text-muted-foreground/40 text-xs italic">Run your code to see output here…</p>
                )}
                {consoleLogs.map((log, i) => (
                  <div key={i} className={`py-0.5 border-l-2 pl-3 text-xs ${log.startsWith('Error') ? 'border-rose-500 text-rose-400' : 'border-emerald-500/30 text-emerald-100/80'}`}>
                    {log}
                  </div>
                ))}
                {running && (
                  <div className="flex items-center gap-2 text-emerald-500 animate-pulse">
                    <ArrowPathIcon className="w-3 h-3 animate-spin" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Executing…</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

