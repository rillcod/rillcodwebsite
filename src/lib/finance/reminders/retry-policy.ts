export const FINANCE_REMINDER_MAX_ATTEMPTS = 3;
export const FINANCE_REMINDER_RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export type FinanceReminderFailure = {
  attempt?: number | null;
  created_at?: string | null;
};

export function financeReminderRetryState(
  failures: FinanceReminderFailure[],
  now = Date.now(),
): { attempt: number; cooldownActive: boolean } {
  const latest = failures[0];
  const attempt = Math.max(1, Number(latest?.attempt || failures.length) + 1);
  const latestFailureAt = Date.parse(String(latest?.created_at || ''));
  return {
    attempt,
    cooldownActive:
      failures.length >= FINANCE_REMINDER_MAX_ATTEMPTS
      && Number.isFinite(latestFailureAt)
      && now - latestFailureAt < FINANCE_REMINDER_RETRY_COOLDOWN_MS,
  };
}

