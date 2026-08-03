/**
 * What actually works, learned from real calls.
 *
 * The catalogues say which models exist. They do not say which ones this
 * project's keys may call: gemini-3.6-flash is listed, is current, and returns
 * 429 on the free tier every time. Ranking on catalogue data alone therefore
 * puts a model that always refuses at the front of the ladder, and every
 * generation pays a wasted round trip to rediscover it.
 *
 * So failures are remembered for a while. A model that refuses is demoted, not
 * removed — quotas reset, previews graduate, outages end — and it returns to
 * its natural place once the cooldown lapses. Nothing here needs editing when
 * that happens, which is the point: the ladder repairs itself from evidence
 * rather than from someone noticing.
 *
 * Deliberately in-memory. This is a hint for ordering, not a fact worth a
 * database round trip on the hot path; a cold process simply re-learns in one
 * call.
 */

/** Quota resets daily, so a refusal should not be held against a model for long. */
const COOLDOWN_MS: Record<Reason, number> = {
  quota: 30 * 60 * 1000, // 429 — try again within the hour
  missing: 6 * 60 * 60 * 1000, // 404 — retired, or never available to this key
  error: 10 * 60 * 1000, // 5xx and the rest — usually transient
};

export type Reason = "quota" | "missing" | "error";

type Demotion = { until: number; reason: Reason };

const demoted = new Map<string, Demotion>();

export function recordModelFailure(modelId: string, status: number): void {
  const reason: Reason =
    status === 429 ? "quota" : status === 404 ? "missing" : "error";
  const until = Date.now() + COOLDOWN_MS[reason];
  const existing = demoted.get(modelId);
  // Never shorten an existing cooldown: a 429 arriving after a 404 should not
  // promote a retired model back into the queue half an hour early.
  if (existing && existing.until > until) return;
  demoted.set(modelId, { until, reason });
}

/** Called after a model answers — it is evidently healthy again. */
export function recordModelSuccess(modelId: string): void {
  demoted.delete(modelId);
}

export function isDemoted(modelId: string): boolean {
  const entry = demoted.get(modelId);
  if (!entry) return false;
  if (Date.now() >= entry.until) {
    demoted.delete(modelId);
    return false;
  }
  return true;
}

/**
 * Same models, healthy ones first.
 *
 * Demoted models keep their relative order at the back rather than being
 * dropped, so a run where every model has recently failed still has a full
 * queue to work through instead of an empty one.
 */
export function healthiestFirst<T>(
  items: T[],
  idOf: (item: T) => string
): T[] {
  const healthy = items.filter((item) => !isDemoted(idOf(item)));
  const resting = items.filter((item) => isDemoted(idOf(item)));
  return [...healthy, ...resting];
}

/** Testing seam, and a way to clear the slate after a key change. */
export function resetModelHealth(): void {
  demoted.clear();
}

/** For the drift job to report, so this stays visible rather than merely working. */
export function demotedModels(): Array<{ id: string; reason: Reason; until: string }> {
  const now = Date.now();
  return [...demoted.entries()]
    .filter(([, entry]) => entry.until > now)
    .map(([id, entry]) => ({
      id,
      reason: entry.reason,
      until: new Date(entry.until).toISOString(),
    }));
}
