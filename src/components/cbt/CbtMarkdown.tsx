'use client';

import { mdToScreenHtml } from '@/lib/cbt/print-utils';

/** Renders CBT question/option text — supports fenced ```code``` blocks and inline `code`. */
export default function CbtMarkdown({ text, className }: { text: string; className?: string }) {
  const safeText = typeof text === 'string' ? text : String(text ?? '');
  if (!safeText.trim()) return null;
  const html = mdToScreenHtml(safeText);
  if (!html.trim()) {
    return <div className={`cbt-markdown whitespace-pre-wrap ${className ?? ''}`}>{safeText}</div>;
  }
  return (
    <div
      className={`cbt-markdown [&_.cbt-code-block]:my-3 ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
