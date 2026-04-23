'use client';

import Link from 'next/link';
import { Fragment, useCallback, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  BookOpenIcon,
  ArrowLeftIcon,
  Squares2X2Icon,
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentListIcon,
  ArrowDownTrayIcon,
} from '@/lib/icons';
import {
  DELIVERY_MODE_CHOICES,
  LEARNING_FLOW_STRIP_LABELS,
  LEARNING_QA_SYSTEM_ORDER,
  LEARNING_SYSTEM_MAP_API_PATH,
  LEARNING_VERSIONING,
  QA_CATALOG_VERSION,
} from '@/lib/learning/qaSystemOrder';

function ListBlock({
  label,
  items,
}: {
  label: string;
  items: string[] | { name: string; note?: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <ul className="space-y-1 text-xs text-foreground/90">
        {items.map((x, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-orange-500 font-black shrink-0">·</span>
            <span>
              {typeof x === 'string' ? x : x.name}
              {typeof x !== 'string' && x.note && (
                <span className="text-muted-foreground"> — {x.note}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function friendlyDbName(name: string): string {
  return name
    .replace(/^public\./, '')
    .replace(/^lesson_plans\./, 'lesson plans ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function LearningSystemMapPage() {
  const { profile, loading } = useAuth();
  const canSee = profile?.role === 'admin' || profile?.role === 'teacher';
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');

  const copyMapJson = useCallback(async () => {
    setCopyState('idle');
    try {
      const res = await fetch(LEARNING_SYSTEM_MAP_API_PATH, { cache: 'no-store' });
      const j = await res.text();
      if (!res.ok) {
        setCopyState('err');
        return;
      }
      await navigator.clipboard.writeText(j);
      setCopyState('ok');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('err');
    }
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  if (!canSee) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center text-sm text-muted-foreground">
        This page is for teachers and administrators.
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-card/40 px-4 py-4 sm:px-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
          <Link
            href="/dashboard/curriculum"
            className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground w-fit"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to curriculum
          </Link>
        </div>
        <div className="max-w-4xl mx-auto mt-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
              <Squares2X2Icon className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">Learning &amp; QA system map</h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                One clear order: choose course, set syllabus path, set term plan, then deliver weekly lessons.
                This page explains where each part lives so nothing feels hidden.
                Active catalog version: <code className="text-orange-300 bg-muted px-1">{QA_CATALOG_VERSION}</code>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 py-8 max-w-4xl mx-auto space-y-4">
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/[0.05] p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-300">Start here (simple)</p>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <li className="border border-border rounded-lg p-3 bg-card/60">
              <p className="font-black text-foreground">1) Choose your course</p>
              <p className="text-muted-foreground mt-1">Open the course syllabus and pick the class/course you want to work on.</p>
              <Link href="/dashboard/curriculum" className="inline-flex mt-2 text-cyan-300 font-bold hover:underline">
                Open Curriculum
              </Link>
            </li>
            <li className="border border-border rounded-lg p-3 bg-card/60">
              <p className="font-black text-foreground">2) Pick teaching path (optional)</p>
              <p className="text-muted-foreground mt-1">Use the optional teaching path tool only if it fits your class. Preview first.</p>
              <Link href="/dashboard/curriculum" className="inline-flex mt-2 text-cyan-300 font-bold hover:underline">
                Open Teaching Path Tool
              </Link>
            </li>
            <li className="border border-border rounded-lg p-3 bg-card/60">
              <p className="font-black text-foreground">3) Set term plan</p>
              <p className="text-muted-foreground mt-1">Generate term progression so the syllabus becomes a clear weekly plan.</p>
              <Link href="/dashboard/lesson-plans" className="inline-flex mt-2 text-cyan-300 font-bold hover:underline">
                Open Lesson Plans
              </Link>
            </li>
            <li className="border border-border rounded-lg p-3 bg-card/60">
              <p className="font-black text-foreground">4) Deliver and track weekly</p>
              <p className="text-muted-foreground mt-1">Track weekly progress, teach lessons, then release assignments/projects/CBT.</p>
              <Link href="/dashboard/curriculum/progress" className="inline-flex mt-2 text-cyan-300 font-bold hover:underline">
                Open Progress
              </Link>
            </li>
          </ol>
        </div>

        {/* One-line linear flow (visual) */}
        <div className="rounded-xl border border-border bg-gradient-to-b from-card to-card/50 p-4">
          <p className="text-[9px] font-black uppercase tracking-widest text-orange-400 mb-3">Simple order</p>
          <div className="overflow-x-auto pb-1 -mx-1 px-1">
            <div className="flex flex-nowrap items-center gap-0.5 min-w-max sm:flex-wrap sm:min-w-0">
              {LEARNING_QA_SYSTEM_ORDER.map((layer, i) => (
                <Fragment key={layer.order}>
                  {i > 0 && <span className="text-muted-foreground text-lg px-0.5 select-none" aria-hidden>→</span>}
                  <span
                    className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/30 px-2 py-1.5 text-[10px] font-bold text-foreground whitespace-nowrap"
                    title={layer.title}
                  >
                    <span className="text-orange-500 font-black tabular-nums">{layer.order}</span>
                    {LEARNING_FLOW_STRIP_LABELS[layer.order] ?? '—'}
                  </span>
                </Fragment>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            Step 5 is your term plan. Do it <strong className="text-foreground/90">right after syllabus</strong> and
            <strong className="text-foreground/90"> before</strong> weekly tracking, live lessons, and assignments.
          </p>
        </div>

        {/* Versions: curriculum v vs QA catalog (not fixed) */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-cyan-400">Version guide</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(
              [
                'syllabusDocument',
                'qaSpineCatalog',
                'curriculumMetadata',
                'classQa',
              ] as const
            ).map((key) => {
              const v = LEARNING_VERSIONING[key];
              return (
                <div
                  key={key}
                  className="rounded-lg border border-border/70 bg-background/50 p-3 text-xs"
                >
                  <p className="font-black text-foreground text-[11px]">{v.label}</p>
                  <p className="text-[10px] text-cyan-500/90 font-mono mt-0.5 break-all">{v.where}</p>
                  <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
                    {v.note}
                    {'current' in v && v.current != null && (
                      <>
                        {' '}
                        <span className="text-foreground font-bold">Now: {String(v.current)}</span>
                      </>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Adopt / flexible / traditional — policy in one place */}
        <div className="rounded-xl border border-dashed border-orange-500/30 bg-orange-500/[0.04] p-4 space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-orange-300">Choose how your school works</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {DELIVERY_MODE_CHOICES.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1.5"
              >
                <p className="text-xs font-black text-foreground leading-tight">{m.title}</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed flex-1">{m.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 space-y-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-300">
            Recommended flow (safe default)
          </p>
          <ol className="space-y-1.5 text-[11px] text-muted-foreground">
            <li><span className="text-foreground font-bold">1.</span> Keep class policy optional (`qa_grade_mode = optional`).</li>
            <li><span className="text-foreground font-bold">2.</span> Open QA panel, inspect DB rows and lane counts first.</li>
            <li><span className="text-foreground font-bold">3.</span> Select class and run preview before apply.</li>
            <li><span className="text-foreground font-bold">4.</span> If preview does not fit, skip apply and continue traditional week-by-week.</li>
            <li><span className="text-foreground font-bold">5.</span> When fit is good, apply spine to this syllabus copy and keep overwrite off unless needed.</li>
            <li><span className="text-foreground font-bold">6.</span> Generate term progression, then run tracking, lessons, and assignments in order.</li>
          </ol>
        </div>

        <div className="rounded-lg border border-dashed border-border bg-card/30 p-4 text-xs text-muted-foreground space-y-3">
          <p className="font-bold text-foreground">At a glance</p>
          <p className="leading-relaxed">
            Programme → <span className="text-foreground">spine</span> → <span className="text-foreground">class</span> →{' '}
            <span className="text-foreground">syllabus (QA or traditional)</span> → <span className="text-foreground">term progression</span> (set rails) →{' '}
            week tracking → live lessons → assignments / projects / CBT.
          </p>
        </div>

        <ol className="space-y-4">
          {LEARNING_QA_SYSTEM_ORDER.map((layer) => (
            <li
              key={layer.order}
              className="relative rounded-xl border border-border bg-card overflow-hidden"
            >
              <div className="flex items-start gap-0 border-b border-border/80 bg-gradient-to-r from-orange-500/5 to-transparent px-4 py-3">
                <span className="text-2xl font-black text-orange-500 tabular-nums w-10 shrink-0">
                  {layer.order}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-black text-foreground leading-tight">{layer.title}</h2>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{layer.purpose}</p>
                </div>
              </div>
              <div className="p-4 space-y-4 sm:grid sm:grid-cols-2 sm:gap-6 sm:space-y-0">
                <div className="space-y-4">
                  <ListBlock
                    label="Where data is saved"
                    items={layer.db.map((x) => ({ ...x, name: friendlyDbName(x.name) }))}
                  />
                  <ListBlock
                    label="Main setup updates"
                    items={layer.sqlMigrations.map((m) => m.replace('.sql', ''))}
                  />
                </div>
                <div className="space-y-4">
                  <ListBlock label="System actions in this step" items={layer.apiRoutes} />
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Where to click</p>
                    <ul className="space-y-1.5">
                      {layer.appPaths.map((p) => (
                        <li key={p.path}>
                          <Link
                            href={p.path}
                            className="group inline-flex items-center gap-1.5 text-xs font-bold text-cyan-400 hover:text-cyan-300"
                          >
                            <BookOpenIcon className="w-3.5 h-3.5" />
                            {p.label}
                            <ArrowTopRightOnSquareIcon className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <details className="px-4 pb-4">
                <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground">
                  Advanced details
                </summary>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ListBlock label="Database tables" items={layer.db} />
                  <ListBlock label="API routes" items={layer.apiRoutes} />
                  <ListBlock label="SQL migration files" items={layer.sqlMigrations} />
                  {layer.codeRefs && layer.codeRefs.length > 0 ? (
                    <ListBlock label="Code references" items={layer.codeRefs} />
                  ) : (
                    <div />
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-cyan-500/80">System export (for technical teams)</p>
                  <code className="text-[10px] bg-background border border-border px-2 py-1 rounded break-all inline-block">
                    GET {LEARNING_SYSTEM_MAP_API_PATH}
                  </code>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void copyMapJson()}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest border border-border bg-muted/30 hover:bg-muted/50"
                    >
                      <ClipboardDocumentListIcon className="w-3.5 h-3.5" />
                      {copyState === 'ok' ? 'Copied' : copyState === 'err' ? 'Copy failed' : 'Copy response'}
                    </button>
                    <a
                      href={LEARNING_SYSTEM_MAP_API_PATH}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10"
                    >
                      <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                      Open JSON
                    </a>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ol>

        <p className="text-[11px] text-muted-foreground text-center pt-2">
          For narrative diagrams and runbooks, see{' '}
          <code className="text-foreground/80">docs/LEARNING_QA_ARCHITECTURE.md</code> in the repo.
        </p>
      </div>
    </div>
  );
}
