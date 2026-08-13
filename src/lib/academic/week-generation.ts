/**
 * One week of teaching content for one class plan: lesson package + slides + flashcards + tasks.
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
import { invokePlanWeekGenerator } from '@/lib/academic/plan-week-generators';

// The content types and their order are settings, not generator trivia — see
// auto-generate-settings, which the cron, the plan page and the readiness
// automation all read from too. Re-exported so existing importers are unchanged.
export {
  WEEK_CONTENT_TYPES,
  normaliseTypes,
  type WeekContentType,
} from './auto-generate-settings';
import { normaliseTypes } from './auto-generate-settings';
import {
  currentDeliveryWeek as calculateDeliveryWeek,
  currentTermWeek as calculateTermWeek,
} from './delivery-calendar';

/** Which teaching week a plan is in today. Week 1 starts on term_start. */
export function currentTermWeek(termStart: string | null, now = new Date()): number {
  return calculateTermWeek(termStart, now);
}

/**
 * Which teaching week a plan is in, whichever spine it runs on.
 *
 * A school plan counts from term_start. A duration programme has no term and no
 * term_start, so counting from it returned week 1 forever — the sweep would
 * have regenerated week 1 every night for a holiday programme instead of
 * advancing through it. Duration plans count from their delivery period's
 * start date instead.
 */
export function currentDeliveryWeek(input: {
  termStart?: string | null;
  periodStart?: string | null;
}, now = new Date()): number {
  return calculateDeliveryWeek(input, now);
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
  /**
   * Optional class meeting within the week (1-based). Special-programme launch
   * uses session 1 only so AI stays within context; teachers prep the rest.
   */
  session?: number | null;
  types?: unknown;
  /** Legacy — in-process generators ignore this. Kept for callers that still pass it. */
  baseUrl?: string;
  /** Cron secret for unattended runs; omit and pass `cookie` for a signed-in teacher. */
  cronSecret?: string;
  cookie?: string;
  /**
   * Publish generated content straight to students. Defaults to false: nobody
   * has read it yet.
   *
   * Generators treat anything other than an explicit `auto_publish: true` as
   * hold-for-approval. This function still defaults the field to false so the
   * unattended sweep never accidentally opts in.
   */
  autoPublish?: boolean;
}): Promise<WeekGenerationOutcome> {
  const autoPublish = input.autoPublish === true;
  const types = normaliseTypes(input.types);
  const sessionRaw = Number(input.session);
  const session =
    Number.isFinite(sessionRaw) && sessionRaw > 0
      ? Math.floor(sessionRaw)
      : null;
  const outcome: WeekGenerationOutcome = {
    week: input.week,
    generated: 0,
    skipped: 0,
    byType: {},
    failedTypes: [],
  };

  for (const type of types) {
    try {
      const res = await invokePlanWeekGenerator({
        planId: input.planId,
        type,
        week: input.week,
        session,
        autoPublish,
        cronSecret: input.cronSecret,
        cookie: input.cookie,
      });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        // The plan guards answer with a reason worth keeping — "this plan is a
        // draft" is actionable, "HTTP 422" is not.
        try {
          const body = await res.json();
          if (body?.error) detail = String(body.error);
        } catch {
          /* not JSON — the status is all there is */
        }
        outcome.byType[type] = { error: detail };
        outcome.failedTypes.push(type);
        continue;
      }

      let generated = 0;
      let skipped = 0;
      const isJsonEndpoint = type === 'slides' || type === 'flashcards';
      if (isJsonEndpoint) {
        const body = await res.json().catch(() => ({}));
        generated = Number(body?.generated) || 0;
        skipped = Number(body?.skipped) || 0;
      } else {
        ({ generated, skipped } = await consumeSSEUntilDone(res));
      }
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
  input: {
    planId: string;
    classId: string | null;
    week: number;
    outcome: WeekGenerationOutcome;
    /** When false/undefined, point the teacher at the approvals queue. */
    autoPublish?: boolean;
  },
): Promise<'sent' | 'skipped_no_content' | 'skipped_no_teacher' | 'skipped_duplicate' | 'failed'> {
  if (input.outcome.generated < 1) return 'skipped_no_content';
  if (!input.classId) return 'skipped_no_teacher';

  const { data: klass } = await db
    .from('classes')
    .select('id, name, teacher_id')
    .eq('id', input.classId)
    .maybeSingle();
  if (!klass?.teacher_id) return 'skipped_no_teacher';

  // Held weeks go to the shared approvals inbox; live weeks go to the plan.
  const actionUrl =
    input.autoPublish === true
      ? `/dashboard/lesson-plans/${input.planId}?week=${input.week}`
      : `/dashboard/teaching/approvals`;

  // Same plan + week + teacher = already told. Scoped by title+week so a
  // held→live change later does not re-notify for the same prep.
  const title = `Week ${input.week} is ready to review`;
  const { data: existing } = await db
    .from('notifications')
    .select('id')
    .eq('user_id', klass.teacher_id)
    .eq('title', title)
    .limit(1)
    .maybeSingle();
  if (existing) return 'skipped_duplicate';

  const now = new Date().toISOString();
  const partial = input.outcome.failedTypes.length
    ? ` (${input.outcome.failedTypes.join(' and ')} still to come)`
    : '';
  const message =
    input.autoPublish === true
      ? `${klass.name}: this week's teaching content is live for students${partial}.`
      : `${klass.name}: this week's teaching content has been prepared${partial}. ` +
        `Review it on Approvals and release when you are happy with it.`;

  const { error } = await db.from('notifications').insert({
    user_id: klass.teacher_id,
    title,
    message,
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
