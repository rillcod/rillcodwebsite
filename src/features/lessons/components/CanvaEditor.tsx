'use client';

import { useState } from 'react';
import {
    PlusIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon,
    TypeIcon, HeadingIcon, CodeIcon, ImageIcon, InfoIcon, AlertTriangleIcon,
    GripVerticalIcon
} from 'lucide-react';

interface Block {
    type: 'text' | 'heading' | 'code' | 'image' | 'callout';
    content?: string;
    language?: string;
    url?: string;
    caption?: string;
    style?: 'info' | 'warning';
}

interface CanvaEditorProps {
    layout: Block[];
    onChange: (layout: Block[]) => void;
}

export default function CanvaEditor({ layout, onChange }: CanvaEditorProps) {
    const addBlock = (type: Block['type']) => {
        const newBlock: Block = { type, content: '' };
        if (type === 'code') newBlock.language = 'javascript';
        if (type === 'callout') newBlock.style = 'info';
        onChange([...layout, newBlock]);
    };

    const updateBlock = (index: number, updates: Partial<Block>) => {
        const next = [...layout];
        next[index] = { ...next[index], ...updates };
        onChange(next);
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

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-white/40">Visual Content Builder</h3>
                <div className="flex gap-2">
                    <ToolbarButton onClick={() => addBlock('heading')} icon={HeadingIcon} label="H2" />
                    <ToolbarButton onClick={() => addBlock('text')} icon={TypeIcon} label="Text" />
                    <ToolbarButton onClick={() => addBlock('code')} icon={CodeIcon} label="Code" />
                    <ToolbarButton onClick={() => addBlock('image')} icon={ImageIcon} label="Image" />
                    <ToolbarButton onClick={() => addBlock('callout')} icon={InfoIcon} label="Tip" />
                </div>
            </div>

            <div className="space-y-4">
                {layout.length === 0 && (
                    <div className="py-12 border-2 border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-white/20">
                        <PlusIcon className="w-8 h-8 mb-2" />
                        <p className="text-xs font-bold uppercase tracking-widest">No visual blocks yet</p>
                    </div>
                )}
                {layout.map((block, i) => (
                    <div key={i} className="group relative bg-white/[0.02] border border-white/10 rounded-2xl p-4 hover:border-cyan-500/30 transition-all">
                        <div className="absolute -left-10 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ControlBtn onClick={() => moveBlock(i, 'up')} icon={ChevronUpIcon} disabled={i === 0} />
                            <ControlBtn onClick={() => moveBlock(i, 'down')} icon={ChevronDownIcon} disabled={i === layout.length - 1} />
                        </div>

                        <div className="flex items-start gap-4">
                            <div className="flex-1 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400/60">{block.type}</span>
                                    <button onClick={() => removeBlock(i)} className="p-1 hover:text-rose-400 text-white/20 transition-colors">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>

                                {block.type === 'heading' && (
                                    <input
                                        type="text"
                                        value={block.content}
                                        onChange={e => updateBlock(i, { content: e.target.value })}
                                        placeholder="Enter heading..."
                                        className="w-full bg-transparent border-b border-white/10 py-1 text-lg font-bold focus:outline-none focus:border-cyan-500"
                                    />
                                )}

                                {block.type === 'text' && (
                                    <textarea
                                        rows={3}
                                        value={block.content}
                                        onChange={e => updateBlock(i, { content: e.target.value })}
                                        placeholder="Enter text content..."
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 resize-none"
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
                                            className="w-full bg-[#050510] border border-white/5 rounded-xl p-4 text-xs font-mono text-cyan-400 focus:outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                )}

                                {block.type === 'image' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <input
                                            type="text"
                                            value={block.url}
                                            onChange={e => updateBlock(i, { url: e.target.value })}
                                            placeholder="Image URL..."
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none"
                                        />
                                        <input
                                            type="text"
                                            value={block.caption}
                                            onChange={e => updateBlock(i, { caption: e.target.value })}
                                            placeholder="Caption (optional)..."
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none"
                                        />
                                    </div>
                                )}

                                {block.type === 'callout' && (
                                    <div className="flex gap-3">
                                        <select
                                            value={block.style}
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
                                            className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500 resize-none"
                                        />
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

function ToolbarButton({ onClick, icon: Icon, label }: any) {
    return (
        <button type="button" onClick={onClick} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 hover:text-white transition-all text-[10px] font-bold uppercase tracking-widest">
            <Icon className="w-3.5 h-3.5" />
            {label}
        </button>
    );
}

function ControlBtn({ onClick, icon: Icon, disabled }: any) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-white/20 hover:text-white disabled:opacity-0 transition-all border border-white/5">
            <Icon className="w-4 h-4" />
        </button>
    );
}
