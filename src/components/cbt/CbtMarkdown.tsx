'use client';

import { mdToScreenHtml } from '@/lib/cbt/print-utils';

/** Renders CBT question/option text — supports fenced ```code``` blocks and inline `code`. */
export default function CbtMarkdown({ text, className }: { text: string; className?: string }) {
  if (!text?.trim()) return null;
  return (
    <div
      className={`cbt-markdown [&_.cbt-code-block]:my-3 ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: mdToScreenHtml(text) }}
    />
  );
}
