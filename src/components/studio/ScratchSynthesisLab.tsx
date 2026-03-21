'use client';

import React, { useState, useCallback, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

type ScratchCat =
  | 'event' | 'motion' | 'looks' | 'sound'
  | 'control' | 'sensing' | 'operator' | 'variable';

interface ScratchBlock {
  id: string;
  label: string;
  category: ScratchCat;
  shape: 'hat' | 'stack' | 'c-block' | 'reporter';
}

// ── Palette of blocks ────────────────────────────────────────────────────────

const PALETTE: Record<ScratchCat, { label: string; color: string; border: string; text: string; emoji: string; blocks: Omit<ScratchBlock, 'id'>[] }> = {
  event: {
    label: 'Events', color: '#FFD500', border: '#CC9900', text: '#1a1200', emoji: '🚩',
    blocks: [
      { label: 'when 🚩 clicked', category: 'event', shape: 'hat' },
      { label: 'when space key pressed', category: 'event', shape: 'hat' },
      { label: 'when this sprite clicked', category: 'event', shape: 'hat' },
      { label: 'broadcast [message1]', category: 'event', shape: 'stack' },
      { label: 'when I receive [message1]', category: 'event', shape: 'hat' },
    ],
  },
  motion: {
    label: 'Motion', color: '#4C97FF', border: '#2E6CC4', text: '#fff', emoji: '🔵',
    blocks: [
      { label: 'move (10) steps', category: 'motion', shape: 'stack' },
      { label: 'turn ↻ (15) degrees', category: 'motion', shape: 'stack' },
      { label: 'turn ↺ (15) degrees', category: 'motion', shape: 'stack' },
      { label: 'go to x: (0) y: (0)', category: 'motion', shape: 'stack' },
      { label: 'glide (1) secs to x: (0) y: (0)', category: 'motion', shape: 'stack' },
      { label: 'if on edge, bounce', category: 'motion', shape: 'stack' },
    ],
  },
  looks: {
    label: 'Looks', color: '#9966FF', border: '#6633CC', text: '#fff', emoji: '💬',
    blocks: [
      { label: 'say [Hello!] for (2) seconds', category: 'looks', shape: 'stack' },
      { label: 'say [Hello!]', category: 'looks', shape: 'stack' },
      { label: 'think [Hmm...] for (2) seconds', category: 'looks', shape: 'stack' },
      { label: 'switch costume to [costume1]', category: 'looks', shape: 'stack' },
      { label: 'next costume', category: 'looks', shape: 'stack' },
      { label: 'set size to (100) %', category: 'looks', shape: 'stack' },
      { label: 'show', category: 'looks', shape: 'stack' },
      { label: 'hide', category: 'looks', shape: 'stack' },
    ],
  },
  sound: {
    label: 'Sound', color: '#CF63CF', border: '#8E3A8E', text: '#fff', emoji: '🔊',
    blocks: [
      { label: 'play sound [pop] until done', category: 'sound', shape: 'stack' },
      { label: 'start sound [pop]', category: 'sound', shape: 'stack' },
      { label: 'stop all sounds', category: 'sound', shape: 'stack' },
      { label: 'set volume to (100) %', category: 'sound', shape: 'stack' },
    ],
  },
  control: {
    label: 'Control', color: '#FFAB19', border: '#CC7A00', text: '#fff', emoji: '🔄',
    blocks: [
      { label: 'wait (1) seconds', category: 'control', shape: 'stack' },
      { label: 'repeat (10)', category: 'control', shape: 'c-block' },
      { label: 'forever', category: 'control', shape: 'c-block' },
      { label: 'if <condition> then', category: 'control', shape: 'c-block' },
      { label: 'if <condition> then / else', category: 'control', shape: 'c-block' },
      { label: 'stop [all]', category: 'control', shape: 'stack' },
      { label: 'wait until <condition>', category: 'control', shape: 'stack' },
    ],
  },
  sensing: {
    label: 'Sensing', color: '#5CB1D6', border: '#2E7EA6', text: '#fff', emoji: '❓',
    blocks: [
      { label: 'ask [What\'s your name?] and wait', category: 'sensing', shape: 'stack' },
      { label: 'touching [mouse-pointer]?', category: 'sensing', shape: 'reporter' },
      { label: 'mouse x', category: 'sensing', shape: 'reporter' },
      { label: 'mouse y', category: 'sensing', shape: 'reporter' },
      { label: 'key [space] pressed?', category: 'sensing', shape: 'reporter' },
    ],
  },
  operator: {
    label: 'Operators', color: '#59C059', border: '#2E8E2E', text: '#fff', emoji: '➕',
    blocks: [
      { label: '(□) + (□)', category: 'operator', shape: 'reporter' },
      { label: '(□) - (□)', category: 'operator', shape: 'reporter' },
      { label: '(□) * (□)', category: 'operator', shape: 'reporter' },
      { label: '(□) / (□)', category: 'operator', shape: 'reporter' },
      { label: 'pick random (1) to (10)', category: 'operator', shape: 'reporter' },
      { label: 'join [hello] [world]', category: 'operator', shape: 'reporter' },
    ],
  },
  variable: {
    label: 'Variables', color: '#FF8C1A', border: '#CC5500', text: '#fff', emoji: '📦',
    blocks: [
      { label: 'set [my variable] to (0)', category: 'variable', shape: 'stack' },
      { label: 'change [my variable] by (1)', category: 'variable', shape: 'stack' },
      { label: 'show variable [my variable]', category: 'variable', shape: 'stack' },
      { label: 'hide variable [my variable]', category: 'variable', shape: 'stack' },
    ],
  },
};

const ALL_CATEGORIES = Object.keys(PALETTE) as ScratchCat[];

// ── Individual block visual ───────────────────────────────────────────────────

function BlockPiece({
  block, index, total, isDragOver, onRemove, draggable,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  block: ScratchBlock; index: number; total: number;
  isDragOver: boolean; onRemove?: () => void; draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const { color, border, text } = PALETTE[block.category];
  const isHat = block.shape === 'hat';
  const isCBlock = block.shape === 'c-block';
  const isLast = index === total - 1;

  return (
    <div
      style={{ position: 'relative', display: 'inline-block', marginBottom: isLast ? 0 : -1 }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* Top notch (puzzle in) — skip hat blocks and first block */}
      {!isHat && index > 0 && (
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
        backgroundColor: isDragOver ? `${color}cc` : color,
        border: `2px solid ${border}`,
        borderRadius: isHat ? '20px 20px 4px 4px' : '4px',
        paddingTop: isHat ? 10 : 8,
        paddingBottom: isLast ? 8 : 12,
        paddingLeft: isCBlock ? 10 : 14,
        paddingRight: 18,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minWidth: 180,
        boxShadow: `0 2px 0 ${border}`,
        cursor: draggable ? 'grab' : 'default',
        userSelect: 'none',
        transition: 'opacity 0.15s',
        outline: isDragOver ? `2px solid white` : 'none',
      }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>{PALETTE[block.category].emoji}</span>
        {/* Drag grip dots */}
        {draggable && (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, opacity: 0.5, flexShrink: 0 }}>
            <span style={{ display: 'flex', gap: 2 }}>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: text }} />
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: text }} />
            </span>
            <span style={{ display: 'flex', gap: 2 }}>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: text }} />
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: text }} />
            </span>
          </span>
        )}
        <span style={{
          color: text,
          fontSize: 12,
          fontWeight: 900,
          fontFamily: 'monospace',
          letterSpacing: '0.02em',
          textShadow: block.category === 'event' ? 'none' : '0 1px 1px rgba(0,0,0,0.3)',
          flex: 1,
        }}>
          {block.label}
        </span>
        {onRemove && (
          <button
            onClick={onRemove}
            style={{
              background: 'rgba(0,0,0,0.25)', border: 'none', color: text,
              width: 20, height: 20, borderRadius: 4, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, flexShrink: 0,
            }}
          >×</button>
        )}
      </div>

      {/* Bottom notch (puzzle out) — skip last */}
      {!isLast && (
        <div style={{
          position: 'absolute', bottom: 0, left: 20,
          width: 20, height: 4,
          backgroundColor: color,
          border: `2px solid ${border}`,
          borderTop: 'none',
          borderRadius: '0 0 4px 4px',
          zIndex: 3,
        }} />
      )}
    </div>
  );
}

// ── Main Scratch Lab ──────────────────────────────────────────────────────────

interface ScratchSynthesisLabProps {
  initialBlocks?: ScratchBlock[];
  onChange?: (blocks: ScratchBlock[]) => void;
  readOnly?: boolean;
}

let _idCounter = 0;
function mkId() { return `sb-${++_idCounter}-${Date.now()}`; }

export default function ScratchSynthesisLab({ initialBlocks, onChange, readOnly }: ScratchSynthesisLabProps) {
  const [activeCategory, setActiveCategory] = useState<ScratchCat>('event');
  const [sequence, setSequence] = useState<ScratchBlock[]>(initialBlocks ?? []);
  const [dragState, setDragState] = useState<{ fromIndex: number; overIndex: number | null } | null>(null);
  const [tab, setTab] = useState<'palette' | 'workspace'>('palette');

  const update = useCallback((blocks: ScratchBlock[]) => {
    setSequence(blocks);
    onChange?.(blocks);
  }, [onChange]);

  function addBlock(tmpl: Omit<ScratchBlock, 'id'>) {
    if (readOnly) return;
    update([...sequence, { ...tmpl, id: mkId() }]);
    setTab('workspace');
  }

  function removeBlock(idx: number) {
    if (readOnly) return;
    update(sequence.filter((_, i) => i !== idx));
  }

  function clearAll() {
    if (readOnly) return;
    update([]);
  }

  // Drag-reorder handlers
  function onDragStart(e: React.DragEvent, fromIndex: number) {
    e.dataTransfer.effectAllowed = 'move';
    setDragState({ fromIndex, overIndex: null });
  }
  function onDragOver(e: React.DragEvent, overIndex: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragState(prev => prev ? { ...prev, overIndex } : null);
  }
  function onDrop(e: React.DragEvent, toIndex: number) {
    e.preventDefault();
    if (!dragState) return;
    const { fromIndex } = dragState;
    if (fromIndex !== toIndex) {
      const next = [...sequence];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      update(next);
    }
    setDragState(null);
  }
  function onDragEnd() { setDragState(null); }

  const paletteCat = PALETTE[activeCategory];

  return (
    <div className="flex flex-col h-full bg-[#0f1117] text-white overflow-hidden">

      {/* ── Mobile tab toggle ── */}
      <div className="flex md:hidden border-b border-white/10 shrink-0">
        {(['palette', 'workspace'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors ${tab === t ? 'bg-white/10 text-yellow-400' : 'text-white/40'}`}>
            {t === 'palette' ? '🎨 Blocks' : '🔧 Workspace'}
          </button>
        ))}
      </div>

      <div className="flex flex-1 min-h-0">

        {/* ── Left: Category sidebar (desktop always, mobile when tab=palette) ── */}
        <div className={`${tab === 'palette' ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-52 shrink-0 border-r border-white/10 bg-[#0d0f17]`}>
          {/* Category tabs */}
          <div className="flex flex-col gap-0.5 p-2 overflow-y-auto">
            {ALL_CATEGORIES.map(cat => {
              const c = PALETTE[cat];
              return (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all ${activeCategory === cat ? 'ring-2 ring-white/30' : 'hover:bg-white/5'}`}
                  style={activeCategory === cat ? { backgroundColor: c.color + '33', borderLeft: `3px solid ${c.color}` } : {}}>
                  <span style={{ fontSize: 16 }}>{c.emoji}</span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide leading-none" style={{ color: c.color }}>{c.label}</p>
                    <p className="text-[9px] text-white/30 mt-0.5">{c.blocks.length} blocks</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Block palette for active category */}
          <div className="flex-1 border-t border-white/10 overflow-y-auto p-3">
            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">
              {readOnly ? 'Read only' : 'Click to add →'}
            </p>
            <div className="flex flex-col gap-1.5">
              {paletteCat.blocks.map((tmpl, i) => (
                <button key={i} onClick={() => addBlock(tmpl)} disabled={readOnly}
                  className="text-left transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-default"
                  title={`Add: ${tmpl.label}`}>
                  <div style={{
                    backgroundColor: paletteCat.color,
                    border: `2px solid ${paletteCat.border}`,
                    borderRadius: tmpl.shape === 'hat' ? '16px 16px 4px 4px' : '4px',
                    padding: '6px 12px',
                    display: 'flex', alignItems: 'center', gap: 6,
                    boxShadow: `0 2px 0 ${paletteCat.border}`,
                  }}>
                    <span style={{ fontSize: 12 }}>{paletteCat.emoji}</span>
                    <span style={{ color: paletteCat.text, fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}>{tmpl.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: Workspace ── */}
        <div className={`${tab === 'workspace' ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-h-0`}>

          {/* Workspace toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-[#0d0f17] shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Workspace</span>
              {sequence.length > 0 && (
                <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full font-bold">
                  {sequence.length} block{sequence.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {!readOnly && sequence.length > 0 && (
              <button onClick={clearAll}
                className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-red-400 px-2 py-1 border border-white/10 hover:border-red-500/30 rounded transition-colors">
                Clear all
              </button>
            )}
          </div>

          {/* Drop area */}
          <div className="flex-1 overflow-y-auto p-4"
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)',
              backgroundImage: `
                linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%),
                radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)
              `,
              backgroundSize: 'cover, 24px 24px',
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            {sequence.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
                <div style={{ fontSize: 48 }}>🧩</div>
                <p className="text-sm font-black text-white/50 uppercase tracking-widest text-center">
                  {readOnly ? 'No blocks added yet' : 'Click blocks on the left\nto build your script!'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 0, minWidth: 200 }}>
                {sequence.map((block, idx) => (
                  <BlockPiece
                    key={block.id}
                    block={block}
                    index={idx}
                    total={sequence.length}
                    isDragOver={dragState?.overIndex === idx}
                    draggable={!readOnly}
                    onRemove={readOnly ? undefined : () => removeBlock(idx)}
                    onDragStart={(e) => onDragStart(e, idx)}
                    onDragOver={(e) => onDragOver(e, idx)}
                    onDrop={(e) => onDrop(e, idx)}
                    onDragEnd={onDragEnd}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Category legend */}
          {sequence.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 py-2 border-t border-white/10 bg-[#0d0f17] shrink-0">
              {ALL_CATEGORIES.filter(cat => sequence.some(b => b.category === cat)).map(cat => (
                <span key={cat} className="text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest"
                  style={{ backgroundColor: PALETTE[cat].color + '33', color: PALETTE[cat].color, border: `1px solid ${PALETTE[cat].color}55` }}>
                  {PALETTE[cat].emoji} {PALETTE[cat].label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
