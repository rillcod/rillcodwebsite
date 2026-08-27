import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { CRON_REGISTRY, monitoredCronJobs, cronPathMap, type CronJob } from './cron-registry';

const CRON_DIR = path.resolve(__dirname, '../../app/api/cron');

// `CRON_REGISTRY` is `as const`, so TypeScript narrows these filters down to `never` and the
// assertions stop compiling. Widen once: the point is to check the data at runtime, since the
// registry is edited by hand.
const jobs: readonly CronJob[] = CRON_REGISTRY;

function routeDirs(): string[] {
  return readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(CRON_DIR, entry.name, 'route.ts')))
    .map((entry) => entry.name);
}

function routeSource(name: string): string {
  return readFileSync(path.join(CRON_DIR, name, 'route.ts'), 'utf8');
}

describe('cron registry', () => {
  it('has no duplicate job names', () => {
    const names = jobs.map((job) => job.name);
    expect(new Set(names).size).toBe(names.length);
  });

  // The two directions below are the point of the registry: a job cannot lose its schedule by
  // being added without an entry, and an entry cannot outlive the route it describes.
  it('has an entry for every /api/cron route', () => {
    const missing = routeDirs().filter((dir) => !jobs.some((job) => job.name === dir));
    expect(missing, `cron routes with no registry entry: ${missing.join(', ')}`).toEqual([]);
  });

  it('has a route for every entry', () => {
    const dirs = routeDirs();
    const missing = jobs.filter((job) => !dirs.includes(job.name)).map((job) => job.name);
    expect(missing, `registry entries with no route: ${missing.join(', ')}`).toEqual([]);
  });

  it('monitors every job that has its own schedule', () => {
    const unmonitored = monitoredCronJobs()
      .filter((job) => !routeSource(job.name).includes('runMonitoredCron'))
      .map((job) => job.name);
    expect(unmonitored, `scheduled jobs missing runMonitoredCron: ${unmonitored.join(', ')}`).toEqual([]);
  });

  // A hard-coded number is how the intervals drifted out of step with the real cadence and left
  // four healthy jobs reading "Late" in Operations Health.
  it('takes its health interval from the registry rather than a literal', () => {
    const hardCoded = monitoredCronJobs()
      .filter((job) => !routeSource(job.name).includes(`cronInterval('${job.name}')`))
      .map((job) => job.name);
    expect(hardCoded, `routes not using cronInterval(): ${hardCoded.join(', ')}`).toEqual([]);
  });

  it('points every triggeredBy at a real job', () => {
    const dangling = jobs
      .filter((job) => 'triggeredBy' in job && job.triggeredBy)
      .filter((job) => !jobs.some((other) => other.name === (job as { triggeredBy: string }).triggeredBy))
      .map((job) => job.name);
    expect(dangling).toEqual([]);
  });

  it('requires a triggeredBy on jobs that have no schedule of their own', () => {
    const orphaned = jobs
      .filter((job) => job.trigger !== 'external')
      .filter((job) => !('triggeredBy' in job && job.triggeredBy))
      .map((job) => job.name);
    expect(orphaned, `dispatched jobs with no parent: ${orphaned.join(', ')}`).toEqual([]);
  });

  // Claiming a parent is not proof of dispatch — the parent must really name the child.
  it('is actually dispatched by the parent it names', () => {
    const notDispatched = jobs
      .filter((job) => job.trigger === 'fanout' || job.trigger === 'chained')
      .filter((job) => {
        const parent = (job as { triggeredBy: string }).triggeredBy;
        return !routeSource(parent).includes(`'${job.name}'`);
      })
      .map((job) => job.name);
    expect(notDispatched, `children never dispatched by their parent: ${notDispatched.join(', ')}`).toEqual([]);
  });

  it('exposes every job for manual running', () => {
    expect(Object.keys(cronPathMap()).sort()).toEqual(jobs.map((job) => job.name).sort());
  });
});

/**
 * cron-job.org is the scheduler. The Worker gateway can call the very same routes from its
 * `scheduled()` handler, so a `[triggers]` block in wrangler.toml does not move scheduling —
 * it duplicates it, and parents get a second copy of every invoice, billing and payment
 * reminder. That is not hypothetical: a `[triggers]` block sat live from 2026-07-31 to
 * 2026-08-04 doing exactly this.
 *
 * Switching hosts is allowed, but it has to be deliberate and atomic: disable the cron-job.org
 * entries first, then add `[triggers]` and `CLOUDFLARE_OWNS_CRON = "true"` in the same change.
 * The gateway ignores every cron unless that flag is set, so these two checks agree.
 */
describe('wrangler cron triggers', () => {
  const WRANGLER = path.resolve(__dirname, '../../../wrangler.toml');
  const toml = readFileSync(WRANGLER, 'utf8');
  const hasTriggers = /^\s*\[triggers\]/m.test(toml);
  const ownsCron = /^\s*CLOUDFLARE_OWNS_CRON\s*=\s*"true"\s*$/m.test(toml);

  it('does not schedule crons on the host without opting in', () => {
    expect(
      hasTriggers && !ownsCron,
      'wrangler.toml has a [triggers] block but CLOUDFLARE_OWNS_CRON is not "true". ' +
        'Both cron-job.org and this Worker would fire every job, double-sending parent emails. ' +
        'Disable the cron-job.org entries first, then set CLOUDFLARE_OWNS_CRON = "true" in [vars].',
    ).toBe(false);
  });

  it('does not claim to own cron without any triggers to fire', () => {
    expect(
      ownsCron && !hasTriggers,
      'CLOUDFLARE_OWNS_CRON is "true" but wrangler.toml has no [triggers] block, so nothing ' +
        'is scheduled at all. Either add the triggers or drop the flag.',
    ).toBe(false);
  });

  it('keeps production on cron-job.org (no host triggers while ownership is off)', () => {
    expect(hasTriggers).toBe(false);
    expect(ownsCron).toBe(false);
  });

  it('keeps the gateway guard wired to the same flag', () => {
    const gateway = readFileSync(
      path.resolve(__dirname, '../../cloudflare/container-gateway.ts'),
      'utf8',
    );
    expect(
      gateway.includes('CLOUDFLARE_OWNS_CRON'),
      'container-gateway.ts no longer checks CLOUDFLARE_OWNS_CRON — the runtime guard is gone, ' +
        'so a restored [triggers] block would fire jobs immediately.',
    ).toBe(true);
  });
});
