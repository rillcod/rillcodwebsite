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
