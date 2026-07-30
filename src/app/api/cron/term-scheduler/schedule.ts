/**
 * Term scheduling maths for the term-scheduler cron.
 *
 * Kept out of route.ts because Next.js only allows route handlers and route
 * config to be exported from a route file — any extra export fails the build's
 * generated route type-check.
 */

/**
 * Which scheduled week a term is in on `now`, counting from `termStart`.
 * Returns 0 before the term starts, then 1 for the first cadence window.
 */
export function scheduledWeekForDate(termStart: string, cadenceDays: number, now = new Date()): number {
  const startsAt = new Date(termStart).getTime();
  if (!Number.isFinite(startsAt)) return 0;
  const elapsedDays = Math.floor((now.getTime() - startsAt) / 86_400_000);
  if (elapsedDays < 0) return 0;
  return Math.floor(elapsedDays / Math.max(1, Number(cadenceDays) || 7)) + 1;
}
