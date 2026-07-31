'use client';

import AIMarkdown from '@/components/ai/AIMarkdown';

type Props = {
  body: string;
  title?: string;
  subtitle?: string;
  className?: string;
  variant?: 'standalone' | 'embedded';
};

/**
 * Readable preview of AI-expanded or manually edited topics narrative.
 *
 * Renders through the shared Markdown pipeline rather than a hand-rolled line
 * splitter. The old approach grouped every bullet after every paragraph, which
 * reordered the narrative whenever the model interleaved prose and lists — and
 * it showed `**bold**` and `##` as literal characters.
 */
export function ExpandedNarrativePreview({
  body,
  title = 'Report story',
  subtitle = '',
  className = '',
  variant = 'standalone',
}: Props) {
  const trimmed = body.trim();
  if (!trimmed) return null;

  const embedded = variant === 'embedded';

  const content = (
    <AIMarkdown
      content={trimmed}
      variant={embedded ? 'compact' : 'default'}
      className={`break-words text-foreground marker:text-emerald-700 dark:marker:text-emerald-300 ${
        embedded ? 'text-xs sm:text-sm' : 'text-sm'
      }`}
    />
  );

  if (embedded) {
    return <div className={`rounded-lg border border-border/70 bg-muted/20 p-3 ${className}`}>{content}</div>;
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.06] via-background to-background shadow-sm ${className}`}
    >
      <div className="border-b border-emerald-500/15 bg-emerald-500/[0.08] px-3 py-3 sm:px-4">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-200">
          {title}
        </p>
        {subtitle ? (
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="p-3 sm:p-4">{content}</div>
    </div>
  );
}
