'use client';

import React, { useCallback, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BlockSequencerProps {
  blocks: string[];
  value: string;
  onChange: (val: string) => void;
  readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Category detection
// ---------------------------------------------------------------------------

type BlockCategory =
  | 'control'
  | 'motion'
  | 'looks'
  | 'sound'
  | 'event'
  | 'operator'
  | 'default';

const CATEGORY_KEYWORDS: { category: BlockCategory; keywords: string[] }[] = [
  {
    category: 'control',
    keywords: ['when', 'if', 'repeat', 'forever', 'wait', 'until', 'stop', 'else'],
  },
  {
    category: 'motion',
    keywords: ['move', 'turn', 'point', 'go to', 'goto', 'glide', 'set x', 'set y', 'change x', 'change y', 'bounce'],
  },
  {
    category: 'looks',
    keywords: ['say', 'think', 'show', 'hide', 'switch', 'costume', 'backdrop', 'size', 'effect', 'clear'],
  },
  {
    category: 'sound',
    keywords: ['play', 'sound', 'stop sound', 'volume', 'tempo', 'note', 'instrument'],
  },
  {
    category: 'event',
    keywords: ['clicked', 'start', 'broadcast', 'receive', 'key pressed', 'flag', 'message'],
  },
  {
    category: 'operator',
    keywords: ['and', 'or', 'not', ' + ', ' - ', ' * ', ' / ', ' = ', ' > ', ' < ', 'mod', 'abs', 'sqrt', 'join', 'letter', 'length', 'contains'],
  },
];

function detectCategory(block: string): BlockCategory {
  const lower = block.toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return category;
    }
  }
  return 'default';
}

// ---------------------------------------------------------------------------
// Colour lookup maps (static classes — Tailwind JIT safe)
// ---------------------------------------------------------------------------

const CATEGORY_BG: Record<BlockCategory, string> = {
  control: 'bg-primary',
  motion: 'bg-primary',
  looks: 'bg-purple-500',
  sound: 'bg-pink-500',
  event: 'bg-yellow-400',
  operator: 'bg-green-500',
  default: 'bg-slate-500',
};

const CATEGORY_TEXT: Record<BlockCategory, string> = {
  control: 'text-white',
  motion: 'text-white',
  looks: 'text-white',
  sound: 'text-white',
  event: 'text-black',
  operator: 'text-white',
  default: 'text-white',
};

const CATEGORY_BORDER: Record<BlockCategory, string> = {
  control: 'border-primary/90',
  motion: 'border-primary',
  looks: 'border-purple-700',
  sound: 'border-pink-700',
  event: 'border-yellow-600',
  operator: 'border-green-700',
  default: 'border-slate-700',
};

const CATEGORY_HOVER: Record<BlockCategory, string> = {
  control: 'hover:bg-primary',
  motion: 'hover:bg-primary',
  looks: 'hover:bg-purple-600',
  sound: 'hover:bg-pink-600',
  event: 'hover:bg-yellow-500',
  operator: 'hover:bg-green-600',
  default: 'hover:bg-slate-600',
};

const CATEGORY_LABEL: Record<BlockCategory, string> = {
  control: 'Control',
  motion: 'Motion',
  looks: 'Looks',
  sound: 'Sound',
  event: 'Events',
  operator: 'Operators',
  default: 'Other',
};

// ---------------------------------------------------------------------------
// Drag-and-drop state
// ---------------------------------------------------------------------------

interface DragState {
  fromIndex: number;
  overIndex: number | null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface PoolBlockProps {
  block: string;
  category: BlockCategory;
  dimmed: boolean;
  disabled: boolean;
  onClick: () => void;
}

function PoolBlock({ block, category, dimmed, disabled, onClick }: PoolBlockProps) {
  const bg = CATEGORY_BG[category];
  const text = CATEGORY_TEXT[category];
  const border = CATEGORY_BORDER[category];
  const hover = disabled ? '' : CATEGORY_HOVER[category];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`Add "${block}" to sequence`}
      className={[
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-mono font-semibold',
        'border-2 rounded-xl select-none transition-all duration-150',
        bg,
        text,
        border,
        hover,
        dimmed ? 'opacity-40' : 'opacity-100',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer active:scale-95',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="w-2 h-2 rounded-full bg-white/40 flex-shrink-0" />
      {block}
    </button>
  );
}

interface SequenceBlockProps {
  block: string;
  index: number;
  total: number;
  category: BlockCategory;
  disabled: boolean;
  isDragOver: boolean;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function SequenceBlock({
  block,
  index,
  total,
  category,
  disabled,
  isDragOver,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: SequenceBlockProps) {
  const bg = CATEGORY_BG[category];
  const text = CATEGORY_TEXT[category];
  const border = CATEGORY_BORDER[category];

  return (
    <div
      draggable={!disabled}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={[
        'flex items-center gap-2 px-3 py-2 border-2 rounded-xl',
        'transition-all duration-150 select-none',
        bg,
        text,
        border,
        isDragOver ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent scale-[1.02]' : '',
        disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Index badge */}
      <span
        className={[
          'flex-shrink-0 w-6 h-6 rounded-xl flex items-center justify-center',
          'text-xs font-bold bg-black/20',
        ].join(' ')}
      >
        {index + 1}
      </span>

      {/* Drag handle dots */}
      {!disabled && (
        <span className="flex-shrink-0 flex flex-col gap-0.5 opacity-50">
          <span className="flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-current" />
            <span className="w-1 h-1 rounded-full bg-current" />
          </span>
          <span className="flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-current" />
            <span className="w-1 h-1 rounded-full bg-current" />
          </span>
        </span>
      )}

      {/* Block label */}
      <span className="flex-1 font-mono font-semibold text-sm truncate">{block}</span>

      {/* Up / Down / Remove controls */}
      {!disabled && (
        <span className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            title="Move up"
            className="w-6 h-6 flex items-center justify-center rounded-xl bg-black/20 hover:bg-black/40 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M8 4l-5 6h10L8 4z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            title="Move down"
            className="w-6 h-6 flex items-center justify-center rounded-xl bg-black/20 hover:bg-black/40 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M8 12l5-6H3l5 6z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Remove block"
            className="w-6 h-6 flex items-center justify-center rounded-xl bg-black/20 hover:bg-red-600 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function BlockSequencer({
  blocks,
  value,
  onChange,
  readOnly = false,
}: BlockSequencerProps) {
  // Parse current sequence from comma-separated value
  const sequence: string[] = value
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  // Derive a set of blocks already in sequence for dimming
  const sequenceSet = new Set(sequence);

  // Category memoisation
  const categoryCache = useRef<Map<string, BlockCategory>>(new Map());
  const getCategory = useCallback((block: string): BlockCategory => {
    if (!categoryCache.current.has(block)) {
      categoryCache.current.set(block, detectCategory(block));
    }
    return categoryCache.current.get(block)!;
  }, []);

  // Drag state
  const [drag, setDrag] = useState<DragState | null>(null);

  // Derive grouped blocks for the pool legend
  const groupedBlocks: Partial<Record<BlockCategory, string[]>> = {};
  for (const block of blocks) {
    const cat = getCategory(block);
    if (!groupedBlocks[cat]) groupedBlocks[cat] = [];
    groupedBlocks[cat]!.push(block);
  }
  const allCategories = Object.keys(groupedBlocks) as BlockCategory[];

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleAddBlock(block: string) {
    if (readOnly) return;
    const next = [...sequence, block];
    onChange(next.join(', '));
  }

  function handleRemove(index: number) {
    if (readOnly) return;
    const next = sequence.filter((_, i) => i !== index);
    onChange(next.join(', '));
  }

  function handleMoveUp(index: number) {
    if (readOnly || index === 0) return;
    const next = [...sequence];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next.join(', '));
  }

  function handleMoveDown(index: number) {
    if (readOnly || index === sequence.length - 1) return;
    const next = [...sequence];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next.join(', '));
  }

  function handleClearAll() {
    if (readOnly) return;
    onChange('');
  }

  // Drag reorder
  function handleDragStart(e: React.DragEvent, fromIndex: number) {
    e.dataTransfer.effectAllowed = 'move';
    setDrag({ fromIndex, overIndex: null });
  }

  function handleDragOver(e: React.DragEvent, overIndex: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDrag((prev) => (prev ? { ...prev, overIndex } : null));
  }

  function handleDrop(e: React.DragEvent, toIndex: number) {
    e.preventDefault();
    if (!drag) return;
    const { fromIndex } = drag;
    if (fromIndex === toIndex) {
      setDrag(null);
      return;
    }
    const next = [...sequence];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange(next.join(', '));
    setDrag(null);
  }

  function handleDragEnd() {
    setDrag(null);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-0 border-2 border-border rounded-xl overflow-hidden bg-background">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          {/* Scratch-like notch icon */}
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-primary">
            <rect x="2" y="6" width="20" height="4" rx="1" fill="currentColor" opacity="0.8" />
            <rect x="2" y="14" width="20" height="4" rx="1" fill="currentColor" opacity="0.5" />
            <path d="M6 6 Q8 3 10 6" fill="currentColor" />
          </svg>
          <span className="text-sm font-bold text-foreground uppercase tracking-widest">
            Block Sequencer
          </span>
        </div>
        {!readOnly && sequence.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="text-xs font-semibold text-muted-foreground hover:text-red-400 transition-colors uppercase tracking-wider px-2 py-1 border border-border rounded-xl hover:border-red-400"
          >
            Clear All
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Block Pool                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="p-4 border-b border-border bg-background">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          Available Blocks — {readOnly ? 'View only' : 'Click to add to sequence'}
        </p>

        {allCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No blocks available.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {allCategories.map((cat) => (
              <div key={cat} className="flex flex-wrap items-start gap-1.5">
                {/* Category label */}
                <span
                  className={[
                    'flex-shrink-0 text-[10px] font-bold uppercase tracking-widest px-1.5 py-1',
                    'border rounded-xl self-center',
                    CATEGORY_BG[cat],
                    CATEGORY_TEXT[cat],
                    CATEGORY_BORDER[cat],
                  ].join(' ')}
                >
                  {CATEGORY_LABEL[cat]}
                </span>
                {groupedBlocks[cat]!.map((block) => (
                  <PoolBlock
                    key={block}
                    block={block}
                    category={cat}
                    dimmed={sequenceSet.has(block)}
                    disabled={readOnly}
                    onClick={() => handleAddBlock(block)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Sequence Tray                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="p-4 bg-card">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Your Sequence
          </p>
          {sequence.length > 0 && (
            <span className="text-xs text-muted-foreground font-mono">
              {sequence.length} block{sequence.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {sequence.length === 0 ? (
          <div
            className={[
              'flex flex-col items-center justify-center gap-2 py-10',
              'border-2 border-dashed border-border rounded-xl',
              readOnly ? '' : 'text-muted-foreground',
            ].join(' ')}
          >
            {/* Empty state illustration */}
            <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10 opacity-30">
              <rect x="4" y="18" width="40" height="8" rx="0" stroke="currentColor" strokeWidth="2" />
              <rect x="4" y="30" width="40" height="8" rx="0" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2" />
              <path d="M14 18 Q16 14 18 18" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
            <p className="text-sm text-muted-foreground">
              {readOnly ? 'No sequence provided.' : 'Click blocks above to build your sequence.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sequence.map((block, index) => {
              const cat = getCategory(block);
              const isDragOver = drag?.overIndex === index;
              return (
                <SequenceBlock
                  key={`${block}-${index}`}
                  block={block}
                  index={index}
                  total={sequence.length}
                  category={cat}
                  disabled={readOnly}
                  isDragOver={isDragOver}
                  onRemove={() => handleRemove(index)}
                  onMoveUp={() => handleMoveUp(index)}
                  onMoveDown={() => handleMoveDown(index)}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                />
              );
            })}
          </div>
        )}

        {/* Sequence value preview (useful for debugging / hidden input) */}
        {sequence.length > 0 && (
          <p className="mt-3 text-[10px] font-mono text-muted-foreground break-all opacity-60">
            {value}
          </p>
        )}
      </div>
    </div>
  );
}
