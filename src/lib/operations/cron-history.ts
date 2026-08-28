/** Rolling window of run logs kept per scheduled job. */
export const CRON_RUN_HISTORY_PER_JOB_CAP = 15;

type CronHistoryDb = {
  rpc: (
    fn: 'prune_cron_run_history',
    args: { p_job_name: string; p_keep_count?: number },
  ) => Promise<{ data: number | null; error: { message: string } | null }>;
};

/** Trim older rows after each insert so cron_run_history stays bounded. */
export async function pruneCronRunHistory(
  db: CronHistoryDb,
  jobName: string,
  keepCount = CRON_RUN_HISTORY_PER_JOB_CAP,
): Promise<void> {
  const { error } = await db.rpc('prune_cron_run_history', {
    p_job_name: jobName,
    p_keep_count: keepCount,
  });
  if (error) {
    console.error(`[cron-monitor] unable to prune history for ${jobName}:`, error.message);
  }
}
