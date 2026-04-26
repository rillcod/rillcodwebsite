'use client';

import { useState, useCallback, useRef } from 'react';
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
    MinusIcon, QuoteIcon, ListOrderedIcon, BookOpenIcon, TableIcon, EyeIcon, EyeOffIcon,
    Columns2Icon, CopyIcon, LightbulbIcon, ChevronRightIcon, Loader2Icon, ZapIcon,
    LayoutTemplateIcon, RotateCcwIcon,
} from 'lucide-react';
import { DocumentDuplicateIcon } from '@/lib/icons';

/* ─── Types ───────────────────────────────────────────────────────────────── */

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
    author?: string;
    terms?: { term: string; definition: string }[];
    rows?: { col1: string; col2: string }[];
    col1_header?: string;
    col2_header?: string;
    left?: string;
    right?: string;
}

interface CanvaEditorProps {
    layout: Block[];
    onChange: (layout: Block[]) => void;
    lessonTitle?: string;
}

/* ─── Toolbar groups ──────────────────────────────────────────────────────── */

const TOOLBAR_GROUPS = [
    {
        id: 'basic', label: 'Basic', color: 'text-foreground',
        items: [
            { type: 'heading' as Block['type'], icon: HeadingIcon, label: 'Heading' },
            { type: 'text' as Block['type'], icon: TypeIcon, label: 'Text' },
            { type: 'callout' as Block['type'], icon: InfoIcon, label: 'Tip' },
            { type: 'quote' as Block['type'], icon: QuoteIcon, label: 'Quote' },
            { type: 'divider' as Block['type'], icon: MinusIcon, label: 'Divider' },
        ],
    },
    {
        id: 'structure', label: 'Structure', color: 'text-violet-400',
        items: [
            { type: 'steps-list' as Block['type'], icon: ListOrderedIcon, label: 'Steps' },
            { type: 'key-terms' as Block['type'], icon: BookOpenIcon, label: 'Terms' },
            { type: 'table' as Block['type'], icon: TableIcon, label: 'Table' },
            { type: 'columns' as Block['type'], icon: Columns2Icon, label: 'Columns' },
        ],
    },
    {
        id: 'media', label: 'Media', color: 'text-sky-400',
        items: [
            { type: 'code' as Block['type'], icon: CodeIcon, label: 'Code' },
            { type: 'image' as Block['type'], icon: ImageIcon, label: 'Image' },
            { type: 'video' as Block['type'], icon: VideoIcon, label: 'Video' },
            { type: 'file' as Block['type'], icon: FileTextIcon, label: 'File' },
        ],
    },
    {
        id: 'learning', label: 'Learning', color: 'text-emerald-400',
        items: [
            { type: 'activity' as Block['type'], icon: ActivityIcon, label: 'Activity' },
            { type: 'quiz' as Block['type'], icon: HelpCircleIcon, label: 'Quiz' },
            { type: 'assignment-block' as Block['type'], icon: TrophyIcon, label: 'Capstone' },
        ],
    },
    {
        id: 'visual', label: 'Visual', color: 'text-indigo-400',
        items: [
            { type: 'mermaid' as Block['type'], icon: Share2Icon, label: 'Diagram' },
            { type: 'math' as Block['type'], icon: SigmaIcon, label: 'Math' },
            { type: 'visualizer' as Block['type'], icon: ActivityIcon, label: 'Visualizer' },
            { type: 'motion-graphics' as Block['type'], icon: SparklesIcon, label: 'Motion' },
            { type: 'd3-chart' as Block['type'], icon: ActivityIcon, label: 'Chart' },
            { type: 'illustration' as Block['type'], icon: SparklesIcon, label: 'Infographic' },
            { type: 'code-map' as Block['type'], icon: Share2Icon, label: 'Architecture' },
            { type: 'scratch' as Block['type'], icon: PuzzleIcon, label: 'Scratch' },
        ],
    },
] as const;

/* ─── Smart hints per block type ─────────────────────────────────────────── */

const BLOCK_HINTS: Record<string, { tip: string; format?: string }> = {
    text: { tip: 'Supports markdown: **bold**, *italic*, `code`, > blockquote, - lists', format: 'Markdown supported' },
    heading: { tip: 'Use as a section divider between major topics. Keep it concise.' },
    callout: { tip: 'Great for highlighting key concepts, warnings, or important notes. Pick the style that fits the tone.' },
    quote: { tip: 'Perfect for famous quotes, student prompts, or important statements.' },
    code: { tip: 'Select the correct language for syntax highlighting. Monaco editor is fully featured.' },
    quiz: { tip: '4 options work best. Mark the correct answer by clicking the radio. Add a hint for after the answer is revealed.', format: 'Use AI Fill to generate a question' },
    activity: { tip: 'Keep each step short and actionable. Enable "Coding Lab" for hands-on programming tasks.' },
    'steps-list': { tip: '3–7 steps is ideal. Each step should be one clear, specific action.', format: 'Use AI Fill to auto-generate steps' },
    'key-terms': { tip: 'Define 4–8 key vocabulary terms. Keep definitions concise — 1–2 sentences max.', format: 'Use AI Fill to extract terms' },
    mermaid: { tip: 'Paste Mermaid diagram syntax. Use the template picker below for a head start.' },
    'motion-graphics': { tip: 'orbit = hierarchy, flow = process steps, network = concept map, wave = signal/frequency, timeline = chronological events' },
    image: { tip: 'Paste a direct image URL or click AI Image to generate one from a description.' },
    table: { tip: 'Perfect for comparing options, showing specifications, or creating reference tables.' },
    columns: { tip: 'Great for side-by-side comparison: before/after, concept A vs B, code vs output.' },
    math: { tip: 'Use LaTeX syntax: fractions (\\frac{a}{b}), power (x^2), roots (\\sqrt{x}), Greek letters (\\alpha, \\beta).' },
    video: { tip: 'Paste a YouTube, Vimeo, or direct video URL. The player embeds automatically.' },
    visualizer: { tip: 'Pick the sketch type that best illustrates your concept. Sorting, physics, loops, turtle graphics, or state machine.' },
    'assignment-block': { tip: 'This is a content block — to create a gradable assignment use "Add Assignment" in the lesson toolbar.' },
};

/* ─── Mermaid diagram templates ──────────────────────────────────────────── */

const MERMAID_TEMPLATES: { label: string; code: string }[] = [
    { label: 'Flowchart', code: 'flowchart TD\n    A[Start] --> B{Decision?}\n    B -- Yes --> C[Action A]\n    B -- No --> D[Action B]\n    C --> E[End]\n    D --> E' },
    { label: 'Sequence', code: 'sequenceDiagram\n    participant User\n    participant System\n    User->>System: Request\n    System-->>User: Response\n    User->>System: Confirm' },
    { label: 'Class Diagram', code: 'classDiagram\n    class Animal {\n        +String name\n        +int age\n        +speak()\n    }\n    class Dog {\n        +fetch()\n    }\n    Animal <|-- Dog' },
    { label: 'ER Diagram', code: 'erDiagram\n    STUDENT ||--o{ ENROLLMENT : "has many"\n    COURSE ||--o{ ENROLLMENT : "has many"\n    ENROLLMENT {\n        date enrolled_at\n        string grade\n    }' },
    { label: 'Mind Map', code: 'mindmap\n  root((Main Topic))\n    Subtopic A\n      Detail 1\n      Detail 2\n    Subtopic B\n      Detail 3\n    Subtopic C' },
    { label: 'Timeline', code: 'timeline\n    title History of Computing\n    1940 : ENIAC\n    1970 : Microprocessor\n    1990 : World Wide Web\n    2007 : Smartphone Era' },
];

/* ─── Math formula templates ──────────────────────────────────────────────── */

const MATH_TEMPLATES: { label: string; formula: string }[] = [
    { label: 'Quadratic', formula: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
    { label: "Pythagorean", formula: 'a^2 + b^2 = c^2' },
    { label: "Newton's 2nd", formula: 'F = ma' },
    { label: 'E = mc²', formula: 'E = mc^2' },
    { label: 'Euler', formula: 'e^{i\\pi} + 1 = 0' },
    { label: 'Ohm\'s Law', formula: 'V = IR' },
];

/* ─── Component ───────────────────────────────────────────────────────────── */

export default function CanvaEditor({ layout, onChange, lessonTitle }: CanvaEditorProps) {
    const [previewMode, setPreviewMode] = useState(false);
    const [activeGroup, setActiveGroup] = useState<string>('basic');
    const [expandedHints, setExpandedHints] = useState<Set<number>>(new Set());
    const [aiFillingIndex, setAiFillingIndex] = useState<number | null>(null);

    // AI Image modal state
    const [aiImageModal, setAiImageModal] = useState(false);
    const [aiImagePrompt, setAiImagePrompt] = useState('');
    const [aiImageLoading, setAiImageLoading] = useState(false);
    const aiImageInputRef = useRef<HTMLInputElement>(null);

    /* ── CRUD helpers ── */

    const addBlock = (type: Block['type']) => {
        const newBlock: Block = { type, content: '', id: Date.now().toString() };
        if (type === 'code') newBlock.language = 'javascript';
        if (type === 'callout') newBlock.style = 'info';
        if (type === 'mermaid') newBlock.code = 'flowchart TD\n    A[Start] --> B[End]';
        if (type === 'math') newBlock.formula = 'E = mc^2';
        if (type === 'visualizer') { newBlock.visualType = 'sorting'; newBlock.visualData = { totalSteps: 8, variables: { i: 0, j: 1 }, visualizationState: { array: [42, 15, 7, 33, 1, 28, 19, 50], comparing: [0, 1] } }; }
        if (type === 'motion-graphics') { newBlock.animationType = 'orbit'; newBlock.config = { nodes: 3 }; }
        if (type === 'd3-chart') { newBlock.chartType = 'bar'; newBlock.dataset = [10, 20, 30, 40]; newBlock.labels = ['A', 'B', 'C', 'D']; }
        if (type === 'scratch') { newBlock.projectId = ''; newBlock.blocks = ['when flag clicked', 'move 10 steps']; }
        if (type === 'illustration') { newBlock.title = 'Key Synthesis'; newBlock.items = [{ label: 'Metric', value: 'Result' }]; }
        if (type === 'code-map') { newBlock.components = [{ name: 'Module', description: 'Logic Overview' }]; }
        if (type === 'assignment-block') { newBlock.title = 'Capstone Project'; newBlock.instructions = 'Project guide...'; newBlock.deliverables = ['Final Output']; }
        if (type === 'quote') { newBlock.content = ''; newBlock.author = ''; }
        if (type === 'steps-list') { newBlock.title = ''; newBlock.steps = ['Step 1', 'Step 2', 'Step 3']; }
        if (type === 'key-terms') { newBlock.title = 'Key Terms'; newBlock.terms = [{ term: '', definition: '' }]; }
        if (type === 'table') { newBlock.col1_header = 'Column 1'; newBlock.col2_header = 'Column 2'; newBlock.rows = [{ col1: '', col2: '' }]; }
        if (type === 'columns') { newBlock.left = ''; newBlock.right = ''; }
        if (type === 'quiz') { newBlock.question = ''; newBlock.options = ['', '', '', '']; newBlock.correct_answer = ''; newBlock.instructions = ''; }
        if (type === 'activity') { newBlock.title = ''; newBlock.steps = ['', '']; newBlock.is_coding = false; }
        onChange([...layout, newBlock]);
    };

    const updateBlock = (indexOrId: number | string, updates: Partial<Block>) => {
        const next = [...layout];
        const targetIndex = typeof indexOrId === 'number'
            ? indexOrId
            : next.findIndex(b => b.id === indexOrId);
        if (targetIndex !== -1) {
            next[targetIndex] = { ...next[targetIndex], ...updates };
            onChange(next);
        }
    };

    const removeBlock = (index: number) => onChange(layout.filter((_, i) => i !== index));

    const moveBlock = (index: number, direction: 'up' | 'down') => {
        const next = [...layout];
        const target = direction === 'up' ? index - 1 : index + 1;
        if (target < 0 || target >= layout.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    };

    const duplicateBlock = (index: number) => {
        const copy = { ...layout[index], id: Date.now().toString() };
        const next = [...layout];
        next.splice(index + 1, 0, copy);
        onChange(next);
    };

    const toggleHint = (index: number) => {
        setExpandedHints(prev => {
            const next = new Set(prev);
            next.has(index) ? next.delete(index) : next.add(index);
            return next;
        });
    };

    /* ── AI Fill ── */

    const handleAIFill = async (index: number) => {
        const block = layout[index];
        if (!['quiz', 'steps-list', 'key-terms'].includes(block.type)) return;
        setAiFillingIndex(index);
        const context = lessonTitle || 'the current lesson topic';
        const prompts: Record<string, string> = {
            quiz: `Generate a multiple-choice quiz question for a lesson on "${context}". Return ONLY this exact JSON with no other text: {"question":"...","options":["A option","B option","C option","D option"],"correct_answer":"A option","instructions":"Brief explanation of why this is correct"}`,
            'steps-list': `Generate 4-5 clear step-by-step instructions for "${context}". Return ONLY this exact JSON: {"title":"Step-by-Step Guide","steps":["Step 1: ...","Step 2: ...","Step 3: ...","Step 4: ..."]}`,
            'key-terms': `List 5-6 key vocabulary terms for a lesson on "${context}". Return ONLY this exact JSON: {"title":"Key Terms","terms":[{"term":"...","definition":"..."},{"term":"...","definition":"..."}]}`,
        };
        try {
            const res = await fetch('/api/ai/study-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: prompts[block.type],
                    lessonTitle: lessonTitle || 'general topic',
                    conversationHistory: [],
                }),
            });
            const data = await res.json();
            const raw = (data.reply || '').trim();
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON in response');
            const parsed = JSON.parse(jsonMatch[0]);
            if (block.type === 'quiz') {
                updateBlock(index, {
                    question: parsed.question || '',
                    options: parsed.options || ['', '', '', ''],
                    correct_answer: parsed.correct_answer || '',
                    instructions: parsed.instructions || '',
                });
            } else if (block.type === 'steps-list') {
                updateBlock(index, { title: parsed.title || '', steps: parsed.steps || [] });
            } else if (block.type === 'key-terms') {
                updateBlock(index, { title: parsed.title || 'Key Terms', terms: parsed.terms || [] });
            }
        } catch {
            // fail silently — content stays as-is
        } finally {
            setAiFillingIndex(null);
        }
    };

    /* ── AI Image ── */

    const openAiImageModal = () => {
        setAiImagePrompt('');
        setAiImageModal(true);
        setTimeout(() => aiImageInputRef.current?.focus(), 50);
    };

    const handleAiImage = async () => {
        const prompt = aiImagePrompt.trim();
        if (!prompt) return;
        setAiImageLoading(true);
        const id = Date.now().toString();
        const newBlock: Block = { id, type: 'image', content: '', caption: prompt, url: '' };
        onChange([...layout, newBlock]);
        setAiImageModal(false);
        setAiImagePrompt('');
        setAiImageLoading(false);
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

    /* ─── Render ─────────────────────────────────────────────────────────── */

    const activeGroupData = TOOLBAR_GROUPS.find(g => g.id === activeGroup);

    return (
        <div className="space-y-4">

            {/* AI Image Generation Modal */}
            {aiImageModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
                    <div className="bg-zinc-900 border border-violet-500/30 shadow-2xl w-full sm:max-w-md p-6 space-y-4 sm:rounded-2xl rounded-t-2xl">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-violet-400/70 mb-0.5">AI Image Generator</p>
                                <h3 className="text-sm font-black text-white">Describe your image</h3>
                            </div>
                            <button type="button" onClick={() => { setAiImageModal(false); setAiImagePrompt(''); }}
                                className="p-2 text-white/30 hover:text-white hover:bg-white/5 rounded-xl transition-colors">
                                <MinusIcon className="w-4 h-4" />
                            </button>
                        </div>
                        <input
                            ref={aiImageInputRef}
                            type="text"
                            value={aiImagePrompt}
                            onChange={e => setAiImagePrompt(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleAiImage(); }}
                            placeholder="e.g. A robot soldering a circuit on a workbench"
                            className="w-full bg-black/40 border border-white/10 focus:border-violet-500/50 focus:outline-none px-4 py-3 text-sm text-white placeholder:text-white/30 rounded-xl"
                        />
                        <div className="flex gap-2">
                            <button type="button" onClick={() => { setAiImageModal(false); setAiImagePrompt(''); }}
                                className="flex-1 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white/40 border border-white/10 hover:bg-white/5 rounded-xl transition-colors">
                                Cancel
                            </button>
                            <button type="button" onClick={handleAiImage} disabled={!aiImagePrompt.trim() || aiImageLoading}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-[11px] font-black uppercase tracking-widest bg-violet-600/30 hover:bg-violet-600/50 text-violet-300 border border-violet-500/30 rounded-xl transition-colors disabled:opacity-40">
                                <Wand2Icon className="w-3.5 h-3.5" /> Generate
                            </button>
                        </div>
                        <p className="text-[10px] text-white/20">Powered by Gemini Imagen · Falls back to Pollinations AI</p>
                        <div className="h-[env(safe-area-inset-bottom)] sm:hidden" />
                    </div>
                </div>
            )}

            {/* ─── Toolbar ─────────────────────────────────────────────────── */}
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 shrink-0">
                        Content Blocks {layout.length > 0 && <span className="text-muted-foreground/40">· {layout.length}</span>}
                    </p>
                    <div className="flex items-center gap-2">
                        {/* AI Image button */}
                        {!previewMode && (
                            <button type="button" onClick={openAiImageModal}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-violet-500/20">
                                <Wand2Icon className="w-3 h-3" /> AI Image
                            </button>
                        )}
                        <button type="button" onClick={() => setPreviewMode(p => !p)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${previewMode ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-white/5 border-border text-muted-foreground hover:text-foreground hover:bg-white/10'}`}>
                            {previewMode ? <><EyeOffIcon className="w-3.5 h-3.5" /> Edit</> : <><EyeIcon className="w-3.5 h-3.5" /> Preview</>}
                        </button>
                    </div>
                </div>

                {!previewMode && (
                    <div className="border border-border rounded-xl overflow-hidden">
                        {/* Category tabs — horizontal scroll on mobile */}
                        <div className="flex overflow-x-auto [-webkit-overflow-scrolling:touch] border-b border-border bg-muted/30">
                            {TOOLBAR_GROUPS.map(g => (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => setActiveGroup(g.id)}
                                    className={`shrink-0 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${
                                        activeGroup === g.id
                                            ? `border-primary ${g.color} bg-background`
                                            : 'border-transparent text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {g.label}
                                </button>
                            ))}
                        </div>

                        {/* Block buttons for active group — horizontal scroll on mobile */}
                        <div className="p-3 overflow-x-auto [-webkit-overflow-scrolling:touch]">
                            <div className="flex gap-2 min-w-max sm:min-w-0 sm:flex-wrap">
                                {activeGroupData?.items.map(item => {
                                    const Icon = item.icon;
                                    return (
                                        <button
                                            key={item.type}
                                            type="button"
                                            onClick={() => addBlock(item.type)}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-all border border-border hover:border-primary/30 hover:bg-primary/5 ${activeGroupData.color} bg-background whitespace-nowrap`}
                                        >
                                            <Icon className="w-3.5 h-3.5 shrink-0" />
                                            {item.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ─── Preview mode ─────────────────────────────────────────────── */}
            {previewMode && (
                <div className="bg-card border border-border rounded-xl p-5 sm:p-8 space-y-5">
                    {layout.length === 0 ? (
                        <p className="text-muted-foreground text-sm italic text-center py-8">No content blocks yet. Switch to Edit mode to add blocks.</p>
                    ) : layout.map((block, i) => (
                        <PreviewBlock key={i} block={block} />
                    ))}
                </div>
            )}

            {/* ─── Block list ───────────────────────────────────────────────── */}
            <div className="space-y-3">
                {!previewMode && layout.length === 0 && (
                    <div className="py-12 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-3 text-muted-foreground/40">
                        <PlusIcon className="w-8 h-8" />
                        <p className="text-xs font-bold uppercase tracking-widest">Select a category above and add your first block</p>
                    </div>
                )}

                {!previewMode && layout.map((block, i) => {
                    const hint = BLOCK_HINTS[block.type];
                    const isAIFilling = aiFillingIndex === i;
                    const hintOpen = expandedHints.has(i);
                    const canAIFill = ['quiz', 'steps-list', 'key-terms'].includes(block.type) && !isAIFilling;

                    return (
                        <div key={i} className="group bg-card border border-border rounded-xl overflow-hidden hover:border-primary/20 transition-all duration-200">

                            {/* Block header bar */}
                            <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border">
                                {/* Type badge */}
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded-md">{block.type}</span>

                                <div className="flex-1" />

                                {/* AI Fill button */}
                                {canAIFill && (
                                    <button
                                        type="button"
                                        onClick={() => handleAIFill(i)}
                                        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 rounded-lg hover:bg-primary/20 transition-all"
                                        title={`AI Fill ${block.type}`}
                                    >
                                        <ZapIcon className="w-3 h-3" />
                                        <span className="hidden sm:inline">AI Fill</span>
                                    </button>
                                )}
                                {isAIFilling && (
                                    <span className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-black text-primary/60">
                                        <Loader2Icon className="w-3 h-3 animate-spin" /> Generating…
                                    </span>
                                )}

                                {/* Hint toggle */}
                                {hint && (
                                    <button
                                        type="button"
                                        onClick={() => toggleHint(i)}
                                        className={`p-1.5 rounded-lg transition-colors ${hintOpen ? 'text-amber-400 bg-amber-500/10' : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted'}`}
                                        title="Show/hide tip"
                                    >
                                        <LightbulbIcon className="w-3.5 h-3.5" />
                                    </button>
                                )}

                                {/* Move up / down */}
                                <div className="flex items-center gap-0.5">
                                    <button type="button" onClick={() => moveBlock(i, 'up')} disabled={i === 0}
                                        className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-muted disabled:opacity-20 transition-colors">
                                        <ChevronUpIcon className="w-3.5 h-3.5" />
                                    </button>
                                    <button type="button" onClick={() => moveBlock(i, 'down')} disabled={i === layout.length - 1}
                                        className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-muted disabled:opacity-20 transition-colors">
                                        <ChevronDownIcon className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                {/* Duplicate */}
                                <button type="button" onClick={() => duplicateBlock(i)}
                                    className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors" title="Duplicate block">
                                    <DocumentDuplicateIcon className="w-3.5 h-3.5" />
                                </button>

                                {/* Delete */}
                                <button type="button" onClick={() => removeBlock(i)}
                                    className="p-1.5 rounded-lg text-muted-foreground/20 hover:text-rose-400 hover:bg-rose-500/10 transition-colors" title="Delete block">
                                    <TrashIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Smart hint */}
                            {hint && hintOpen && (
                                <div className="flex items-start gap-2.5 px-4 py-2.5 bg-amber-500/5 border-b border-amber-500/10">
                                    <LightbulbIcon className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs text-amber-200/80 leading-relaxed">{hint.tip}</p>
                                        {hint.format && <p className="text-[10px] text-amber-400/50 mt-0.5">💡 {hint.format}</p>}
                                    </div>
                                </div>
                            )}

                            {/* Block editor body */}
                            <div className="p-4 space-y-3">

                                {/* ── Heading ── */}
                                {block.type === 'heading' && (
                                    <input type="text" value={block.content} onChange={e => updateBlock(i, { content: e.target.value })}
                                        placeholder="Enter section heading…"
                                        className="w-full bg-transparent border-b border-border py-2 text-xl font-black text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40" />
                                )}

                                {/* ── Text ── */}
                                {block.type === 'text' && (
                                    <textarea rows={4} value={block.content} onChange={e => updateBlock(i, { content: e.target.value })}
                                        placeholder="Enter content… Supports **bold**, *italic*, `code`, - lists"
                                        className="w-full bg-muted/30 border border-border rounded-xl p-3 text-sm text-foreground focus:outline-none focus:border-primary resize-y placeholder:text-muted-foreground/40" />
                                )}

                                {/* ── Code ── */}
                                {block.type === 'code' && (
                                    <div className="space-y-2">
                                        <select value={block.language} onChange={e => updateBlock(i, { language: e.target.value })}
                                            className="bg-muted border border-border rounded-lg text-[11px] px-3 py-1.5 text-foreground focus:outline-none w-full sm:w-auto">
                                            {['javascript','typescript','python','html','css','sql','java','cpp','csharp','go','rust','php','bash','json','yaml','markdown'].map(l => (
                                                <option key={l} value={l}>{l}</option>
                                            ))}
                                        </select>
                                        <div className="border border-border rounded-xl overflow-hidden">
                                            <MonacoEditor height={200} language={block.language || 'javascript'} value={block.content || ''}
                                                onChange={val => updateBlock(i, { content: val ?? '' })} theme="vs-dark"
                                                options={{ fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on', lineNumbers: 'on', padding: { top: 10, bottom: 10 }, scrollbar: { vertical: 'hidden', horizontal: 'hidden' }, overviewRulerLanes: 0, folding: false, renderLineHighlight: 'none', automaticLayout: true }} />
                                        </div>
                                    </div>
                                )}

                                {/* ── Image ── */}
                                {block.type === 'image' && (
                                    <div className="space-y-3">
                                        <input type="text" value={block.url} onChange={e => updateBlock(i, { url: e.target.value })}
                                            placeholder="Image URL (https://…)"
                                            className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40" />
                                        <input type="text" value={block.caption} onChange={e => updateBlock(i, { caption: e.target.value })}
                                            placeholder="Caption (optional)…"
                                            className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-muted-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40" />
                                        {block.url && (
                                            <div className="rounded-xl overflow-hidden border border-border bg-muted/20">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={block.url} alt={block.caption || ''} className="w-full max-h-48 object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── Callout ── */}
                                {block.type === 'callout' && (
                                    <div className="space-y-2">
                                        <select value={block.style || 'info'} onChange={e => updateBlock(i, { style: e.target.value as any })}
                                            className="bg-muted border border-border rounded-lg text-[11px] px-3 py-1.5 text-foreground focus:outline-none w-full sm:w-auto">
                                            <option value="info">ℹ Info</option>
                                            <option value="warning">⚠ Warning</option>
                                            <option value="success">✓ Success</option>
                                            <option value="danger">✕ Danger</option>
                                        </select>
                                        <textarea rows={2} value={block.content} onChange={e => updateBlock(i, { content: e.target.value })}
                                            placeholder="Callout content…"
                                            className="w-full bg-muted/30 border border-border rounded-xl p-3 text-sm text-foreground focus:outline-none focus:border-primary resize-none placeholder:text-muted-foreground/40" />
                                    </div>
                                )}

                                {/* ── Quote ── */}
                                {block.type === 'quote' && (
                                    <div className="space-y-2 border-l-4 border-primary/30 pl-4">
                                        <textarea rows={2} value={block.content || ''} onChange={e => updateBlock(i, { content: e.target.value })}
                                            placeholder="Quote text…"
                                            className="w-full bg-transparent italic text-foreground/80 text-sm focus:outline-none resize-none placeholder:text-muted-foreground/40" />
                                        <input type="text" value={block.author || ''} onChange={e => updateBlock(i, { author: e.target.value })}
                                            placeholder="— Author / source (optional)"
                                            className="w-full bg-transparent border-b border-border text-xs text-primary/60 focus:outline-none focus:border-primary placeholder:text-muted-foreground/30" />
                                    </div>
                                )}

                                {/* ── Divider ── */}
                                {block.type === 'divider' && (
                                    <div className="py-1 flex items-center gap-3 text-muted-foreground/30">
                                        <div className="flex-1 border-b border-dashed border-border" />
                                        <span className="text-[9px] font-black uppercase tracking-widest">Section Divider</span>
                                        <div className="flex-1 border-b border-dashed border-border" />
                                    </div>
                                )}

                                {/* ── Steps List ── */}
                                {block.type === 'steps-list' && (
                                    <div className="space-y-3">
                                        <input type="text" value={block.title || ''} onChange={e => updateBlock(i, { title: e.target.value })}
                                            placeholder="Section title (e.g. How to…)"
                                            className="w-full bg-transparent border-b border-border py-1.5 text-sm font-bold text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40" />
                                        <div className="space-y-2">
                                            {(block.steps || []).map((s, sIdx) => (
                                                <div key={sIdx} className="flex items-center gap-2">
                                                    <span className="w-6 h-6 rounded-lg bg-violet-500/20 border border-violet-500/20 flex items-center justify-center text-[10px] font-black text-violet-400 shrink-0">{sIdx + 1}</span>
                                                    <input value={s} onChange={e => { const next = [...(block.steps || [])]; next[sIdx] = e.target.value; updateBlock(i, { steps: next }); }}
                                                        placeholder={`Step ${sIdx + 1}…`}
                                                        className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/30" />
                                                    <button type="button" onClick={() => { const next = (block.steps || []).filter((_, idx) => idx !== sIdx); updateBlock(i, { steps: next }); }}
                                                        className="p-1.5 hover:text-rose-400 text-muted-foreground/30 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0">
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <button type="button" onClick={() => updateBlock(i, { steps: [...(block.steps || []), ''] })}
                                            className="flex items-center gap-1.5 text-[11px] font-black text-violet-400 uppercase tracking-widest hover:text-violet-300 transition-colors">
                                            <PlusIcon className="w-3.5 h-3.5" /> Add Step
                                        </button>
                                    </div>
                                )}

                                {/* ── Key Terms ── */}
                                {block.type === 'key-terms' && (
                                    <div className="space-y-3">
                                        <input type="text" value={block.title || ''} onChange={e => updateBlock(i, { title: e.target.value })}
                                            placeholder="Section title (e.g. Key Terms)"
                                            className="w-full bg-transparent border-b border-border py-1.5 text-sm font-bold text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40" />
                                        <div className="space-y-2">
                                            {(block.terms || []).map((t, tIdx) => (
                                                <div key={tIdx} className="flex items-start gap-2">
                                                    <input value={t.term} onChange={e => { const next = [...(block.terms || [])]; next[tIdx] = { ...next[tIdx], term: e.target.value }; updateBlock(i, { terms: next }); }}
                                                        placeholder="Term…"
                                                        className="w-[35%] bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-sm font-bold text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/30" />
                                                    <input value={t.definition} onChange={e => { const next = [...(block.terms || [])]; next[tIdx] = { ...next[tIdx], definition: e.target.value }; updateBlock(i, { terms: next }); }}
                                                        placeholder="Definition…"
                                                        className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-sm text-muted-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/30" />
                                                    <button type="button" onClick={() => updateBlock(i, { terms: (block.terms || []).filter((_, idx) => idx !== tIdx) })}
                                                        className="p-1.5 hover:text-rose-400 text-muted-foreground/30 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0 mt-0.5">
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <button type="button" onClick={() => updateBlock(i, { terms: [...(block.terms || []), { term: '', definition: '' }] })}
                                            className="flex items-center gap-1.5 text-[11px] font-black text-violet-400 uppercase tracking-widest hover:text-violet-300 transition-colors">
                                            <PlusIcon className="w-3.5 h-3.5" /> Add Term
                                        </button>
                                    </div>
                                )}

                                {/* ── Table ── */}
                                {block.type === 'table' && (
                                    <div className="space-y-2 overflow-x-auto">
                                        <div className="flex gap-2 min-w-[360px]">
                                            <input value={block.col1_header || ''} onChange={e => updateBlock(i, { col1_header: e.target.value })} placeholder="Column 1 header"
                                                className="flex-1 bg-muted border border-border rounded-lg px-3 py-1.5 text-[11px] font-black text-foreground focus:outline-none focus:border-primary" />
                                            <input value={block.col2_header || ''} onChange={e => updateBlock(i, { col2_header: e.target.value })} placeholder="Column 2 header"
                                                className="flex-1 bg-muted border border-border rounded-lg px-3 py-1.5 text-[11px] font-black text-foreground focus:outline-none focus:border-primary" />
                                        </div>
                                        {(block.rows || []).map((row, rIdx) => (
                                            <div key={rIdx} className="flex gap-2 min-w-[360px]">
                                                <input value={row.col1} onChange={e => { const next = [...(block.rows || [])]; next[rIdx] = { ...next[rIdx], col1: e.target.value }; updateBlock(i, { rows: next }); }} placeholder="Cell…"
                                                    className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none" />
                                                <input value={row.col2} onChange={e => { const next = [...(block.rows || [])]; next[rIdx] = { ...next[rIdx], col2: e.target.value }; updateBlock(i, { rows: next }); }} placeholder="Cell…"
                                                    className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none" />
                                                <button type="button" onClick={() => updateBlock(i, { rows: (block.rows || []).filter((_, idx) => idx !== rIdx) })}
                                                    className="p-1.5 hover:text-rose-400 text-muted-foreground/30 rounded-lg shrink-0">
                                                    <TrashIcon className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        <button type="button" onClick={() => updateBlock(i, { rows: [...(block.rows || []), { col1: '', col2: '' }] })}
                                            className="flex items-center gap-1.5 text-[11px] font-black text-violet-400 uppercase tracking-widest hover:text-violet-300 transition-colors">
                                            <PlusIcon className="w-3.5 h-3.5" /> Add Row
                                        </button>
                                    </div>
                                )}

                                {/* ── Columns ── */}
                                {block.type === 'columns' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Left Column</p>
                                            <textarea rows={5} value={block.left || ''} onChange={e => updateBlock(i, { left: e.target.value })} placeholder="Left column content…"
                                                className="w-full bg-muted/30 border border-border rounded-xl p-3 text-sm text-foreground focus:outline-none focus:border-primary resize-none placeholder:text-muted-foreground/40" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Right Column</p>
                                            <textarea rows={5} value={block.right || ''} onChange={e => updateBlock(i, { right: e.target.value })} placeholder="Right column content…"
                                                className="w-full bg-muted/30 border border-border rounded-xl p-3 text-sm text-foreground focus:outline-none focus:border-primary resize-none placeholder:text-muted-foreground/40" />
                                        </div>
                                    </div>
                                )}

                                {/* ── Video ── */}
                                {block.type === 'video' && (
                                    <div className="space-y-2">
                                        <input type="text" value={block.url || ''} onChange={e => updateBlock(i, { url: e.target.value })}
                                            placeholder="YouTube, Vimeo or direct video URL…"
                                            className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40" />
                                        <input type="text" value={block.caption || ''} onChange={e => updateBlock(i, { caption: e.target.value })}
                                            placeholder="Caption (optional)…"
                                            className="w-full bg-transparent border-b border-border py-1.5 text-xs text-muted-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/30" />
                                    </div>
                                )}

                                {/* ── File ── */}
                                {block.type === 'file' && (
                                    <div className="space-y-2">
                                        <input type="text" value={block.url || ''} onChange={e => updateBlock(i, { url: e.target.value })}
                                            placeholder="Download URL (Google Drive, etc.)…"
                                            className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40" />
                                        <input type="text" value={block.fileName || ''} onChange={e => updateBlock(i, { fileName: e.target.value })}
                                            placeholder="Display name (e.g. Study Guide.pdf)…"
                                            className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40" />
                                    </div>
                                )}

                                {/* ── Mermaid ── */}
                                {block.type === 'mermaid' && (
                                    <div className="space-y-3">
                                        {/* Template picker */}
                                        <div className="flex gap-2 flex-wrap">
                                            {MERMAID_TEMPLATES.map(t => (
                                                <button key={t.label} type="button"
                                                    onClick={() => updateBlock(i, { code: t.code })}
                                                    className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest bg-muted border border-border rounded-lg hover:border-violet-500/40 hover:text-violet-400 transition-all">
                                                    <LayoutTemplateIcon className="w-3 h-3" /> {t.label}
                                                </button>
                                            ))}
                                        </div>
                                        <textarea value={block.code || ''} onChange={e => updateBlock(i, { code: e.target.value })}
                                            placeholder={'flowchart TD\n    A[Start] --> B{Decision?}\n    B -- Yes --> C[Action]'}
                                            className="w-full bg-[#1a1a2e] text-cyan-300 p-4 rounded-xl border border-border font-mono text-sm min-h-[140px] focus:outline-none focus:border-violet-500 resize-y" />
                                        <p className="text-[10px] text-muted-foreground/40">Mermaid diagram syntax · <a href="https://mermaid.js.org/syntax/flowchart.html" target="_blank" rel="noopener noreferrer" className="text-violet-400/60 hover:text-violet-400 transition-colors">Docs ↗</a></p>
                                    </div>
                                )}

                                {/* ── Math ── */}
                                {block.type === 'math' && (
                                    <div className="space-y-3">
                                        {/* Formula templates */}
                                        <div className="flex gap-2 flex-wrap">
                                            {MATH_TEMPLATES.map(t => (
                                                <button key={t.label} type="button"
                                                    onClick={() => updateBlock(i, { formula: t.formula })}
                                                    className="px-2.5 py-1 text-[10px] font-black bg-muted border border-border rounded-lg hover:border-indigo-500/40 hover:text-indigo-400 transition-all">
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>
                                        <input type="text" value={block.formula || ''} onChange={e => updateBlock(i, { formula: e.target.value })}
                                            placeholder="LaTeX formula e.g. E = mc^2"
                                            className="w-full bg-[#1a1a2e] text-white p-4 rounded-xl border border-border font-mono text-lg focus:outline-none focus:border-indigo-500" />
                                        <p className="text-[10px] text-muted-foreground/40">LaTeX syntax · fractions: \frac{"{a}"}{"{b}"} · powers: x^2 · roots: \sqrt{"{x}"}</p>
                                    </div>
                                )}

                                {/* ── Quiz ── */}
                                {block.type === 'quiz' && (
                                    <div className="space-y-4">
                                        <textarea rows={2} value={block.question || ''} onChange={e => updateBlock(i, { question: e.target.value })}
                                            placeholder="Quiz question…"
                                            className="w-full bg-muted/30 border border-border rounded-xl p-3 text-sm font-bold text-foreground focus:outline-none focus:border-primary resize-none placeholder:text-muted-foreground/40" />
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {(block.options || ['', '', '', '']).map((opt: string, optIdx: number) => (
                                                <div key={optIdx} className="flex items-center gap-2">
                                                    <input type="radio" name={`quiz-${i}-correct`} checked={block.correct_answer === opt && opt !== ''}
                                                        onChange={() => updateBlock(i, { correct_answer: opt })}
                                                        className="accent-emerald-500 w-4 h-4 shrink-0" />
                                                    <input type="text" value={opt} onChange={e => { const newOpts = [...(block.options || ['', '', '', ''])]; newOpts[optIdx] = e.target.value; updateBlock(i, { options: newOpts }); }}
                                                        placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                                                        className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder:text-muted-foreground/30" />
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground/40">Click the radio button to mark the correct answer</p>
                                        <textarea rows={2} value={block.instructions || ''} onChange={e => updateBlock(i, { instructions: e.target.value })}
                                            placeholder="Explanation shown after answer (optional)…"
                                            className="w-full bg-muted/30 border border-border rounded-xl p-3 text-sm text-muted-foreground focus:outline-none focus:border-primary resize-none placeholder:text-muted-foreground/30" />
                                    </div>
                                )}

                                {/* ── Activity ── */}
                                {block.type === 'activity' && (
                                    <div className="space-y-4">
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                            <input type="text" value={block.title || ''} onChange={e => updateBlock(i, { title: e.target.value })}
                                                placeholder="Activity title (e.g. Coding Challenge)…"
                                                className="flex-1 bg-transparent border-b border-border py-1.5 text-sm font-bold text-foreground focus:outline-none focus:border-emerald-500 placeholder:text-muted-foreground/40" />
                                            <label className="flex items-center gap-2 text-[11px] text-emerald-400 font-black uppercase tracking-widest shrink-0 cursor-pointer">
                                                <input type="checkbox" checked={block.is_coding} onChange={e => updateBlock(i, { is_coding: e.target.checked })} className="accent-emerald-500 w-4 h-4" />
                                                Coding Lab
                                            </label>
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest">Action Steps</p>
                                            {(block.steps || ['', '']).map((s, sIdx) => (
                                                <div key={sIdx} className="flex items-center gap-2">
                                                    <span className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center text-[10px] font-black text-emerald-400 shrink-0">{sIdx + 1}</span>
                                                    <input value={s} onChange={e => { const next = [...(block.steps || [])]; next[sIdx] = e.target.value; updateBlock(i, { steps: next }); }}
                                                        placeholder={`Step ${sIdx + 1}…`}
                                                        className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-emerald-500 placeholder:text-muted-foreground/30" />
                                                    <button type="button" onClick={() => { const next = (block.steps || []).filter((_, idx) => idx !== sIdx); updateBlock(i, { steps: next }); }}
                                                        className="p-1.5 hover:text-rose-400 text-muted-foreground/30 rounded-lg shrink-0">
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                            <button type="button" onClick={() => updateBlock(i, { steps: [...(block.steps || []), ''] })}
                                                className="flex items-center gap-1.5 text-[11px] font-black text-emerald-400 uppercase tracking-widest hover:text-emerald-300 transition-colors">
                                                <PlusIcon className="w-3.5 h-3.5" /> Add Step
                                            </button>
                                        </div>
                                        {block.is_coding && (
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest">Starter Code</p>
                                                <textarea rows={4} value={block.initialCode || ''} onChange={e => updateBlock(i, { initialCode: e.target.value })}
                                                    placeholder="Initial code for the workspace…"
                                                    className="w-full bg-[#1a1a2e] border border-border rounded-xl p-3 text-xs font-mono text-cyan-400 focus:outline-none resize-y" />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── Visualizer ── */}
                                {block.type === 'visualizer' && (
                                    <div className="space-y-4 p-4 bg-cyan-500/5 rounded-xl border border-cyan-500/10">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <div>
                                                <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest mb-1">Sketch Type</p>
                                                <select value={block.visualType} onChange={e => {
                                                    const t = e.target.value;
                                                    const presets: Record<string, any> = {
                                                        sorting: { totalSteps: 8, variables: { i: 0, j: 1 }, visualizationState: { array: [42, 15, 7, 33, 1, 28, 19, 50], comparing: [0, 1] } },
                                                        physics: { totalSteps: 12, variables: { ball: 0 }, visualizationState: { balls: [{ x: 0.3, y: 0.15, vx: 2, vy: 0, radius: 20, hue: 120 }, { x: 0.6, y: 0.12, vx: -1.5, vy: 0, radius: 16, hue: 200 }] } },
                                                        loops: { totalSteps: 8, variables: { i: 0 }, visualizationState: { iterations: [0, 1, 2, 3, 4, 5, 6, 7] } },
                                                        turtle: { totalSteps: 6, variables: { x: 0, y: 0 }, visualizationState: { turtle: { x: 0.5, y: 0.5, hue: 180, path: [{ x: 0.2, y: 0.5 }, { x: 0.5, y: 0.2 }, { x: 0.8, y: 0.5 }] } } },
                                                        stateMachine: { totalSteps: 4, variables: { state: 0 }, visualizationState: { states: [{ label: 'IDLE', x: 0.2, y: 0.5 }, { label: 'INIT', x: 0.42, y: 0.25 }, { label: 'RUN', x: 0.65, y: 0.25 }, { label: 'DONE', x: 0.82, y: 0.5 }], connections: [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 0 }] } },
                                                    };
                                                    updateBlock(i, { visualType: t, visualData: presets[t] ?? block.visualData });
                                                }}
                                                    className="bg-muted border border-border rounded-lg px-3 py-1.5 text-[11px] text-cyan-400 font-bold outline-none">
                                                    {['sorting', 'physics', 'loops', 'turtle', 'stateMachine'].map(t => (
                                                        <option key={t} value={t}>{t === 'stateMachine' ? 'State Machine' : t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest mb-1">Steps</p>
                                                <input type="number" min={1} max={100} value={block.visualData?.totalSteps ?? 8}
                                                    onChange={e => updateBlock(i, { visualData: { ...block.visualData, totalSteps: Math.max(1, parseInt(e.target.value) || 1) } })}
                                                    className="w-20 bg-muted border border-border rounded-lg px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-cyan-500" />
                                            </div>
                                        </div>
                                        {block.visualType === 'sorting' && (
                                            <div>
                                                <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest mb-1">Array values (comma-separated)</p>
                                                <input type="text" value={(block.visualData?.visualizationState?.array || []).join(', ')}
                                                    onChange={e => { const arr = e.target.value.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n)); if (arr.length > 0) updateBlock(i, { visualData: { ...block.visualData, visualizationState: { ...block.visualData?.visualizationState, array: arr } } }); }}
                                                    placeholder="42, 15, 7, 33, 1, 28"
                                                    className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-[11px] text-foreground outline-none focus:border-cyan-500" />
                                            </div>
                                        )}
                                        <p className="text-[10px] text-muted-foreground/30 leading-relaxed">The visualizer auto-plays the sketch. Pick the type that best illustrates your concept, then students hit play.</p>
                                    </div>
                                )}

                                {/* ── Motion Graphics ── */}
                                {block.type === 'motion-graphics' && (
                                    <div className="space-y-3 p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                                        <div className="flex flex-wrap gap-4">
                                            <div>
                                                <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest mb-1">Animation Type</p>
                                                <select value={block.animationType} onChange={e => updateBlock(i, { animationType: e.target.value })}
                                                    className="bg-muted border border-border rounded-lg px-3 py-1.5 text-[11px] text-indigo-300 font-bold outline-none">
                                                    {[
                                                        { v: 'orbit', l: 'Orbit (hierarchy)' },
                                                        { v: 'flow', l: 'Flow (process steps)' },
                                                        { v: 'network', l: 'Network (concept map)' },
                                                        { v: 'pulse', l: 'Pulse (emphasis)' },
                                                        { v: 'wave', l: 'Wave (signal/frequency)' },
                                                        { v: 'particles', l: 'Particles (dynamic)' },
                                                        { v: 'timeline', l: 'Timeline (chronological)' },
                                                    ].map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest mb-1">Nodes</p>
                                                <input type="number" value={block.config?.nodes || 3} onChange={e => updateBlock(i, { config: { ...block.config, nodes: parseInt(e.target.value) } })}
                                                    className="w-20 bg-muted border border-border rounded-lg px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-indigo-500" />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── D3 Chart ── */}
                                {block.type === 'd3-chart' && (
                                    <div className="space-y-3 p-4 bg-primary/5 rounded-xl border border-primary/10">
                                        <div className="flex flex-wrap gap-3">
                                            <div>
                                                <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest mb-1">Chart Type</p>
                                                <select value={block.chartType} onChange={e => updateBlock(i, { chartType: e.target.value })}
                                                    className="bg-muted border border-border rounded-lg px-3 py-1.5 text-[11px] text-primary font-bold outline-none">
                                                    {['bar', 'line', 'pie', 'area'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <input type="text" value={(block.dataset || []).join(', ')} onChange={e => updateBlock(i, { dataset: e.target.value.split(',').map(n => parseFloat(n.trim()) || 0) })}
                                            placeholder="Data values: 10, 20, 30, 40"
                                            className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-[11px] text-foreground focus:outline-none focus:border-primary" />
                                        <input type="text" value={(block.labels || []).join(', ')} onChange={e => updateBlock(i, { labels: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                            placeholder="Labels (optional): Jan, Feb, Mar"
                                            className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-[11px] text-muted-foreground focus:outline-none focus:border-primary" />
                                        <input type="text" value={block.title || ''} onChange={e => updateBlock(i, { title: e.target.value })}
                                            placeholder="Chart title…"
                                            className="w-full bg-transparent border-b border-border py-1.5 text-sm font-bold text-foreground focus:outline-none focus:border-primary placeholder:text-muted-foreground/40" />
                                    </div>
                                )}

                                {/* ── Illustration / Infographic ── */}
                                {block.type === 'illustration' && (
                                    <div className="space-y-3 p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                                        <input type="text" value={block.title || ''} onChange={e => updateBlock(i, { title: e.target.value })}
                                            placeholder="Infographic title…"
                                            className="w-full bg-transparent border-b border-border py-1.5 text-sm font-bold text-foreground focus:outline-none focus:border-indigo-500 placeholder:text-muted-foreground/40" />
                                        <div className="space-y-2">
                                            {(block.items || []).map((item, itemIdx) => (
                                                <div key={itemIdx} className="flex gap-2">
                                                    <input value={item.label} placeholder="Label" onChange={e => { const next = [...(block.items || [])]; next[itemIdx].label = e.target.value; updateBlock(i, { items: next }); }}
                                                        className="flex-1 bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none" />
                                                    <input value={item.value} placeholder="Value" onChange={e => { const next = [...(block.items || [])]; next[itemIdx].value = e.target.value; updateBlock(i, { items: next }); }}
                                                        className="flex-1 bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none" />
                                                    <button type="button" onClick={() => updateBlock(i, { items: (block.items || []).filter((_, idx) => idx !== itemIdx) })}
                                                        className="p-1.5 hover:text-rose-400 text-muted-foreground/30 rounded-lg"><TrashIcon className="w-3.5 h-3.5" /></button>
                                                </div>
                                            ))}
                                        </div>
                                        <button type="button" onClick={() => updateBlock(i, { items: [...(block.items || []), { label: '', value: '' }] })}
                                            className="flex items-center gap-1.5 text-[11px] font-black text-indigo-400 uppercase tracking-widest hover:text-indigo-300 transition-colors">
                                            <PlusIcon className="w-3.5 h-3.5" /> Add Item
                                        </button>
                                    </div>
                                )}

                                {/* ── Code Map / Architecture ── */}
                                {block.type === 'code-map' && (
                                    <div className="space-y-3 p-4 bg-cyan-500/5 rounded-xl border border-cyan-500/10">
                                        <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Architectural Components</p>
                                        {(block.components || []).map((comp, compIdx) => (
                                            <div key={compIdx} className="space-y-2 p-3 bg-muted rounded-xl border border-border">
                                                <div className="flex items-center gap-2">
                                                    <input value={comp.name} placeholder="Component name…" onChange={e => { const next = [...(block.components || [])]; next[compIdx].name = e.target.value; updateBlock(i, { components: next }); }}
                                                        className="flex-1 bg-transparent border-b border-border py-1 text-sm font-bold text-foreground focus:outline-none focus:border-cyan-500 placeholder:text-muted-foreground/40" />
                                                    <button type="button" onClick={() => updateBlock(i, { components: (block.components || []).filter((_, idx) => idx !== compIdx) })}
                                                        className="p-1 hover:text-rose-400 text-muted-foreground/30"><TrashIcon className="w-3.5 h-3.5" /></button>
                                                </div>
                                                <textarea value={comp.description} placeholder="Description…" onChange={e => { const next = [...(block.components || [])]; next[compIdx].description = e.target.value; updateBlock(i, { components: next }); }}
                                                    className="w-full bg-transparent text-xs text-muted-foreground focus:outline-none h-14 resize-none" />
                                            </div>
                                        ))}
                                        <button type="button" onClick={() => updateBlock(i, { components: [...(block.components || []), { name: '', description: '' }] })}
                                            className="flex items-center gap-1.5 text-[11px] font-black text-cyan-400 uppercase tracking-widest hover:text-cyan-300 transition-colors">
                                            <PlusIcon className="w-3.5 h-3.5" /> Add Component
                                        </button>
                                    </div>
                                )}

                                {/* ── Assignment Block ── */}
                                {block.type === 'assignment-block' && (
                                    <div className="space-y-4 p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                                        <div className="flex items-center gap-2">
                                            <TrophyIcon className="w-4 h-4 text-emerald-400" />
                                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Capstone Project</p>
                                        </div>
                                        <input type="text" value={block.title || ''} onChange={e => updateBlock(i, { title: e.target.value })}
                                            placeholder="Project title…"
                                            className="w-full bg-transparent border-b border-border py-1.5 text-sm font-bold text-foreground focus:outline-none focus:border-emerald-500 placeholder:text-muted-foreground/40" />
                                        <textarea value={block.instructions || ''} onChange={e => updateBlock(i, { instructions: e.target.value })}
                                            placeholder="Project instructions and context…"
                                            className="w-full bg-muted/30 border border-border rounded-xl p-3 text-sm text-muted-foreground focus:outline-none h-24 resize-y placeholder:text-muted-foreground/30" />
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-widest">Deliverables</p>
                                            {(block.deliverables || []).map((del, delIdx) => (
                                                <div key={delIdx} className="flex items-center gap-2">
                                                    <input value={del} onChange={e => { const next = [...(block.deliverables || [])]; next[delIdx] = e.target.value; updateBlock(i, { deliverables: next }); }}
                                                        placeholder={`Deliverable ${delIdx + 1}…`}
                                                        className="flex-1 bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-emerald-500 placeholder:text-muted-foreground/30" />
                                                    <button type="button" onClick={() => updateBlock(i, { deliverables: (block.deliverables || []).filter((_, idx) => idx !== delIdx) })}
                                                        className="p-1.5 hover:text-rose-400 text-muted-foreground/30 rounded-lg">
                                                        <TrashIcon className="w-3.5 h-3.5" /></button>
                                                </div>
                                            ))}
                                            <button type="button" onClick={() => updateBlock(i, { deliverables: [...(block.deliverables || []), ''] })}
                                                className="flex items-center gap-1.5 text-[11px] font-black text-emerald-400 uppercase tracking-widest hover:text-emerald-300 transition-colors">
                                                <PlusIcon className="w-3.5 h-3.5" /> Add Deliverable
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ── Scratch ── */}
                                {block.type === 'scratch' && (
                                    <div className="space-y-2 p-4 bg-rose-500/5 rounded-xl border border-rose-500/10">
                                        <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Scratch Project</p>
                                        <input type="text" value={block.projectId || ''} onChange={e => updateBlock(i, { projectId: e.target.value })}
                                            placeholder="Scratch project ID or URL…"
                                            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-rose-500 placeholder:text-muted-foreground/40" />
                                        <p className="text-[10px] text-muted-foreground/30">Share your Scratch project and paste the ID or URL here.</p>
                                    </div>
                                )}

                            </div>{/* /block editor body */}
                        </div>
                    );
                })}
            </div>{/* /block list */}
        </div>
    );
}

/* ─── Preview renderer ─────────────────────────────────────────────────────── */

function PreviewBlock({ block }: { block: Block }) {
    const calloutStyles: Record<string, string> = {
        info: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
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
                <blockquote className="border-l-4 border-primary pl-4 space-y-1">
                    <p className="text-base italic text-foreground/90">"{block.content}"</p>
                    {block.author && <p className="text-xs font-bold text-primary">— {block.author}</p>}
                </blockquote>
            );
        case 'callout':
            return (
                <div className={`flex gap-3 p-4 border rounded-xl text-sm ${calloutStyles[block.style || 'info']}`}>
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
                                <span className="shrink-0 w-6 h-6 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-400 text-[10px] font-black flex items-center justify-center">{i + 1}</span>
                                <span className="pt-0.5">{s}</span>
                            </li>
                        ))}
                    </ol>
                </div>
            );
        case 'key-terms':
            return (
                <div className="space-y-2">
                    {block.title && <p className="text-xs font-black uppercase tracking-widest text-cyan-400">{block.title}</p>}
                    <dl className="space-y-2">
                        {(block.terms || []).map((t, i) => (
                            <div key={i} className="flex gap-4 p-3 bg-muted/20 rounded-lg border border-border">
                                <dt className="text-sm font-bold text-foreground w-[30%] shrink-0">{t.term || <span className="text-muted-foreground italic">Term</span>}</dt>
                                <dd className="text-sm text-foreground/70 flex-1">{t.definition || <span className="text-muted-foreground italic">Definition</span>}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            );
        case 'table':
            return (
                <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-muted/50">
                                <th className="text-left px-4 py-2.5 font-black text-foreground text-[11px] uppercase tracking-widest border-b border-border">{block.col1_header || 'Column 1'}</th>
                                <th className="text-left px-4 py-2.5 font-black text-foreground text-[11px] uppercase tracking-widest border-b border-border">{block.col2_header || 'Column 2'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(block.rows || []).map((row, i) => (
                                <tr key={i} className={i % 2 === 1 ? 'bg-muted/10' : ''}>
                                    <td className="px-4 py-2.5 border-b border-border/50 text-foreground/80 last:border-0">{row.col1}</td>
                                    <td className="px-4 py-2.5 border-b border-border/50 text-foreground/80 last:border-0">{row.col2}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case 'columns':
            return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="text-sm text-foreground/80 whitespace-pre-wrap">{block.left || <span className="text-muted-foreground italic">Left column</span>}</div>
                    <div className="text-sm text-foreground/80 whitespace-pre-wrap border-t sm:border-t-0 sm:border-l border-border pt-4 sm:pt-0 sm:pl-6">{block.right || <span className="text-muted-foreground italic">Right column</span>}</div>
                </div>
            );
        case 'code':
            return (
                <pre className="bg-[#0d0d1a] border border-border rounded-xl p-4 overflow-x-auto text-xs font-mono text-cyan-300 leading-relaxed">
                    <code>{block.content}</code>
                </pre>
            );
        case 'image':
            return block.url ? (
                <figure className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={block.url} alt={block.caption || ''} className="max-w-full rounded-xl border border-border" />
                    {block.caption && <figcaption className="text-xs text-muted-foreground italic text-center">{block.caption}</figcaption>}
                </figure>
            ) : <p className="text-muted-foreground text-xs italic">[Image block — no URL set]</p>;
        case 'video':
            return block.url ? (
                <div className="space-y-1">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">📹 Video</p>
                    <a href={block.url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline break-all">{block.caption || block.url}</a>
                </div>
            ) : <p className="text-xs text-muted-foreground italic">[Video — no URL set]</p>;
        case 'quiz':
            return (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-black uppercase tracking-widest text-primary">Quick Check</p>
                    <p className="text-sm font-bold text-foreground">{block.question}</p>
                    <ul className="space-y-1.5">
                        {(block.options || []).filter(Boolean).map((opt, i) => (
                            <li key={i} className={`text-sm px-3 py-1.5 rounded-lg border ${opt === block.correct_answer ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-border text-foreground/70'}`}>
                                {opt === block.correct_answer ? '✓ ' : `${String.fromCharCode(65 + i)}. `}{opt}
                            </li>
                        ))}
                    </ul>
                </div>
            );
        case 'activity':
            return (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-2">
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
            return <p className="font-serif text-lg text-center py-3 text-foreground border border-border rounded-xl bg-muted/10">{block.formula}</p>;
        case 'file':
            return block.url ? (
                <a href={block.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                    📎 {block.fileName || 'Download Resource'}
                </a>
            ) : <p className="text-xs text-muted-foreground italic">[File — no URL set]</p>;
        case 'illustration':
            return (
                <div className="border border-indigo-500/20 bg-indigo-500/5 rounded-xl p-4 space-y-2">
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
            return (
                <div className="border border-border rounded-xl bg-card p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{block.type}</p>
                    {block.content && <p className="text-sm text-foreground/80 whitespace-pre-line">{block.content}</p>}
                </div>
            );
    }
}
