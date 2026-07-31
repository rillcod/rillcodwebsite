/**
 * One week of teaching content for one class plan: the lesson, the assignment and the project.
 *
 * Both entry points share this so they cannot drift: the weekly sweep
 * (/api/cron/auto-generate-content) and the teacher's "Generate next week now" button
 * (/api/lesson-plans/[id]/generate-week). Whichever fires, the teacher ends up with the same
 * content and the same "ready to review" notice.
 *
 * Nothing here publishes. Generated weeks stay draft so a human still reviews before learners
 * see them — high automation, but the quality gate stays with the teacher.
 */
import { consumeSSEUntilDone } from '@/lib/lesson-plans/ai-fetch';

export const WEEK_CONTENT_TYPES = ['lessons', 'assignments', 'projects'] as const;
export type WeekContentType = (typeof WEEK_CONTENT_TYPES)[number];

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Which teaching week a plan is in today. Week 1 starts on term_start. */
export function currentTermWeek(termStart: string | null): number {
  if (!termStart) return 1;
  const started = new Date(termStart).getTime();
  if (!Number.isFinite(started)) return 1;
  const elapsed = Date.now() - started;
  if (elapsed < 0) return 1; // term has not started yet
  return Math.max(1, Math.ceil(elapsed / MS_PER_WEEK));
}

export function normaliseTypes(raw: unknown): WeekContentType[] {
  const list = Array.isArray(raw) ? raw : WEEK_CONTENT_TYPES;
  const picked = list.filter((t): t is WeekContentType =>
    WEEK_CONTENT_TYPES.includes(t as WeekContentType),
  );
  return picked.length ? picked : [...WEEK_CONTENT_TYPES];
}

export type WeekGenerationOutcome = {
  week: number;
  generated: number;
  skipped: number;
  byType: Record<string, { generated: number; skipped: number } | { error: string }>;
  failedTypes: string[];
};

/**
 * Generate one specific week for one plan. `only_weeks` keeps each call to a single week so a
 * run cannot silently burn the whole term's AI budget.
 *
 * Never throws: a type that fails is recorded in `failedTypes` and the rest still run, so one
 * flaky generator cannot cost the teacher the other two.
 */
export async function generatePlanWeek(input: {
  planId: string;
  week: number;
  types?: unknown;
  baseUrl: string;
  /** Cron secret for unattended runs; omit and pass `cookie` for a signed-in teacher. */
  cronSecret?: string;
  cookie?: string;
}): Promise<WeekGenerationOutcome> {
  const types = normaliseTypes(input.types);
  const outcome: WeekGenerationOutcome = {
    week: input.week,
    generated: 0,
    skipped: 0,
    byType: {},
    failedTypes: [],
  };

  for (const type of types) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (input.cronSecret) headers['x-cron-secret'] = input.cronSecret;
      if (input.cookie) headers.cookie = input.cookie;

      const res = await fetch(`${input.baseUrl}/api/lesson-plans/${input.planId}/generate-${type}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ only_weeks: [input.week], max_weeks: 1 }),
        cache: 'no-store',
      });

      if (!res.ok) {
        outcome.byType[type] = { error: `HTTP ${res.status}` };
        outcome.failedTypes.push(type);
        continue;
      }

      const { generated, skipped } = await consumeSSEUntilDone(res);
      outcome.generated += generated;
      outcome.skipped += skipped;
      outcome.byType[type] = { generated, skipped };
    } catch (error) {
      outcome.byType[type] = { error: error instanceof Error ? error.message : String(error) };
      outcome.failedTypes.push(type);
    }
  }

  return outcome;
}

/**
 * Tell the class's teacher their week is waiting. Sent only when something was actually created —
 * a notice for a week that generated nothing is noise, and noise is what stops people reading
 * notifications at all.
 *
 * Idempotent per plan+week: the sweep may retry a plan, and a teacher may press the button after
 * it, without the teacher being told twice.
 */
export async function notifyWeekReady(
  db: any,
  input: { planId: string; classId: string | null; week: number; outcome: WeekGenerationOutcome },
): Promise<'sent' | 'skipped_no_content' | 'skipped_no_teacher' | 'skipped_duplicate' | 'failed'> {
  if (input.outcome.generated < 1) return 'skipped_no_content';
  if (!input.classId) return 'skipped_no_teacher';

  const { data: klass } = await db
    .from('classes')
    .select('id, name, teacher_id')
    .eq('id', input.classId)
    .maybeSingle();
  if (!klass?.teacher_id) return 'skipped_no_teacher';

  const actionUrl = `/dashboard/lesson-plans/${input.planId}?week=${input.week}`;

  // Same plan + week + teacher = already told. Scoped by action_url so it cannot collide with
  // another class's week.
  const { data: existing } = await db
    .from('notifications')
    .select('id')
    .eq('user_id', klass.teacher_id)
    .eq('action_url', actionUrl)
    .limit(1)
    .maybeSingle();
  if (existing) return 'skipped_duplicate';

  const now = new Date().toISOString();
  const partial = input.outcome.failedTypes.length
    ? ` (${input.outcome.failedTypes.join(' and ')} still to come)`
    : '';
  const { error } = await db.from('notifications').insert({
    user_id: klass.teacher_id,
    title: `Week ${input.week} is ready to review`,
    message:
      `${klass.name}: this week's teaching content has been prepared${partial}. ` +
      `Review it and publish when you are happy with it.`,
    type: 'info',
    action_url: actionUrl,
    is_read: false,
    created_at: now,
    updated_at: now,
  });
  return error ? 'failed' : 'sent';
}

/** True when this user is allowed to generate for this class. Teachers get their OWN classes only. */
export function canGenerateForClass(
  actor: { id: string; role: string | null },
  klass: { teacher_id: string | null } | null,
): boolean {
  if (actor.role === 'admin') return true;
  if (actor.role !== 'teacher') return false;
  return Boolean(klass?.teacher_id && klass.teacher_id === actor.id);
}
