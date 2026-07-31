'use client';

import { useState, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

/**
 * Shared renderer for anything an LLM produced.
 *
 * AI replies come back as Markdown. Dropping that string into JSX renders the
 * raw syntax — literal `**bold**`, `###`, and unspaced ``` fences — which is the
 * single biggest reason generated content reads as fake. Every AI surface should
 * render through this component instead.
 *
 * Raw HTML is intentionally NOT enabled (no rehype-raw): model output is
 * untrusted, and react-markdown escaping it is what keeps this XSS-safe.
 */

type Variant = 'chat' | 'default' | 'compact';

interface AIMarkdownProps {
    content: string;
    /** 'chat' = tight bubble spacing, 'default' = article, 'compact' = inline panels. */
    variant?: Variant;
    className?: string;
}

/**
 * Models frequently wrap an entire Markdown answer in a ```markdown fence.
 * Left alone it renders as one grey code block instead of formatted prose.
 */
function unwrapOuterFence(raw: string): string {
    const text = raw.trim();
    const match = text.match(/^```(?:markdown|md|text|)?\s*\n([\s\S]*?)\n?```$/i);
    if (!match) return text;
    // Only unwrap when it really is the whole message, not a legitimate snippet.
    return match[1].includes('```') ? text : match[1];
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            /* clipboard blocked — leave the button idle */
        }
    };

    return (
        <div className="group relative my-3 rounded-xl border border-border bg-muted/60 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60 bg-background/40">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {lang || 'code'}
                </span>
                <button
                    type="button"
                    onClick={copy}
                    className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={copied ? 'Copied' : 'Copy code'}
                >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">
                <code className="font-mono text-foreground/90 whitespace-pre">{code}</code>
            </pre>
        </div>
    );
}

const SPACING: Record<Variant, { p: string; heading: string; list: string; gap: string }> = {
    chat: { p: 'mb-2 last:mb-0', heading: 'mt-3 first:mt-0 mb-1', list: 'my-2', gap: 'space-y-1' },
    default: { p: 'mb-3 last:mb-0', heading: 'mt-5 first:mt-0 mb-2', list: 'my-3', gap: 'space-y-1.5' },
    compact: { p: 'mb-1.5 last:mb-0', heading: 'mt-2 first:mt-0 mb-1', list: 'my-1.5', gap: 'space-y-0.5' },
};

function AIMarkdownImpl({ content, variant = 'default', className = '' }: AIMarkdownProps) {
    const text = useMemo(() => unwrapOuterFence(content ?? ''), [content]);
    const s = SPACING[variant];

    if (!text) return null;

    return (
        <div className={`ai-markdown break-words ${className}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ children }) => (
                        <h3 className={`text-base font-black text-foreground ${s.heading}`}>{children}</h3>
                    ),
                    h2: ({ children }) => (
                        <h4 className={`text-[15px] font-black text-foreground ${s.heading}`}>{children}</h4>
                    ),
                    h3: ({ children }) => (
                        <h5 className={`text-sm font-bold text-foreground ${s.heading}`}>{children}</h5>
                    ),
                    h4: ({ children }) => (
                        <h6 className={`text-sm font-bold text-foreground/80 ${s.heading}`}>{children}</h6>
                    ),
                    p: ({ children }) => <p className={`leading-relaxed ${s.p}`}>{children}</p>,
                    ul: ({ children }) => (
                        <ul className={`list-disc pl-5 ${s.list} ${s.gap} marker:text-primary/60`}>{children}</ul>
                    ),
                    ol: ({ children }) => (
                        <ol className={`list-decimal pl-5 ${s.list} ${s.gap} marker:text-primary/60 marker:font-bold`}>
                            {children}
                        </ol>
                    ),
                    li: ({ children }) => <li className="leading-relaxed pl-0.5">{children}</li>,
                    strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                    del: ({ children }) => <del className="opacity-50">{children}</del>,
                    hr: () => <hr className="my-4 border-border" />,
                    a: ({ href, children }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline decoration-primary/30 hover:decoration-primary underline-offset-2 transition-all"
                        >
                            {children}
                        </a>
                    ),
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-primary/40 pl-3 my-2 italic text-foreground/70">
                            {children}
                        </blockquote>
                    ),
                    code: ({ className: cls, children, ...rest }: any) => {
                        // Fenced blocks arrive with a `language-*` class and are handled by `pre`.
                        if (cls) return <code className={cls} {...rest}>{children}</code>;
                        return (
                            <code className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[0.85em] font-mono border border-primary/15">
                                {children}
                            </code>
                        );
                    },
                    pre: ({ children }: any) => {
                        const codeEl = (children as any)?.props;
                        const lang = /language-(\w+)/.exec(codeEl?.className || '')?.[1] ?? '';
                        const code = String(codeEl?.children ?? '').replace(/\n$/, '');
                        return <CodeBlock lang={lang} code={code} />;
                    },
                    table: ({ children }) => (
                        <div className="my-3 overflow-x-auto rounded-xl border border-border">
                            <table className="w-full text-left text-[13px] border-collapse">{children}</table>
                        </div>
                    ),
                    thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
                    th: ({ children }) => (
                        <th className="px-3 py-2 font-bold text-foreground border-b border-border whitespace-nowrap">
                            {children}
                        </th>
                    ),
                    td: ({ children }) => (
                        <td className="px-3 py-2 border-b border-border/50 align-top">{children}</td>
                    ),
                    input: ({ checked, type }: any) =>
                        type === 'checkbox' ? (
                            <input
                                type="checkbox"
                                checked={!!checked}
                                readOnly
                                className="mr-1.5 align-middle accent-primary"
                            />
                        ) : null,
                }}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
}

const AIMarkdown = memo(AIMarkdownImpl);
export default AIMarkdown;
