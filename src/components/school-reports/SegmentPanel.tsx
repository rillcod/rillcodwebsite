'use client';

import type { ReactNode } from 'react';

type SegmentTone = 'neutral' | 'brand' | 'emerald';

type Props = {
  title: string;
  step?: number | string;
  accent?: string;
  tone?: SegmentTone;
  children: ReactNode;
  className?: string;
  /** Stretch to equal height inside grid columns. */
  fillHeight?: boolean;
};

const toneClass: Record<SegmentTone, string> = {
  neutral: 'border-border/80 bg-card',
  brand: 'border-primary/30 bg-primary/[0.04]',
  emerald: 'border-emerald-500/30 bg-emerald-500/[0.04]',
};

export function SegmentPanel({
  title,
  step,
  accent = '#7a0606',
  tone = 'neutral',
  children,
  className = '',
  fillHeight = false,
}: Props) {
  const label = step != null ? `${step} · ${title}` : title;

  return (
    <section
      className={`overflow-hidden rounded-xl border shadow-sm ${toneClass[tone]} ${
        fillHeight ? 'flex h-full flex-col' : ''
      } ${className}`}
    >
      <div className="h-1 shrink-0" style={{ backgroundColor: accent }} aria-hidden />
      <div className={`p-4 ${fillHeight ? 'flex flex-1 flex-col' : ''}`}>
        <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: accent }}>
          {label}
        </p>
        <div className={`mt-2.5 ${fillHeight ? 'flex-1' : ''}`}>{children}</div>
      </div>
    </section>
  );
}

/** Two-column grid where each segment keeps a full border and equal height. */
export function SegmentGrid({
  children,
  columns = 2,
  className = '',
}: {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  const colClass =
    columns === 3 ? 'md:grid-cols-3' : columns === 1 ? 'grid-cols-1' : 'sm:grid-cols-2';
  return <div className={`grid items-stretch gap-3 ${colClass} ${className}`}>{children}</div>;
}
