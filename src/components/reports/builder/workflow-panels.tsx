'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronDownIcon,
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
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/30 sm:px-4 ${
            showBody ? 'border-b border-border/50' : ''
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
          <div className="flex flex-shrink-0 items-center gap-2">
            {actions}
            <ChevronDownIcon
              className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </div>
        </button>
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
  meta,
  statusLabel,
  statusTone = 'draft',
  saveLabel,
  progressLabel,
}: {
  studentName: string;
  meta?: string;
  statusLabel?: string;
  statusTone?: 'draft' | 'published' | 'unsaved';
  saveLabel?: string;
  progressLabel?: string;
}) {
  const toneClass =
    statusTone === 'published'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
      : statusTone === 'unsaved'
        ? 'bg-orange-500/15 text-orange-400 border-orange-500/25'
        : 'bg-amber-500/15 text-amber-400 border-amber-500/25';

  return (
    <div className="sticky top-0 z-20 -mx-1 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-indigo-600 text-sm font-black text-white">
            {studentName?.[0] ?? '?'}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-black text-foreground">{studentName}</p>
              {statusLabel ? (
                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${toneClass}`}>
                  {statusLabel}
                </span>
              ) : null}
            </div>
            {meta ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{meta}</p> : null}
            {saveLabel ? <p className="mt-0.5 text-[10px] text-muted-foreground/80">{saveLabel}</p> : null}
          </div>
        </div>
        {progressLabel ? (
          <span className="flex-shrink-0 font-mono text-[11px] text-muted-foreground">{progressLabel}</span>
        ) : null}
      </div>
    </div>
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
      ? 'border-sky-500/25 bg-sky-500/5 text-sky-300'
      : 'border-amber-500/30 bg-amber-500/5 text-amber-300';

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
  description = 'Six weighted components. Labels are what teachers grade — DB field names stay unchanged.',
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
      ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-300'
      : status === 'loading'
        ? 'border-sky-500/25 bg-sky-500/5 text-sky-300'
        : status === 'missing'
          ? 'border-amber-500/25 bg-amber-500/5 text-amber-300'
          : 'border-rose-500/25 bg-rose-500/5 text-rose-300';

  const Icon =
    status === 'ready'
      ? CheckCircleIcon
      : status === 'loading'
        ? ArrowPathIcon
        : ExclamationTriangleIcon;

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-semibold ${styles}`}>
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${status === 'loading' ? 'animate-spin' : ''}`} />
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
    <div className="fixed inset-x-0 bottom-[var(--app-bottom-nav-height)] z-40 border-t border-border bg-background/95 backdrop-blur md:sticky md:bottom-0 md:inset-x-auto md:rounded-xl md:border md:shadow-lg">
      {children}
      {structured ? (
        <div className="mx-auto max-w-5xl space-y-2 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            {primary ? <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{primary}</div> : null}
            {secondary ? <div className="flex flex-wrap items-center gap-2">{secondary}</div> : null}
            {overflow ? (
              <div className="ml-auto flex flex-wrap items-center gap-1.5 opacity-90">{overflow}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
