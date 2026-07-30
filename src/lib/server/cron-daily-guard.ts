/**
 * Shared once-per-day guard for cron fan-out hosts. Survives deploys and Redis
 * outages by persisting the claim in app_settings (same pattern as at-risk-students).
 */
type DbClient = {
  from: (table: string) => {
    select: (cols: string) => { eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: { value?: string } | null; error: { message: string } | null }> } };
    upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
  };
};

export type DailyGuardClaim = {
  today: string;
  release: (reason: string) => Promise<void>;
};

export function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns null when the day is already claimed for this key. */
export async function claimDailyGuard(db: DbClient, key: string): Promise<DailyGuardClaim | null> {
  const today = todayUtcDate();
  const { data: priorRun, error: readError } = await db
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (readError) throw new Error(`Daily guard read failed (${key}): ${readError.message}`);
  if (priorRun?.value === today) return null;

  const { error: writeError } = await db.from('app_settings').upsert({
    key,
    value: today,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
  if (writeError) throw new Error(`Daily guard write failed (${key}): ${writeError.message}`);

  const release = async (reason: string) => {
    const { error } = await db.from('app_settings').upsert({
      key,
      value: '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    if (error) {
      console.error(`[cron-daily-guard] could not release ${key} after`, reason, error);
    } else {
      console.warn(`[cron-daily-guard] released ${key} for retry after`, reason);
    }
  };

  return { today, release };
}

export async function recordFanoutResult(
  db: DbClient,
  key: string,
  host: string,
  result: Record<string, string>,
): Promise<void> {
  const { error } = await db.from('app_settings').upsert({
    key,
    value: JSON.stringify({ host, at: new Date().toISOString(), result }),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
  if (error) console.error(`[cron-daily-guard] could not record fanout for ${key}:`, error);
}
