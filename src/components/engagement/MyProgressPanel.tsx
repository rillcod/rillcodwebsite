'use client';

import { useEffect, useState } from 'react';

/**
 * A learner's own progress, in the order they care about it.
 *
 * What to do next comes first and largest. The old screen led with a points
 * total, which tells a beginner nothing they can act on — and with the first
 * level 500 points away, the number sat still for a term. Points are here, but
 * as supporting detail, not the headline.
 */

type Milestone = { key: string; label: string; icon: string; stage: string; how: string };
type Skill = { name: string; level: 'introduced' | 'practising' | 'confident'; timesShown: number; bestScore: number | null };

type Engagement = {
  progress: {
    points: number; level: string; levelTitle: string; levelIcon: string; levelMeaning: string;
    nextLevel: string | null; nextLevelTitle: string | null;
    pointsToNextLevel: number; percentToNextLevel: number;
  };
  nextStep: string;
  streak: { current: number; longest: number };
  activity: { lessonsCompleted: number; assignmentsSubmitted: number; quizzesPassed: number; portfolioProjects: number };
  skills: Skill[];
  skillsSummary: string;
  milestones: { earned: Milestone[]; next: Milestone | null };
};

const SKILL_TONE: Record<Skill['level'], string> = {
  confident: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25',
  practising: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25',
  introduced: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/25',
};

const SKILL_WORD: Record<Skill['level'], string> = {
  confident: 'Confident',
  practising: 'Practising',
  introduced: 'Just started',
};

export default function MyProgressPanel({ userId }: { userId?: string }) {
  const [data, setData] = useState<Engagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/user-points${userId ? `?user_id=${userId}` : ''}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Could not load your progress');
        if (!cancelled) setData(json.engagement ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load your progress');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return <div className="h-40 rounded-2xl border border-white/10 bg-white/[0.02] animate-pulse" />;
  }
  if (error || !data) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-muted-foreground">
        {error || 'No progress yet.'}
      </div>
    );
  }

  const { progress, milestones } = data;

  return (
    <div className="space-y-4">
      {/* What to do next — the headline, because it is the only part that is actionable. */}
      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Your next step</p>
        <p className="text-lg font-black text-foreground">{data.nextStep}</p>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] font-bold">
            <span className="text-muted-foreground">
              <span className="mr-1">{progress.levelIcon}</span>
              {progress.levelTitle} · {progress.levelMeaning}
            </span>
            <span className="text-foreground">
              {progress.nextLevelTitle
                ? `${progress.pointsToNextLevel} points to ${progress.nextLevelTitle}`
                : 'Top level reached'}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress.percentToNextLevel}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">{progress.points} points earned so far</p>
        </div>
      </div>

      {/* What they have done. Counts, not points — a learner recognises these. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {([
          ['Lessons', data.activity.lessonsCompleted],
          ['Hand-ins', data.activity.assignmentsSubmitted],
          ['Quizzes passed', data.activity.quizzesPassed],
          ['Projects', data.activity.portfolioProjects],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <p className="text-xl font-black tabular-nums text-foreground">{value}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {data.streak.current > 1 && (
        <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
          🔥 {data.streak.current} days in a row
          {data.streak.longest > data.streak.current && ` · best ${data.streak.longest}`}
        </p>
      )}

      {/* Skills — what they can now do, which points never told them. */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">What you can do</p>
          <p className="text-sm font-bold text-foreground mt-1">{data.skillsSummary}</p>
        </div>
        {data.skills.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {data.skills.slice(0, 12).map((skill) => (
              <li
                key={skill.name}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${SKILL_TONE[skill.level]}`}
                title={`Shown in ${skill.timesShown} piece${skill.timesShown === 1 ? '' : 's'} of marked work`}
              >
                {skill.name}
                <span className="ml-1.5 opacity-70 font-medium">{SKILL_WORD[skill.level]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Milestones. The next one is shown as a target, not hidden until earned. */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Milestones</p>

        {milestones.next && (
          <div className="rounded-xl border border-dashed border-white/20 px-3 py-2.5 flex items-center gap-3">
            <span className="text-2xl opacity-40">{milestones.next.icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-black text-foreground">{milestones.next.label}</p>
              <p className="text-[11px] text-muted-foreground">{milestones.next.how}</p>
            </div>
          </div>
        )}

        {milestones.earned.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {milestones.earned.map((m) => (
              <li
                key={m.key}
                className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400"
                title={m.how}
              >
                <span className="mr-1">{m.icon}</span>{m.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-muted-foreground">None yet — the first one is a single lesson away.</p>
        )}
      </div>
    </div>
  );
}
