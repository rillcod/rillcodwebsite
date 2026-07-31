/**
 * Print the §12 automation schedule table from the cron registry.
 *
 *   npm run cron:table
 *
 * The registry (src/lib/operations/cron-registry.ts) is the source of truth. Paste the output over
 * the table in docs/AUTOMATED_OFFICE_MASTER_PLAN.md whenever a job is added, retimed, or retired,
 * so the documentation cannot drift away from the code again.
 */
import { CRON_REGISTRY, type CronJob } from '../src/lib/operations/cron-registry';

const jobs: readonly CronJob[] = CRON_REGISTRY;

/** When Operations Health starts calling the job Late: interval + max(10, interval * 0.25). */
function maxHealthyAge(minutes: number): string {
  const late = minutes + Math.max(10, Math.round(minutes * 0.25));
  if (late >= 2880) return `${+(late / 1440).toFixed(1)} days`;
  if (late >= 120) return `${+(late / 60).toFixed(1)} hours`;
  return `${late} minutes`;
}

function triggeredBy(job: CronJob): string {
  switch (job.trigger) {
    case 'external': return 'External scheduler';
    case 'chained': return `Chained from \`${job.triggeredBy}\``;
    case 'piggyback': return `Runs inside \`${job.triggeredBy}\``;
    default: return `Fan-out from \`${job.triggeredBy}\``;
  }
}

const header = [
  '| Job | Schedule (WAT) | Maximum healthy age | Triggered by | Purpose |',
  '|---|---:|---:|---|---|',
];

const rows = jobs.map(
  (job) => `| \`${job.name}\` | ${job.schedule} | ${maxHealthyAge(job.intervalMinutes)} | ${triggeredBy(job)} | ${job.purpose} |`,
);

console.log([...header, ...rows].join('\n'));
