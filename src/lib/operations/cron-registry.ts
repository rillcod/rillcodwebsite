/**
 * Single source of truth for every scheduled job in the app.
 *
 * Before this file the schedule was described in five places that had all drifted apart:
 * `vercel.json`, `wrangler.toml`, the §12 table in docs/AUTOMATED_OFFICE_MASTER_PLAN.md,
 * the `CRON_PATHS` map in the operations-health route, and the hard-coded interval in each
 * route. Nothing reconciled them, so a job could lose its schedule (or never gain one) without
 * anything failing. Everything that needs to know about the schedule now reads this file, and
 * `cron-registry.test.ts` fails the build if a route exists without an entry or vice versa.
 *
 * `intervalMinutes` is the health cadence, NOT the registration. It feeds `runMonitoredCron`,
 * which stores `next_expected_at = finished_at + intervalMinutes`. Operations Health then adds a
 * grace of `max(10, intervalMinutes * 0.25)` minutes before calling a job Late. It must therefore
 * describe how often the job REALLY runs — a value shorter than the true cadence marks a healthy
 * job Late forever and trains everyone to ignore the panel.
 *
 * The external scheduler itself (cron-job.org) lives outside this repo. This registry is the
 * contract it is expected to honour; `trigger: 'external'` entries are the ones that need an
 * entry there.
 *
 * NOTHING is scheduled by the host. `vercel.json` deliberately has no `crons` key and
 * `wrangler.toml` deliberately has no `[triggers]`, and neither should be given one. Both used to
 * list nine jobs that were never firing — verified against cron_run_history on 2026-07-31, where
 * academic-readiness ran twice in seven days rather than the seven its 04:30 daily entry implied,
 * and term-scheduler twice rather than seven. Re-adding them would not fix a schedule; it would
 * double-fire jobs that already run, including the invoice, billing and payment reminders that
 * email parents.
 */

export type CronTrigger =
  /** Registered on the external scheduler (cron-job.org). Needs its own entry there. */
  | 'external'
  /** Dispatched by another cron through `fanoutCrons`. */
  | 'fanout'
  /** Dispatched by one specific upstream cron only after that job succeeds. */
  | 'chained'
  /** The same work also runs inside another job; no independent schedule is required. */
  | 'piggyback';

export type CronJob = {
  /** Route segment under /api/cron and the `job_name` recorded in `cron_job_health`. */
  name: string;
  /** Plain-language name shown in Operations Health. */
  label: string;
  /** Health cadence in minutes — how often this job really runs. See the note above. */
  intervalMinutes: number;
  trigger: CronTrigger;
  /** For fanout/chained/piggyback: the job that dispatches this one. */
  triggeredBy?: string;
  /** Documented cadence in WAT, for the docs table and operator reference. */
  schedule: string;
  purpose: string;
};

const DAILY = 1440;
const WEEKLY = 7 * 24 * 60;
const MONTHLY = 30 * 24 * 60;

export const CRON_REGISTRY = [
  // ── Registered on the external scheduler ────────────────────────────────────────────────
  {
    name: 'process-notifications',
    label: 'Send waiting messages',
    // Deliberately tight: the 10-minute grace floor puts the Late threshold at ~11 minutes,
    // which matches the 10-minute maximum healthy age this queue is held to.
    intervalMinutes: 1,
    trigger: 'external',
    schedule: 'Every 2-5 minutes',
    purpose: 'Email queue, WhatsApp outbox, scheduled newsletters',
  },
  {
    name: 'live-session-reminders',
    label: 'Class and live-session reminders',
    intervalMinutes: 15,
    trigger: 'external',
    schedule: 'Every 10-15 minutes',
    purpose: 'Upcoming live sessions',
  },
  {
    name: 'onboarding-sweep',
    label: 'Help new users get started',
    intervalMinutes: 15,
    trigger: 'external',
    schedule: 'Every 15 minutes',
    purpose: 'Repair paid but incomplete onboarding; hosts the daily fan-out',
  },
  {
    name: 'process-certificates',
    label: 'Prepare certificates',
    intervalMinutes: 60,
    trigger: 'external',
    schedule: 'Every 30 minutes',
    purpose: 'Certificate queue',
  },
  {
    name: 'communication-followup',
    // Previously had no trigger anywhere in the repo and no confirmed cron-job.org entry, so the
    // owner reminder it sends may never have fired at all. Now driven by onboarding-sweep's hourly
    // fan-out, which does not depend on anyone remembering to register it. Safe if an external
    // entry also exists: followup-runner only selects cases whose last reminder is over an hour
    // old, so a second caller in the same hour finds nothing to send.
    label: 'Owner follow-up reminders',
    intervalMinutes: 60,
    trigger: 'fanout',
    triggeredBy: 'onboarding-sweep',
    schedule: 'Hourly (fan-out)',
    purpose: 'Hourly owner reminder for unanswered customer communication',
  },
  {
    name: 'integrity-sweep',
    label: 'Tidy and repair records',
    intervalMinutes: DAILY,
    trigger: 'external',
    schedule: 'Daily 03:00',
    purpose: 'Operational data integrity and self-healing repair',
  },
  {
    name: 'academic-readiness',
    // Rides onboarding-sweep's existing daily-guarded fan-out — it deliberately does NOT get its
    // own scheduler entry. Observed: 2 runs 14.5 hours apart, at 09:30 and 00:00, which matches
    // the fan-out and not the 04:30 entry vercel.json declares.
    label: 'Prepare classes for teaching',
    intervalMinutes: DAILY,
    trigger: 'fanout',
    triggeredBy: 'onboarding-sweep',
    schedule: 'Daily (fan-out)',
    purpose: 'Prepare official teaching plans and notify teachers',
  },
  {
    name: 'term-scheduler',
    // Observed in cron_run_history 2026-07-31: 3 runs in 30 days, median gap 6.6 days. The
    // registered entry is weekly, not the daily one vercel.json and the old docs claimed.
    label: 'Prepare the next school term',
    intervalMinutes: WEEKLY,
    trigger: 'external',
    schedule: 'Weekly',
    purpose: 'Release approved term content',
  },
  {
    name: 'receipt-sweep',
    // Observed: 341 runs in 7 days, median AND max gap both 30 minutes. The daily entry in
    // vercel.json is decorative; the real scheduler runs this every half hour.
    label: 'Check payment receipts',
    intervalMinutes: 60,
    trigger: 'external',
    schedule: 'Every 30 minutes',
    purpose: 'Missing receipt recovery',
  },
  {
    name: 'at-risk-students',
    label: 'Student-success checks',
    intervalMinutes: DAILY,
    trigger: 'external',
    schedule: 'Daily 07:00',
    purpose: 'Student-success detection; fans out registration and payment recovery',
  },
  {
    name: 'invoice-reminders',
    label: 'Invoice reminders',
    intervalMinutes: DAILY,
    trigger: 'external',
    schedule: 'Daily 07:00',
    purpose: 'Student invoice reminders',
  },
  {
    name: 'billing-reminders',
    label: 'Billing reminders',
    intervalMinutes: DAILY,
    trigger: 'external',
    schedule: 'Daily 08:00',
    purpose: 'Partner-school billing',
  },
  {
    name: 'payment-reminders',
    label: 'Balance payment reminders',
    intervalMinutes: DAILY,
    trigger: 'external',
    schedule: 'Daily 09:00',
    purpose: 'Outstanding registration balances',
  },
  {
    name: 'school-report-readiness',
    label: 'Check school report readiness',
    intervalMinutes: DAILY,
    trigger: 'external',
    schedule: 'Daily 10:00',
    purpose: 'Partner-school reporting readiness',
  },
  {
    name: 'weekly-summary',
    label: 'Monthly parent update',
    intervalMinutes: MONTHLY,
    trigger: 'external',
    schedule: 'Monthly, 1st at 09:00',
    purpose: 'Parent summary',
  },

  // ── Dispatched by onboarding-sweep's once-per-day fan-out ───────────────────────────────
  {
    name: 'assignment-reminders',
    label: 'Assignment reminders',
    intervalMinutes: DAILY,
    trigger: 'fanout',
    triggeredBy: 'onboarding-sweep',
    schedule: 'Daily (fan-out)',
    purpose: 'Upcoming assignment reminders',
  },
  {
    name: 'form-followup',
    label: 'Form and registration follow-up',
    intervalMinutes: DAILY,
    trigger: 'fanout',
    triggeredBy: 'onboarding-sweep',
    schedule: 'Daily (fan-out)',
    purpose: 'Form and registration follow-up',
  },
  {
    name: 'lead-nurture',
    label: 'Follow up interested customers',
    intervalMinutes: DAILY,
    trigger: 'fanout',
    triggeredBy: 'onboarding-sweep',
    schedule: 'Daily (fan-out)',
    purpose: 'State-aware lead nurture',
  },

  {
    name: 'streak-reminder',
    // Observed: 672 runs in 7 days, median AND max gap both 15 minutes, latest run in the same
    // minute as onboarding-sweep and live-session-reminders. It has its own 15-minute scheduler
    // entry — at-risk-students also fans it out, but the external entry sets the real cadence.
    label: 'Learning activity reminders',
    intervalMinutes: 15,
    trigger: 'external',
    schedule: 'Every 15 minutes (also fanned out by at-risk-students)',
    purpose: 'Engagement reminder',
  },

  // ── Chained after a specific upstream job succeeds ──────────────────────────────────────
  {
    name: 'auto-generate-content',
    // Hourly, not daily. Each run is bounded by a ~50s budget (about 4-5 classes), so a daily
    // sweep tops out near 30 classes a week — short of the 60 that need weekly content. Hourly
    // rides onboarding-sweep's existing 15-minute entry behind an hourly guard, so this needed no
    // new scheduler registration. academic-readiness still chains it too, as an immediate kick
    // once new plans are prepared rather than waiting up to an hour.
    label: 'Generate lesson content',
    intervalMinutes: 60,
    trigger: 'fanout',
    triggeredBy: 'onboarding-sweep',
    schedule: 'Hourly (fan-out); also chained from academic-readiness',
    purpose: 'Approved academic plan generation',
  },

  // ── No independent schedule ─────────────────────────────────────────────────────────────
  {
    name: 'publish-newsletters',
    label: 'Publish scheduled newsletters',
    intervalMinutes: 5,
    trigger: 'piggyback',
    triggeredBy: 'process-notifications',
    schedule: 'Optional; the same work runs inside process-notifications',
    purpose: 'Scheduled newsletter publication',
  },
] as const satisfies readonly CronJob[];

export type CronJobName = (typeof CRON_REGISTRY)[number]['name'];

const BY_NAME = new Map<string, CronJob>(CRON_REGISTRY.map((job) => [job.name, job]));

export function cronJob(name: CronJobName): CronJob {
  const job = BY_NAME.get(name);
  if (!job) throw new Error(`Unknown cron job: ${name}`);
  return job;
}

/**
 * Health cadence for a job. Routes call this instead of hard-coding a number so the interval
 * can never drift away from the registered schedule again.
 */
export function cronInterval(name: CronJobName): number {
  return cronJob(name).intervalMinutes;
}

export function cronPath(name: string): string {
  return `/api/cron/${name}`;
}

/**
 * Jobs that keep their own row in `cron_job_health`. Piggybacked work is excluded: it has no
 * independent schedule, so it would sit at "Waiting for first run" forever and mean nothing.
 */
export function monitoredCronJobs(): CronJob[] {
  return CRON_REGISTRY.filter((job) => job.trigger !== 'piggyback');
}

/** `job name → route path` for every job, including piggybacked ones (manual run stays useful). */
export function cronPathMap(): Record<string, string> {
  return Object.fromEntries(CRON_REGISTRY.map((job) => [job.name, cronPath(job.name)]));
}

export function cronLabel(name: string): string {
  return BY_NAME.get(name)?.label
    ?? name.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
