'use client';

import { useState } from 'react';
import {
    PlusIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon,
    TypeIcon, HeadingIcon, CodeIcon, ImageIcon, InfoIcon, AlertTriangleIcon,
    GripVerticalIcon, ActivityIcon, HelpCircleIcon, VideoIcon, FileTextIcon,
    Share2Icon, SigmaIcon, SparklesIcon, Wand2Icon, PuzzleIcon
} from 'lucide-react';

interface Block {
    type: 'text' | 'heading' | 'code' | 'image' | 'callout' | 'activity' | 'quiz' | 'video' | 'file' | 'mermaid' | 'math' | 'visualizer' | 'motion-graphics' | 'd3-chart' | 'scratch';
    content?: string;
    language?: string;
    url?: string;
    caption?: string;
    style?: 'info' | 'warning';
    title?: string;
    instructions?: string;
    question?: string;
    options?: string[];
    correct_answer?: string;
    fileName?: string;
    code?: string; // For mermaid
    formula?: string; // For math
    id?: string; // For AI image generation and potentially other blocks
    visualType?: string;
    visualData?: any;
    animationType?: string;
    config?: any;
    chartType?: string;
    dataset?: any[];
    steps?: string[];
    is_coding?: boolean;
    initialCode?: string;
    projectId?: string;
    blocks?: string[];
}

interface CanvaEditorProps {
    layout: Block[];
    onChange: (layout: Block[]) => void;
}

export default function CanvaEditor({ layout, onChange }: CanvaEditorProps) {
    const addBlock = (type: Block['type']) => {
        const newBlock: Block = { type, content: '', id: Date.now().toString() }; // Add id to new blocks
        if (type === 'code') newBlock.language = 'javascript';
        if (type === 'callout') newBlock.style = 'info';
        if (type === 'mermaid') newBlock.code = 'graph TD\n    A[Start] --> B[End]';
        if (type === 'math') newBlock.formula = 'E = mc^2';
        if (type === 'visualizer') { newBlock.visualType = 'physics'; newBlock.visualData = { variables: {}, totalSteps: 10 }; }
        if (type === 'motion-graphics') { newBlock.animationType = 'orbit'; newBlock.config = { nodes: 3 }; }
        if (type === 'd3-chart') { newBlock.chartType = 'bar'; newBlock.dataset = [10, 20, 30, 40]; }
        if (type === 'scratch') { newBlock.projectId = ''; newBlock.blocks = ['when flag clicked', 'move 10 steps']; }
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
            {/* Toolbar — scrollable on mobile, wraps naturally on desktop */}
            <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Content Blocks</p>
                <div className="flex flex-wrap gap-1.5">
                    <ToolbarButton onClick={() => addBlock('heading')} icon={HeadingIcon} label="Heading" />
                    <ToolbarButton onClick={() => addBlock('text')} icon={TypeIcon} label="Text" />
                    <ToolbarButton onClick={() => addBlock('code')} icon={CodeIcon} label="Code" />
                    <ToolbarButton onClick={() => addBlock('image')} icon={ImageIcon} label="Image" />
                    <ToolbarButton onClick={() => addBlock('video')} icon={VideoIcon} label="Video" />
                    <ToolbarButton icon={FileTextIcon} label="File" onClick={() => addBlock('file')} />
                    <ToolbarButton icon={Share2Icon} label="Diagram" onClick={() => addBlock('mermaid')} />
                    <ToolbarButton icon={SigmaIcon} label="Math" onClick={() => addBlock('math')} />
                    <ToolbarButton onClick={() => addBlock('callout')} icon={InfoIcon} label="Tip" />
                    <ToolbarButton onClick={() => addBlock('activity')} icon={ActivityIcon} label="Activity" />
                    <ToolbarButton onClick={() => addBlock('quiz')} icon={HelpCircleIcon} label="Quiz" />
                    <div className="h-6 w-px bg-white/10 mx-1 self-center" />
                    <ToolbarButton onClick={() => addBlock('visualizer')} icon={ActivityIcon} label="Visualizer" className="border-cyan-500/30 text-cyan-400" />
                    <ToolbarButton onClick={() => addBlock('motion-graphics')} icon={SparklesIcon} label="Motion" className="border-indigo-500/30 text-indigo-400" />
                    <ToolbarButton onClick={() => addBlock('d3-chart')} icon={ActivityIcon} label="Chart" className="border-orange-500/30 text-orange-400" />
                    <ToolbarButton onClick={() => addBlock('scratch')} icon={PuzzleIcon} label="Scratch" className="border-rose-500/30 text-rose-400" />
                    <button
                        type="button"
                        onClick={handleAiImage}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 rounded-lg text-[10px] font-bold transition-all border border-violet-500/20"
                    >
                        <Wand2Icon className="w-3.5 h-3.5" />
                        AI Image
                    </button>
                </div>
            </div>

            <div className="space-y-3">
                {layout.length === 0 && (
                    <div className="py-12 border-2 border-dashed border-border rounded-3xl flex flex-col items-center justify-center text-white/20">
                        <PlusIcon className="w-8 h-8 mb-2" />
                        <p className="text-xs font-bold uppercase tracking-widest">No visual blocks yet — add one above</p>
                    </div>
                )}
                {layout.map((block, i) => (
                    <div key={i} className="group bg-white/[0.02] border border-border rounded-2xl p-3 sm:p-4 hover:border-cyan-500/30 transition-all">
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
                                    <button onClick={() => removeBlock(i)} className="p-1.5 hover:text-rose-400 text-white/20 hover:bg-rose-500/10 rounded-lg transition-colors">
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
                                        className="w-full bg-white/5 border border-border rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 resize-none"
                                    />
                                )}

                                {block.type === 'code' && (
                                    <div className="space-y-2">
                                        <select
                                            value={block.language}
                                            onChange={e => updateBlock(i, { language: e.target.value })}
                                            className="bg-white/10 text-[10px] px-2 py-1 rounded-md text-white/60 focus:outline-none"
                                        >
                                            <option value="javascript">JavaScript</option>
                                            <option value="typescript">TypeScript</option>
                                            <option value="python">Python</option>
                                            <option value="html">HTML</option>
                                            <option value="css">CSS</option>
                                            <option value="sql">SQL</option>
                                        </select>
                                        <textarea
                                            rows={4}
                                            value={block.content}
                                            onChange={e => updateBlock(i, { content: e.target.value })}
                                            placeholder="Paste code here..."
                                            className="w-full bg-[#050510] border border-border rounded-xl p-4 text-xs font-mono text-cyan-400 focus:outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                )}

                                {block.type === 'image' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <input
                                            type="text"
                                            value={block.url}
                                            onChange={e => updateBlock(i, { url: e.target.value })}
                                            placeholder="Image URL..."
                                            className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-xs focus:outline-none"
                                        />
                                        <input
                                            type="text"
                                            value={block.caption}
                                            onChange={e => updateBlock(i, { caption: e.target.value })}
                                            placeholder="Caption (optional)..."
                                            className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-xs focus:outline-none"
                                        />
                                    </div>
                                )}

                                {block.type === 'callout' && (
                                    <div className="flex gap-3">
                                        <select
                                            value={block.style || 'info'}
                                            onChange={e => updateBlock(i, { style: e.target.value as any })}
                                            className="bg-white/10 text-[10px] px-2 py-1 h-fit rounded-md text-white/60 focus:outline-none"
                                        >
                                            <option value="info">Info Tip</option>
                                            <option value="warning">Warning</option>
                                        </select>
                                        <textarea
                                            rows={2}
                                            value={block.content}
                                            onChange={e => updateBlock(i, { content: e.target.value })}
                                            placeholder="Callout content..."
                                            className="flex-1 bg-white/5 border border-border rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 resize-none"
                                        />
                                    </div>
                                )}

                                {block.type === 'activity' && (
                                    <div className="space-y-4 p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
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
                                                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs font-mono text-cyan-400 focus:outline-none"
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
                                            className="w-full bg-white/5 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500"
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
                                            className="bg-white/5 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500"
                                        />
                                        <input
                                            type="text"
                                            value={block.fileName || ''}
                                            onChange={e => updateBlock(i, { fileName: e.target.value })}
                                            placeholder="Display Name (e.g., Study Guide.pdf)..."
                                            className="bg-white/5 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                )}
                                {block.type === 'mermaid' && (
                                    <div className="space-y-4">
                                        <textarea
                                            value={block.code || ''}
                                            onChange={(e) => updateBlock(i, { code: e.target.value })}
                                            placeholder="graph TD\nA[Start] --> B[End]"
                                            className="w-full bg-[#1e1e2e] text-white p-4 rounded-xl border border-border font-mono text-sm h-32 focus:outline-none focus:border-cyan-500"
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
                                            className="w-full bg-[#1e1e2e] text-white p-4 rounded-xl border border-border font-serif text-lg focus:outline-none focus:border-cyan-500"
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
                                                        className="flex-1 bg-white/5 border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {block.type === 'visualizer' && (
                                    <div className="space-y-4 p-4 bg-cyan-500/5 rounded-xl border border-cyan-500/10">
                                        <div className="flex gap-4">
                                            <select 
                                                value={block.visualType} 
                                                onChange={e => updateBlock(i, { visualType: e.target.value })}
                                                className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-cyan-400 font-bold outline-none"
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
                                            className="w-full bg-black/60 border border-white/5 p-3 rounded-lg font-mono text-[10px] text-white/80 h-32 outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                )}
                                {block.type === 'motion-graphics' && (
                                    <div className="space-y-4 p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                                        <div className="flex gap-4">
                                            <select 
                                                value={block.animationType} 
                                                onChange={e => updateBlock(i, { animationType: e.target.value })}
                                                className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-indigo-300 font-bold outline-none"
                                            >
                                                {['orbit', 'pulse', 'wave', 'grid', 'particles'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
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
                                    <div className="space-y-4 p-4 bg-orange-500/5 rounded-xl border border-orange-500/10">
                                        <div className="flex gap-4">
                                            <select 
                                                value={block.chartType} 
                                                onChange={e => updateBlock(i, { chartType: e.target.value })}
                                                className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-orange-400 font-bold outline-none"
                                            >
                                                {['bar', 'line', 'pie', 'area'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                                            </select>
                                            <input 
                                                type="text" 
                                                value={(block.dataset || []).join(', ')} 
                                                onChange={e => updateBlock(i, { dataset: e.target.value.split(',').map(n => parseFloat(n.trim()) || 0) })}
                                                placeholder="Data: 10, 20, 30"
                                                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-white"
                                            />
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

function ToolbarButton({ onClick, icon: Icon, label, className }: any) {
    return (
        <button type="button" onClick={onClick} className={`flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-border rounded-lg text-white/60 hover:text-white transition-all text-[10px] font-bold uppercase tracking-widest ${className || ''}`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
        </button>
    );
}

function ControlBtn({ onClick, icon: Icon, disabled }: any) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/20 hover:text-white disabled:opacity-0 transition-all border border-border">
            <Icon className="w-4 h-4" />
        </button>
    );
}
