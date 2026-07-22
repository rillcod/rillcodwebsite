'use client';

type Props = {
  body: string;
  title?: string;
  subtitle?: string;
  className?: string;
  variant?: 'standalone' | 'embedded';
};

/** Readable preview of AI-expanded or manually edited topics narrative. */
export function ExpandedNarrativePreview({
  body,
  title = 'Report story',
  subtitle = '',
  className = '',
  variant = 'standalone',
}: Props) {
  const trimmed = body.trim();
  if (!trimmed) return null;

  const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter((line) => /^[-•*]\s/.test(line) || line.startsWith('•'));
  const proseLines = lines.filter((line) => !/^[-•*]\s/.test(line) && !line.startsWith('•'));
  const embedded = variant === 'embedded';

  const content = (
    <div className="space-y-3">
      {proseLines.map((paragraph, index) => (
        <p
          key={`p-${index}`}
          className={`leading-relaxed text-foreground break-words whitespace-pre-wrap ${embedded ? 'text-sm' : 'text-sm'}`}
        >
          {paragraph}
        </p>
      ))}
      {bulletLines.length ? (
        <ul className={`space-y-1.5 ${proseLines.length ? 'border-t border-border/60 pt-2' : ''}`}>
          {bulletLines.map((line, index) => (
            <li key={`b-${index}`} className={`flex gap-2 leading-snug text-foreground ${embedded ? 'text-xs' : 'text-[12px]'}`}>
              <span className="mt-0.5 shrink-0 font-black text-emerald-700">•</span>
              <span className="min-w-0 break-words">{line.replace(/^[-•*]\s*/, '')}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {!proseLines.length && !bulletLines.length ? (
        <p className={`leading-relaxed text-foreground break-words whitespace-pre-wrap ${embedded ? 'text-xs' : 'text-sm'}`}>
          {trimmed}
        </p>
      ) : null}
    </div>
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
