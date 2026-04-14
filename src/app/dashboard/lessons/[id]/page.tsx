// @refresh reset
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, PlayIcon, DocumentTextIcon, AcademicCapIcon,
  ClockIcon, BookOpenIcon, CheckCircleIcon, ClipboardDocumentListIcon,
  PaperClipIcon, ArrowDownTrayIcon, VideoCameraIcon, DocumentIcon,
  PhotoIcon, BoltIcon, CheckBadgeIcon, LockClosedIcon,
  InformationCircleIcon, ExclamationTriangleIcon, RocketLaunchIcon,
  QuestionMarkCircleIcon, ChevronRightIcon, XMarkIcon,
  RectangleGroupIcon, ClipboardIcon, TrophyIcon, StarIcon, PlusIcon
} from '@/lib/icons';
import Script from 'next/script';
import { motion, AnimatePresence } from 'framer-motion';
import IntegratedCodeRunner from '@/components/studio/IntegratedCodeRunner';
import VideoPlayer from '@/components/media/VideoPlayer';
import Editor from '@monaco-editor/react';
import * as d3 from 'd3';
import dynamic from 'next/dynamic';
import NeuralVoiceReader from '@/components/ai/NeuralVoiceReader';
import StudyAssistant from '@/components/ai/StudyAssistant';

const CodeVisualizer = dynamic(() => import('@/components/visualizer/CodeVisualizer'), { ssr: false }) as any;
const BlocklyEditor = dynamic(() => import('@/components/studio/BlocklyEditor'), { ssr: false }) as any;
const Lottie = dynamic(() => import('lottie-react'), { ssr: false }) as any;

import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

function VisualizerBlock({ block }: { block: any }) {
  const [step, setStep] = useState(0);
  const codeData = {
    step,
    totalSteps: block.visualData?.totalSteps ?? 10,
    variables: block.visualData?.variables ?? {},
    visualizationState: block.visualData?.visualizationState ?? {},
    currentLine: block.visualData?.currentLine,
  };
  return (
    <div className="my-10 space-y-3">
      {(block.title || block.concept) && (
        <div className="flex items-center gap-3 px-1">
          <div className="w-1 h-4 bg-cyan-500 rounded-full" />
          <p className="text-[10px] font-black text-cyan-400/70 uppercase tracking-widest">{block.title || block.concept}</p>
        </div>
      )}
      <div className="bg-card border border-border overflow-hidden">
        <CodeVisualizer
          visualizationType={block.visualType || 'sorting'}
          codeData={codeData}
          onStepChange={setStep}
        />
      </div>
    </div>
  );
}
const ReactPlayer = dynamic(() => import('react-player'), { ssr: false }) as any;

// ── Scratch-style visual block renderer ─────────────────────────────────────
type ScratchBlockCategory = 'event' | 'motion' | 'looks' | 'sound' | 'control' | 'sensing' | 'operator' | 'variable' | 'custom';

function categorizeScratchBlock(text: string): ScratchBlockCategory {
  const t = text.toLowerCase();
  if (/when|broadcast|receive|clicked|pressed|start|flag/.test(t)) return 'event';
  if (/move|turn|go to|glide|point|set x|set y|bounce|position|direction/.test(t)) return 'motion';
  if (/say|think|show|hide|switch costume|next costume|size|effect|looks|graphic/.test(t)) return 'looks';
  if (/play sound|stop sound|volume|note|instrument|rest/.test(t)) return 'sound';
  if (/forever|repeat|if|else|wait|stop|create clone|run without/.test(t)) return 'control';
  if (/touching|key|mouse|ask|answer|distance|timer|current|loud|video|webcam/.test(t)) return 'sensing';
  if (/\+|\-|\*|\/|=|>|<|and|or|not|random|round|abs|floor|ceiling|sqrt|mod|join|letter|length|contains/.test(t)) return 'operator';
  if (/set|change|show variable|hide variable|add to list|delete|insert|replace|item/.test(t)) return 'variable';
  return 'custom';
}

const SCRATCH_COLORS: Record<ScratchBlockCategory, { bg: string; border: string; text: string }> = {
  event:    { bg: '#FFD500', border: '#CC9900', text: '#1a1a00' },
  motion:   { bg: '#4C97FF', border: '#2E6CC4', text: '#fff' },
  looks:    { bg: '#9966FF', border: '#6633CC', text: '#fff' },
  sound:    { bg: '#CF63CF', border: '#8E3A8E', text: '#fff' },
  control:  { bg: '#FFAB19', border: '#CC7A00', text: '#fff' },
  sensing:  { bg: '#5CB1D6', border: '#2E7EA6', text: '#fff' },
  operator: { bg: '#59C059', border: '#2E8E2E', text: '#fff' },
  variable: { bg: '#FF8C1A', border: '#CC5500', text: '#fff' },
  custom:   { bg: '#FF6680', border: '#CC2244', text: '#fff' },
};

const SCRATCH_ICONS: Record<ScratchBlockCategory, string> = {
  event: '🚩', motion: '🔵', looks: '💬', sound: '🔊',
  control: '🔄', sensing: '❓', operator: '➕', variable: '📦', custom: '⚙️',
};

function isHatBlock(text: string): boolean {
  const t = text.toLowerCase();
  return /^when|^on (flag|key|click|start)|^broadcast received/.test(t);
}

function isCBlock(text: string): boolean {
  const t = text.toLowerCase();
  return /^(forever|repeat|if\b|else\b)/.test(t);
}

function ScratchBlockPiece({ text, index, total }: { text: string; index: number; total: number }) {
  const cat = categorizeScratchBlock(text);
  const colors = SCRATCH_COLORS[cat];
  const hat = isHatBlock(text);
  const cBlock = isCBlock(text);
  const isLast = index === total - 1;

  return (
    <div style={{ position: 'relative', display: 'inline-block', marginBottom: isLast ? 0 : -1 }}>
      {/* Top notch connector (puzzle bump in) — skip on hat blocks */}
      {!hat && index > 0 && (
        <div style={{
          position: 'absolute', top: 0, left: 20,
          width: 20, height: 4,
          backgroundColor: '#0d0d1a',
          borderRadius: '0 0 4px 4px',
          zIndex: 2,
        }} />
      )}

      {/* Block body */}
      <div style={{
        backgroundColor: colors.bg,
        border: `2px solid ${colors.border}`,
        borderRadius: hat ? '20px 20px 4px 4px' : '4px',
        paddingTop: hat ? '10px' : '8px',
        paddingBottom: isLast ? '8px' : '12px',
        paddingLeft: cBlock ? '10px' : '14px',
        paddingRight: '18px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minWidth: '180px',
        maxWidth: '100%',
        boxShadow: `0 2px 0 ${colors.border}`,
        position: 'relative',
        cursor: 'default',
        userSelect: 'none',
      }}>
        <span style={{ fontSize: '14px', flexShrink: 0 }}>{SCRATCH_ICONS[cat]}</span>
        <span style={{
          color: colors.text,
          fontSize: '12px',
          fontWeight: 900,
          fontFamily: 'monospace',
          letterSpacing: '0.02em',
          textShadow: cat === 'event' ? 'none' : '0 1px 1px rgba(0,0,0,0.3)',
        }}>
          {text}
        </span>
      </div>

      {/* Bottom notch connector (puzzle bump out) — skip on last block */}
      {!isLast && (
        <div style={{
          position: 'absolute', bottom: 0, left: 20,
          width: 20, height: 4,
          backgroundColor: colors.bg,
          border: `2px solid ${colors.border}`,
          borderTop: 'none',
          borderRadius: '0 0 4px 4px',
          zIndex: 3,
        }} />
      )}
    </div>
  );
}

function ScratchBlockRenderer({ blocks, instructions }: { blocks: string[]; instructions?: string }) {
  const [copied, setCopied] = useState(false);

  const blockList = blocks?.length ? blocks : [
    'when flag clicked',
    'say "Hello! Ready to code?" for 2 seconds',
    'move 10 steps',
    'wait 1 seconds',
    'say "Great job!" for 2 seconds',
  ];

  const copyAll = () => {
    navigator.clipboard.writeText(blockList.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Scratch workspace */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)',
        border: '2px solid rgba(255,213,0,0.2)',
        borderRadius: 8,
        padding: '24px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Scratch logo watermark */}
        <div style={{ position: 'absolute', top: 8, right: 12, opacity: 0.12, fontSize: 11, fontWeight: 900, color: '#FFD500', letterSpacing: '0.1em' }}>
          SCRATCH BLOCKS
        </div>

        {/* Grid dots background */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {blockList.map((text, i) => (
            <ScratchBlockPiece key={i} text={text} index={i} total={blockList.length} />
          ))}
        </div>
      </div>

      {/* Legend + copy */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap gap-2">
          {(Object.entries(SCRATCH_COLORS) as [ScratchBlockCategory, typeof SCRATCH_COLORS[ScratchBlockCategory]][])
            .filter(([cat]) => blockList.some(b => categorizeScratchBlock(b) === cat))
            .map(([cat, col]) => (
              <span key={cat} style={{ backgroundColor: col.bg, color: col.text, border: `1px solid ${col.border}` }}
                className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded">
                {SCRATCH_ICONS[cat]} {cat}
              </span>
            ))}
        </div>
        <button onClick={copyAll} className="text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
          {copied ? '✓ Copied!' : '⧉ Copy blocks'}
        </button>
      </div>

      {/* Instructions */}
      {instructions && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-4">
          <p className="text-[10px] font-black text-yellow-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            🚩 Step-by-Step Guide
          </p>
          <p className="text-sm text-foreground/70 leading-relaxed whitespace-pre-line">{instructions}</p>
        </div>
      )}
    </div>
  );
}

const TYPE_COLOR: Record<string, string> = {
  video: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  'hands-on': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  hands_on: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  interactive: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  workshop: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  coding: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

// --- Sub-components ---

function MermaidRenderer({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const chartId = useMemo(() => `mermaid-${Math.random().toString(36).slice(2, 9)}`, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const renderDiagram = async () => {
      const mermaid = (window as any).mermaid;
      if (!mermaid) return;

      try {
        let processedCode = code.trim();

        // Strip markdown fences
        const fenceMatch = processedCode.match(/```(?:mermaid)?([\s\S]*?)```/);
        if (fenceMatch) processedCode = fenceMatch[1].trim();
        processedCode = processedCode.replace(/^```mermaid\s*\n?/i, '').replace(/^```\s*\n?/i, '').replace(/\n?```$/i, '').trim();

        // Decode HTML entities
        processedCode = processedCode.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;/g, "'");

        // Normalise graph → flowchart
        if (/^graph\s+/i.test(processedCode)) processedCode = processedCode.replace(/^graph\s+/i, 'flowchart ');

        // Strip unsupported node shapes AI likes to invent (keep only standard ones)
        // Replace {{...}} with ([...]) and {{{...}}} with [...] which mermaid supports
        processedCode = processedCode.replace(/\{\{\{([^}]+)\}\}\}/g, '[$1]');
        processedCode = processedCode.replace(/\{\{([^}]+)\}\}/g, '([$1])');

        // Remove any lines with bare-word emoji that break parsing
        processedCode = processedCode.split('\n').map(line => {
          // Strip inline comments that AI sometimes adds
          return line.replace(/\/\/.*$/, '').replace(/#.*$/, (m, offset) => {
            // Only strip # comments if not inside a string
            const before = line.slice(0, offset);
            const quoteCount = (before.match(/"/g) || []).length;
            return quoteCount % 2 === 0 ? '' : m;
          });
        }).join('\n').trim();

        // Validate diagram type
        const VALID_START = /^(flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|journey|quadrantChart|mindmap|timeline|xychart|block)/i;
        if (!VALID_START.test(processedCode)) {
          // Try to auto-wrap as a flowchart if it looks like nodes+edges
          if (/-->|---/.test(processedCode)) {
            processedCode = `flowchart TD\n${processedCode}`;
          } else {
            throw new Error('Unrecognised diagram type');
          }
        }

        const { svg } = await mermaid.render(chartId, processedCode);
        setSvg(svg);
        setError(null);
      } catch (e: any) {
        console.error('Mermaid Render Error:', e);
        const msg = typeof e === 'string' ? e : e.message || e.str || 'Diagram syntax error';
        setError(msg);
      }
    };

    // Poll until mermaid is available (script may still be loading)
    let attempts = 0;
    const tryRender = () => {
      if ((window as any).mermaid) {
        renderDiagram();
      } else if (attempts < 20) {
        attempts++;
        setTimeout(tryRender, 300);
      }
    };
    const timer = setTimeout(tryRender, 100);
    return () => clearTimeout(timer);
  }, [code, chartId]);

  if (error) {
    return (
      <div className="my-12 p-8 sm:p-12 bg-rose-500/5 border-2 border-rose-500/10 rounded-none sm:rounded-none text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 rounded-none bg-rose-500/20 text-rose-400">
            <ExclamationTriangleIcon className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black text-rose-500/60 uppercase tracking-widest">Oops! A Tiny Snag</p>
            <p className="text-sm font-bold text-muted-foreground">The visual map is taking a quick nap. Refresh to wake it up!</p>
          </div>
          <pre className="mt-4 w-full p-6 bg-card/80 rounded-none text-[10px] font-mono text-muted-foreground text-left overflow-x-auto border border-border italic text-rose-300/80">
            {code}
          </pre>
          <p className="text-[10px] text-rose-400/40 font-black uppercase tracking-widest">Double check the blocks or hit refresh to see the path!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="my-12 space-y-4">
      <div className="flex items-center gap-3 px-6">
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
        <p className="text-[10px] font-black text-indigo-500/60 uppercase tracking-[0.3em]">Our Learning Adventure Map</p>
      </div>
      <div className="bg-white/95 p-8 sm:p-12 rounded-none sm:rounded-none flex justify-center overflow-x-auto shadow-2xl border-4 border-border relative group min-h-[100px]">
        <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        {svg ? (
          <div
            className="w-full h-full flex justify-center"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Synthesizing Diagram...</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MathRenderer({ formula }: { formula: string }) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).katex) {
      try {
        const rendered = (window as any).katex.renderToString(formula, {
          throwOnError: false,
          displayMode: true
        });
        setHtml(rendered);
      } catch (e) {
        setHtml(`<span class="text-rose-400">Error: ${formula}</span>`);
      }
    } else {
      setHtml(`<span class="font-serif italic text-muted-foreground">${formula}</span>`);
    }
  }, [formula]);

  return (
    <div className="my-12 p-10 sm:p-20 bg-indigo-500/5 border-2 border-indigo-500/10 rounded-none sm:rounded-none relative overflow-hidden group shadow-3xl text-center">
      <div className="absolute -left-10 -top-10 w-48 h-48 bg-indigo-500/10 blur-3xl rounded-full group-hover:scale-125 transition-transform" />
      <p className="text-[10px] font-black text-indigo-400/60 uppercase tracking-[0.4em] mb-10 relative z-10">Mathematical Synthesis</p>
      <div className="math-container text-2xl sm:text-5xl text-foreground relative z-10 overflow-x-auto py-4" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function MonacoEditorBlock({ code, language }: { code: string; language?: string }) {
  return (
    <IntegratedCodeRunner
      initialCode={code}
      language={language?.toLowerCase() as any || 'javascript'}
      title={`${language || 'Code'} Workspace`}
      height={450}
    />
  );
}

function D3ChartRenderer({ type, dataset, labels }: { type: string; dataset: any[]; labels?: string[] }) {
  const CHART_COLORS = ['#06b6d4', '#8b5cf6', '#f97316', '#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#ec4899'];

  const containerRef = (node: SVGSVGElement) => {
    if (!node || !dataset.length) return;
    d3.select(node).selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: labels?.length ? 50 : 30, left: 40 };
    const totalW = 620;
    const totalH = 320;
    const width = totalW - margin.left - margin.right;
    const height = totalH - margin.top - margin.bottom;

    const svg = d3.select(node)
      .attr('viewBox', `0 0 ${totalW} ${totalH}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    // Defs for gradient
    const defs = svg.append('defs');
    dataset.forEach((_, i) => {
      const grad = defs.append('linearGradient').attr('id', `bar-grad-${i}`).attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1');
      const c = CHART_COLORS[i % CHART_COLORS.length];
      grad.append('stop').attr('offset', '0%').attr('stop-color', c).attr('stop-opacity', 0.9);
      grad.append('stop').attr('offset', '100%').attr('stop-color', c).attr('stop-opacity', 0.3);
    });

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Grid lines
    const maxVal = (d3.max(dataset as number[]) || 100) * 1.1;

    if (type === 'bar') {
      const domainLabels = (labels && labels.length === dataset.length) ? labels : dataset.map((_, i) => `${i + 1}`);
      const x = d3.scaleBand().domain(domainLabels).range([0, width]).padding(0.25);
      const y = d3.scaleLinear().domain([0, maxVal]).range([height, 0]);

      // Horizontal grid
      g.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(5)).enter()
        .append('line').attr('x1', 0).attr('x2', width).attr('y1', d => y(d)).attr('y2', d => y(d))
        .attr('stroke', 'rgba(255,255,255,0.05)').attr('stroke-width', 1);

      // Bars
      g.selectAll('rect').data(dataset).enter().append('rect')
        .attr('x', (_: any, i: number) => x(domainLabels[i])!)
        .attr('y', height)
        .attr('width', x.bandwidth())
        .attr('height', 0)
        .attr('fill', (_: any, i: number) => `url(#bar-grad-${i})`)
        .attr('rx', 2)
        .transition().duration(700).delay((_: any, i: number) => i * 60)
        .attr('y', (d: any) => y(d))
        .attr('height', (d: any) => height - y(d));

      // X axis labels
      g.append('g').attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x).tickSize(0))
        .select('.domain').remove();
      g.selectAll('.tick text').attr('fill', 'rgba(255,255,255,0.35)').attr('font-size', '9px').attr('font-weight', '700')
        .attr('dy', '1.2em').attr('text-anchor', 'middle')
        .each(function(this: any) {
          const el = d3.select(this);
          const txt = el.text();
          if (txt.length > 10) { el.text(txt.slice(0, 9) + '…'); }
        });

    } else if (type === 'line' || type === 'area') {
      const x = d3.scaleLinear().domain([0, dataset.length - 1]).range([0, width]);
      const y = d3.scaleLinear().domain([0, maxVal]).range([height, 0]);
      const lineGen = d3.line<any>().x((_: any, i: number) => x(i)).y((d: any) => y(d)).curve(d3.curveCatmullRom);

      if (type === 'area') {
        const areaGen = d3.area<any>().x((_: any, i: number) => x(i)).y0(height).y1((d: any) => y(d)).curve(d3.curveCatmullRom);
        g.append('path').datum(dataset).attr('fill', 'rgba(6,182,212,0.12)').attr('d', areaGen);
      }
      const stroke = type === 'area' ? '#06b6d4' : '#f97316';
      const path = g.append('path').datum(dataset).attr('fill', 'none').attr('stroke', stroke).attr('stroke-width', 2.5).attr('d', lineGen);
      const totalLen = (path.node() as SVGPathElement)?.getTotalLength?.() || 600;
      path.attr('stroke-dasharray', totalLen).attr('stroke-dashoffset', totalLen)
        .transition().duration(1000).attr('stroke-dashoffset', 0);

      // Dots
      g.selectAll('circle').data(dataset).enter().append('circle')
        .attr('cx', (_: any, i: number) => x(i)).attr('cy', (d: any) => y(d)).attr('r', 4)
        .attr('fill', stroke).attr('opacity', 0).transition().duration(600).delay((_: any, i: number) => i * 80).attr('opacity', 1);

      // X axis labels
      if (labels?.length) {
        const xBand = d3.scaleBand().domain(labels).range([0, width]);
        g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(xBand).tickSize(0))
          .select('.domain').remove();
        g.selectAll('.tick text').attr('fill', 'rgba(255,255,255,0.35)').attr('font-size', '9px').attr('font-weight', '700').attr('dy', '1.2em');
      }
    } else if (type === 'pie') {
      const radius = Math.min(width, height) / 2;
      const pg = g.append('g').attr('transform', `translate(${width / 2},${height / 2})`);
      const pie = d3.pie<any>().value(d => d).sort(null);
      const arc = d3.arc<any>().outerRadius(radius - 10).innerRadius(radius * 0.4);
      const arcs = pg.selectAll('.arc').data(pie(dataset)).enter().append('g');
      arcs.append('path').attr('fill', (_: any, i: number) => CHART_COLORS[i % CHART_COLORS.length])
        .attr('stroke', 'rgba(0,0,0,0.3)').attr('stroke-width', 1)
        .transition().duration(800).attrTween('d', function(this: any, d: any) {
          const i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
          return (t: number) => arc(i(t)) ?? '';
        });
    }
  };

  return (
    <div className="p-5 bg-card border border-border rounded-none overflow-hidden">
      <svg ref={containerRef} className="w-full h-auto" style={{ maxHeight: 340 }} />
    </div>
  );
}

const MOTION_COLORS = [
  { bg: 'bg-cyan-500/20',    border: 'border-cyan-500/40',    text: 'text-cyan-400',    glow: 'rgba(6,182,212,0.5)'    },
  { bg: 'bg-violet-500/20',  border: 'border-violet-500/40',  text: 'text-violet-400',  glow: 'rgba(139,92,246,0.5)'   },
  { bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', text: 'text-emerald-400', glow: 'rgba(16,185,129,0.5)'   },
  { bg: 'bg-orange-500/20',  border: 'border-orange-500/40',  text: 'text-orange-400',  glow: 'rgba(249,115,22,0.5)'   },
  { bg: 'bg-rose-500/20',    border: 'border-rose-500/40',    text: 'text-rose-400',    glow: 'rgba(244,63,94,0.5)'    },
  { bg: 'bg-amber-500/20',   border: 'border-amber-500/40',   text: 'text-amber-400',   glow: 'rgba(245,158,11,0.5)'   },
];

function MotionGraphicRenderer({ type, config, title }: { type: string; config: any; title?: string }) {
  const labels: string[] = config?.labels || [];
  const nodeCount: number = config?.nodes || (labels.length > 0 ? labels.length : 5);
  const effectiveLabels = labels.length > 0 ? labels : Array.from({ length: Math.min(nodeCount, 7) }, (_, i) => `Step ${i + 1}`);

  return (
    <div className="my-10 relative rounded-none border border-border bg-card overflow-hidden" style={{ minHeight: '340px' }}>
      {/* Layered gradient backdrops */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/50 via-transparent to-cyan-950/30 pointer-events-none" />
      <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-600/5 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-40 h-40 bg-cyan-600/5 blur-3xl rounded-full pointer-events-none" />

      {/* Scan line */}
      <motion.div
        animate={{ y: [0, 340, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/25 to-transparent pointer-events-none z-10"
      />

      {/* Header */}
      <div className="absolute top-4 left-5 z-10 flex flex-col gap-0.5">
        <p className="text-[8px] font-black text-indigo-400/50 uppercase tracking-[0.5em]">Motion Illustration</p>
        {title && <p className="text-[11px] font-black text-foreground/60 uppercase tracking-tight max-w-[260px] truncate">{title}</p>}
      </div>
      <div className="absolute top-4 right-5 z-10">
        <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-[8px] font-black text-indigo-400/60 uppercase tracking-widest">{type}</span>
      </div>

      <div className="flex items-center justify-center h-[340px] px-6 pt-10">

        {/* ── FLOW — horizontal pipeline with animated data dots ── */}
        {type === 'flow' && (
          <div className="flex items-center w-full max-w-2xl overflow-x-auto pb-2 gap-0">
            {effectiveLabels.slice(0, 6).map((label, i) => {
              const col = MOTION_COLORS[i % MOTION_COLORS.length];
              const isLast = i === effectiveLabels.slice(0, 6).length - 1;
              return (
                <div key={i} className="flex items-center flex-shrink-0" style={{ flex: isLast ? '0 0 auto' : '1 1 0' }}>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.22, type: 'spring', stiffness: 180 }}
                    className="flex flex-col items-center gap-2 flex-shrink-0"
                  >
                    <motion.div
                      animate={{ boxShadow: [`0 0 0px ${col.glow}`, `0 0 18px ${col.glow}`, `0 0 0px ${col.glow}`] }}
                      transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.35 }}
                      className={`w-14 h-14 ${col.bg} border ${col.border} flex items-center justify-center rounded-none`}
                    >
                      <span className={`text-lg font-black ${col.text}`}>{i + 1}</span>
                    </motion.div>
                    <p className={`text-[8px] font-black ${col.text} uppercase tracking-wider text-center max-w-[56px] leading-tight`}>{label}</p>
                  </motion.div>
                  {!isLast && (
                    <div className="relative flex-1 mx-2 flex items-center" style={{ minWidth: 24, marginBottom: 16 }}>
                      <div className="w-full h-px bg-white/10" />
                      <motion.div
                        animate={{ x: ['0%', '100%'] }}
                        transition={{ duration: 1.8, repeat: Infinity, ease: 'linear', delay: i * 0.3 }}
                        className="absolute w-2 h-2 rounded-full bg-cyan-400/70 top-1/2 -translate-y-1/2"
                        style={{ left: 0 }}
                      />
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 border-t-[3px] border-b-[3px] border-l-[5px] border-t-transparent border-b-transparent border-l-white/20" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── NETWORK — center concept + orbiting nodes ── */}
        {type === 'network' && (
          <div className="relative" style={{ width: 260, height: 260 }}>
            <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
              {effectiveLabels.slice(1, 7).map((_, i, arr) => {
                const angle = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
                return (
                  <motion.g
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.12 + 0.3, duration: 0.4 }}
                  >
                    <line
                      x1={130} y1={130}
                      x2={130 + 102 * Math.cos(angle)}
                      y2={130 + 102 * Math.sin(angle)}
                      stroke="rgba(99,102,241,0.2)"
                      strokeWidth="1.5"
                      strokeDasharray="5 4"
                    />
                  </motion.g>
                );
              })}
            </svg>
            <motion.div
              animate={{ scale: [1, 1.07, 1] }}
              transition={{ duration: 3.5, repeat: Infinity }}
              className="absolute w-20 h-20 bg-orange-500/20 border-2 border-orange-500/50 flex items-center justify-center z-10 shadow-[0_0_28px_rgba(249,115,22,0.3)]"
              style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}
            >
              <p className="text-[8px] font-black text-orange-300 uppercase text-center leading-tight px-1">{effectiveLabels[0] || 'Core'}</p>
            </motion.div>
            {effectiveLabels.slice(1, 7).map((label, i, arr) => {
              const angle = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
              const col = MOTION_COLORS[i % MOTION_COLORS.length];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.15 + 0.5, type: 'spring' }}
                  className={`absolute w-12 h-12 ${col.bg} border ${col.border} flex items-center justify-center z-10`}
                  style={{ left: 130 + 102 * Math.cos(angle), top: 130 + 102 * Math.sin(angle), transform: 'translate(-50%,-50%)' }}
                >
                  <p className={`text-[7px] font-black ${col.text} text-center leading-tight px-0.5`}>{label}</p>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* ── ORBIT — enhanced planetary rings ── */}
        {type === 'orbit' && (
          <div className="relative flex items-center justify-center" style={{ width: 240, height: 240 }}>
            {[...Array(config?.nodes || 3)].map((_, i) => {
              const r = (i + 1) * 40;
              const col = MOTION_COLORS[i % MOTION_COLORS.length];
              return (
                <div key={i}>
                  <div className={`absolute rounded-full border ${col.border} opacity-15`} style={{ width: r * 2, height: r * 2, left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }} />
                  <motion.div
                    animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
                    transition={{ duration: 5 + i * 2.5, repeat: Infinity, ease: 'linear' }}
                    className="absolute"
                    style={{ width: r * 2, height: r * 2, left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}
                  >
                    <div className={`absolute w-3 h-3 ${col.bg} border ${col.border} top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 shadow-lg`} />
                  </motion.div>
                </div>
              );
            })}
            <motion.div
              animate={{ scale: [1, 1.12, 1], rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
              className="absolute w-14 h-14 bg-orange-500/25 border-2 border-orange-500/50 flex items-center justify-center shadow-[0_0_25px_rgba(249,115,22,0.4)] z-10"
            >
              <div className="w-4 h-4 rounded-full bg-orange-400" />
            </motion.div>
          </div>
        )}

        {/* ── PARTICLES — multi-color concept burst ── */}
        {type === 'particles' && (
          <div className="relative w-full h-52">
            {[...Array(28)].map((_, i) => {
              const col = MOTION_COLORS[i % MOTION_COLORS.length];
              return (
                <motion.div
                  key={i}
                  className={`absolute w-1.5 h-1.5 rounded-full ${col.bg} border ${col.border}`}
                  animate={{ x: [Math.random() * 500 - 250, Math.random() * 500 - 250], y: [Math.random() * 160 - 80, Math.random() * 160 - 80], opacity: [0, 0.9, 0], scale: [0, 1.5, 0] }}
                  transition={{ duration: Math.random() * 4 + 2.5, repeat: Infinity, ease: 'easeInOut', delay: Math.random() * 3 }}
                  style={{ left: '50%', top: '50%' }}
                />
              );
            })}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <motion.p animate={{ opacity: [0.05, 0.15, 0.05] }} transition={{ duration: 3, repeat: Infinity }} className="text-5xl font-black text-foreground/10 uppercase tracking-[0.3em] select-none">LIVE</motion.p>
            </div>
          </div>
        )}

        {/* ── WAVE — multi-color frequency bars ── */}
        {type === 'wave' && (
          <div className="flex gap-1 items-end h-40">
            {[...Array(20)].map((_, i) => {
              const col = MOTION_COLORS[i % MOTION_COLORS.length];
              return (
                <motion.div
                  key={i}
                  className={`flex-1 ${col.bg} border-t ${col.border} min-w-[8px] rounded-none`}
                  animate={{ height: [12, Math.random() * 110 + 20, 12] }}
                  transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.07, ease: 'easeInOut' }}
                />
              );
            })}
          </div>
        )}

        {/* ── PULSE — concentric rings with center glow ── */}
        {(type === 'pulse' || (!['flow','network','orbit','particles','wave'].includes(type))) && (
          <div className="relative flex items-center justify-center">
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute border border-cyan-500/30 rounded-none"
                animate={{ scale: [1, 2.5 + i * 0.6], opacity: [0.5, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.65, ease: 'easeOut' }}
                style={{ width: 80, height: 80 }}
              />
            ))}
            <motion.div
              animate={{ scale: [1, 1.08, 1], rotate: [0, 90, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
              className="w-20 h-20 bg-cyan-500/20 border-2 border-cyan-500/50 flex items-center justify-center shadow-[0_0_32px_rgba(6,182,212,0.4)]"
            >
              <div className="w-8 h-8 bg-cyan-500/40 border border-cyan-400/50" />
            </motion.div>
          </div>
        )}

      </div>

    </div>
  );
}

function InteractiveQuiz({ block, lessonContext }: { block: any; lessonContext?: { lessonTitle: string; courseTitle?: string; gradeLevel?: string } }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  const handleSelect = (idx: number) => {
    if (revealed) return;
    setSelected(idx);
    setRevealed(true);
    if (idx === block.correctAnswer) {
      if (block.onComplete) block.onComplete();
    } else {
      // Wrong answer — fetch an AI explanation
      const correctOption = block.options?.[block.correctAnswer] ?? 'the correct answer';
      const wrongOption = block.options?.[idx] ?? 'your answer';
      setLoadingExplanation(true);
      fetch('/api/ai/study-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `In this quiz question: "${block.question}" — the correct answer is "${correctOption}" but I chose "${wrongOption}". Can you explain clearly why "${correctOption}" is correct and help me understand?`,
          lessonTitle: lessonContext?.lessonTitle ?? 'this lesson',
          courseTitle: lessonContext?.courseTitle,
          gradeLevel: lessonContext?.gradeLevel,
          conversationHistory: [],
        }),
      })
        .then(r => r.json())
        .then(d => setAiExplanation(d.reply ?? null))
        .catch(() => {})
        .finally(() => setLoadingExplanation(false));
    }
  };

  return (
    <div className="p-5 rounded-none border border-orange-500/20 bg-background space-y-5 relative overflow-hidden hover:border-orange-500/40 transition-all my-6 shadow-lg">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-none bg-orange-500/10 text-orange-400 flex-shrink-0">
          <QuestionMarkCircleIcon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[9px] font-bold text-orange-400 uppercase tracking-widest">Quick Check</p>
          <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Quiz</h3>
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-sm font-semibold text-foreground leading-snug">{block.question}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {block.options?.map((opt: string, optIdx: number) => {
            const isCorrect = optIdx === block.correctAnswer;
            const isSelected = selected === optIdx;
            let stateClass = "border-border/60 bg-white/[0.02] hover:border-orange-500/40 hover:bg-orange-500/5";
            if (revealed) {
              if (isCorrect) stateClass = "border-emerald-500/50 bg-emerald-500/10";
              else if (isSelected) stateClass = "border-rose-500/50 bg-rose-500/10";
              else stateClass = "border-border/30 bg-transparent opacity-40";
            }
            return (
              <motion.button
                key={optIdx}
                onClick={() => handleSelect(optIdx)}
                whileHover={!revealed ? { scale: 1.01 } : {}}
                whileTap={!revealed ? { scale: 0.99 } : {}}
                className={`p-3.5 rounded-none border transition-all text-left ${stateClass}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-none border flex items-center justify-center text-[11px] font-black flex-shrink-0 ${revealed && isCorrect ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : revealed && isSelected ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                        : 'bg-card border-border text-muted-foreground'
                    }`}>
                    {String.fromCharCode(65 + optIdx)}
                  </div>
                  <span className={`text-xs font-medium leading-snug flex-1 ${revealed && isCorrect ? 'text-emerald-300'
                      : revealed && isSelected ? 'text-rose-300'
                        : 'text-muted-foreground'
                    }`}>
                    {opt}
                  </span>
                  {revealed && isCorrect && (
                    <CheckCircleIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence>
          {revealed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="pt-4 border-t border-border"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-none flex-shrink-0 ${selected === block.correctAnswer ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                  {selected === block.correctAnswer ? <CheckBadgeIcon className="w-4 h-4" /> : <XMarkIcon className="w-4 h-4" />}
                </div>
                <p className="text-xs font-medium text-foreground flex-1">
                  {selected === block.correctAnswer ? "Correct! Well done." : "Not quite — see the explanation below."}
                </p>
                <button
                  onClick={() => { setRevealed(false); setSelected(null); setAiExplanation(null); }}
                  className="px-4 py-1.5 bg-card border border-border text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all flex-shrink-0"
                >
                  Retry
                </button>
              </div>
              {selected !== block.correctAnswer && (
                <div className="mt-3 rounded-none border border-indigo-500/20 bg-indigo-500/5 p-4">
                  <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <span>✦</span> AI Tutor Explanation
                  </p>
                  {loadingExplanation ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Thinking...</span>
                    </div>
                  ) : aiExplanation ? (
                    <p className="text-sm text-muted-foreground leading-relaxed">{aiExplanation}</p>
                  ) : null}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CompletionCelebration({ onDismiss, lessonTitle, courseTitle, gradeLevel, objectives }: {
  onDismiss: () => void;
  lessonTitle?: string;
  courseTitle?: string;
  gradeLevel?: string;
  objectives?: string[];
}) {
  const [recap, setRecap] = useState<string | null>(null);
  const [recapLoading, setRecapLoading] = useState(true);

  useEffect(() => {
    if (!lessonTitle) { setRecapLoading(false); return; }
    fetch('/api/ai/study-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `I just completed the lesson "${lessonTitle}". Give me exactly 3 bullet points summarising the most important things I learned. Be brief, specific, and exciting! Use ✓ for each bullet.`,
        lessonTitle,
        courseTitle,
        gradeLevel,
        lessonObjectives: objectives,
        conversationHistory: [],
      }),
    })
      .then(r => r.json())
      .then(d => setRecap(d.reply ?? null))
      .catch(() => {})
      .finally(() => setRecapLoading(false));
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-2xl flex items-center justify-center p-6"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            initial={{
              x: "50%",
              y: "50%",
              scale: 0,
              rotate: 0
            }}
            animate={{
              x: `${Math.random() * 100}%`,
              y: `${Math.random() * 100}%`,
              scale: [0, 1, 0.5],
              rotate: 360,
              opacity: [0, 1, 0]
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              ease: "easeOut"
            }}
            className={`absolute w-4 h-4 rounded-full ${['bg-cyan-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500'][i % 4]}`}
          />
        ))}
      </div>

      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="max-w-2xl w-full bg-background border border-border rounded-none p-12 sm:p-20 text-center space-y-12 shadow-[0_50px_100px_rgba(6,182,212,0.15)] relative"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="w-32 h-32 rounded-none bg-gradient-to-br from-orange-600 to-orange-400 to-indigo-600 flex items-center justify-center text-foreground shadow-3xl rotate-12">
            <TrophyIcon className="w-16 h-16" />
          </div>
        </div>

        <div className="space-y-6 pt-10">
          <div className="flex items-center justify-center gap-4">
            <div className="h-px w-12 bg-muted" />
            <p className="text-[12px] font-bold text-orange-400 uppercase tracking-widest">Achievement</p>
            <div className="h-px w-12 bg-muted" />
          </div>
          <h2 className="text-5xl sm:text-7xl font-black text-foreground leading-none tracking-tighter">LESSON COMPLETE!</h2>
          <p className="text-base text-muted-foreground font-medium">{courseTitle ? `${courseTitle} · ` : ''}{lessonTitle}</p>
        </div>

        {/* AI recap */}
        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-none p-6 text-left min-h-[80px]">
          <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span>✦</span> What You Mastered Today
          </p>
          {recapLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground/50">
              <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Generating your recap...</span>
            </div>
          ) : recap ? (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{recap}</p>
          ) : (
            <p className="text-sm text-muted-foreground">You've successfully completed this lesson. Great work!</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-card shadow-sm border border-border rounded-none p-8">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">XP Earned</p>
            <p className="text-3xl font-black text-orange-400">+250 XP</p>
          </div>
          <div className="bg-card shadow-sm border border-border rounded-none p-8">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Status</p>
            <p className="text-3xl font-black text-emerald-400">COMPLETE</p>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="w-full py-8 bg-orange-600 hover:bg-orange-500 text-white font-black uppercase tracking-[0.4em] text-xs rounded-none transition-all shadow-2xl active:scale-95"
        >
          Continue
        </button>
      </motion.div>
    </motion.div>
  );
}

// ── Activity Steps — auto-detects Scratch-like steps and shows them as colored blocks ──
const SCRATCH_KEYWORDS = /^(when|move|turn|go to|say|think|show|hide|play|repeat|forever|if|wait|stop|set|change|broadcast|switch|next costume|ask|glide|point)/i;

function ActivitySteps({ steps, isCoding }: { steps: string[]; isCoding?: boolean }) {
  const scratchSteps = steps.filter(s => SCRATCH_KEYWORDS.test(s.trim()));
  const hasBlocks = scratchSteps.length >= Math.ceil(steps.length / 2); // majority look like scratch blocks
  const [viewMode, setViewMode] = useState<'steps' | 'blocks'>(hasBlocks ? 'blocks' : 'steps');

  return (
    <div className="space-y-4">
      {hasBlocks && (
        <div className="flex items-center gap-2">
          <button onClick={() => setViewMode('steps')}
            className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded transition-colors ${viewMode === 'steps' ? 'bg-emerald-500/20 text-emerald-400' : 'text-muted-foreground hover:text-foreground'}`}>
            📋 Steps
          </button>
          <button onClick={() => setViewMode('blocks')}
            className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded transition-colors ${viewMode === 'blocks' ? 'bg-yellow-500/20 text-yellow-400' : 'text-muted-foreground hover:text-foreground'}`}>
            🧩 Block View
          </button>
        </div>
      )}

      {viewMode === 'blocks' ? (
        <div style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)',
          border: '2px solid rgba(255,213,0,0.15)',
          borderRadius: 8,
          padding: '24px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            pointerEvents: 'none',
          }} />
          <div style={{ position: 'absolute', top: 8, right: 12, opacity: 0.1, fontSize: 10, fontWeight: 900, color: '#FFD500', letterSpacing: '0.1em' }}>
            SCRATCH BLOCKS
          </div>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {steps.map((text, i) => (
              <ScratchBlockPiece key={i} text={text} index={i} total={steps.length} />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {steps.map((step, sIdx) => (
            <div key={sIdx} className="flex gap-4 p-4 rounded-none bg-background/50 border border-emerald-500/10 hover:border-emerald-500/30 transition-all group/step">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] font-black text-emerald-400 shrink-0">
                {sIdx + 1}
              </div>
              <p className="text-sm font-medium text-muted-foreground leading-relaxed pt-1 group-hover/step:text-foreground transition-colors">
                {step}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recharts wrapper (simpler alternative to D3 for data charts) ─────────────
const RCHART_COLORS = ['#06b6d4', '#8b5cf6', '#f97316', '#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#ec4899'];

function RechartsBlock({ chartType, data, dataKey, labels }: { chartType: string; data: any[]; dataKey?: string; labels?: string[] }) {
  const normalized = data.map((v: any, i: number) => ({
    name: labels?.[i] ?? (typeof v === 'object' ? v.name ?? `${i + 1}` : `${i + 1}`),
    value: typeof v === 'number' ? v : (v.value ?? v.y ?? 0),
  }));

  const commonProps = {
    margin: { top: 10, right: 10, left: -20, bottom: 5 },
  };

  if (chartType === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={normalized} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={40} paddingAngle={2}>
            {normalized.map((_: any, i: number) => <Cell key={i} fill={RCHART_COLORS[i % RCHART_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--foreground)' }} />
          <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }
  if (chartType === 'area') {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={normalized} {...commonProps}>
          <defs>
            <linearGradient id="rcg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--foreground)' }} />
          <Area type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2} fill="url(#rcg)" />
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={normalized} {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--foreground)' }} />
          <Line type="monotone" dataKey="value" stroke="#f97316" strokeWidth={2.5} dot={{ fill: '#f97316', r: 4 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  // Default: bar
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={normalized} {...commonProps}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--foreground)' }} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {normalized.map((_: any, i: number) => <Cell key={i} fill={RCHART_COLORS[i % RCHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Lottie animation block ────────────────────────────────────────────────────
// Free Lottie JSON presets by topic keyword
const LOTTIE_PRESETS: Record<string, string> = {
  robot:    'https://assets7.lottiefiles.com/packages/lf20_ysrn2iwp.json',
  code:     'https://assets10.lottiefiles.com/packages/lf20_fcfjwiyb.json',
  science:  'https://assets2.lottiefiles.com/packages/lf20_i9mxcD.json',
  idea:     'https://assets5.lottiefiles.com/packages/lf20_twijbubv.json',
  success:  'https://assets2.lottiefiles.com/packages/lf20_jbrw3hcz.json',
  loading:  'https://assets4.lottiefiles.com/packages/lf20_p8bfn5to.json',
  star:     'https://assets4.lottiefiles.com/packages/lf20_touohxv0.json',
  math:     'https://assets4.lottiefiles.com/packages/lf20_YXD37q.json',
};

function LottieBlock({ url, keyword, title, loop = true }: { url?: string; keyword?: string; title?: string; loop?: boolean }) {
  const [animData, setAnimData] = useState<any>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const src = url || LOTTIE_PRESETS[keyword?.toLowerCase() ?? ''] || LOTTIE_PRESETS['idea'];
    fetch(src)
      .then(r => r.json())
      .then(setAnimData)
      .catch(() => setError(true));
  }, [url, keyword]);

  if (error) return null;

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      {animData && (
        <div className="w-48 h-48 sm:w-64 sm:h-64">
          <Lottie animationData={animData} loop={loop} />
        </div>
      )}
      {title && <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest text-center">{title}</p>}
    </div>
  );
}

// ── Blockly block (read-only display with live code gen) ──────────────────────
function BlocklyBlock({ xml, language, title }: { xml?: string; language?: string; title?: string }) {
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [showCode, setShowCode] = useState(false);

  return (
    <div className="space-y-3">
      {title && (
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-500/20 text-yellow-400">
            <RectangleGroupIcon className="w-4 h-4" />
          </div>
          <p className="text-[10px] font-black text-yellow-400 uppercase tracking-[0.4em]">{title}</p>
        </div>
      )}
      <div className="border border-yellow-500/20 bg-card overflow-hidden" style={{ minHeight: 360 }}>
        <BlocklyEditor
          xml={xml}
          language={language || 'python'}
          onChange={(_xml: string, code: string) => setGeneratedCode(code)}
        />
      </div>
      {generatedCode && (
        <div>
          <button
            onClick={() => setShowCode(s => !s)}
            className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-yellow-400/60 hover:text-yellow-400 transition-colors mb-2"
          >
            <ChevronRightIcon className={`w-3 h-3 transition-transform ${showCode ? 'rotate-90' : ''}`} />
            {showCode ? 'Hide' : 'Show'} generated {language || 'python'} code
          </button>
          {showCode && (
            <pre className="p-4 bg-card/80 border border-border text-xs font-mono text-emerald-300 overflow-x-auto rounded-none leading-relaxed">
              {generatedCode}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── AnimatedBlock: scroll-triggered entrance for every lesson block ──────────
function AnimatedBlock({ children, i }: { children: React.ReactNode; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: Math.min(i * 0.04, 0.2), ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function CanvaRenderer({ blocks, lessonType, onInteraction, onExplainRequest, lessonContext }: {
  blocks: any[];
  lessonType?: string;
  onInteraction?: (idx: number) => void;
  onExplainRequest?: (text: string) => void;
  lessonContext?: { lessonTitle: string; courseTitle?: string; gradeLevel?: string };
}) {
  if (!blocks || blocks.length === 0) return null;

  const INFO_COLORS = [
    { accent: 'border-l-cyan-500',    num: 'bg-cyan-500',    text: 'text-cyan-400',    bg: 'bg-cyan-500/5'    },
    { accent: 'border-l-violet-500',  num: 'bg-violet-500',  text: 'text-violet-400',  bg: 'bg-violet-500/5'  },
    { accent: 'border-l-orange-500',  num: 'bg-orange-500',  text: 'text-orange-400',  bg: 'bg-orange-500/5'  },
    { accent: 'border-l-emerald-500', num: 'bg-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/5' },
    { accent: 'border-l-rose-500',    num: 'bg-rose-500',    text: 'text-rose-400',    bg: 'bg-rose-500/5'    },
    { accent: 'border-l-amber-500',   num: 'bg-amber-500',   text: 'text-amber-400',   bg: 'bg-amber-500/5'   },
  ];

  return (
    <div className={`space-y-10 sm:space-y-16 ${lessonType === 'reading' ? 'max-w-3xl mx-auto' : ''}`}>
      {blocks.map((block: any, i: number) => {
        switch (block.type) {

          /* ── HEADING ───────────────────────────────────────────────── */
          case 'heading':
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="relative group pt-4">
                  <div className="absolute -left-4 top-0 bottom-0 w-1 rounded-full bg-gradient-to-b from-orange-500 via-violet-500 to-cyan-500 opacity-0 group-hover:opacity-100 transition-all duration-300 scale-y-0 group-hover:scale-y-100 origin-top" />
                  <h2 className="text-lg sm:text-2xl font-black tracking-tight leading-snug break-words bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text">
                    {block.content}
                  </h2>
                  <div className="mt-2 h-px w-0 group-hover:w-full bg-gradient-to-r from-orange-500/50 via-violet-500/30 to-transparent transition-all duration-500" />
                </div>
              </AnimatedBlock>
            );

          /* ── TEXT ──────────────────────────────────────────────────── */
          case 'text':
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="relative py-2 pl-4 border-l-2 border-border hover:border-violet-500/30 transition-colors duration-300">
                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed whitespace-pre-wrap font-medium selection:bg-cyan-500/30 break-words">
                    {block.content}
                  </p>
                </div>
              </AnimatedBlock>
            );

          /* ── CODE ──────────────────────────────────────────────────── */
          case 'code':
            return (
              <AnimatedBlock key={i} i={i}>
                <MonacoEditorBlock code={block.content} language={block.language} />
              </AnimatedBlock>
            );

          /* ── IMAGE ─────────────────────────────────────────────────── */
          case 'image':
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="space-y-4 sm:space-y-6">
                  <div className="overflow-hidden border border-border shadow-2xl hover:border-cyan-500/20 transition-colors duration-500 group">
                    <img src={block.url} alt={block.caption} className="w-full object-cover group-hover:scale-[1.02] transition-transform duration-700" />
                  </div>
                  {block.caption && <p className="text-center text-[10px] sm:text-xs text-muted-foreground font-black uppercase tracking-[0.3em] italic px-10">{block.caption}</p>}
                </div>
              </AnimatedBlock>
            );

          /* ── CALLOUT ───────────────────────────────────────────────── */
          case 'callout': {
            const isWarning = block.style === 'warning';
            return (
              <AnimatedBlock key={i} i={i}>
                <div className={`p-8 sm:p-12 border-2 shadow-2xl relative overflow-hidden group ${isWarning ? 'bg-rose-500/5 border-rose-500/10' : 'bg-cyan-500/5 border-cyan-500/10'}`}>
                  <div className={`absolute -right-12 -top-12 w-48 sm:w-64 h-48 sm:h-64 opacity-[0.03] transition-transform group-hover:scale-110 ${isWarning ? 'text-rose-500' : 'text-cyan-500'}`}>
                    {isWarning ? <ExclamationTriangleIcon /> : <InformationCircleIcon />}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-6 sm:gap-10 relative z-10">
                    <div className={`shrink-0 p-4 sm:p-6 shadow-xl ${isWarning ? 'bg-rose-500/20 text-rose-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                      {isWarning ? <ExclamationTriangleIcon className="w-8 h-8 sm:w-12 sm:h-12" /> : <InformationCircleIcon className="w-8 h-8 sm:w-12 sm:h-12" />}
                    </div>
                    <div className="space-y-2">
                      <p className={`text-[10px] font-black uppercase tracking-[0.3em] ${isWarning ? 'text-rose-400' : 'text-cyan-400'}`}>
                        {isWarning ? 'Important Note' : 'Key Insight'}
                      </p>
                      <p className="text-sm sm:text-base font-bold text-foreground leading-relaxed">{block.content}</p>
                    </div>
                  </div>
                </div>
              </AnimatedBlock>
            );
          }

          /* ── ACTIVITY ──────────────────────────────────────────────── */
          case 'activity':
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="p-8 sm:p-12 border-2 border-emerald-500/20 bg-emerald-500/5 space-y-8 relative overflow-hidden shadow-2xl group/activity">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl pointer-events-none" />
                  <div className="flex items-center gap-6">
                    <div className="p-4 bg-emerald-500/20 text-emerald-400 flex-shrink-0 shadow-lg group-hover/activity:scale-110 transition-transform">
                      <RocketLaunchIcon className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.5em] mb-1">Interactive Synthesis Lab</p>
                      <h3 className="text-xl font-black uppercase tracking-tight text-foreground">{block.title || 'Practical Implementation'}</h3>
                    </div>
                  </div>
                  <div className="space-y-6">
                    {block.steps && Array.isArray(block.steps) ? (
                      <ActivitySteps steps={block.steps} isCoding={block.is_coding} />
                    ) : (
                      <div className="border-l-4 border-emerald-500/40 pl-6 py-2">
                        <p className="text-base font-medium text-foreground leading-relaxed whitespace-pre-wrap italic opacity-80">
                          {block.instructions || 'Follow the experiential learning prompt below.'}
                        </p>
                      </div>
                    )}
                  </div>
                  {block.is_coding && (
                    <div className="mt-8">
                      <IntegratedCodeRunner
                        initialCode={block.initialCode || ''}
                        language={block.language?.toLowerCase() as any || 'javascript'}
                        title={block.title || 'Implementation Sandbox'}
                        onRun={() => onInteraction?.(i)}
                      />
                    </div>
                  )}
                </div>
              </AnimatedBlock>
            );

          /* ── QUIZ ──────────────────────────────────────────────────── */
          case 'quiz':
            return (
              <AnimatedBlock key={i} i={i}>
                <InteractiveQuiz block={{ ...block, onComplete: () => onInteraction?.(i) }} lessonContext={lessonContext} />
              </AnimatedBlock>
            );

          /* ── VIDEO ─────────────────────────────────────────────────── */
          case 'video':
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="space-y-4 sm:space-y-6">
                  <VideoPlayer url={block.url} title={block.caption} />
                  {block.caption && <p className="text-center text-xs sm:text-sm font-black uppercase tracking-[0.3em] text-muted-foreground italic px-4">{block.caption}</p>}
                </div>
              </AnimatedBlock>
            );

          /* ── SCRATCH ───────────────────────────────────────────────── */
          case 'scratch':
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="border-2 border-yellow-500/20 bg-yellow-500/5 space-y-6 p-6 sm:p-10">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-yellow-500/20 text-yellow-400 flex-shrink-0">
                      <RectangleGroupIcon className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-yellow-500 uppercase tracking-[0.4em] mb-0.5">Visual Coding Lab — KG to Basic 6</p>
                      <h3 className="text-lg font-black uppercase tracking-tight text-foreground">Scratch Block Mission</h3>
                    </div>
                  </div>
                  <ScratchBlockRenderer blocks={block.blocks || []} instructions={block.instructions} />
                </div>
              </AnimatedBlock>
            );

          /* ── FILE ──────────────────────────────────────────────────── */
          case 'file':
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="p-6 sm:p-10 border-2 border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-6 group hover:border-cyan-500/30 transition-all text-center sm:text-left shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-600/5 blur-3xl rounded-full" />
                  <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8 relative z-10">
                    <div className="p-5 bg-cyan-500/10 text-cyan-400 group-hover:scale-110 transition-transform shadow-lg">
                      <ArrowDownTrayIcon className="w-8 h-8 sm:w-10 sm:h-10" />
                    </div>
                    <div>
                      <h4 className="text-xl sm:text-2xl font-black text-foreground group-hover:text-cyan-400 transition-colors truncate max-w-[200px] sm:max-w-md tracking-tight">{block.fileName || 'Learning Resource'}</h4>
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mt-1">Ready for Download</p>
                    </div>
                  </div>
                  <a href={block.url} target="_blank" className="relative z-10 w-full sm:w-auto px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95">Download Now</a>
                </div>
              </AnimatedBlock>
            );

          /* ── ILLUSTRATION (bento grid) ─────────────────────────────── */
          case 'illustration': {
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="my-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="h-px flex-1 bg-gradient-to-r from-indigo-500/30 to-transparent" />
                    <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] shrink-0 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
                      {block.title || 'Key Concepts'}
                    </h3>
                    <div className="h-px flex-1 bg-gradient-to-l from-indigo-500/30 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(block.items || []).map((item: any, idx: number) => {
                      const col = INFO_COLORS[idx % INFO_COLORS.length];
                      return (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, y: 16 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: idx * 0.07, type: 'spring', stiffness: 180 }}
                          className={`flex gap-4 p-4 border border-border border-l-4 ${col.accent} ${col.bg} group hover:shadow-lg transition-all`}
                        >
                          <div className={`w-7 h-7 ${col.num} flex items-center justify-center text-[10px] font-black text-white shrink-0 mt-0.5`}>
                            {idx + 1}
                          </div>
                          <div className="space-y-1 flex-1 min-w-0">
                            <p className={`text-[9px] font-black ${col.text} uppercase tracking-widest leading-none`}>{item.label}</p>
                            <p className="text-sm font-medium text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">{item.value}</p>
                            {onExplainRequest && (
                              <button
                                onClick={() => onExplainRequest(`Explain "${item.label}": ${item.value}`)}
                                className={`mt-1 text-[8px] font-black uppercase tracking-widest ${col.text} opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity flex items-center gap-1`}
                              >
                                <span>✦</span> Ask AI
                              </button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </AnimatedBlock>
            );
          }

          /* ── CODE-MAP (timeline) ───────────────────────────────────── */
          case 'code-map':
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="p-8 sm:p-12 bg-card border border-border shadow-2xl">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-2 h-2 rounded-full bg-cyan-500" />
                    <p className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.4em]">Logic Maps &amp; Flow</p>
                  </div>
                  <div className="relative pl-6 border-l border-cyan-500/20 space-y-0">
                    {(block.components || []).map((comp: any, idx: number) => (
                      <div key={idx} className="relative pb-8 group last:pb-0">
                        <div className="absolute -left-[25px] top-1 w-4 h-4 rounded-full bg-cyan-500/20 border-2 border-cyan-500 group-hover:bg-cyan-500 transition-colors shadow-[0_0_10px_rgba(6,182,212,0.4)]" />
                        <div className="space-y-1">
                          <h4 className="text-base font-black text-foreground uppercase tracking-tight group-hover:text-cyan-400 transition-colors">{comp.name}</h4>
                          <p className="text-sm text-muted-foreground leading-relaxed">{comp.description}</p>
                          {onExplainRequest && (
                            <button
                              onClick={() => onExplainRequest(`Explain "${comp.name}": ${comp.description}`)}
                              className="mt-1 text-[8px] font-black uppercase tracking-widest text-cyan-400 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity flex items-center gap-1"
                            >
                              <span>✦</span> Ask AI
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </AnimatedBlock>
            );

          /* ── ASSIGNMENT-BLOCK ──────────────────────────────────────── */
          case 'assignment-block':
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border-2 border-emerald-500/20" />
                  <div className="relative p-8 sm:p-12 space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/40 rotate-3 group-hover:rotate-0 transition-transform duration-500">
                        <TrophyIcon className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Capstone Challenge</p>
                        <h3 className="text-2xl sm:text-3xl font-black text-foreground uppercase tracking-tight">{block.title || 'Mastery Synthesis'}</h3>
                      </div>
                    </div>
                    <div className="p-6 bg-muted/50 border border-border shadow-lg">
                      <p className="text-sm font-medium text-muted-foreground leading-relaxed whitespace-pre-wrap mb-6">{block.instructions}</p>
                      {block.deliverables && block.deliverables.length > 0 && (
                        <div className="space-y-3 pt-4 border-t border-emerald-500/20">
                          <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Required Deliverables</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {block.deliverables.map((del: string, idx: number) => (
                              <div key={idx} className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/10">
                                <div className="w-5 h-5 bg-emerald-500/20 flex items-center justify-center text-[10px] font-black text-emerald-500">{idx + 1}</div>
                                <span className="text-xs font-bold text-foreground/80">{del}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </AnimatedBlock>
            );

          /* ── MATH ──────────────────────────────────────────────────── */
          case 'math':
            return (
              <AnimatedBlock key={i} i={i}>
                <MathRenderer formula={block.formula || ''} />
              </AnimatedBlock>
            );

          /* ── MOTION-GRAPHICS ───────────────────────────────────────── */
          case 'motion-graphics':
            return (
              <AnimatedBlock key={i} i={i}>
                <MotionGraphicRenderer
                  type={block.animationType || 'particles'}
                  config={block.config || {}}
                  title={block.title || block.concept}
                />
              </AnimatedBlock>
            );

          /* ── D3-CHART ──────────────────────────────────────────────── */
          case 'd3-chart':
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="space-y-3">
                  {(block.title || block.concept) && (
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-4 bg-orange-500 rounded-full" />
                      <p className="text-[10px] font-black text-orange-400/70 uppercase tracking-widest">{block.title || block.concept}</p>
                    </div>
                  )}
                  <D3ChartRenderer type={block.chartType || 'bar'} dataset={block.dataset || []} labels={block.labels} />
                </div>
              </AnimatedBlock>
            );

          /* ── VISUALIZER ────────────────────────────────────────────── */
          case 'visualizer':
            return (
              <AnimatedBlock key={i} i={i}>
                <VisualizerBlock block={block} />
              </AnimatedBlock>
            );

          /* ── KEY-TERMS ─────────────────────────────────────────────── */
          case 'key-terms': {
            const terms: { term: string; definition: string }[] = block.terms || block.items || [];
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/20 text-amber-400">
                      <BookOpenIcon className="w-4 h-4" />
                    </div>
                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-[0.4em]">{block.title || 'Key Terms & Definitions'}</p>
                  </div>
                  <div className="divide-y divide-white/5 border border-border">
                    {terms.map((t: any, idx: number) => (
                      <div key={idx} className="group flex gap-4 p-4 hover:bg-muted/30 transition-colors">
                        <div className="shrink-0 mt-1">
                          <div className="w-2 h-2 rounded-full bg-amber-500/60 group-hover:bg-amber-400 transition-colors" />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <p className="text-sm font-black text-amber-300 tracking-tight">{t.term || t.label || t.word}</p>
                          <p className="text-sm text-muted-foreground leading-relaxed">{t.definition || t.value || t.meaning}</p>
                        </div>
                        {onExplainRequest && (
                          <button
                            onClick={() => onExplainRequest(`Explain term: "${t.term || t.label}". Definition: ${t.definition || t.value}`)}
                            className="shrink-0 self-start text-[8px] font-black uppercase tracking-widest text-amber-400 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity mt-1"
                          >
                            ✦ AI
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </AnimatedBlock>
            );
          }

          /* ── QUOTE ─────────────────────────────────────────────────── */
          case 'quote':
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="relative pl-8 py-6 border-l-4 border-violet-500/60 bg-violet-500/5 overflow-hidden group">
                  <div className="absolute top-3 right-4 text-5xl font-black text-violet-500/10 leading-none select-none">"</div>
                  <blockquote className="text-base sm:text-lg font-semibold text-foreground/80 italic leading-relaxed mb-3">
                    "{block.content || block.quote}"
                  </blockquote>
                  {(block.author || block.source) && (
                    <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest">
                      — {block.author || block.source}
                    </p>
                  )}
                </div>
              </AnimatedBlock>
            );

          /* ── STEPS-LIST ────────────────────────────────────────────── */
          case 'steps-list': {
            const steps: string[] = block.steps || block.items || [];
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="space-y-3">
                  {block.title && (
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em] flex items-center gap-2">
                      <CheckCircleIcon className="w-4 h-4" />
                      {block.title}
                    </p>
                  )}
                  <div className="space-y-2">
                    {steps.map((step: any, idx: number) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.07, type: 'spring', stiffness: 200 }}
                        className="flex items-start gap-4 p-4 bg-muted/30 border border-border hover:border-emerald-500/20 hover:bg-emerald-500/5 transition-all group"
                      >
                        <div className="shrink-0 w-7 h-7 bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[11px] font-black text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                          {idx + 1}
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors pt-0.5">
                          {typeof step === 'string' ? step : step.text || step.content || step.label || JSON.stringify(step)}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </AnimatedBlock>
            );
          }

          /* ── TABLE ─────────────────────────────────────────────────── */
          case 'table': {
            const headers: string[] = block.headers || block.columns || [];
            const rows: any[][] = block.rows || block.data || [];
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="space-y-3">
                  {block.title && (
                    <p className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.4em]">{block.title}</p>
                  )}
                  <div className="overflow-x-auto border border-border">
                    <table className="w-full text-sm border-collapse">
                      {headers.length > 0 && (
                        <thead>
                          <tr className="bg-muted/50">
                            {headers.map((h: string, hi: number) => (
                              <th key={hi} className="px-4 py-3 text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest border-b border-border">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                      )}
                      <tbody>
                        {rows.map((row: any[], ri: number) => (
                          <tr key={ri} className="border-b border-border hover:bg-muted/30 transition-colors group">
                            {(Array.isArray(row) ? row : Object.values(row)).map((cell: any, ci: number) => (
                              <td key={ci} className={`px-4 py-3 text-sm text-muted-foreground group-hover:text-foreground transition-colors ${ci === 0 ? 'font-semibold text-foreground/80' : ''}`}>
                                {String(cell ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </AnimatedBlock>
            );
          }

          /* ── COLUMNS ───────────────────────────────────────────────── */
          case 'columns': {
            const cols: any[] = block.columns || block.items || [];
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cols.map((col: any, ci: number) => {
                    const accent = INFO_COLORS[ci % INFO_COLORS.length];
                    return (
                      <motion.div
                        key={ci}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: ci * 0.1, type: 'spring', stiffness: 160 }}
                        className={`p-5 border border-border border-t-2 ${accent.accent.replace('border-l-', 'border-t-')} ${accent.bg} space-y-2 group hover:shadow-lg transition-all`}
                      >
                        {(col.title || col.heading || col.label) && (
                          <p className={`text-[10px] font-black uppercase tracking-widest ${accent.text}`}>
                            {col.title || col.heading || col.label}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
                          {col.content || col.text || col.value || col.body || ''}
                        </p>
                      </motion.div>
                    );
                  })}
                </div>
              </AnimatedBlock>
            );
          }

          /* ── MERMAID / DIAGRAM ─────────────────────────────────────── */
          case 'mermaid':
          case 'diagram':
            return (
              <AnimatedBlock key={i} i={i}>
                <MermaidRenderer code={block.code || block.content || ''} />
              </AnimatedBlock>
            );

          /* ── LOTTIE ANIMATION ──────────────────────────────────────── */
          case 'lottie':
            return (
              <AnimatedBlock key={i} i={i}>
                <LottieBlock
                  url={block.url}
                  keyword={block.keyword || block.topic}
                  title={block.title || block.caption}
                  loop={block.loop !== false}
                />
              </AnimatedBlock>
            );

          /* ── BLOCKLY VISUAL CODING ─────────────────────────────────── */
          case 'blockly':
            return (
              <AnimatedBlock key={i} i={i}>
                <BlocklyBlock
                  xml={block.xml || block.workspace}
                  language={block.language || 'python'}
                  title={block.title}
                />
              </AnimatedBlock>
            );

          /* ── RECHARTS DATA CHART ───────────────────────────────────── */
          case 'chart':
          case 'recharts': {
            const chartData = block.data || block.dataset || [];
            return (
              <AnimatedBlock key={i} i={i}>
                <div className="space-y-3">
                  {(block.title || block.concept) && (
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-4 bg-violet-500 rounded-full" />
                      <p className="text-[10px] font-black text-violet-400/70 uppercase tracking-widest">{block.title || block.concept}</p>
                    </div>
                  )}
                  <div className="p-4 bg-card border border-border">
                    <RechartsBlock
                      chartType={block.chartType || block.type2 || 'bar'}
                      data={chartData}
                      labels={block.labels}
                    />
                  </div>
                  {block.caption && (
                    <p className="text-center text-[10px] text-muted-foreground italic">{block.caption}</p>
                  )}
                </div>
              </AnimatedBlock>
            );
          }

          default:
            return null;
        }
      })}
    </div>
  );
}

// ── Full markdown renderer for lesson_notes ──────────────────────────────────
function NoteCodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const LANG_COLOR: Record<string, string> = {
    python: 'text-emerald-400 bg-emerald-500/10',
    javascript: 'text-yellow-400 bg-yellow-500/10',
    js: 'text-yellow-400 bg-yellow-500/10',
    html: 'text-orange-400 bg-orange-500/10',
    css: 'text-blue-400 bg-blue-500/10',
    robotics: 'text-violet-400 bg-violet-500/10',
    bash: 'text-muted-foreground bg-muted/50',
    json: 'text-cyan-400 bg-cyan-500/10',
  };
  const langClass = LANG_COLOR[lang?.toLowerCase()] ?? 'text-cyan-400 bg-cyan-500/10';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="my-5 bg-card border border-border overflow-hidden shadow-xl"
    >
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
          </div>
          {lang && <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${langClass}`}>{lang}</span>}
        </div>
        <button
          onClick={copy}
          className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors flex items-center gap-1"
        >
          {copied ? '✓ Copied' : '⧉ Copy'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] font-mono leading-relaxed text-cyan-700 dark:text-cyan-300">
        <code>{code}</code>
      </pre>
    </motion.div>
  );
}

function renderMarkdownNotes(md: string): React.ReactNode[] {
  const lines = md.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const inline = (text: string, k: number | string) => {
    const html = text
      .replace(/`([^`]+)`/g, '<code style="background:rgba(6,182,212,0.1);color:var(--inline-code-color,#0e7490);padding:2px 7px;border-radius:4px;font-size:0.83em;font-family:monospace;border:1px solid rgba(6,182,212,0.25)">$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--foreground);font-weight:900">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em style="color:rgba(255,255,255,0.7)">$1</em>')
      .replace(/~~(.+?)~~/g, '<s style="opacity:0.4">$1</s>');
    return <span key={k} dangerouslySetInnerHTML={{ __html: html }} />;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { codeLines.push(lines[i]); i++; }
      nodes.push(<NoteCodeBlock key={key++} lang={lang} code={codeLines.join('\n')} />);
      i++; continue;
    }

    // Blockquote / callout (> prefix)
    if (line.trim().startsWith('> ')) {
      const quotes: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) { quotes.push(lines[i].slice(lines[i].indexOf('> ') + 2)); i++; }
      nodes.push(
        <motion.blockquote
          key={key++}
          initial={{ opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35 }}
          className="my-4 pl-5 border-l-4 border-violet-500/50 bg-violet-500/5 py-3 pr-4"
        >
          <p className="text-sm text-foreground/70 italic leading-relaxed">{inline(quotes.join(' '), 'bq')}</p>
        </motion.blockquote>
      );
      continue;
    }

    // Headings with scroll-triggered fade-in
    if (/^### /.test(line)) {
      nodes.push(
        <motion.h3 key={key++} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.3 }}
          className="text-base font-black text-foreground/80 pt-5 pb-1 flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-cyan-500 inline-block" />
          {inline(line.slice(4), 'h3')}
        </motion.h3>
      );
      i++; continue;
    }
    if (/^## /.test(line)) {
      nodes.push(
        <motion.h2 key={key++} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.35 }}
          className="text-lg font-black text-foreground pt-8 pb-2 border-b border-border uppercase tracking-widest mt-4">
          {inline(line.slice(3), 'h2')}
        </motion.h2>
      );
      i++; continue;
    }
    if (/^# /.test(line)) {
      nodes.push(
        <motion.h1 key={key++} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}
          className="text-2xl font-black text-foreground pt-6 pb-2 bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text">
          {inline(line.slice(2), 'h1')}
        </motion.h1>
      );
      i++; continue;
    }

    // Bullet list
    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) { items.push(lines[i].slice(2)); i++; }
      nodes.push(
        <ul key={key++} className="list-none space-y-2 pl-0 my-3">
          {items.map((item, ii) => (
            <motion.li key={ii} initial={{ opacity: 0, x: -6 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
              transition={{ delay: ii * 0.05, duration: 0.3 }}
              className="flex gap-3 items-start text-sm text-muted-foreground leading-relaxed"
            >
              <span className="text-cyan-500/70 mt-1.5 shrink-0 text-xs">▸</span>
              <span className="flex-1">{inline(item, ii)}</span>
            </motion.li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, '')); i++; }
      nodes.push(
        <ol key={key++} className="list-none space-y-2 pl-0 my-3">
          {items.map((item, ii) => (
            <motion.li key={ii} initial={{ opacity: 0, x: -6 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
              transition={{ delay: ii * 0.05, duration: 0.3 }}
              className="flex gap-3 items-start text-sm text-muted-foreground leading-relaxed"
            >
              <span className="w-5 h-5 rounded bg-indigo-500/20 text-indigo-400 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{ii + 1}</span>
              <span className="flex-1">{inline(item, ii)}</span>
            </motion.li>
          ))}
        </ol>
      );
      continue;
    }

    // Markdown table
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        if (!/^[\s|:-]+$/.test(lines[i])) tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length > 0) {
        const rows = tableLines.map(r => r.split('|').filter(c => c.trim()).map(c => c.trim()));
        nodes.push(
          <div key={key++} className="overflow-x-auto my-4 border border-border">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  {(rows[0] || []).map((cell, ci) => (
                    <th key={ci} className="px-4 py-2.5 text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest border-b border-border">{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1).map((row, ri) => (
                  <tr key={ri} className="border-b border-border hover:bg-muted/30 transition-colors">
                    {row.map((cell, ci) => (
                      <td key={ci} className={`px-4 py-2.5 text-sm ${ci === 0 ? 'font-semibold text-foreground/80' : 'text-muted-foreground'}`}>{inline(cell, ci)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Empty line
    if (!line.trim()) { i++; continue; }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length && lines[i].trim() &&
      !/^#{1,3} /.test(lines[i]) && !/^[-*] /.test(lines[i]) &&
      !/^\d+\. /.test(lines[i]) && !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('|') && !lines[i].trim().startsWith('> ')
    ) { paraLines.push(lines[i]); i++; }
    if (paraLines.length > 0) {
      nodes.push(
        <p key={key++} className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap my-1.5">
          {inline(paraLines.join('\n'), 'p')}
        </p>
      );
    }
  }
  return nodes;
}

const TabBtn = ({ active, onClick, icon: Icon, label, count }: any) => (
  <button onClick={onClick} className={`flex items-center gap-2 sm:gap-2.5 px-4 sm:px-6 py-3 sm:py-4 rounded-none transition-all relative group whitespace-nowrap ${active ? 'bg-gradient-to-r from-orange-600 to-orange-400 to-indigo-500 text-foreground shadow-[0_10px_30px_-10px_rgba(6,182,212,0.5)]' : 'text-muted-foreground hover:text-foreground hover:bg-card shadow-sm'}`}>
    <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:scale-110 ${active ? 'text-foreground' : 'text-current'}`} />
    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.1em] sm:tracking-[0.15em] shrink-0">{label}</span>
    {count !== undefined && count > 0 && (
      <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black min-w-[16px] sm:min-w-[18px] text-center ${active ? 'bg-muted text-foreground' : 'bg-card shadow-sm text-muted-foreground group-hover:text-muted-foreground'}`}>
        {count}
      </span>
    )}
    {active && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-cyan-400 rounded-full blur-[2px] shadow-[0_0_8px_cyan]" />}
  </button>
);

// --- Main Page Component ---

export default function LessonDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const classId = searchParams?.get('class_id');
  const { profile, loading: authLoading } = useAuth();

  const [lesson, setLesson] = useState<any>(null);
  const [courseLessons, setCourseLessons] = useState<any[]>([]);
  const [courseAssignments, setCourseAssignments] = useState<any[]>([]);
  const [programQuizzes, setProgramQuizzes] = useState<any[]>([]);
  const [plans, setPlans] = useState<any>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'content' | 'materials' | 'tasks' | 'plan'>('content');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [completed, setCompleted] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const startTimeRef = useState<number>(() => Date.now())[0];
  const [notesRead, setNotesRead] = useState(false);
  const [lessonHook, setLessonHook] = useState<{ hook_title: string; hook: string; real_world_example: string; challenge_question: string } | null>(null);
  const [hookLoading, setHookLoading] = useState(false);
  const hookFetchedRef = useRef(false);
  const [isCinemaMode, setIsCinemaMode] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [interactions, setInteractions] = useState<Set<number>>(new Set());
  const [explainRequest, setExplainRequest] = useState<string | undefined>(undefined);

  const handleInteraction = (idx: number) => {
    setInteractions(prev => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  };

  const handleGenerateNotes = async () => {
    if (!lesson || generatingNotes) return;
    setGeneratingNotes(true);
    try {
      const siblingTitles = courseLessons
        .filter(l => l.id !== id)
        .map(l => l.title);
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'lesson-notes',
          topic: lesson.title,
          gradeLevel: lesson.grade_level || 'JSS1–SS3',
          subject: lesson.subject || undefined,
          durationMinutes: lesson.duration_minutes || 60,
          courseName: lesson.courses?.title || undefined,
          programName: lesson.courses?.programs?.name || undefined,
          siblingLessons: siblingTitles.length ? siblingTitles : undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Generation failed');
      let notes: string | undefined = payload.data?.lesson_notes;
      if (notes) {
        // Sanitize: if AI returned escaped \n sequences instead of real newlines, fix them
        if (typeof notes === 'string' && !notes.includes('\n') && notes.includes('\\n')) {
          notes = notes.replace(/\\n/g, '\n');
        }
        // Save to DB
        const db = createClient();
        await db.from('lessons').update({ lesson_notes: notes }).eq('id', id);
        // Update local state
        setLesson((prev: any) => ({ ...prev, lesson_notes: notes }));
      }
    } catch (e: any) {
      alert(e.message ?? 'Failed to generate notes. Please try again.');
    } finally {
      setGeneratingNotes(false);
    }
  };

  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (!mainEl) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = mainEl;
      const progress = (scrollTop / (scrollHeight - clientHeight)) * 100;
      setScrollProgress(progress);
    };

    mainEl.addEventListener('scroll', handleScroll);
    return () => mainEl.removeEventListener('scroll', handleScroll);
  }, []);

  const nextLesson = useMemo(() => {
    if (!id || courseLessons.length === 0) return null;
    const idx = courseLessons.findIndex(l => l.id === id);
    return idx !== -1 && idx < courseLessons.length - 1 ? courseLessons[idx + 1] : null;
  }, [id, courseLessons]);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  const fetchData = useCallback(async () => {
    if (!profile || !id) return;
    const db = createClient();
    try {
      const { data: lessonData, error: lErr } = await db
        .from('lessons')
        .select(`
          *, 
          lesson_notes, 
          courses (
            id, 
            title, 
            program_id,
            programs ( id, name )
          ), 
          portal_users!lessons_created_by_fkey ( full_name )
        `)
        .eq('id', id)
        .maybeSingle();

      if (lErr) throw lErr;
      if (!lessonData) { setError('Lesson not found'); return; }
      const lessonObj = lessonData as any;
      setLesson(lessonObj);

      const [plansRes, materialsRes] = await Promise.all([
        db.from('lesson_plans').select('*').eq('lesson_id', id).maybeSingle(),
        db.from('lesson_materials').select('*').eq('lesson_id', id).order('created_at', { ascending: true }),
      ]);
      setPlans(plansRes.data);
      setMaterials(materialsRes.data ?? []);

      if (lessonObj.course_id) {
        const [cLessons, cAsgns, cQuizzes] = await Promise.all([
          db.from('lessons').select('id, title, order_index, lesson_type').eq('course_id', lessonObj.course_id).order('order_index', { ascending: true }),
          db.from('assignments').select('id, title, assignment_type, due_date').eq('lesson_id', lessonObj.id),
          db.from('cbt_exams').select('id, title, duration_minutes, total_points').eq('program_id', lessonObj.courses?.program_id || lessonObj.courses?.programs?.id || '')
        ]);
        setCourseLessons(cLessons.data ?? []);
        setCourseAssignments(cAsgns.data ?? []);
        setProgramQuizzes(cQuizzes.data ?? []);
      }

      if (profile.role === 'student') {
        const { data: progress } = await db.from('lesson_progress').select('lesson_id, completed_at').eq('portal_user_id', profile.id);
        const cIds = new Set<string>();
        progress?.forEach((p: any) => { if (p.completed_at) cIds.add(p.lesson_id); });
        setCompletedIds(cIds);
        if (cIds.has(id)) setCompleted(true);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, profile]);

  useEffect(() => {
    if (!authLoading && profile) fetchData();
  }, [authLoading, profile, fetchData]);

  // Auto-fetch lesson hook once when lesson loads
  useEffect(() => {
    if (!lesson || hookFetchedRef.current) return;
    hookFetchedRef.current = true;
    setHookLoading(true);
    fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'lesson-hook',
        topic: lesson.title,
        gradeLevel: lesson.grade_level || 'JSS1–SS3',
        courseName: lesson.courses?.title || undefined,
        programName: lesson.courses?.programs?.name || undefined,
      }),
    })
      .then(r => r.json())
      .then(p => { if (p.data?.hook) setLessonHook(p.data); })
      .catch(() => {})
      .finally(() => setHookLoading(false));
  }, [lesson]);

  const handleMarkComplete = async () => {
    if (!profile || !id || marking || completed) return;
    setMarking(true);
    const timeSpent = Math.round((Date.now() - startTimeRef) / 60000);
    try {
      const res = await fetch(`/api/lessons/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeSpentMinutes: Math.max(timeSpent, 1), progressPercentage: 100 }),
      });
      if (!res.ok) throw new Error('Failed to mark complete');
      setCompleted(true);
      setCompletedIds(prev => new Set([...prev, id]));
      setShowCelebration(true);
    } catch (e: any) {
      setMarkError(e.message);
    } finally {
      setMarking(false);
    }
  };

  // Scripts always rendered so Mermaid/KaTeX load regardless of auth/data state
  const alwaysScripts = (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js" strategy="afterInteractive" onLoad={() => {
        (window as any).mermaid?.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: {
            primaryColor: '#4f46e5',
            primaryTextColor: '#1e293b',
            primaryBorderColor: '#4f46e5',
            lineColor: '#6366f1',
            secondaryColor: '#06b6d4',
            tertiaryColor: '#f8fafc',
            fontFamily: 'Inter, sans-serif',
            fontSize: '12px'
          },
          securityLevel: 'loose',
          flowchart: { htmlLabels: true, useMaxWidth: true, curve: 'basis' }
        });
      }} />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
      <Script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" strategy="afterInteractive" />
    </>
  );

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
      {alwaysScripts}
      <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">Loading lesson...</p>
    </div>
  );

  if (error || !lesson) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 text-center gap-6">
      <ExclamationTriangleIcon className="w-16 h-16 text-rose-500/20" />
      <h2 className="text-2xl font-bold text-rose-400">Could not load lesson</h2>
      <p className="text-muted-foreground max-w-md">{error || 'Unable to load lesson content. Please check your connection or contact support.'}</p>
      <Link href="/dashboard/lessons" className="px-6 py-2.5 bg-card shadow-sm border border-border rounded-none text-xs font-bold">Back to Lessons</Link>
    </div>
  );

  const heroVideo = lesson.lesson_type === 'video' ? (lesson.content_layout as any[])?.find(b => b.type === 'video') : null;
  const isCoding = lesson.lesson_type === 'coding';
  const isReading = lesson.lesson_type === 'reading';

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row h-screen overflow-hidden">
      {alwaysScripts}
      <AnimatePresence>
        {showCelebration && (
          <CompletionCelebration
            onDismiss={() => setShowCelebration(false)}
            lessonTitle={lesson?.title}
            courseTitle={lesson?.courses?.title ?? undefined}
            gradeLevel={lesson?.grade_level ?? undefined}
            objectives={Array.isArray(lesson?.objectives) ? lesson.objectives : undefined}
          />
        )}
      </AnimatePresence>
      {/* Mobile Header (Techy & Clean) */}
      <div className="md:hidden p-5 border-b border-border bg-background/80 backdrop-blur-xl flex items-center justify-between z-50 sticky top-0">
        <div className="flex items-center gap-4">
          <button onClick={() => setSidebarOpen(true)} className="p-3 bg-card shadow-sm rounded-none text-cyan-400 hover:bg-cyan-500/10 transition-all border border-border active:scale-95 shadow-xl">
            <RectangleGroupIcon className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">Lesson</p>
            <h2 className="text-xs font-bold text-foreground truncate max-w-[150px]">{lesson.title}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Live</span>
        </div>
      </div>

      {/* Sidebar - Course Syllabus (Nucleus Style) */}
      <aside className={`fixed inset-0 z-[60] md:relative md:inset-auto transition-all duration-700 ease-in-out md:translate-x-0 ${sidebarOpen ? 'translate-x-0 w-full md:w-[360px]' : '-translate-x-full w-full md:w-0 overflow-hidden'}`}>
        {/* Mobile Backdrop */}
        <div className={`md:hidden absolute inset-0 bg-background/80 backdrop-blur-md transition-opacity duration-700 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setSidebarOpen(false)} />

        <div className="relative h-full bg-background border-r border-border flex flex-col w-[85%] max-w-[340px] md:w-full shadow-[20px_0_50px_rgba(0,0,0,0.5)]">
          <div className="p-8 border-b border-border flex items-center justify-between bg-gradient-to-br from-white/[0.02] to-transparent">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                <h2 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">Curriculum</h2>
              </div>
              <p className="font-black text-foreground text-lg leading-tight truncate max-w-[200px]">{lesson.courses?.programs?.name || 'Academic Track'}</p>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden p-3 bg-card shadow-sm rounded-none text-muted-foreground hover:text-foreground transition-all hover:bg-rose-500/10 active:scale-95">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 custom-scrollbar bg-card/20">
            <div className="px-6 py-5 bg-card shadow-sm border border-border rounded-none mb-6 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-600/10 blur-2xl -mr-12 -mt-12 group-hover:scale-150 transition-transform" />
              <h3 className="text-xs font-bold text-orange-400 uppercase tracking-widest relative z-10">{lesson.courses?.title || 'Course'}</h3>
              <div className="flex items-center gap-2 mt-2 relative z-10">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em]">{courseLessons.length} lessons</span>
                <div className="h-px flex-1 bg-muted" />
              </div>
            </div>

            <div className="space-y-1.5">
              {courseLessons.map((l, idx) => {
                const isActive = l.id === id;
                const isCompleted = completedIds.has(l.id);
                return (
                  <Link key={l.id} href={`/dashboard/lessons/${l.id}${classId ? `?class_id=${classId}` : ''}`}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-4 p-4 rounded-none transition-all relative group overflow-hidden ${isActive ? 'bg-cyan-500/10 text-foreground shadow-xl ring-1 ring-cyan-500/20' : 'hover:bg-card shadow-sm text-muted-foreground hover:text-muted-foreground'}`}>
                    {isActive && <div className="absolute left-0 top-0 w-1 h-full bg-cyan-500 shadow-[0_0_15px_cyan]" />}

                    <div className={`shrink-0 w-8 h-8 rounded-none border flex items-center justify-center text-[10px] font-black transition-all ${isCompleted ? 'bg-emerald-500 border-emerald-500 text-foreground shadow-lg shadow-emerald-500/20' : isActive ? 'bg-white text-black border-border' : 'border-border group-hover:border-border group-hover:bg-card shadow-sm'}`}>
                      {isCompleted ? <CheckBadgeIcon className="w-4 h-4" /> : idx + 1}
                    </div>

                    <div className="min-w-0 flex-1">
                      <span className={`text-[11px] font-black block truncate leading-tight uppercase tracking-wide ${isActive ? 'text-foreground' : 'text-current group-hover:text-muted-foreground'}`}>{l.title}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[8px] uppercase tracking-widest font-black opacity-30">{l.lesson_type}</span>
                        {isCompleted && <span className="text-[8px] text-emerald-500 font-bold uppercase tracking-widest">Done</span>}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="p-8 border-t border-border bg-gradient-to-t from-black to-transparent">
            <Link href={classId ? `/dashboard/classes/${classId}` : `/dashboard/lessons`} className="flex items-center justify-center gap-3 px-6 py-4 bg-card shadow-sm hover:bg-muted border border-border rounded-none text-[10px] font-black text-muted-foreground hover:text-foreground uppercase tracking-[0.3em] transition-all shadow-xl active:scale-95 group">
              <ArrowLeftIcon className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
              {classId ? 'Back to Class' : 'Back to Lessons'}
            </Link>
          </div>
        </div>
      </aside>

      <main className={`flex-1 overflow-y-auto relative ${isCinemaMode ? 'bg-black' : 'bg-background'} custom-scrollbar scroll-smooth`}>
        {/* Dynamic Progress Indicator */}
        <div className="fixed top-0 left-0 right-0 h-1.5 z-[100] md:left-[0px]">
          <motion.div
            className="h-full bg-gradient-to-r from-orange-600 to-orange-400 via-indigo-500 to-orange-600 shadow-[0_0_15px_rgba(6,182,212,0.5)]"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>
        {/* Video Hero — handles both YouTube links and R2-uploaded videos */}
        {lesson.lesson_type === 'video' && heroVideo && (
          <VideoPlayer
            url={heroVideo.url}
            title={lesson.title}
            cinemaMode
            onCinemaModeChange={setIsCinemaMode}
            className="w-full border-b border-border"
          />
        )}

        {!isCinemaMode && (
          <div className={`max-w-6xl mx-auto px-4 sm:px-12 py-8 sm:py-20 space-y-10 sm:space-y-16 ${isReading ? 'max-w-4xl' : ''}`}>
            {/* Header */}
            <header className="space-y-10 sm:space-y-16 animate-in fade-in slide-in-from-top-12 duration-1000">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="hidden md:flex p-4 bg-card shadow-sm border border-border rounded-none text-muted-foreground hover:text-cyan-400 hover:border-cyan-500/30 transition-all shadow-xl group">
                  <BoltIcon className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                </button>
                <div className={`px-6 py-2 rounded-full text-[10px] sm:text-[11px] font-black border uppercase tracking-[0.3em] shadow-3xl ${TYPE_COLOR[lesson.lesson_type] || 'bg-muted text-foreground border-border'}`}>
                  {lesson.lesson_type}
                </div>
                {lesson.duration_minutes && (
                  <div className="text-[10px] sm:text-[11px] font-black text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-3 bg-card shadow-sm px-6 py-2 rounded-full border border-border">
                    <ClockIcon className="w-5 h-5 text-cyan-500" />
                    {lesson.duration_minutes} Min
                  </div>
                )}
                <div className="flex-1"></div>
                {completed && (
                  <div className="flex items-center gap-2 text-emerald-400 font-black text-[10px] sm:text-[11px] uppercase tracking-[0.3em] bg-emerald-500/10 px-6 py-2.5 rounded-none border border-emerald-500/20 shadow-3xl shadow-emerald-500/20">
                    <CheckBadgeIcon className="w-5 h-5 sm:w-6 sm:h-6" /> Mastery
                  </div>
                )}
              </div>
              <div className="space-y-8">
                <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-[1.0] text-foreground selection:bg-cyan-500 selection:text-black break-words">
                  {lesson.title}
                </h1>
                <div className="h-2 w-32 bg-gradient-to-r from-orange-600 to-orange-400 to-transparent rounded-full opacity-40"></div>
                <div className="flex items-start gap-8 max-w-4xl">
                  <p className="text-sm sm:text-base text-muted-foreground font-medium leading-relaxed italic border-l-4 border-border pl-5 sm:pl-8 py-2">
                    {lesson.description}
                  </p>
                </div>
              </div>
            </header>
            {/* Nav Tabs - Modern Glass Style */}
            <div className="sticky top-0 z-30 pt-4 pb-12 -mx-4 px-4 sm:-mx-12 sm:px-12 md:relative md:p-0 md:m-0 flex justify-center sm:justify-start">
              <div className="flex items-center gap-1.5 sm:gap-2 bg-card/95 backdrop-blur-3xl p-2 rounded-none border border-border w-fit shadow-3xl overflow-x-auto no-scrollbar max-w-full">
                <TabBtn active={activeTab === 'content'} onClick={() => setActiveTab('content')} icon={BookOpenIcon} label="Lesson" />
                <TabBtn active={activeTab === 'materials'} onClick={() => setActiveTab('materials')} icon={PaperClipIcon} label="Resources" count={materials.length} />
                <TabBtn active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} icon={ClipboardDocumentListIcon} label="Assignments" count={courseAssignments.length + programQuizzes.length} />
                <TabBtn active={activeTab === 'plan'} onClick={() => setActiveTab('plan')} icon={AcademicCapIcon} label="Lesson Plan" />
              </div>
            </div>

            {/* Display Area */}
            <div className="min-h-[50vh]">
              {activeTab === 'content' && (
                <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000 space-y-20">
                  {/* Lesson Intro Strip */}
                  <div className="flex items-center gap-4 p-5 bg-card border border-border">
                    <div className="w-10 h-10 bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                      <BookOpenIcon className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Now viewing</p>
                      <p className="text-sm font-bold text-foreground truncate">{lesson.title}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{lesson.duration_minutes || 60} min</span>
                      {lesson.duration_minutes && (
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest border-l border-border pl-3">
                          ~{Math.ceil((lesson.lesson_notes?.split(' ').length || 0) / 200)} min read
                        </span>
                      )}
                    </div>
                  </div>

                  {/* PRIMARY: Study Notes First */}
                  <div className="space-y-12">
                    <div className="flex items-center gap-4">
                      <div className="h-px bg-indigo-500/20 w-12" />
                      <h3 className="text-[11px] font-bold uppercase text-indigo-400 tracking-widest">Study Notes</h3>
                      <div className="h-px flex-1 bg-indigo-500/10" />
                      <div className="flex items-center gap-2 ml-auto">
                        {lesson.lesson_notes && (
                          <NeuralVoiceReader content={lesson.lesson_notes} title={lesson.title} />
                        )}
                        {isStaff && (
                          <button
                            onClick={handleGenerateNotes}
                            disabled={generatingNotes}
                            className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500/20 transition-all disabled:opacity-50"
                          >
                            {generatingNotes ? (
                              <><div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /> Generating...</>
                            ) : (
                              <><span className="text-base">✦</span> {lesson.lesson_notes ? 'Regenerate' : 'Generate Notes'}</>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    {/* ── Lesson Hook Banner ── */}
                    {hookLoading && (
                      <div className="flex items-center gap-3 px-1 py-6 text-muted-foreground/50">
                        <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Loading lesson intro...</span>
                      </div>
                    )}
                    {lessonHook && (
                      <div className="rounded-none border-2 border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-amber-500/5 overflow-hidden mb-8">
                        <div className="flex items-center gap-3 px-6 py-3 border-b border-orange-500/15 bg-orange-500/5">
                          <span className="text-base">🔥</span>
                          <p className="text-[10px] font-black text-orange-400 uppercase tracking-[0.3em]">{lessonHook.hook_title}</p>
                        </div>
                        <div className="p-6 sm:p-8 space-y-5">
                          <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                            {lessonHook.hook}
                          </div>
                          {lessonHook.real_world_example && (
                            <div className="flex gap-3 p-4 bg-amber-500/8 border border-amber-500/20 rounded-none">
                              <span className="text-amber-400 shrink-0 mt-0.5">🌍</span>
                              <div>
                                <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">Real-World Connection</p>
                                <p className="text-sm text-muted-foreground">{lessonHook.real_world_example}</p>
                              </div>
                            </div>
                          )}
                          {lessonHook.challenge_question && (
                            <div className="flex gap-3 p-4 bg-indigo-500/8 border border-indigo-500/20 rounded-none">
                              <span className="text-indigo-400 shrink-0 mt-0.5">💭</span>
                              <div>
                                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Think About It</p>
                                <p className="text-sm font-semibold text-foreground italic">{lessonHook.challenge_question}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {lesson.lesson_notes ? (
                      <div className="max-w-none bg-card p-12 sm:p-20 rounded-none border border-border shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative overflow-hidden group/notes">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 blur-[120px] pointer-events-none" />
                        <div className="text-muted-foreground leading-relaxed text-base font-medium space-y-4">
                          {renderMarkdownNotes(lesson.lesson_notes)}
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-none bg-card p-12 sm:p-20 rounded-none border border-dashed border-indigo-500/20 flex flex-col items-center justify-center gap-6 text-center min-h-[200px]">
                        <div className="text-4xl opacity-30">📖</div>
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">No study notes yet</p>
                          <p className="text-sm text-muted-foreground font-medium">{isStaff ? 'Click "Generate Notes" above to create in-depth study material for this lesson.' : 'Detailed study notes will appear here once published by your instructor.'}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <CanvaRenderer
                    blocks={lesson.content_layout || []}
                    lessonType={lesson.lesson_type}
                    onInteraction={handleInteraction}
                    onExplainRequest={(text) => setExplainRequest(`${text}__${Date.now()}`)}
                    lessonContext={{
                      lessonTitle: lesson.title,
                      courseTitle: lesson.courses?.title ?? undefined,
                      gradeLevel: lesson.grade_level ?? undefined,
                    }}
                  />


                  {/* Logic: Interaction Progress Check */}
                  <div className="mt-24 sm:mt-40 pt-24 border-t border-border space-y-12">
                    {!completed && (
                      <div className="max-w-xl mx-auto p-8 bg-card border border-border space-y-6">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.4em]">
                          <span className="text-muted-foreground flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-orange-600 animate-pulse" />
                            Progress
                          </span>
                          <span className="text-orange-500">{interactions.size} interactive blocks done</span>
                        </div>
                        <div className="h-1 bg-muted/50 rounded-none overflow-hidden">
                          <motion.div
                            className="h-full bg-orange-600 shadow-[0_0_15px_rgba(234,88,12,0.5)]"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, (interactions.size / (lesson.content_layout?.filter((b: any) => b.type === 'quiz' || b.type === 'activity').length || 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Lesson Complete & Navigation */}
                    <div className="flex flex-col items-center gap-12 sm:gap-20 text-center pb-40 sm:pb-56">
                      {!completed && profile?.role === 'student' ? (
                        <div className="relative group">
                          <div className="absolute -inset-1 bg-gradient-to-r from-orange-600 to-orange-400 via-indigo-500 to-orange-600 rounded-none sm:rounded-none blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
                          <button onClick={handleMarkComplete} disabled={marking}
                            className="relative px-12 sm:px-20 py-8 sm:py-12 bg-background rounded-none sm:rounded-none text-foreground flex flex-col items-center gap-4 transition-all active:scale-95 border border-border">
                            <div className="p-5 bg-cyan-500/20 rounded-none text-cyan-400 shadow-2xl group-hover:scale-110 transition-transform duration-500">
                              <CheckBadgeIcon className="w-10 h-10 sm:w-14 sm:h-14" />
                            </div>
                            <div>
                              <span className="text-xl sm:text-3xl font-black uppercase tracking-[0.2em]">{marking ? 'Saving...' : 'Mark as Complete'}</span>
                              <span className="block text-[10px] sm:text-[12px] opacity-40 font-black uppercase tracking-[0.4em] mt-2">Mark this lesson as completed</span>
                            </div>
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-8 group">
                          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-emerald-500/10 border-4 border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_50px_rgba(16,185,129,0.2)] group-hover:scale-110 transition-transform duration-700">
                            <CheckBadgeIcon className="w-12 h-12 sm:w-20 sm:h-20" />
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-3xl sm:text-4xl font-black text-foreground italic tracking-tighter">Lesson Completed</h4>
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Progress saved</p>
                          </div>
                        </div>
                      )}

                      {nextLesson && (
                        <div className="w-full max-w-4xl bg-background border border-border rounded-none p-10 sm:p-20 space-y-10 sm:space-y-14 group hover:border-cyan-500/20 transition-all shadow-3xl relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-600/5 blur-[120px] -mr-32 -mt-32 pointer-events-none" />
                          <div className="space-y-6 relative z-10">
                            <div className="flex items-center justify-center gap-4">
                              <div className="h-px w-12 bg-cyan-500/30" />
                              <h5 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">Next Lesson</h5>
                              <div className="h-px w-12 bg-cyan-500/30" />
                            </div>
                            <h3 className="text-3xl sm:text-5xl font-black text-foreground group-hover:text-cyan-400 transition-colors tracking-tighter leading-none">{nextLesson.title}</h3>
                            <div className="flex items-center justify-center gap-6">
                              <span className="px-6 py-2 bg-card shadow-sm rounded-full text-[10px] font-black uppercase tracking-widest text-muted-foreground">{nextLesson.lesson_type}</span>
                              <span className="text-[10px] font-black text-cyan-500/30 uppercase tracking-[0.3em]">Module {courseLessons.findIndex(l => l.id === nextLesson.id) + 1} of {courseLessons.length}</span>
                            </div>
                          </div>
                          <Link href={`/dashboard/lessons/${nextLesson.id}${classId ? `?class_id=${classId}` : ''}`}
                            className="relative z-10 inline-flex items-center gap-4 px-12 sm:px-16 py-6 sm:py-8 bg-white text-black font-black uppercase text-[12px] sm:text-[14px] tracking-[0.3em] rounded-none hover:bg-cyan-500 hover:text-foreground transition-all shadow-[0_20px_60px_rgba(255,255,255,0.1)] active:scale-95 group/btn">
                            Start Lesson <ChevronRightIcon className="w-5 h-5 transition-transform group-hover/btn:translate-x-2" />
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'materials' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
                  {materials.map((m: any) => (
                    <a key={m.id} href={m.file_url} target="_blank"
                      className="group p-8 sm:p-10 bg-background border border-border rounded-none flex flex-col gap-10 hover:bg-white/[0.03] hover:border-cyan-500/30 transition-all shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-600/5 blur-3xl rounded-full" />
                      <div className="flex items-center justify-between relative z-10">
                        <div className="p-5 bg-cyan-500/10 rounded-none text-cyan-400 group-hover:scale-110 transition-transform shadow-xl">
                          <PaperClipIcon className="w-8 h-8" />
                        </div>
                        <div className="w-10 h-10 rounded-full bg-card shadow-sm border border-border flex items-center justify-center text-muted-foreground group-hover:text-cyan-400 group-hover:border-cyan-500/40 group-hover:scale-110 transition-all shadow-xl">
                          <ArrowDownTrayIcon className="w-5 h-5" />
                        </div>
                      </div>
                      <div className="space-y-3 relative z-10">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{m.file_type || 'Resource'}</p>
                        <h4 className="font-black text-2xl text-foreground group-hover:text-cyan-400 transition-colors leading-tight tracking-tight">{m.title}</h4>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-2">{m.file_size ? `${(m.file_size / 1024 / 1024).toFixed(2)} MB` : 'Cloud Link'}</p>
                      </div>
                    </a>
                  ))}
                  {materials.length === 0 && (
                    <div className="col-span-full py-40 text-center bg-background border border-dashed border-border rounded-none shadow-2xl">
                      <PaperClipIcon className="w-16 h-16 mx-auto text-foreground/10 mb-6 opacity-20" />
                      <p className="text-xl font-black text-muted-foreground uppercase tracking-widest">No shared resources</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'tasks' && (
                <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2 px-4 py-1.5 bg-amber-500/5 border border-amber-500/10 w-fit">
                        <ClipboardDocumentListIcon className="w-4 h-4" /> Assignments
                      </h3>
                      {isStaff && (
                        <Link
                          href={`/dashboard/assignments/new?lesson_id=${lesson?.id}&course_id=${lesson?.course_id ?? ''}`}
                          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold uppercase tracking-widest transition-colors"
                        >
                          <PlusIcon className="w-3.5 h-3.5" /> Add Assignment
                        </Link>
                      )}
                    </div>
                    {courseAssignments.length === 0 ? (
                      <div className="flex flex-col items-center gap-3 py-12 text-center">
                        <ClipboardDocumentListIcon className="w-10 h-10 text-muted-foreground/30" />
                        <p className="text-muted-foreground text-sm">No assignments for this lesson yet.</p>
                        {isStaff && (
                          <Link href={`/dashboard/assignments/new?lesson_id=${lesson?.id}&course_id=${lesson?.course_id ?? ''}`}
                            className="text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors">
                            + Create the first assignment
                          </Link>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {courseAssignments.map((a: any) => (
                          <Link key={a.id} href={`/dashboard/assignments/${a.id}`}
                            className="p-8 sm:p-10 bg-background border border-border rounded-none hover:bg-amber-500/[0.03] hover:border-amber-500/30 transition-all group flex items-center justify-between gap-8 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-600/5 blur-3xl rounded-full" />
                            <div className="flex items-center gap-10 relative z-10">
                              <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-none text-amber-500 group-hover:scale-110 transition-transform shadow-xl hidden sm:flex">
                                <DocumentTextIcon className="w-8 h-8" />
                              </div>
                              <div className="space-y-2">
                                <h4 className="font-black text-2xl text-foreground group-hover:text-amber-400 transition-colors tracking-tight">{a.title}</h4>
                                <div className="flex flex-wrap items-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                                  <span className="px-3 py-1 bg-card shadow-sm rounded-none text-amber-500/60 font-black">{a.assignment_type}</span>
                                  <span className="w-1.5 h-1.5 rounded-full bg-muted"></span>
                                  <span className={a.due_date && new Date(a.due_date) < new Date() ? 'text-rose-400 animate-pulse' : 'text-muted-foreground'}>
                                    {a.due_date ? `Deadline: ${new Date(a.due_date).toLocaleDateString()}` : 'No deadline'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="w-12 h-12 rounded-none bg-card shadow-sm border border-border flex items-center justify-center text-muted-foreground group-hover:text-amber-400 group-hover:border-amber-500/40 group-hover:translate-x-1 transition-all shadow-xl">
                              <ChevronRightIcon className="w-6 h-6" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-6 pt-12 border-t border-border">
                    <h3 className="text-xs font-bold text-orange-400 uppercase tracking-widest flex items-center gap-2 px-4 py-1.5 bg-orange-500/5 border border-orange-500/10 w-fit">
                      <AcademicCapIcon className="w-4 h-4" /> CBT Exams
                    </h3>
                    {programQuizzes.length === 0 ? (
                      <p className="text-muted-foreground text-xs italic px-4">No CBT exams found for this programme.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {programQuizzes.map((q: any) => (
                          <Link key={q.id} href={`/dashboard/cbt/${q.id}`}
                            className="p-8 sm:p-10 bg-background border border-border rounded-none hover:bg-orange-500/[0.03] hover:border-orange-500/30 transition-all group flex items-center justify-between gap-8 shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/5 blur-3xl rounded-full" />
                            <div className="flex items-center gap-10 relative z-10">
                              <div className="p-6 bg-orange-500/10 border border-orange-500/20 rounded-none text-orange-400 group-hover:scale-110 transition-transform shadow-xl hidden sm:flex">
                                <StarIcon className="w-8 h-8" />
                              </div>
                              <div className="space-y-2">
                                <h4 className="font-black text-2xl text-foreground group-hover:text-orange-400 transition-colors tracking-tight">{q.title}</h4>
                                <div className="flex flex-wrap items-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                                  <span className="px-3 py-1 bg-card shadow-sm rounded-none text-orange-500/60 font-bold">{q.duration_minutes} min</span>
                                  <span className="w-1.5 h-1.5 rounded-full bg-muted"></span>
                                  <span className="text-muted-foreground">{q.total_questions} questions</span>
                                </div>
                              </div>
                            </div>
                            <div className="w-12 h-12 rounded-none bg-card shadow-sm border border-border flex items-center justify-center text-muted-foreground group-hover:text-orange-400 group-hover:border-orange-500/40 group-hover:translate-x-1 transition-all shadow-xl">
                              <ChevronRightIcon className="w-6 h-6" />
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'plan' && (
                <div className="max-w-4xl mx-auto space-y-12 sm:space-y-24 animate-in fade-in slide-in-from-bottom-8 duration-1000">
                  {/* If it's a full course plan (structured) */}
                  {plans?.plan_data && Object.keys(plans.plan_data).length > 0 ? (
                    <div className="space-y-20">
                      <div className="bg-background/40 backdrop-blur-xl border border-border rounded-none p-10 sm:p-20 relative overflow-hidden group shadow-3xl">
                        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-600/5 blur-[120px] -mr-48 -mt-48 group-hover:bg-cyan-600/10 transition-all duration-1000" />
                        <div className="relative z-10 space-y-8">
                          <div className="flex items-center gap-4">
                            <div className="px-4 py-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-bold uppercase tracking-widest">Overview</div>
                            <div className="h-px flex-1 bg-card shadow-sm" />
                          </div>
                          <h2 className="text-3xl sm:text-5xl font-black text-foreground leading-tight tracking-tight">{plans.plan_data.course_title}</h2>
                          <p className="text-xl sm:text-3xl text-muted-foreground font-medium italic leading-relaxed border-l-4 border-cyan-500/30 pl-8">{plans.plan_data.description}</p>
                          <div className="flex flex-wrap gap-6 pt-6">
                            <div className="bg-card shadow-sm px-8 py-4 rounded-none border border-border">
                              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Grade Level</p>
                              <p className="text-lg font-black text-foreground">{plans.plan_data.grade_level}</p>
                            </div>
                            <div className="bg-card shadow-sm px-8 py-4 rounded-none border border-border">
                              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Duration</p>
                              <p className="text-lg font-black text-foreground">{plans.plan_data.duration}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-12">
                        <div className="flex items-center gap-6">
                          <h3 className="text-xl font-bold text-foreground uppercase tracking-widest">Weekly Breakdown</h3>
                          <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
                        </div>

                        <div className="grid grid-cols-1 gap-8 relative pb-20">
                          <div className="absolute left-7 sm:left-12 top-0 bottom-0 w-1 bg-card shadow-sm" />
                          {plans.plan_data.weeks?.map((week: any, wIdx: number) => (
                            <motion.div
                              initial={{ opacity: 0, x: -20 }}
                              whileInView={{ opacity: 1, x: 0 }}
                              transition={{ delay: wIdx * 0.1 }}
                              key={wIdx}
                              className="relative pl-20 sm:pl-32 group"
                            >
                              <div className="absolute left-0 top-6 sm:top-8 w-14 sm:w-24 h-px bg-muted group-hover:bg-cyan-500/50 transition-colors" />
                              <div className={`absolute left-4 sm:left-8 top-1 sm:top-2 w-8 h-8 sm:w-12 sm:h-12 rounded-none border-2 flex items-center justify-center text-[10px] sm:text-[12px] font-black z-10 transition-all ${wIdx % 2 === 0 ? 'bg-cyan-600 border-cyan-400 text-foreground shadow-[0_0_20px_rgba(6,182,212,0.3)]' : 'bg-background border-border text-muted-foreground'}`}>
                                {week.week}
                              </div>
                              <div className="bg-card shadow-sm border border-border rounded-none p-8 sm:p-12 hover:bg-white/[0.08] hover:border-cyan-500/20 transition-all shadow-2xl">
                                <div className="space-y-6">
                                  <div className="space-y-1">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Theme</p>
                                    <h4 className="text-xl sm:text-2xl font-black text-foreground group-hover:text-cyan-400 transition-colors">{week.theme}</h4>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-4">
                                    <div className="space-y-4">
                                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Core Topics</p>
                                      <div className="space-y-2">
                                        {week.topics?.map((t: string, ti: number) => (
                                          <div key={ti} className="flex items-center gap-3 text-sm text-muted-foreground font-medium">
                                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500/40" /> {t}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="space-y-4">
                                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Activities</p>
                                      <div className="space-y-2">
                                        {week.activities?.map((a: string, ai: number) => (
                                          <div key={ai} className="flex items-center gap-3 text-sm text-muted-foreground font-medium italic">
                                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500/40" /> {a}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pb-32">
                        <div className="bg-card shadow-sm border border-border rounded-none p-10 sm:p-16 space-y-6">
                          <h5 className="text-[11px] font-bold text-orange-400 uppercase tracking-widest">Assessment Strategy</h5>
                          <p className="text-lg sm:text-2xl text-muted-foreground font-medium leading-relaxed italic">{plans.plan_data.assessment_strategy}</p>
                        </div>
                        <div className="bg-card shadow-sm border border-border rounded-none p-10 sm:p-16 space-y-6">
                          <h5 className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest">Materials</h5>
                          <div className="flex flex-wrap gap-2">
                            {plans.plan_data.materials?.map((m: string, mi: number) => (
                              <span key={mi} className="px-5 py-2.5 bg-card shadow-sm rounded-none text-[10px] sm:text-[11px] font-black text-muted-foreground uppercase tracking-widest border border-border">{m}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-12 sm:space-y-16">
                      {plans?.objectives && (
                        <div className="relative">
                          <div className="absolute -left-4 sm:-left-8 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-600 to-cyan-400 to-transparent rounded-full opacity-40"></div>
                          <PlanBlock title="Target Learning Outcomes" content={plans.objectives} />
                        </div>
                      )}
                      <div className="relative">
                        <div className="absolute -left-4 sm:-left-8 top-0 bottom-0 w-1 bg-gradient-to-b from-orange-600 to-orange-400 to-transparent rounded-full opacity-20"></div>
                        <PlanBlock title="Learning Goals" content={
                          plans?.objectives ||
                          (lesson.objectives?.length ? lesson.objectives.join('\n\n') : null) ||
                          lesson.description
                        } />
                      </div>
                      <div className="relative">
                        <div className="absolute -left-4 sm:-left-8 top-0 bottom-0 w-1 bg-gradient-to-b from-orange-500 to-transparent rounded-full opacity-20"></div>
                        <PlanBlock title="Activities" content={
                          plans?.activities ||
                          (lesson.content_layout || [])
                            .filter((b: any) => b.type === 'activity')
                            .map((b: any) => [
                              b.title ? `◆ ${b.title}` : null,
                              b.instructions || null,
                              b.steps?.length ? b.steps.map((s: string, si: number) => `  ${si + 1}. ${s}`).join('\n') : null
                            ].filter(Boolean).join('\n'))
                            .join('\n\n') ||
                          lesson.objectives?.join('\n\n')
                        } />
                      </div>
                      <div className="relative">
                        <div className="absolute -left-4 sm:-left-8 top-0 bottom-0 w-1 bg-gradient-to-b from-orange-600 to-orange-400 to-transparent rounded-full opacity-20"></div>
                        <PlanBlock title="Assessment Strategy" content={
                          plans?.assessment_methods ||
                          (lesson.content_layout || [])
                            .filter((b: any) => b.type === 'quiz' || b.type === 'assignment-block')
                            .map((b: any) => b.type === 'quiz'
                              ? `◈ Quiz: ${b.question}${b.options?.length ? '\n   Options: ' + b.options.join(' | ') : ''}`
                              : `◆ ${b.title || 'Assignment'}\n   ${b.instructions || ''}\n${b.deliverables?.length ? '   Deliverables: ' + b.deliverables.join(', ') : ''}`
                            )
                            .join('\n\n')
                        } />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {lesson && lesson.lesson_notes && (
          <NeuralVoiceReader
            content={lesson.lesson_notes}
            title={lesson.title}
          />
        )}
        {lesson && (
          <StudyAssistant
            lessonTitle={lesson.title}
            lessonType={lesson.lesson_type ?? undefined}
            courseTitle={lesson.courses?.title ?? undefined}
            programName={lesson.courses?.programs?.name ?? undefined}
            gradeLevel={lesson.grade_level ?? undefined}
            lessonObjectives={Array.isArray(lesson.objectives) ? lesson.objectives : undefined}
            externalMessage={explainRequest ?? undefined}
          />
        )}
      </main>
    </div>
  );
}

const LayoutIcon = ({ className }: any) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
);

const PlanBlock = ({ title, content }: any) => (
  <div className="space-y-8 sm:space-y-10 group">
    <div className="flex items-center gap-4">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
      <h4 className="text-[10px] sm:text-[11px] font-black uppercase text-cyan-400/60 tracking-[0.4em] sm:tracking-[0.5em]">{title}</h4>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
    </div>
    <div className="relative p-10 sm:p-14 bg-card shadow-sm border border-border rounded-none sm:rounded-none shadow-2xl overflow-hidden group-hover:border-cyan-500/20 transition-all">
      <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-600/5 blur-3xl rounded-full" />
      <p className="text-xl sm:text-3xl text-muted-foreground leading-relaxed sm:leading-[1.8] font-medium italic whitespace-pre-wrap relative z-10">{content || 'Curriculum details for this module are still being finalized. Check back soon.'}</p>
    </div>
  </div>
);
