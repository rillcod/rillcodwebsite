import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260929000123_prune_cron_run_history.sql'),
  'utf8',
).toLowerCase();

describe('cron run history retention', () => {
  it('keeps only the newest rows per job', () => {
    expect(sql).toContain('order by created_at desc, id desc');
    expect(sql).toContain('offset p_keep_count');
    expect(sql).toContain('delete from public.cron_run_history');
  });

  it('trims the existing backlog on deploy', () => {
    expect(sql).toContain('select public.prune_all_cron_run_history(15)');
  });

  it('keeps pruning private to the service role', () => {
    expect(sql).toContain('grant execute on function public.prune_cron_run_history(text, integer) to service_role');
    expect(sql).not.toMatch(/grant execute on function public\.prune_cron_run_history[^;]+to authenticated/);
  });
});
