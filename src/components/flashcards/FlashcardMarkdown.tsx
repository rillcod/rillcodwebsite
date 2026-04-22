'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface FlashcardMarkdownProps {
  content: string;
  className?: string;
}

export default function FlashcardMarkdown({ content, className }: FlashcardMarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
          code: ({ children }) => (
            <code className="bg-black/20 dark:bg-white/10 rounded px-1 py-0.5 font-mono text-[0.95em]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="bg-black/20 dark:bg-white/10 rounded-xl p-3 overflow-x-auto text-left my-3">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-current/30 pl-3 italic my-2">{children}</blockquote>
          ),
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  );
}
