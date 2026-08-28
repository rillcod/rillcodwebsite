import { describe, expect, it, vi } from 'vitest';
import { CRON_RUN_HISTORY_PER_JOB_CAP, pruneCronRunHistory } from './cron-history';

describe('cron history retention', () => {
  it('defaults to fifty rows per job', () => {
    expect(CRON_RUN_HISTORY_PER_JOB_CAP).toBe(15);
  });

  it('prunes through the database rpc without failing the caller', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 3, error: null });
    await pruneCronRunHistory({ rpc }, 'process-notifications');
    expect(rpc).toHaveBeenCalledWith('prune_cron_run_history', {
      p_job_name: 'process-notifications',
      p_keep_count: 15,
    });
  });

  it('logs and continues when pruning is unavailable', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'function missing' } });
    await pruneCronRunHistory({ rpc }, 'payment-reminders');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
