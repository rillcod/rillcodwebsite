import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260929000112_prevent_overlapping_cron_runs.sql'),
  'utf8',
).toLowerCase();

describe('durable scheduled-job lease', () => {
  it('uses one atomic lease per job and only takes over an expired owner', () => {
    expect(sql).toContain('job_name text primary key');
    expect(sql).toContain('on conflict (job_name) do update');
    expect(sql).toContain('cron_job_leases.lease_until <= now()');
  });

  it('prevents an old run from releasing a newer run lease', () => {
    expect(sql).toMatch(/delete from public\.cron_job_leases[\s\S]*job_name[\s\S]*and run_id = p_run_id/);
  });

  it('keeps lease mutation private to the service role', () => {
    expect(sql).toContain('revoke all on table public.cron_job_leases from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.claim_cron_job_run(text, uuid, integer) to service_role');
    expect(sql).toContain('grant execute on function public.release_cron_job_run(text, uuid) to service_role');
    expect(sql).not.toMatch(/grant execute on function public\.(claim|release)_cron_job_run[^;]+to authenticated/);
  });
});
