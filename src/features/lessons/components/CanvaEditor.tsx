'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
    ssr: false,
    loading: () => <div className="h-[180px] bg-[#050510] animate-pulse border border-border" />,
});
import {
    PlusIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon,
    TypeIcon, HeadingIcon, CodeIcon, ImageIcon, InfoIcon, AlertTriangleIcon,
    GripVerticalIcon, ActivityIcon, HelpCircleIcon, VideoIcon, FileTextIcon,
    Share2Icon, SigmaIcon, SparklesIcon, Wand2Icon, PuzzleIcon, Trophy as TrophyIcon,
    MinusIcon, QuoteIcon, ListOrderedIcon, BookOpenIcon, TableIcon, EyeIcon, EyeOffIcon, Columns2Icon
} from 'lucide-react';

interface Block {
    type: 'text' | 'heading' | 'code' | 'image' | 'callout' | 'activity' | 'quiz' | 'video' | 'file' | 'mermaid' | 'math' | 'visualizer' | 'motion-graphics' | 'd3-chart' | 'scratch' | 'illustration' | 'code-map' | 'assignment-block' | 'divider' | 'quote' | 'steps-list' | 'key-terms' | 'table' | 'columns';
    content?: string;
    language?: string;
    url?: string;
    caption?: string;
    style?: 'info' | 'warning' | 'success' | 'danger';
    title?: string;
    items?: { label: string; value: string }[];
    components?: { name: string; description: string }[];
    deliverables?: string[];
    instructions?: string;
    question?: string;
    options?: string[];
    correct_answer?: string;
    fileName?: string;
    code?: string;
    formula?: string;
    id?: string;
    visualType?: string;
    visualData?: any;
    animationType?: string;
    config?: any;
    chartType?: string;
    dataset?: any[];
    labels?: string[];
    steps?: string[];
    is_coding?: boolean;
    initialCode?: string;
    projectId?: string;
    blocks?: string[];
    // New block-specific fields
    author?: string;            // quote block
    terms?: { term: string; definition: string }[];  // key-terms block
    rows?: { col1: string; col2: string }[];          // table block
    col1_header?: string;       // table block
    col2_header?: string;       // table block
    left?: string;              // columns block
    right?: string;             // columns block
}

interface CanvaEditorProps {
    layout: Block[];
    onChange: (layout: Block[]) => void;
}

export default function CanvaEditor({ layout, onChange }: CanvaEditorProps) {
    const [previewMode, setPreviewMode] = useState(false);

    const addBlock = (type: Block['type']) => {
        const newBlock: Block = { type, content: '', id: Date.now().toString() };
        if (type === 'code') newBlock.language = 'javascript';
        if (type === 'callout') newBlock.style = 'info';
        if (type === 'mermaid') newBlock.code = 'graph TD\n    A[Start] --> B[End]';
        if (type === 'math') newBlock.formula = 'E = mc^2';
        if (type === 'visualizer') { newBlock.visualType = 'sorting'; newBlock.visualData = { totalSteps: 12, variables: { i: 0, comparison: 'Active' }, visualizationState: { array: [42, 15, 7, 33, 1, 28, 19, 50], comparing: [0, 1] } }; }
        if (type === 'motion-graphics') { newBlock.animationType = 'orbit'; newBlock.config = { nodes: 3 }; }
        if (type === 'd3-chart') { newBlock.chartType = 'bar'; newBlock.dataset = [10, 20, 30, 40]; }
        if (type === 'scratch') { newBlock.projectId = ''; newBlock.blocks = ['when flag clicked', 'move 10 steps']; }
        if (type === 'illustration') { newBlock.title = 'Key Synthesis'; newBlock.items = [{ label: 'Metric', value: 'Result' }]; }
        if (type === 'code-map') { newBlock.components = [{ name: 'Module', description: 'Logic Overview' }]; }
        if (type === 'assignment-block') { newBlock.title = 'Capstone Project'; newBlock.instructions = 'Project guide...'; newBlock.deliverables = ['Final Output']; }
        // New block defaults
        if (type === 'quote') { newBlock.content = ''; newBlock.author = ''; }
        if (type === 'steps-list') { newBlock.title = ''; newBlock.steps = ['Step 1', 'Step 2', 'Step 3']; }
        if (type === 'key-terms') { newBlock.title = 'Key Terms'; newBlock.terms = [{ term: '', definition: '' }]; }
        if (type === 'table') { newBlock.col1_header = 'Column 1'; newBlock.col2_header = 'Column 2'; newBlock.rows = [{ col1: '', col2: '' }]; }
        if (type === 'columns') { newBlock.left = ''; newBlock.right = ''; }
        onChange([...layout, newBlock]);
    };

    const updateBlock = (indexOrId: number | string, updates: Partial<Block>) => {
        const next = [...layout];
        let targetIndex: number;

        if (typeof indexOrId === 'number') {
            targetIndex = indexOrId;
        } else {
            targetIndex = next.findIndex(block => block.id === indexOrId);
        }

        if (targetIndex !== -1) {
            next[targetIndex] = { ...next[targetIndex], ...updates };
            onChange(next);
        }
    };

    const removeBlock = (index: number) => {
        onChange(layout.filter((_, i) => i !== index));
    };

    const moveBlock = (index: number, direction: 'up' | 'down') => {
        const next = [...layout];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= layout.length) return;
        [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
        onChange(next);
    };

    const handleAiImage = async () => {
        const prompt = window.prompt("What image should AI generate? (e.g. A robot soldering a circuit)");
        if (!prompt) return;
        const id = Date.now().toString();
        const newBlock: Block = { id, type: 'image', content: '', caption: prompt, url: '' };
        onChange([...layout, newBlock]);
        try {
            const res = await fetch('/api/ai/image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
            });
            const data = await res.json();
            if (data.url) {
                updateBlock(id, { url: data.url });
            } else {
                updateBlock(id, { caption: `⚠ Image failed: ${data.error || 'unknown error'}` });
            }
        } catch (e: any) {
            updateBlock(id, { caption: `⚠ Image failed: ${e.message}` });
        }
    };

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Content Blocks</p>
                    <button
                        type="button"
                        onClick={() => setPreviewMode(p => !p)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none text-[10px] font-bold uppercase tracking-widest transition-all border ${previewMode ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' : 'bg-white/5 border-border text-white/50 hover:text-white hover:bg-white/10'}`}
                    >
                        {previewMode ? <><EyeOffIcon className="w-3.5 h-3.5" /> Edit</> : <><EyeIcon className="w-3.5 h-3.5" /> Preview</>}
                    </button>
                </div>
                {!previewMode && (
                <div className="flex flex-wrap gap-1.5">
                    {/* Basic */}
                    <ToolbarButton onClick={() => addBlock('heading')} icon={HeadingIcon} label="Heading" />
                    <ToolbarButton onClick={() => addBlock('text')} icon={TypeIcon} label="Text" />
                    <ToolbarButton onClick={() => addBlock('callout')} icon={InfoIcon} label="Tip" />
                    <ToolbarButton onClick={() => addBlock('quote')} icon={QuoteIcon} label="Quote" />
                    <ToolbarButton onClick={() => addBlock('divider')} icon={MinusIcon} label="Divider" />
                    <div className="h-6 w-px bg-white/10 mx-1 self-center" />
                    {/* Structure */}
                    <ToolbarButton onClick={() => addBlock('steps-list')} icon={ListOrderedIcon} label="Steps" className="border-violet-500/30 text-violet-400" />
                    <ToolbarButton onClick={() => addBlock('key-terms')} icon={BookOpenIcon} label="Key Terms" className="border-violet-500/30 text-violet-400" />
                    <ToolbarButton onClick={() => addBlock('table')} icon={TableIcon} label="Table" className="border-violet-500/30 text-violet-400" />
                    <ToolbarButton onClick={() => addBlock('columns')} icon={Columns2Icon} label="Columns" className="border-violet-500/30 text-violet-400" />
                    <div className="h-6 w-px bg-white/10 mx-1 self-center" />
                    {/* Media */}
                    <ToolbarButton onClick={() => addBlock('code')} icon={CodeIcon} label="Code" />
                    <ToolbarButton onClick={() => addBlock('image')} icon={ImageIcon} label="Image" />
                    <ToolbarButton onClick={() => addBlock('video')} icon={VideoIcon} label="Video" />
                    <ToolbarButton icon={FileTextIcon} label="File" onClick={() => addBlock('file')} />
                    <div className="h-6 w-px bg-white/10 mx-1 self-center" />
                    {/* Learning */}
                    <ToolbarButton onClick={() => addBlock('activity')} icon={ActivityIcon} label="Activity" className="border-emerald-500/30 text-emerald-400" />
                    <ToolbarButton onClick={() => addBlock('quiz')} icon={HelpCircleIcon} label="Quiz" className="border-orange-500/30 text-orange-400" />
                    <ToolbarButton onClick={() => addBlock('assignment-block')} icon={TrophyIcon} label="Capstone Note" className="border-amber-500/30 text-amber-400" title="Content block only — use 'Add Assignment' in the lesson to create a real assignment" />
                    <div className="h-6 w-px bg-white/10 mx-1 self-center" />
                    {/* Advanced */}
                    <ToolbarButton icon={Share2Icon} label="Diagram" onClick={() => addBlock('mermaid')} className="border-violet-500/30 text-violet-400" />
                    <ToolbarButton icon={SigmaIcon} label="Math" onClick={() => addBlock('math')} className="border-indigo-500/30 text-indigo-400" />
                    <ToolbarButton onClick={() => addBlock('visualizer')} icon={ActivityIcon} label="Visualizer" className="border-cyan-500/30 text-cyan-400" />
                    <ToolbarButton onClick={() => addBlock('motion-graphics')} icon={SparklesIcon} label="Motion" className="border-indigo-500/30 text-indigo-400" />
                    <ToolbarButton onClick={() => addBlock('d3-chart')} icon={ActivityIcon} label="Chart" className="border-orange-500/30 text-orange-400" />
                    <ToolbarButton onClick={() => addBlock('scratch')} icon={PuzzleIcon} label="Scratch" className="border-rose-500/30 text-rose-400" />
                    <ToolbarButton onClick={() => addBlock('illustration')} icon={SparklesIcon} label="Infographic" className="border-indigo-500/30 text-indigo-400" />
                    <ToolbarButton onClick={() => addBlock('code-map')} icon={Share2Icon} label="Architecture" className="border-cyan-500/30 text-cyan-400" />
                    <div className="h-6 w-px bg-white/10 mx-1 self-center" />
                    <button
                        type="button"
                        onClick={handleAiImage}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 rounded-none text-[10px] font-bold transition-all border border-violet-500/20"
                    >
                        <Wand2Icon className="w-3.5 h-3.5" />
                        AI Image
                    </button>
                </div>
                )}
            </div>

            {/* Preview mode — formatted readable view */}
            {previewMode && (
                <div className="bg-card shadow-sm border border-border rounded-none p-6 sm:p-8 space-y-5 prose-invert max-w-none">
                    {layout.length === 0 ? (
                        <p className="text-muted-foreground text-sm italic text-center py-8">No content blocks yet. Switch to Edit mode to add blocks.</p>
                    ) : layout.map((block, i) => (
                        <PreviewBlock key={i} block={block} />
                    ))}
                </div>
            )}

            <div className="space-y-3">
                {!previewMode && layout.length === 0 && (
                    <div className="py-12 border-2 border-dashed border-border rounded-none flex flex-col items-center justify-center text-white/20">
                        <PlusIcon className="w-8 h-8 mb-2" />
                        <p className="text-xs font-bold uppercase tracking-widest">No visual blocks yet — add one above</p>
                    </div>
                )}
                {!previewMode && layout.map((block, i) => (
                    <div key={i} className="group bg-white/[0.02] border border-border rounded-none p-3 sm:p-4 hover:border-cyan-500/30 transition-all">
                        <div className="flex items-start gap-3">
                            <div className="flex-1 space-y-3">
                                {/* Block header: type label + move up/down + delete */}
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400/60">{block.type}</span>
                                        <div className="flex items-center gap-1">
                                            <ControlBtn onClick={() => moveBlock(i, 'up')} icon={ChevronUpIcon} disabled={i === 0} title="Move up" />
                                            <ControlBtn onClick={() => moveBlock(i, 'down')} icon={ChevronDownIcon} disabled={i === layout.length - 1} title="Move down" />
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => removeBlock(i)} className="p-1.5 hover:text-rose-400 text-white/20 hover:bg-rose-500/10 rounded-none transition-colors">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>

                                {block.type === 'heading' && (
                                    <input
                                        type="text"
                                        value={block.content}
                                        onChange={e => updateBlock(i, { content: e.target.value })}
                                        placeholder="Enter heading..."
                                        className="w-full bg-transparent border-b border-border py-1 text-lg font-bold focus:outline-none focus:border-cyan-500"
                                    />
                                )}

                                {block.type === 'text' && (
                                    <textarea
                                        rows={3}
                                        value={block.content}
                                        onChange={e => updateBlock(i, { content: e.target.value })}
                                        placeholder="Enter text content..."
                                        className="w-full bg-white/5 border border-border rounded-none p-3 text-sm focus:outline-none focus:border-cyan-500 resize-none"
                                    />
                                )}

                                {block.type === 'code' && (
                                    <div className="space-y-2">
                                        <select
                                            value={block.language}
                                            onChange={e => updateBlock(i, { language: e.target.value })}
                                            className="bg-white/10 text-[10px] px-2 py-1 rounded-none text-white/60 focus:outline-none"
                                        >
                                            <option value="javascript">JavaScript</option>
                                            <option value="typescript">TypeScript</option>
                                            <option value="python">Python</option>
                                            <option value="html">HTML</option>
                                            <option value="css">CSS</option>
                                            <option value="sql">SQL</option>
                                            <option value="java">Java</option>
                                            <option value="cpp">C++</option>
                                            <option value="csharp">C#</option>
                                            <option value="go">Go</option>
                                            <option value="rust">Rust</option>
                                            <option value="php">PHP</option>
                                            <option value="bash">Bash</option>
                                        </select>
                                        <div className="border border-border overflow-hidden">
                                            <MonacoEditor
                                                height={180}
                                                language={block.language || 'javascript'}
                                                value={block.content || ''}
                                                onChange={val => updateBlock(i, { content: val ?? '' })}
                                                theme="vs-dark"
                                                options={{
                                                    fontSize: 13,
                                                    minimap: { enabled: false },
                                                    scrollBeyondLastLine: false,
                                                    wordWrap: 'on',
                                                    lineNumbers: 'on',
                                                    padding: { top: 8, bottom: 8 },
                                                    scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
                                                    overviewRulerLanes: 0,
                                                    folding: false,
                                                    renderLineHighlight: 'none',
                                                    automaticLayout: true,
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {block.type === 'image' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <input
                                            type="text"
                                            value={block.url}
                                            onChange={e => updateBlock(i, { url: e.target.value })}
                                            placeholder="Image URL..."
                                            className="w-full bg-white/5 border border-border rounded-none px-3 py-2 text-xs focus:outline-none"
                                        />
                                        <input
                                            type="text"
                                            value={block.caption}
                                            onChange={e => updateBlock(i, { caption: e.target.value })}
                                            placeholder="Caption (optional)..."
                                            className="w-full bg-white/5 border border-border rounded-none px-3 py-2 text-xs focus:outline-none"
                                        />
                                    </div>
                                )}

                                {block.type === 'callout' && (
                                    <div className="flex gap-3">
                                        <select
                                            value={block.style || 'info'}
                                            onChange={e => updateBlock(i, { style: e.target.value as any })}
                                            className="bg-white/10 text-[10px] px-2 py-1 h-fit rounded-none text-white/60 focus:outline-none"
                                        >
                                            <option value="info">ℹ Info</option>
                                            <option value="warning">⚠ Warning</option>
                                            <option value="success">✓ Success</option>
                                            <option value="danger">✕ Danger</option>
                                        </select>
                                        <textarea
                                            rows={2}
                                            value={block.content}
                                            onChange={e => updateBlock(i, { content: e.target.value })}
                                            placeholder="Callout content..."
                                            className="flex-1 bg-white/5 border border-border rounded-none p-3 text-sm focus:outline-none focus:border-cyan-500 resize-none"
                                        />
                                    </div>
                                )}

                                {block.type === 'activity' && (
                                    <div className="space-y-4 p-4 bg-emerald-500/5 rounded-none border border-emerald-500/10">
                                        <div className="flex items-center justify-between">
                                            <input
                                                type="text"
                                                value={block.title || ''}
                                                onChange={e => updateBlock(i, { title: e.target.value })}
                                                placeholder="Activity Title (e.g., Coding Challenge)..."
                                                className="bg-transparent border-b border-white/10 py-1 text-sm font-bold focus:outline-none focus:border-emerald-500"
                                            />
                                            <label className="flex items-center gap-2 text-[10px] text-emerald-400 font-black uppercase">
                                                <input 
                                                    type="checkbox" 
                                                    checked={block.is_coding} 
                                                    onChange={e => updateBlock(i, { is_coding: e.target.checked })}
                                                    className="accent-emerald-500"
                                                />
                                                Coding Lab
                                            </label>
                                        </div>
                                        
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Action Steps</p>
                                            {(block.steps || ['Select a target', 'Apply logic']).map((s, sIdx) => (
                                                <div key={sIdx} className="flex gap-2">
                                                    <span className="w-6 h-6 rounded bg-black/40 flex items-center justify-center text-[10px] font-black text-emerald-500">{sIdx + 1}</span>
                                                    <input 
                                                        value={s} 
                                                        onChange={e => {
                                                            const next = [...(block.steps || [])];
                                                            next[sIdx] = e.target.value;
                                                            updateBlock(i, { steps: next });
                                                        }}
                                                        className="flex-1 bg-black/40 border border-white/5 rounded px-3 py-1 text-xs text-white"
                                                    />
                                                    <button 
                                                        type="button"
                                                        onClick={() => {
                                                            const next = (block.steps || []).filter((_, idx) => idx !== sIdx);
                                                            updateBlock(i, { steps: next });
                                                        }}
                                                        className="p-1 hover:text-rose-400 opacity-40 hover:opacity-100"
                                                    >
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                            <button 
                                                type="button"
                                                onClick={() => updateBlock(i, { steps: [...(block.steps || []), ''] })} 
                                                className="text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1 hover:text-emerald-300"
                                            >
                                                <PlusIcon className="w-3 h-3" /> Add Step
                                            </button>
                                        </div>

                                        {block.is_coding && (
                                            <textarea
                                                rows={4}
                                                value={block.initialCode || ''}
                                                onChange={e => updateBlock(i, { initialCode: e.target.value })}
                                                placeholder="Initial workspace code (starter snippets)..."
                                                className="w-full bg-black/40 border border-white/10 rounded-none p-3 text-xs font-mono text-cyan-400 focus:outline-none"
                                            />
                                        )}
                                    </div>
                                )}

                                {block.type === 'video' && (
                                    <div className="space-y-3">
                                        <input
                                            type="text"
                                            value={block.url || ''}
                                            onChange={e => updateBlock(i, { url: e.target.value })}
                                            placeholder="YouTube or Video URL..."
                                            className="w-full bg-white/5 border border-border rounded-none px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500"
                                        />
                                        <input
                                            type="text"
                                            value={block.caption || ''}
                                            onChange={e => updateBlock(i, { caption: e.target.value })}
                                            placeholder="Video caption (optional)..."
                                            className="w-full bg-transparent border-b border-border py-1 text-xs text-white/40 focus:outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                )}

                                {block.type === 'file' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <input
                                            type="text"
                                            value={block.url || ''}
                                            onChange={e => updateBlock(i, { url: e.target.value })}
                                            placeholder="Download Link (Google Drive, etc)..."
                                            className="bg-white/5 border border-border rounded-none px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500"
                                        />
                                        <input
                                            type="text"
                                            value={block.fileName || ''}
                                            onChange={e => updateBlock(i, { fileName: e.target.value })}
                                            placeholder="Display Name (e.g., Study Guide.pdf)..."
                                            className="bg-white/5 border border-border rounded-none px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                )}
                                {block.type === 'mermaid' && (
                                    <div className="space-y-4">
                                        <textarea
                                            value={block.code || ''}
                                            onChange={(e) => updateBlock(i, { code: e.target.value })}
                                            placeholder="graph TD\nA[Start] --> B[End]"
                                            className="w-full bg-[#1e1e2e] text-white p-4 rounded-none border border-border font-mono text-sm h-32 focus:outline-none focus:border-cyan-500"
                                        />
                                        <p className="text-[10px] text-white/40 uppercase font-black">Mermaid Diagram Syntax</p>
                                    </div>
                                )}

                                {block.type === 'math' && (
                                    <div className="space-y-4">
                                        <input
                                            type="text"
                                            value={block.formula || ''}
                                            onChange={(e) => updateBlock(i, { formula: e.target.value })}
                                            placeholder="E = mc^2"
                                            className="w-full bg-[#1e1e2e] text-white p-4 rounded-none border border-border font-serif text-lg focus:outline-none focus:border-cyan-500"
                                        />
                                        <p className="text-[10px] text-white/40 uppercase font-black">LaTeX Formula Syntax</p>
                                    </div>
                                )}
                                {block.type === 'quiz' && (
                                    <div className="space-y-4">
                                        <input
                                            type="text"
                                            value={block.question || ''}
                                            onChange={e => updateBlock(i, { question: e.target.value })}
                                            placeholder="Quiz Question..."
                                            className="w-full bg-transparent border-b border-border py-1 text-sm font-bold focus:outline-none focus:border-cyan-500"
                                        />
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {(block.options || ['', '', '', '']).map((opt: string, optIdx: number) => (
                                                <div key={optIdx} className="flex gap-2 items-center">
                                                    <input
                                                        type="radio"
                                                        name={`quiz-${i}-correct`}
                                                        checked={block.correct_answer === opt && opt !== ''}
                                                        onChange={() => updateBlock(i, { correct_answer: opt })}
                                                        className="accent-cyan-500"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={opt}
                                                        onChange={e => {
                                                            const newOpts = [...(block.options || ['', '', '', ''])];
                                                            newOpts[optIdx] = e.target.value;
                                                            updateBlock(i, { options: newOpts });
                                                        }}
                                                        placeholder={`Option ${optIdx + 1}`}
                                                        className="flex-1 bg-white/5 border border-border rounded-none px-3 py-1.5 text-xs focus:outline-none"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <textarea
                                            rows={2}
                                            value={block.instructions || ''}
                                            onChange={e => updateBlock(i, { instructions: e.target.value })}
                                            placeholder="Hint or explanation (shown after answer)..."
                                            className="w-full bg-white/5 border border-border rounded-none p-3 text-xs text-muted-foreground focus:outline-none focus:border-cyan-500 resize-none"
                                        />
                                    </div>
                                )}
                                {block.type === 'visualizer' && (
                                    <div className="space-y-4 p-4 bg-cyan-500/5 rounded-none border border-cyan-500/10">
                                        <div className="flex gap-4">
                                            <select 
                                                value={block.visualType} 
                                                onChange={e => updateBlock(i, { visualType: e.target.value })}
                                                className="bg-black/40 border border-white/10 rounded-none px-3 py-1.5 text-[10px] text-cyan-400 font-bold outline-none"
                                            >
                                                {['physics', 'sorting', 'turtle', 'loops', 'stateMachine'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                                            </select>
                                            <p className="text-[10px] text-white/40 font-medium">Configure visualization logic and parameters below.</p>
                                        </div>
                                        <textarea
                                            value={JSON.stringify(block.visualData, null, 2)}
                                            onChange={e => {
                                                try { updateBlock(i, { visualData: JSON.parse(e.target.value) }); } catch(err) {}
                                            }}
                                            className="w-full bg-black/60 border border-white/5 p-3 rounded-none font-mono text-[10px] text-white/80 h-32 outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                )}
                                {block.type === 'motion-graphics' && (
                                    <div className="space-y-4 p-4 bg-indigo-500/5 rounded-none border border-indigo-500/10">
                                        <div className="flex gap-4">
                                            <select 
                                                value={block.animationType} 
                                                onChange={e => updateBlock(i, { animationType: e.target.value })}
                                                className="bg-black/40 border border-white/10 rounded-none px-3 py-1.5 text-[10px] text-indigo-300 font-bold outline-none"
                                            >
                                                {['orbit', 'flow', 'network', 'pulse', 'wave', 'particles'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                                            </select>
                                            <label className="flex items-center gap-2 text-[10px] text-white/40">
                                                Nodes:
                                                <input 
                                                    type="number" 
                                                    value={block.config?.nodes || 0} 
                                                    onChange={e => updateBlock(i, { config: { ...block.config, nodes: parseInt(e.target.value) }})}
                                                    className="w-12 bg-black/40 border-white/10 rounded px-1"
                                                />
                                            </label>
                                        </div>
                                    </div>
                                )}
                                {block.type === 'd3-chart' && (
                                    <div className="space-y-4 p-4 bg-orange-500/5 rounded-none border border-orange-500/10">
                                        <div className="flex gap-4">
                                            <select 
                                                value={block.chartType} 
                                                onChange={e => updateBlock(i, { chartType: e.target.value })}
                                                className="bg-black/40 border border-white/10 rounded-none px-3 py-1.5 text-[10px] text-orange-400 font-bold outline-none"
                                            >
                                                {['bar', 'line', 'pie', 'area'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                                            </select>
                                            <input
                                                type="text"
                                                value={(block.dataset || []).join(', ')}
                                                onChange={e => updateBlock(i, { dataset: e.target.value.split(',').map(n => parseFloat(n.trim()) || 0) })}
                                                placeholder="Data: 10, 20, 30"
                                                className="flex-1 bg-black/40 border border-white/10 rounded-none px-3 py-1.5 text-[10px] text-white"
                                            />
                                            <input
                                                type="text"
                                                value={(block.labels || []).join(', ')}
                                                onChange={e => updateBlock(i, { labels: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                                placeholder="Labels (optional): Jan, Feb, Mar"
                                                className="flex-1 bg-black/40 border border-white/10 rounded-none px-3 py-1.5 text-[10px] text-white/60"
                                            />
                                        </div>
                                        <input
                                            type="text"
                                            value={block.title || ''}
                                            onChange={e => updateBlock(i, { title: e.target.value })}
                                            placeholder="Chart title..."
                                            className="w-full bg-transparent border-b border-white/10 py-1 text-sm font-bold focus:outline-none focus:border-orange-500 mt-2"
                                        />
                                    </div>
                                )}
                                {block.type === 'illustration' && (
                                    <div className="space-y-4 p-4 bg-indigo-500/5 rounded-none border border-indigo-500/10">
                                        <input
                                            type="text"
                                            value={block.title || ''}
                                            onChange={e => updateBlock(i, { title: e.target.value })}
                                            placeholder="Illustration Title..."
                                            className="w-full bg-transparent border-b border-white/10 py-1 text-sm font-bold focus:outline-none focus:border-indigo-500"
                                        />
                                        <div className="space-y-2">
                                            {(block.items || []).map((item, itemIdx) => (
                                                <div key={itemIdx} className="grid grid-cols-2 gap-2">
                                                    <input 
                                                        value={item.label} 
                                                        placeholder="Label"
                                                        onChange={e => {
                                                            const next = [...(block.items || [])];
                                                            next[itemIdx].label = e.target.value;
                                                            updateBlock(i, { items: next });
                                                        }}
                                                        className="bg-black/40 border border-white/5 rounded px-3 py-1 text-xs text-white"
                                                    />
                                                    <input 
                                                        value={item.value} 
                                                        placeholder="Value"
                                                        onChange={e => {
                                                            const next = [...(block.items || [])];
                                                            next[itemIdx].value = e.target.value;
                                                            updateBlock(i, { items: next });
                                                        }}
                                                        className="bg-black/40 border border-white/5 rounded px-3 py-1 text-xs text-white"
                                                    />
                                                </div>
                                            ))}
                                            <button 
                                                type="button"
                                                onClick={() => updateBlock(i, { items: [...(block.items || []), { label: '', value: '' }] })}
                                                className="text-[9px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1"
                                            >
                                                <PlusIcon className="w-3 h-3" /> Add Item
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {block.type === 'code-map' && (
                                    <div className="space-y-4 p-4 bg-cyan-500/5 rounded-none border border-cyan-500/10">
                                        <p className="text-[10px] font-black text-cyan-500 uppercase tracking-widest">Architectural Components</p>
                                        <div className="space-y-3">
                                            {(block.components || []).map((comp, compIdx) => (
                                                <div key={compIdx} className="space-y-2 p-3 bg-black/40 rounded-none border border-white/5">
                                                    <input 
                                                        value={comp.name} 
                                                        placeholder="Component Name"
                                                        onChange={e => {
                                                            const next = [...(block.components || [])];
                                                            next[compIdx].name = e.target.value;
                                                            updateBlock(i, { components: next });
                                                        }}
                                                        className="w-full bg-transparent border-b border-white/10 py-1 text-xs font-bold focus:outline-none focus:border-cyan-500"
                                                    />
                                                    <textarea 
                                                        value={comp.description} 
                                                        placeholder="Description"
                                                        onChange={e => {
                                                            const next = [...(block.components || [])];
                                                            next[compIdx].description = e.target.value;
                                                            updateBlock(i, { components: next });
                                                        }}
                                                        className="w-full bg-transparent text-xs text-white/60 focus:outline-none h-12 resize-none"
                                                    />
                                                </div>
                                            ))}
                                            <button 
                                                type="button"
                                                onClick={() => updateBlock(i, { components: [...(block.components || []), { name: '', description: '' }] })}
                                                className="text-[9px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1"
                                            >
                                                <PlusIcon className="w-3 h-3" /> Add Component
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {block.type === 'divider' && (
                                    <div className="py-2 flex items-center gap-3 text-white/20">
                                        <div className="flex-1 border-b border-dashed border-white/10" />
                                        <span className="text-[9px] uppercase font-black tracking-widest">Divider</span>
                                        <div className="flex-1 border-b border-dashed border-white/10" />
                                    </div>
                                )}

                                {block.type === 'quote' && (
                                    <div className="space-y-2 p-3 border-l-4 border-orange-500/40 bg-orange-500/5">
                                        <textarea rows={2} value={block.content || ''} onChange={e => updateBlock(i, { content: e.target.value })}
                                            placeholder="Quote text..."
                                            className="w-full bg-transparent italic text-sm text-foreground/80 focus:outline-none resize-none" />
                                        <input type="text" value={block.author || ''} onChange={e => updateBlock(i, { author: e.target.value })}
                                            placeholder="Author / source (optional)..."
                                            className="w-full bg-transparent border-b border-white/10 text-xs text-orange-400/70 focus:outline-none" />
                                    </div>
                                )}

                                {block.type === 'steps-list' && (
                                    <div className="space-y-3 p-3 bg-violet-500/5 border border-violet-500/10">
                                        <input type="text" value={block.title || ''} onChange={e => updateBlock(i, { title: e.target.value })}
                                            placeholder="Steps section title..."
                                            className="w-full bg-transparent border-b border-white/10 text-sm font-bold focus:outline-none" />
                                        {(block.steps || []).map((s, sIdx) => (
                                            <div key={sIdx} className="flex gap-2">
                                                <span className="w-6 h-6 rounded bg-violet-500/20 flex items-center justify-center text-[10px] font-black text-violet-400">{sIdx + 1}</span>
                                                <input value={s} onChange={e => { const next = [...(block.steps || [])]; next[sIdx] = e.target.value; updateBlock(i, { steps: next }); }}
                                                    className="flex-1 bg-black/30 border border-white/5 px-3 py-1 text-xs text-white focus:outline-none" />
                                                <button type="button" onClick={() => { const next = (block.steps || []).filter((_, idx) => idx !== sIdx); updateBlock(i, { steps: next }); }} className="p-1 hover:text-rose-400 opacity-40 hover:opacity-100"><TrashIcon className="w-3 h-3" /></button>
                                            </div>
                                        ))}
                                        <button type="button" onClick={() => updateBlock(i, { steps: [...(block.steps || []), ''] })} className="text-[9px] font-black text-violet-400 uppercase tracking-widest flex items-center gap-1"><PlusIcon className="w-3 h-3" /> Add Step</button>
                                    </div>
                                )}

                                {block.type === 'key-terms' && (
                                    <div className="space-y-3 p-3 bg-violet-500/5 border border-violet-500/10">
                                        <input type="text" value={block.title || ''} onChange={e => updateBlock(i, { title: e.target.value })}
                                            placeholder="Section title (e.g. Key Terms)..."
                                            className="w-full bg-transparent border-b border-white/10 text-sm font-bold focus:outline-none mb-1" />
                                        {(block.terms || []).map((t, tIdx) => (
                                            <div key={tIdx} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                                                <input value={t.term} onChange={e => { const next = [...(block.terms || [])]; next[tIdx] = { ...next[tIdx], term: e.target.value }; updateBlock(i, { terms: next }); }}
                                                    placeholder="Term..." className="bg-black/30 border border-white/5 px-3 py-1 text-xs font-bold text-white focus:outline-none" />
                                                <input value={t.definition} onChange={e => { const next = [...(block.terms || [])]; next[tIdx] = { ...next[tIdx], definition: e.target.value }; updateBlock(i, { terms: next }); }}
                                                    placeholder="Definition..." className="bg-black/30 border border-white/5 px-3 py-1 text-xs text-white/60 focus:outline-none" />
                                                <button type="button" onClick={() => updateBlock(i, { terms: (block.terms || []).filter((_, idx) => idx !== tIdx) })} className="p-1 hover:text-rose-400 opacity-40 hover:opacity-100"><TrashIcon className="w-3 h-3" /></button>
                                            </div>
                                        ))}
                                        <button type="button" onClick={() => updateBlock(i, { terms: [...(block.terms || []), { term: '', definition: '' }] })} className="text-[9px] font-black text-violet-400 uppercase tracking-widest flex items-center gap-1"><PlusIcon className="w-3 h-3" /> Add Term</button>
                                    </div>
                                )}

                                {block.type === 'table' && (
                                    <div className="space-y-2 p-3 bg-violet-500/5 border border-violet-500/10">
                                        <div className="grid grid-cols-2 gap-2 mb-1">
                                            <input value={block.col1_header || ''} onChange={e => updateBlock(i, { col1_header: e.target.value })} placeholder="Column 1 header..." className="bg-black/30 border border-white/5 px-3 py-1 text-xs font-bold text-white focus:outline-none" />
                                            <input value={block.col2_header || ''} onChange={e => updateBlock(i, { col2_header: e.target.value })} placeholder="Column 2 header..." className="bg-black/30 border border-white/5 px-3 py-1 text-xs font-bold text-white focus:outline-none" />
                                        </div>
                                        {(block.rows || []).map((row, rIdx) => (
                                            <div key={rIdx} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                                                <input value={row.col1} onChange={e => { const next = [...(block.rows || [])]; next[rIdx] = { ...next[rIdx], col1: e.target.value }; updateBlock(i, { rows: next }); }} placeholder="Cell..." className="bg-black/30 border border-white/5 px-3 py-1 text-xs text-white focus:outline-none" />
                                                <input value={row.col2} onChange={e => { const next = [...(block.rows || [])]; next[rIdx] = { ...next[rIdx], col2: e.target.value }; updateBlock(i, { rows: next }); }} placeholder="Cell..." className="bg-black/30 border border-white/5 px-3 py-1 text-xs text-white focus:outline-none" />
                                                <button type="button" onClick={() => updateBlock(i, { rows: (block.rows || []).filter((_, idx) => idx !== rIdx) })} className="p-1 hover:text-rose-400 opacity-40 hover:opacity-100"><TrashIcon className="w-3 h-3" /></button>
                                            </div>
                                        ))}
                                        <button type="button" onClick={() => updateBlock(i, { rows: [...(block.rows || []), { col1: '', col2: '' }] })} className="text-[9px] font-black text-violet-400 uppercase tracking-widest flex items-center gap-1"><PlusIcon className="w-3 h-3" /> Add Row</button>
                                    </div>
                                )}

                                {block.type === 'columns' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-violet-500/5 border border-violet-500/10">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black uppercase tracking-widest text-violet-400/60">Left Column</p>
                                            <textarea rows={4} value={block.left || ''} onChange={e => updateBlock(i, { left: e.target.value })} placeholder="Left column content..." className="w-full bg-black/30 border border-white/5 p-3 text-xs text-white focus:outline-none resize-none" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black uppercase tracking-widest text-violet-400/60">Right Column</p>
                                            <textarea rows={4} value={block.right || ''} onChange={e => updateBlock(i, { right: e.target.value })} placeholder="Right column content..." className="w-full bg-black/30 border border-white/5 p-3 text-xs text-white focus:outline-none resize-none" />
                                        </div>
                                    </div>
                                )}

                                {block.type === 'assignment-block' && (
                                    <div className="space-y-4 p-4 bg-emerald-500/5 rounded-none border border-emerald-500/10">
                                        <div className="flex items-center gap-2 mb-2">
                                            <TrophyIcon className="w-4 h-4 text-emerald-400" />
                                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest text-emerald-500">Capstone Project Engine</p>
                                        </div>
                                        <input
                                            type="text"
                                            value={block.title || ''}
                                            onChange={e => updateBlock(i, { title: e.target.value })}
                                            placeholder="Project Title..."
                                            className="w-full bg-transparent border-b border-white/10 py-1 text-sm font-bold focus:outline-none focus:border-emerald-500"
                                        />
                                        <textarea
                                            value={block.instructions || ''}
                                            onChange={e => updateBlock(i, { instructions: e.target.value })}
                                            placeholder="Guided project instructions..."
                                            className="w-full bg-transparent text-xs text-white/60 focus:outline-none h-24 resize-none"
                                        />
                                        <div className="space-y-2">
                                            <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Deliverables</p>
                                            {(block.deliverables || []).map((del, delIdx) => (
                                                <input 
                                                    key={delIdx}
                                                    value={del} 
                                                    onChange={e => {
                                                        const next = [...(block.deliverables || [])];
                                                        next[delIdx] = e.target.value;
                                                        updateBlock(i, { deliverables: next });
                                                    }}
                                                    className="w-full bg-black/40 border border-white/5 rounded px-3 py-1 text-xs text-white"
                                                />
                                            ))}
                                            <button 
                                                type="button"
                                                onClick={() => updateBlock(i, { deliverables: [...(block.deliverables || []), ''] })}
                                                className="text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1"
                                            >
                                                <PlusIcon className="w-3 h-3" /> Add Deliverable
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Preview renderer ──────────────────────────────────────────────────────
function PreviewBlock({ block }: { block: Block }) {
    const calloutStyles: Record<string, string> = {
        info: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
        warning: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
        success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
        danger: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
    };
    const calloutIcons: Record<string, string> = { info: 'ℹ', warning: '⚠', success: '✓', danger: '✕' };

    switch (block.type) {
        case 'heading':
            return <h2 className="text-xl font-black text-foreground border-b border-border pb-2">{block.content || <span className="text-muted-foreground italic">Untitled heading</span>}</h2>;
        case 'text':
            return <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{block.content || <span className="text-muted-foreground italic">Empty text block</span>}</p>;
        case 'quote':
            return (
                <blockquote className="border-l-4 border-orange-500 pl-4 space-y-1">
                    <p className="text-base italic text-foreground/90">"{block.content}"</p>
                    {block.author && <p className="text-xs font-bold text-orange-400">— {block.author}</p>}
                </blockquote>
            );
        case 'callout':
            return (
                <div className={`flex gap-3 p-4 border rounded-none text-sm ${calloutStyles[block.style || 'info']}`}>
                    <span className="text-base leading-none mt-0.5">{calloutIcons[block.style || 'info']}</span>
                    <p className="leading-relaxed">{block.content}</p>
                </div>
            );
        case 'divider':
            return <hr className="border-border my-2" />;
        case 'steps-list':
            return (
                <div className="space-y-2">
                    {block.title && <p className="text-xs font-black uppercase tracking-widest text-violet-400">{block.title}</p>}
                    <ol className="space-y-2">
                        {(block.steps || []).map((s, i) => (
                            <li key={i} className="flex gap-3 text-sm text-foreground/80">
                                <span className="flex-shrink-0 w-6 h-6 rounded bg-violet-500/20 border border-violet-500/30 text-violet-400 text-[10px] font-black flex items-center justify-center">{i + 1}</span>
                                <span className="pt-0.5">{s}</span>
                            </li>
                        ))}
                    </ol>
                </div>
            );
        case 'key-terms':
            return (
                <div className="space-y-2">
                    {block.title && <p className="text-xs font-black uppercase tracking-widest text-violet-400">{block.title}</p>}
                    <dl className="space-y-2">
                        {(block.terms || []).map((t, i) => (
                            <div key={i} className="grid grid-cols-[minmax(120px,1fr)_3fr] gap-4 p-3 bg-white/3 border border-border">
                                <dt className="text-sm font-bold text-foreground">{t.term || <span className="text-muted-foreground italic">Term</span>}</dt>
                                <dd className="text-sm text-foreground/70">{t.definition || <span className="text-muted-foreground italic">Definition</span>}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            );
        case 'table':
            return (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr>
                                <th className="text-left px-4 py-2 bg-white/5 border border-border font-bold text-foreground text-[11px] uppercase tracking-widest">{block.col1_header || 'Column 1'}</th>
                                <th className="text-left px-4 py-2 bg-white/5 border border-border font-bold text-foreground text-[11px] uppercase tracking-widest">{block.col2_header || 'Column 2'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(block.rows || []).map((row, i) => (
                                <tr key={i} className={i % 2 === 1 ? 'bg-white/[0.015]' : ''}>
                                    <td className="px-4 py-2.5 border border-border text-foreground/80">{row.col1}</td>
                                    <td className="px-4 py-2.5 border border-border text-foreground/80">{row.col2}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case 'columns':
            return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="text-sm text-foreground/80 whitespace-pre-wrap border-r border-border pr-4">{block.left || <span className="text-muted-foreground italic">Left column</span>}</div>
                    <div className="text-sm text-foreground/80 whitespace-pre-wrap">{block.right || <span className="text-muted-foreground italic">Right column</span>}</div>
                </div>
            );
        case 'code':
            return (
                <pre className="bg-[#0d0d1a] border border-border p-4 overflow-x-auto text-xs font-mono text-cyan-300 leading-relaxed">
                    <code>{block.content}</code>
                </pre>
            );
        case 'image':
            return block.url ? (
                <figure className="space-y-2">
                    <img src={block.url} alt={block.caption || ''} className="max-w-full border border-border" />
                    {block.caption && <figcaption className="text-xs text-muted-foreground italic">{block.caption}</figcaption>}
                </figure>
            ) : <p className="text-muted-foreground text-xs italic">[Image block — no URL set]</p>;
        case 'video':
            return block.url ? (
                <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">📹 Video</p>
                    <a href={block.url} target="_blank" rel="noreferrer" className="text-sm text-orange-400 hover:underline">{block.caption || block.url}</a>
                </div>
            ) : null;
        case 'quiz':
            return (
                <div className="bg-orange-500/5 border border-orange-500/20 p-4 space-y-3">
                    <p className="text-xs font-black uppercase tracking-widest text-orange-400">Quick Check</p>
                    <p className="text-sm font-bold text-foreground">{block.question}</p>
                    <ul className="space-y-1.5">
                        {(block.options || []).filter(Boolean).map((opt, i) => (
                            <li key={i} className={`text-sm px-3 py-1.5 border ${opt === block.correct_answer ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-border text-foreground/70'}`}>
                                {opt === block.correct_answer ? '✓ ' : ''}{opt}
                            </li>
                        ))}
                    </ul>
                </div>
            );
        case 'activity':
            return (
                <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 space-y-2">
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-400">{block.is_coding ? '💻 Coding Lab' : '⚡ Activity'}</p>
                    {block.title && <p className="text-sm font-bold text-foreground">{block.title}</p>}
                    <ol className="space-y-1.5">
                        {(block.steps || []).map((s, i) => (
                            <li key={i} className="flex gap-2 text-sm text-foreground/70">
                                <span className="text-emerald-400 font-bold">{i + 1}.</span> {s}
                            </li>
                        ))}
                    </ol>
                </div>
            );
        case 'math':
            return <p className="font-serif text-lg text-center py-3 text-foreground border border-border bg-white/3">{block.formula}</p>;
        case 'file':
            return block.url ? (
                <a href={block.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-orange-400 hover:underline">
                    📎 {block.fileName || 'Download Resource'}
                </a>
            ) : null;
        case 'illustration':
            return (
                <div className="border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-2">
                    <p className="text-xs font-black uppercase tracking-widest text-indigo-400">{block.title}</p>
                    {(block.items || []).map((item, i) => (
                        <div key={i} className="flex justify-between text-sm border-b border-border/50 pb-1">
                            <span className="text-foreground/70">{item.label}</span>
                            <span className="font-bold text-foreground">{item.value}</span>
                        </div>
                    ))}
                </div>
            );
        default:
            return <p className="text-muted-foreground text-xs italic">[{block.type} block]</p>;
    }
}

function ToolbarButton({ onClick, icon: Icon, label, className }: any) {
    return (
        <button type="button" onClick={onClick} className={`flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-border rounded-none text-white/60 hover:text-white transition-all text-[10px] font-bold uppercase tracking-widest ${className || ''}`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
        </button>
    );
}

function ControlBtn({ onClick, icon: Icon, disabled }: any) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-none text-white/20 hover:text-white disabled:opacity-0 transition-all border border-border">
            <Icon className="w-4 h-4" />
        </button>
    );
}
