'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
} from '@/lib/icons';

export function BuilderField({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground">
        {label}
        {required ? <span className="ml-1 text-rose-400">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

type BuilderSectionPriority = 'primary' | 'secondary';

export function BuilderSection({
  title,
  description,
  children,
  actions,
  priority = 'primary',
  defaultOpen = true,
  collapsible = false,
  icon: _icon,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  /** primary = full weight; secondary = quieter chrome for demoted settings */
  priority?: BuilderSectionPriority;
  defaultOpen?: boolean;
  collapsible?: boolean;
  /** @deprecated Emoji headers removed for calmer chrome; accepted for call-site compat */
  icon?: string;
}) {
  void _icon;
  const [open, setOpen] = useState(defaultOpen);
  const isSecondary = priority === 'secondary';
  const showBody = !collapsible || open;

  return (
    <section
      className={`rounded-xl border ${
        isSecondary
          ? 'border-border/60 bg-card/60'
          : 'border-border bg-card'
      }`}
    >
      {collapsible ? (
        <div
          className={`flex w-full items-start gap-2 px-3 py-2 transition-colors hover:bg-muted/30 sm:px-4 ${
            showBody ? 'border-b border-border/50' : ''
          }`}
        >
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
          >
            <div className="min-w-0">
              <h3
                className={`font-black text-foreground ${
                  isSecondary ? 'text-xs' : 'text-sm'
                }`}
              >
                {title}
              </h3>
              {description ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
              ) : null}
            </div>
            <ChevronDownIcon
              className={`mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
          {actions ? <div className="flex-shrink-0">{actions}</div> : null}
        </div>
      ) : (
        <div
          className={`flex items-start justify-between gap-3 border-b border-border/50 px-3 py-2 sm:px-4 ${
            isSecondary ? 'bg-transparent' : 'bg-muted/10'
          }`}
        >
          <div className="min-w-0">
            <h3
              className={`font-black text-foreground ${
                isSecondary ? 'text-xs' : 'text-sm'
              }`}
            >
              {title}
            </h3>
            {description ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex-shrink-0">{actions}</div> : null}
        </div>
      )}
      {showBody ? <div className="space-y-3 p-3 sm:p-4">{children}</div> : null}
    </section>
  );
}

export function BuilderContextStrip({
  studentName,
  grade,
  courseName,
  moduleName,
  overallScore,
  overallGrade,
  isDirty,
  isPublished,
  filledScoresCount,
  totalScoresCount = 6,
  studentIndex,
  totalStudents,
  onPrev,
  onNext,
  onReturn,
  returnLabel = 'Roster',
  saving,
  meta,
  statusLabel,
  statusTone = 'draft',
  saveLabel,
  progressLabel,
}: {
  studentName: string;
  grade?: string;
  courseName?: string;
  moduleName?: string;
  overallScore?: number | null;
  overallGrade?: string | null;
  isDirty?: boolean;
  isPublished?: boolean;
  filledScoresCount?: number;
  totalScoresCount?: number;
  studentIndex?: number;
  totalStudents?: number;
  onPrev?: () => void;
  onNext?: () => void;
  onReturn?: () => void;
  returnLabel?: string;
  saving?: boolean;
  meta?: string;
  statusLabel?: string;
  statusTone?: 'draft' | 'published' | 'unsaved';
  saveLabel?: string;
  progressLabel?: string;
}) {
  const scoreNum = overallScore != null && !isNaN(Number(overallScore)) ? Math.round(Number(overallScore)) : null;

  return (
    <aside
      aria-label="Active student and score context"
      className="sticky top-[var(--app-header-height)] md:top-0 z-30 -mx-3 sm:mx-0 px-3 sm:px-4 py-2 bg-card/95 dark:bg-card/90 backdrop-blur-xl border-b border-border shadow-sm transition-all"
    >
      <div className="flex items-center justify-between gap-2">
        {/* Left: Whom & What */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          {onReturn && (
            <button
              type="button"
              onClick={onReturn}
              disabled={saving}
              className="inline-flex items-center gap-1 px-2 py-1 min-h-8 rounded-lg border border-border bg-muted/40 hover:bg-muted active:bg-muted/80 text-[11px] font-bold text-foreground transition-colors shrink-0 touch-manipulation disabled:opacity-50"
              title={`Return to ${returnLabel}`}
            >
              <ArrowLeftIcon className="h-3 w-3 text-primary shrink-0" />
              <span className="hidden xs:inline">{returnLabel}</span>
            </button>
          )}

          <div className="flex h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary text-xs font-black text-primary-foreground shadow-sm">
            {studentName?.[0] ?? '?'}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="truncate text-xs sm:text-sm font-black text-foreground max-w-[130px] xs:max-w-[200px] sm:max-w-[280px]">
                {studentName}
              </span>
              {grade && (
                <span className="shrink-0 px-1.5 py-0.2 rounded-md bg-primary/10 text-primary text-[10px] font-bold">
                  {grade}
                </span>
              )}
              {studentIndex != null && totalStudents != null && (
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground font-semibold">
                  #{studentIndex + 1}/{totalStudents}
                </span>
              )}
            </div>

            <p className="mt-0 truncate text-[10px] text-muted-foreground max-w-[180px] xs:max-w-[260px] sm:max-w-[360px]">
              {courseName || 'Course'}
              {moduleName ? ` · ${moduleName}` : ''}
              {meta ? ` · ${meta}` : ''}
            </p>
          </div>
        </div>

        {/* Right: Live Scores, Save Status, & Student Switchers */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Live Score & Grade Pill */}
          {scoreNum != null && (
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-xl border text-xs font-black shrink-0 transition-all ${
                scoreNum >= 80
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : scoreNum >= 65
                  ? 'bg-blue-500/15 border-blue-500/30 text-blue-600 dark:text-blue-400'
                  : scoreNum >= 48
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-400'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400'
              }`}
              title="Real-time calculated overall score & grade"
            >
              <span className="tabular-nums">{scoreNum}%</span>
              {overallGrade && (
                <span className="px-1 py-0.2 rounded bg-foreground/10 text-[9px] font-black uppercase">
                  {overallGrade}
                </span>
              )}
            </div>
          )}

          {/* Save Status Pill */}
          <div className="hidden sm:flex items-center text-[10px] font-semibold">
            {saving ? (
              <span className="flex items-center gap-1 text-muted-foreground bg-muted/40 border border-border px-2 py-0.5 rounded-lg">
                <ArrowPathIcon className="h-3 w-3 animate-spin text-primary" />
                <span>Saving…</span>
              </span>
            ) : isDirty ? (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>Unsaved</span>
              </span>
            ) : isPublished ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg">
                <CheckCircleIcon className="h-3 w-3" />
                <span>Published</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-lg">
                <CheckIcon className="h-3 w-3" />
                <span>Saved</span>
              </span>
            )}
          </div>

          {/* Score count badge */}
          {filledScoresCount != null && (
            <span className="hidden md:inline-block font-mono text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded border border-border">
              {filledScoresCount}/{totalScoresCount} scores
            </span>
          )}

          {/* Top Prev & Next Chevrons */}
          {(onPrev || onNext) && (
            <div className="flex items-center gap-0.5">
              {onPrev && (
                <button
                  type="button"
                  disabled={saving || (studentIndex != null && studentIndex <= 0)}
                  onClick={onPrev}
                  className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground hover:text-foreground active:bg-muted transition-colors disabled:opacity-30 touch-manipulation"
                  title="Previous student"
                >
                  <ChevronLeftIcon className="h-3.5 w-3.5" />
                </button>
              )}
              {onNext && (
                <button
                  type="button"
                  disabled={saving || (studentIndex != null && totalStudents != null && studentIndex >= totalStudents - 1)}
                  onClick={onNext}
                  className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground hover:text-foreground active:bg-muted transition-colors disabled:opacity-30 touch-manipulation"
                  title="Next student"
                >
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export function BuilderIssuesDisclosure({
  title,
  count,
  defaultOpen = false,
  children,
  tone = 'warning',
}: {
  title: string;
  count: number;
  /** Open by default when publish is blocked; otherwise collapsed to keep pace. */
  defaultOpen?: boolean;
  children: ReactNode;
  tone?: 'warning' | 'info';
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count <= 0) return null;

  const toneClass =
    tone === 'info'
      ? 'border-sky-500/25 bg-sky-500/5 text-sky-800 dark:text-sky-300'
      : 'border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300';

  return (
    <div className={`overflow-hidden rounded-xl border ${toneClass}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-11 items-center gap-2 px-4 py-2.5 text-left"
      >
        <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-xs font-bold">
          {title}
          <span className="ml-1.5 font-semibold opacity-70">({count})</span>
        </span>
        <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <div className="space-y-2 border-t border-current/10 px-4 py-3">{children}</div> : null}
    </div>
  );
}

export function ScorePanelSkeleton() {
  return (
    <div className="animate-pulse space-y-2" aria-busy="true" aria-label="Loading performance scores">
      <div className="h-3 w-32 rounded bg-muted/60" />
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1 rounded-lg border border-border/50 bg-muted/20 px-2 py-1.5">
            <div className="h-2.5 w-24 rounded bg-muted/50" />
            <div className="h-1.5 w-full rounded-full bg-muted/40" />
          </div>
        ))}
      </div>
      <div className="h-10 rounded-lg border border-border/50 bg-muted/20" />
    </div>
  );
}

export function EvidenceEditorPanel({
  title = 'Performance Scores',
  description = 'Six weighted parts. What you type here is the official score.',
  children,
  icon: _icon,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  icon?: string;
}) {
  void _icon;
  return (
    <BuilderSection title={title} description={description} priority="primary">
      {children}
    </BuilderSection>
  );
}

export function NarrativeEditorPanel({
  title = 'Evaluation',
  description,
  children,
  icon: _icon,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  icon?: string;
}) {
  void _icon;
  return (
    <BuilderSection title={title} description={description} priority="primary">
      {children}
    </BuilderSection>
  );
}

export function EvidenceStatusBanner({
  status,
  message,
  detail,
}: {
  status: 'ready' | 'loading' | 'missing' | 'error';
  message: string;
  detail?: string;
}) {
  const styles =
    status === 'ready'
      ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
      : status === 'loading'
        ? 'border-sky-500/25 bg-sky-500/5 text-sky-800 dark:text-sky-300'
        : status === 'missing'
          ? 'border-amber-500/25 bg-amber-500/5 text-amber-800 dark:text-amber-300'
          : 'border-rose-500/25 bg-rose-500/5 text-rose-700 dark:text-rose-300';

  const Icon =
    status === 'ready'
      ? CheckCircleIcon
      : status === 'loading'
        ? ArrowPathIcon
        : ExclamationTriangleIcon;

  return (
    <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-semibold ${styles}`}>
      <Icon className={`h-3 w-3 flex-shrink-0 ${status === 'loading' ? 'animate-spin' : ''}`} />
      <span className="min-w-0 truncate">
        {message}
        {detail ? <span className="ml-1 font-medium opacity-70">· {detail}</span> : null}
      </span>
    </div>
  );
}

export function PublishControls({
  children,
  primary,
  secondary,
  overflow,
}: {
  children?: ReactNode;
  /** Primary publish actions (Publish / Publish & Next) */
  primary?: ReactNode;
  /** Secondary actions (Draft) */
  secondary?: ReactNode;
  /** Quieter tools (Preview, AI, nav) */
  overflow?: ReactNode;
}) {
  const structured = primary != null || secondary != null || overflow != null;

  return (
    <div className="fixed inset-x-0 bottom-[var(--app-bottom-nav-height)] z-[55] border-t border-border bg-background/95 backdrop-blur-md shadow-[0_-8px_24px_rgba(0,0,0,0.12)] md:sticky md:bottom-0 md:inset-x-auto md:z-auto md:rounded-lg md:border md:shadow-md">
      {children}
      {structured ? (
        <div className="mx-auto max-w-5xl space-y-1.5 p-2 sm:p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {primary ? <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{primary}</div> : null}
            {secondary ? <div className="flex flex-wrap items-center gap-1.5">{secondary}</div> : null}
            {overflow ? (
              <div className="ml-auto flex flex-wrap items-center gap-1 opacity-90">{overflow}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
