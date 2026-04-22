'use client';

/**
 * LessonPreviewModal — full-screen, mobile-first, reader-style preview of
 * a lesson (AI-generated OR hand-edited). Shared between `/dashboard/lessons/add`
 * and `/dashboard/lessons/[id]/edit` so both surfaces behave identically.
 *
 * The preview is intentionally decoupled from the heavy student-renderer
 * (Monaco / Blockly / D3 / Recharts / Mermaid / Lottie) so opening the
 * modal is instant; live-widget blocks show a colour-graded placeholder
 * with an "Interactive · live" chip that mirrors the final student view.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, X, RefreshCw, CheckCircle2, Users, BookOpen,
  ListChecks, FileText, Target, Layout, Clock, GraduationCap,
  Code2, Image as ImageIcon, Lightbulb, PenLine, Video,
} from 'lucide-react';

export interface LessonPreviewModalProps {
  title: string;
  description?: string;
  lessonType?: string;
  durationMinutes?: string | number;
  grade?: string;
  model?: string;
  objectives: string[];
  contentLayout: any[];
  lessonNotes?: string;
  onClose: () => void;
  /** Optional — shown as "Regenerate" / primary secondary action. */
  onRegenerate?: () => void;
  /** Customise the footer primary-CTA label. Default: "Looks good — continue". */
  primaryLabel?: string;
}

export default function LessonPreviewModal({
  title, description, lessonType, durationMinutes, grade, model,
  objectives, contentLayout, lessonNotes, onClose, onRegenerate,
  primaryLabel = 'Looks good — continue',
}: LessonPreviewModalProps) {
  const [tab, setTab] = useState<'reader' | 'outline' | 'notes'>('reader');
  const [studentView, setStudentView] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const totalBlocks = contentLayout?.length ?? 0;
  const notesWords = lessonNotes ? lessonNotes.trim().split(/\s+/).filter(Boolean).length : 0;
  const totalCompletion = [
    title ? 1 : 0,
    description ? 1 : 0,
    objectives.length > 0 ? 1 : 0,
    totalBlocks > 0 ? 1 : 0,
    lessonNotes ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
  const completionPct = Math.round((totalCompletion / 5) * 100);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-stretch sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Lesson preview"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="bg-background border border-border w-full sm:max-w-4xl sm:rounded-2xl rounded-none shadow-2xl flex flex-col max-h-screen sm:max-h-[94vh] overflow-hidden pb-[env(safe-area-inset-bottom)]"
      >
        {/* Sticky header */}
        <div className="shrink-0 bg-card/95 backdrop-blur-md border-b border-border">
          <div className="flex items-center gap-2 px-3 sm:px-5 py-3">
            <button
              onClick={onClose}
              className="shrink-0 w-10 h-10 inline-flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
              aria-label="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-black text-violet-400 uppercase tracking-widest">
                <Sparkles className="w-3 h-3" /> Lesson Preview
                {!studentView && <span className="text-muted-foreground">· Teacher</span>}
              </div>
              <p className="text-sm sm:text-base font-bold text-foreground truncate">{title || 'Untitled lesson'}</p>
            </div>
            <button
              onClick={() => setStudentView(v => !v)}
              className={`shrink-0 hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-black uppercase tracking-widest border rounded-lg transition-all min-h-[40px] ${
                studentView
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted'
              }`}
              title="Toggle student-facing view"
            >
              <Users className="w-3.5 h-3.5" /> Student view
            </button>
          </div>

          {/* Completion meter */}
          <div className="px-3 sm:px-5 pb-2">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              <span>Completion</span>
              <span>{completionPct}%</span>
            </div>
            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 px-2 sm:px-3 pb-1.5 overflow-x-auto [-webkit-overflow-scrolling:touch]">
            {([
              { key: 'reader'  as const, label: 'Reader',  icon: BookOpen,   badge: undefined as string | undefined },
              { key: 'outline' as const, label: 'Outline', icon: ListChecks, badge: undefined as string | undefined },
              { key: 'notes'   as const, label: 'Notes',   icon: FileText,   badge: notesWords ? `${notesWords}w` : undefined },
            ]).map(t => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-black uppercase tracking-widest border-b-2 transition-colors min-h-[40px] ${
                    active
                      ? 'border-violet-500 text-violet-400'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {t.label}
                  {t.badge && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{t.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
          <AnimatePresence mode="wait">
          {tab === 'reader' && (
            <motion.article
              key="reader"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-6 max-w-3xl mx-auto"
            >
              <motion.header
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.05 }}
                className="space-y-3 pb-5 border-b border-border"
              >
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-orange-500 to-violet-500" />
                  Lesson
                </div>
                <h1 className="text-2xl sm:text-4xl font-black text-foreground leading-[1.1] tracking-tight">
                  <span className="bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
                    {title || 'Untitled lesson'}
                  </span>
                </h1>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  {lessonType && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-300 font-bold uppercase tracking-widest">
                      <Layout className="w-3 h-3" /> {lessonType}
                    </span>
                  )}
                  {durationMinutes && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground font-bold">
                      <Clock className="w-3 h-3" /> {durationMinutes} min
                    </span>
                  )}
                  {grade && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 font-bold">
                      <GraduationCap className="w-3 h-3" /> {grade}
                    </span>
                  )}
                  {!studentView && model && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground font-medium text-[10px]">
                      {model}
                    </span>
                  )}
                </div>
                {description && (
                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{description}</p>
                )}
              </motion.header>

              {objectives.length > 0 && (
                <section className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-violet-400" />
                    <h2 className="text-[11px] font-black uppercase tracking-widest text-violet-300">Learning Objectives</h2>
                  </div>
                  <ul className="space-y-2.5">
                    {objectives.map((obj, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-violet-500/20 text-violet-300 text-[11px] font-black inline-flex items-center justify-center">
                          {i + 1}
                        </span>
                        <p className="text-sm text-foreground leading-relaxed flex-1">{obj}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {totalBlocks > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Layout className="w-4 h-4 text-orange-400" />
                    <h2 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                      Lesson Flow · {totalBlocks} section{totalBlocks === 1 ? '' : 's'}
                    </h2>
                    {!studentView && (
                      <span className="ml-auto text-[9px] font-bold text-muted-foreground/70 uppercase tracking-wider">
                        Student-identical preview
                      </span>
                    )}
                  </div>
                  <div className="space-y-10 sm:space-y-14">
                    {contentLayout.map((block: Record<string, unknown>, i: number) => (
                      <PreviewAnimatedBlock key={i} i={i}>
                        <LessonPreviewBlock index={i} block={block as Record<string, any>} showType={!studentView} />
                      </PreviewAnimatedBlock>
                    ))}
                  </div>
                </section>
              )}

              {lessonNotes && (
                <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 sm:p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="w-4 h-4 text-amber-400" />
                    <h2 className="text-[11px] font-black uppercase tracking-widest text-amber-300">Before the class</h2>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Students see this as the lesson intro. Switch to the <button onClick={() => setTab('notes')} className="underline text-amber-300 hover:text-amber-200">Notes tab</button> for the full text.
                  </p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                    {lessonNotes.slice(0, 400)}{lessonNotes.length > 400 ? '…' : ''}
                  </p>
                </section>
              )}

              {totalBlocks === 0 && objectives.length === 0 && !lessonNotes && (
                <div className="text-center py-10">
                  <Sparkles className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-sm text-muted-foreground">No lesson content yet.</p>
                  {onRegenerate && (
                    <button onClick={onRegenerate} className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-black uppercase tracking-widest min-h-[44px]">
                      <Sparkles className="w-3.5 h-3.5" /> Generate with AI
                    </button>
                  )}
                </div>
              )}
            </motion.article>
          )}

          {tab === 'outline' && (
            <motion.div
              key="outline"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="space-y-2 max-w-2xl mx-auto"
            >
              {totalBlocks === 0 && objectives.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No outline yet.</p>
              ) : (
                <>
                  {objectives.length > 0 && (
                    <div className="rounded-xl border border-border bg-card p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-violet-300 mb-2">Objectives</p>
                      <ol className="space-y-1.5 list-decimal list-inside text-sm text-foreground">
                        {objectives.map((o, i) => <li key={i}>{o}</li>)}
                      </ol>
                    </div>
                  )}
                  {contentLayout.map((block: Record<string, unknown>, i: number) => {
                    const b = block as Record<string, any>;
                    const { icon: Icon, color } = blockTypeStyle(b.type);
                    return (
                      <div key={i} className="flex items-start gap-3 p-3 sm:p-4 rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors">
                        <span className="shrink-0 w-8 h-8 rounded-lg bg-muted inline-flex items-center justify-center text-[11px] font-black text-muted-foreground">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-foreground truncate">{b.title || cleanBlockType(b.type)}</p>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${color}`}>
                              <Icon className="w-2.5 h-2.5" /> {cleanBlockType(b.type)}
                            </span>
                          </div>
                          {blockExcerpt(b) && (
                            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{blockExcerpt(b)}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </motion.div>
          )}

          {tab === 'notes' && (
            <motion.div
              key="notes"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="max-w-2xl mx-auto"
            >
              {lessonNotes ? (
                <article className="prose prose-sm sm:prose-base max-w-none text-foreground">
                  <div className="flex items-center justify-between mb-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <span>Lesson Notes</span>
                    <span>{notesWords} words · ~{Math.max(1, Math.round(notesWords / 200))} min read</span>
                  </div>
                  <div className="text-sm sm:text-base text-foreground leading-relaxed whitespace-pre-line">
                    {lessonNotes}
                  </div>
                </article>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-10">No study notes yet.</p>
              )}
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 border-t border-border bg-card/95 backdrop-blur-md">
          <div className="sm:hidden flex items-center justify-between px-4 py-2 border-b border-border">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">View as</span>
            <button
              onClick={() => setStudentView(v => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest border rounded-lg transition-all min-h-[36px] ${
                studentView
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-muted/40 border-border text-muted-foreground'
              }`}
            >
              <Users className="w-3 h-3" /> {studentView ? 'Student' : 'Teacher'}
            </button>
          </div>
          <div className="flex items-center gap-2 p-3 sm:p-4">
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-background border border-border hover:bg-muted text-xs font-black uppercase tracking-widest rounded-lg transition-all min-h-[48px]"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Regenerate
              </button>
            )}
            <button
              onClick={onClose}
              className={`${onRegenerate ? 'flex-[1.3]' : 'flex-1'} inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-xs font-black uppercase tracking-widest rounded-lg transition-all min-h-[48px] shadow-lg shadow-violet-900/20`}
            >
              <CheckCircle2 className="w-4 h-4" /> {primaryLabel}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * Helpers
 * ════════════════════════════════════════════════════════════════════════ */

function PreviewAnimatedBlock({ children, i }: { children: React.ReactNode; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.55, delay: Math.min(i * 0.05, 0.25), ease: [0.22, 1, 0.36, 1] }}
      style={{ willChange: 'transform, opacity' }}
    >
      {children}
    </motion.div>
  );
}

type RawBlock = Record<string, any>;

function LessonPreviewBlock({ index, block, showType }: { index: number; block: RawBlock; showType: boolean }) {
  const { icon: Icon, color } = blockTypeStyle(block.type);
  const title = block.title?.trim();
  const content = typeof block.content === 'string' ? block.content : '';
  const code = block.code || (block.type === 'code' ? content : undefined);

  if (block.type === 'heading') {
    return (
      <div className="relative group pt-4">
        <div className="absolute -left-4 top-0 bottom-0 w-1 rounded-full bg-gradient-to-b from-orange-500 via-violet-500 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <h2 className="text-lg sm:text-2xl font-black tracking-tight leading-snug break-words bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text">
          {content || title || 'Untitled section'}
        </h2>
        <div className="mt-2 h-px w-0 group-hover:w-full bg-gradient-to-r from-orange-500/50 via-violet-500/30 to-transparent transition-all duration-500" />
      </div>
    );
  }

  if (block.type === 'text') {
    return (
      <div className="relative py-2 pl-4 border-l-2 border-border hover:border-violet-500/30 transition-colors duration-300">
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed whitespace-pre-wrap font-medium">
          {content}
        </p>
      </div>
    );
  }

  if (block.type === 'callout' || block.type === 'tip') {
    const variant = (block.variant || block.kind || 'info') as string;
    const variantStyle: Record<string, string> = {
      info: 'bg-sky-500/10 border-sky-500/25 text-sky-200',
      tip: 'bg-amber-500/10 border-amber-500/25 text-amber-200',
      warning: 'bg-amber-500/10 border-amber-500/25 text-amber-200',
      success: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200',
      danger: 'bg-rose-500/10 border-rose-500/25 text-rose-200',
    };
    const cls = variantStyle[variant] || variantStyle.info;
    return (
      <div className={`rounded-xl border p-4 sm:p-5 flex items-start gap-3 ${cls}`}>
        <Lightbulb className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {title && <p className="text-sm font-black mb-1">{title}</p>}
          <p className="text-sm leading-relaxed whitespace-pre-line">{content}</p>
        </div>
      </div>
    );
  }

  if (block.type === 'quote') {
    return (
      <blockquote className="relative px-6 py-4 border-l-4 border-violet-500 bg-violet-500/5 rounded-r-lg">
        <p className="text-base sm:text-lg italic text-foreground leading-relaxed">&ldquo;{content}&rdquo;</p>
        {block.author && <footer className="mt-2 text-[11px] font-black uppercase tracking-widest text-violet-300">— {block.author}</footer>}
      </blockquote>
    );
  }

  if (block.type === 'key-terms') {
    const terms = Array.isArray(block.terms) ? block.terms : Array.isArray(block.items) ? block.items : [];
    return (
      <section className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-cyan-400" />
          <h3 className="text-[11px] font-black uppercase tracking-widest text-cyan-300">{title || 'Key Terms'}</h3>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {terms.map((t: any, i: number) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3">
              <dt className="text-sm font-black text-foreground">{t.term || t.title || t.name}</dt>
              <dd className="text-[13px] text-muted-foreground mt-1 leading-relaxed">{t.definition || t.description || t.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  if (block.type === 'steps-list' || block.type === 'activity') {
    const steps: any[] = Array.isArray(block.steps) ? block.steps : Array.isArray(block.items) ? block.items : [];
    return (
      <section className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <ListChecks className="w-4 h-4 text-emerald-400" />
          <h3 className="text-[11px] font-black uppercase tracking-widest text-emerald-300">{title || (block.type === 'activity' ? 'Activity' : 'Steps')}</h3>
        </div>
        <ol className="space-y-3">
          {steps.map((s: any, i: number) => {
            const text = typeof s === 'string' ? s : s.text || s.title || s.description;
            return (
              <li key={i} className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-emerald-500/25 text-emerald-200 text-xs font-black inline-flex items-center justify-center">{i + 1}</span>
                <p className="flex-1 text-sm sm:text-[15px] text-foreground leading-relaxed pt-1">{text}</p>
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  if (block.type === 'table') {
    const headers: string[] = block.headers || block.columns || [];
    const rows: any[][] = block.rows || [];
    return (
      <section className="space-y-2">
        {title && <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">{title}</p>}
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>{headers.map((h, i) => <th key={i} className="text-left px-3 py-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  {r.map((cell, j) => <td key={j} className="px-3 py-2 text-foreground">{String(cell)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  if (block.type === 'columns') {
    const cols: any[] = block.columns || [];
    return (
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cols.map((c: any, i: number) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            {c.title && <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2">{c.title}</p>}
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{c.content}</p>
          </div>
        ))}
      </section>
    );
  }

  if (block.type === 'video') {
    return (
      <section className="rounded-xl border border-rose-500/25 bg-rose-500/5 overflow-hidden">
        <div className="aspect-video flex items-center justify-center bg-gradient-to-br from-rose-500/20 to-red-900/40 relative">
          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-2xl">
            <Video className="w-7 h-7 text-rose-600 ml-1" />
          </div>
          <div className="absolute bottom-2 right-3 text-[9px] font-black text-white/70 uppercase tracking-widest">Video · renders live</div>
        </div>
        {(title || block.url) && (
          <div className="p-3 sm:p-4">
            {title && <p className="text-sm font-black text-foreground">{title}</p>}
            {block.url && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{block.url}</p>}
          </div>
        )}
      </section>
    );
  }

  if (['visualizer', 'code-map', 'motion-graphics', 'chart', 'recharts', 'mermaid', 'diagram', 'lottie', 'blockly', 'scratch'].includes(block.type)) {
    const widgetLabel: Record<string, { label: string; color: string }> = {
      'visualizer':       { label: 'Code Visualizer',  color: 'from-cyan-500/20 to-sky-900/30 border-cyan-500/25' },
      'code-map':         { label: 'Code Map',         color: 'from-violet-500/20 to-indigo-900/30 border-violet-500/25' },
      'motion-graphics':  { label: 'Motion Graphic',   color: 'from-fuchsia-500/20 to-pink-900/30 border-fuchsia-500/25' },
      'chart':            { label: 'Chart',            color: 'from-emerald-500/20 to-green-900/30 border-emerald-500/25' },
      'recharts':         { label: 'Chart',            color: 'from-emerald-500/20 to-green-900/30 border-emerald-500/25' },
      'mermaid':          { label: 'Diagram',          color: 'from-blue-500/20 to-indigo-900/30 border-blue-500/25' },
      'diagram':          { label: 'Diagram',          color: 'from-blue-500/20 to-indigo-900/30 border-blue-500/25' },
      'lottie':           { label: 'Animation',        color: 'from-purple-500/20 to-violet-900/30 border-purple-500/25' },
      'blockly':          { label: 'Blockly Workspace',color: 'from-yellow-500/20 to-orange-900/30 border-yellow-500/25' },
      'scratch':          { label: 'Scratch Blocks',   color: 'from-orange-500/20 to-amber-900/30 border-orange-500/25' },
    };
    const info = widgetLabel[block.type];
    return (
      <section className={`rounded-xl border bg-gradient-to-br ${info.color} overflow-hidden`}>
        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          <div className="w-1.5 h-4 rounded-full bg-white/60" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/80">{title || info.label}</p>
          <span className="ml-auto text-[9px] font-bold text-white/50 uppercase tracking-widest">Interactive · live</span>
        </div>
        <div className="min-h-[180px] flex items-center justify-center p-5">
          <div className="text-center max-w-sm">
            <div className="inline-flex w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm items-center justify-center mb-3">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <p className="text-sm font-bold text-white/90">{info.label}</p>
            <p className="text-[12px] text-white/60 leading-relaxed mt-1">
              Students see a fully interactive {info.label.toLowerCase()} here.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (['quiz', 'quiz-block', 'mcq', 'multiple-choice'].includes(block.type)) {
    const items: any[] = Array.isArray(block.items) ? block.items : Array.isArray(block.questions) ? block.questions : [];
    return (
      <section className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-black inline-flex items-center justify-center">{index + 1}</span>
            <h3 className="text-sm sm:text-base font-black text-foreground">{title || 'Quiz checkpoint'}</h3>
          </div>
          {showType && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${color}`}>
              <Icon className="w-2.5 h-2.5" /> Quiz
            </span>
          )}
        </div>
        {items.length ? (
          <ol className="space-y-3 list-decimal list-inside">
            {items.slice(0, 3).map((q: any, i: number) => (
              <li key={i} className="text-sm text-foreground">
                <span className="font-bold">{q.question || q.prompt || q.text || 'Question'}</span>
                {Array.isArray(q.options) && (
                  <ul className="ml-5 mt-1.5 space-y-1">
                    {q.options.slice(0, 4).map((opt: any, j: number) => (
                      <li key={j} className="text-[13px] text-muted-foreground">{String.fromCharCode(65 + j)}. {typeof opt === 'string' ? opt : opt.text}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            {items.length > 3 && (
              <li className="text-[11px] text-muted-foreground list-none">+ {items.length - 3} more questions</li>
            )}
          </ol>
        ) : content ? (
          <p className="text-sm text-foreground whitespace-pre-line">{content}</p>
        ) : null}
      </section>
    );
  }

  if (code || block.type === 'code' || block.type === 'snippet') {
    return (
      <section className="rounded-xl border border-sky-500/25 bg-sky-500/5 overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 w-6 h-6 rounded-full bg-sky-500/20 text-sky-300 text-[11px] font-black inline-flex items-center justify-center">{index + 1}</span>
            <h3 className="text-sm sm:text-base font-black text-foreground truncate">{title || 'Code example'}</h3>
          </div>
          {showType && block.language && (
            <span className="shrink-0 text-[9px] font-mono font-bold text-sky-300 uppercase tracking-widest">{block.language}</span>
          )}
        </div>
        <pre className="text-[12px] sm:text-[13px] leading-relaxed font-mono text-foreground bg-black/40 p-4 overflow-x-auto whitespace-pre">
          <code>{code}</code>
        </pre>
      </section>
    );
  }

  if (block.type === 'assignment-block' || block.type === 'assignment') {
    return (
      <section className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 w-6 h-6 rounded-full bg-rose-500/20 text-rose-300 text-[11px] font-black inline-flex items-center justify-center">{index + 1}</span>
            <h3 className="text-sm sm:text-base font-black text-foreground">{title || 'Assignment'}</h3>
          </div>
          {showType && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${color}`}>
              <PenLine className="w-2.5 h-2.5" /> Assignment
            </span>
          )}
        </div>
        {content && <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{content}</p>}
        {Array.isArray(block.tasks) && block.tasks.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {block.tasks.map((t: any, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <CheckCircle2 className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                <span>{typeof t === 'string' ? t : t.title || t.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  if (block.type === 'image' && block.src) {
    return (
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={block.src} alt={block.alt || title || ''} className="w-full max-h-[60vh] object-contain bg-black/30" />
        {(title || block.caption) && (
          <div className="p-3 sm:p-4 text-[12px] text-muted-foreground">
            {title && <span className="font-bold text-foreground">{title}. </span>}
            {block.caption}
          </div>
        )}
      </section>
    );
  }

  if ((block.type === 'list' || block.type === 'checklist') && Array.isArray(block.items)) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-muted text-muted-foreground text-[11px] font-black inline-flex items-center justify-center">{index + 1}</span>
          <h3 className="text-sm sm:text-base font-black text-foreground">{title || 'Key points'}</h3>
        </div>
        <ul className="space-y-2">
          {block.items.map((it: any, i: number) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-2 shrink-0" />
              <span>{typeof it === 'string' ? it : it.text || it.title}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 w-6 h-6 rounded-full bg-muted text-muted-foreground text-[11px] font-black inline-flex items-center justify-center">{index + 1}</span>
          <h3 className="text-sm sm:text-base font-black text-foreground truncate">{title || cleanBlockType(block.type)}</h3>
        </div>
        {showType && (
          <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${color}`}>
            <Icon className="w-2.5 h-2.5" /> {cleanBlockType(block.type)}
          </span>
        )}
      </div>
      {content && (
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{content}</p>
      )}
    </section>
  );
}

function cleanBlockType(type?: string): string {
  if (!type) return 'Block';
  return type.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function blockExcerpt(block: any): string {
  const c = typeof block.content === 'string' ? block.content : '';
  if (c) return c.slice(0, 180);
  if (Array.isArray(block.items) && block.items.length > 0) {
    return block.items.slice(0, 2).map((x: any) => typeof x === 'string' ? x : x.text || x.title).join(' · ');
  }
  return '';
}

function blockTypeStyle(type?: string): { icon: React.ComponentType<{ className?: string }>; color: string } {
  switch (type) {
    case 'code':
    case 'snippet':
      return { icon: Code2, color: 'bg-sky-500/10 border-sky-500/25 text-sky-300' };
    case 'quiz':
    case 'quiz-block':
    case 'mcq':
    case 'multiple-choice':
      return { icon: CheckCircle2, color: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' };
    case 'assignment':
    case 'assignment-block':
      return { icon: PenLine, color: 'bg-rose-500/10 border-rose-500/25 text-rose-300' };
    case 'image':
      return { icon: ImageIcon, color: 'bg-violet-500/10 border-violet-500/25 text-violet-300' };
    case 'video':
      return { icon: Video, color: 'bg-red-500/10 border-red-500/25 text-red-300' };
    case 'list':
    case 'checklist':
      return { icon: ListChecks, color: 'bg-amber-500/10 border-amber-500/25 text-amber-300' };
    case 'callout':
    case 'tip':
      return { icon: Lightbulb, color: 'bg-amber-500/10 border-amber-500/25 text-amber-300' };
    case 'heading':
      return { icon: Target, color: 'bg-fuchsia-500/10 border-fuchsia-500/25 text-fuchsia-300' };
    default:
      return { icon: FileText, color: 'bg-muted border-border text-muted-foreground' };
  }
}
