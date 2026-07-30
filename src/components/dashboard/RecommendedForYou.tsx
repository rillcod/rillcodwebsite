'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  SparklesIcon, ArrowRightIcon, BookOpenIcon, BoltIcon, AcademicCapIcon, ArrowPathIcon,
  ClipboardDocumentListIcon,
} from '@/lib/icons';

type Rec = {
  type: 'continue' | 'reinforce' | 'start' | 'review' | 'exam';
  title: string;
  reason: string;
  href: string;
  course_title?: string;
};

const ICON: Record<Rec['type'], any> = {
  continue: BookOpenIcon,
  reinforce: BoltIcon,
  start: AcademicCapIcon,
  review: ArrowPathIcon,
  exam: ClipboardDocumentListIcon,
};
const ACCENT: Record<Rec['type'], string> = {
  continue: 'text-violet-600 dark:text-violet-400 border-violet-500/25 bg-violet-500/8',
  reinforce: 'text-amber-600 dark:text-amber-400 border-amber-500/25 bg-amber-500/8',
  start: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/25 bg-emerald-500/8',
  review: 'text-cyan-600 dark:text-cyan-400 border-cyan-500/25 bg-cyan-500/8',
  exam: 'text-rose-600 dark:text-rose-400 border-rose-500/25 bg-rose-500/8',
};
const LABEL: Record<Rec['type'], string> = {
  continue: 'Continue', reinforce: 'Reinforce', start: 'Start next', review: 'Review', exam: 'Exam',
};

/**
 * "Recommended for you" — fast, heuristic learner recommendations (no AI tokens).
 * Renders nothing while loading or when there's nothing to suggest, so it never
 * shows an empty box on the dashboard.
 */
export default function RecommendedForYou() {
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/recommendations')
      .then((r) => (r.ok ? r.json() : { recommendations: [] }))
      .then((j) => { if (active) { setRecs(j.recommendations ?? []); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading || recs.length === 0) return null;

  return (
    <section className="bg-card border border-border p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <SparklesIcon className="w-5 h-5 text-violet-600 dark:text-violet-400" />
        <h2 className="text-base font-black text-foreground">Recommended for you</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {recs.map((r, i) => {
          const Icon = ICON[r.type] ?? BookOpenIcon;
          return (
            <Link key={`${r.href}-${i}`} href={r.href}
              className={`group flex flex-col gap-2 p-4 rounded-xl border transition-all hover:scale-[1.02] ${ACCENT[r.type] ?? ACCENT.continue}`}>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest">
                  <Icon className="w-3.5 h-3.5" /> {LABEL[r.type] ?? 'Learn'}
                </span>
                <ArrowRightIcon className="w-4 h-4 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-sm font-bold text-foreground leading-snug line-clamp-2">{r.title}</p>
              <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">{r.reason}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
