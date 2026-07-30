/**
 * Trigger code-base cron jobs that are NOT registered on the external scheduler by calling their
 * own endpoints, so they still run without a new cron-job.org entry. Each target runs as its own
 * serverless invocation (its own maxDuration), so a heavy job never blocks the host.
 *
 * Call this from a registered host cron via Next's `after()` so the host responds to the scheduler
 * immediately and the fan-out happens in the background. Never throws.
 */
export async function fanoutCrons(hostUrl: string, paths: string[]): Promise<Record<string, string>> {
  const secret = process.env.CRON_SECRET || process.env.BILLING_CRON_SECRET || '';
  const out: Record<string, string> = {};
  if (!secret) {
    for (const p of paths) out[p] = 'no-secret';
    return out;
  }
  let origin: string;
  try { origin = new URL(hostUrl).origin; }
  catch { origin = process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com'; }

  await Promise.allSettled(paths.map(async (p) => {
    try {
      const r = await fetch(`${origin}/api/cron/${p}`, {
        method: 'POST',
        headers: { 'x-cron-secret': secret },
        cache: 'no-store',
      });
      out[p] = r.ok ? 'ok' : `http_${r.status}`;
    } catch {
      out[p] = 'error';
    }
  }));
  return out;
}

/** True when every child returned `ok`. */
export function fanoutAllSucceeded(result: Record<string, string>): boolean {
  return Object.values(result).every((status) => status === 'ok');
}

export function fanoutFailures(result: Record<string, string>): Array<[string, string]> {
  return Object.entries(result).filter(([, status]) => status !== 'ok');
}

/**
 * Run cron children one after another so upstream work (e.g. academic-readiness)
 * finishes before downstream consumers (e.g. auto-generate-content).
 */
export async function fanoutCronsSequential(hostUrl: string, paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const path of paths) {
    const batch = await fanoutCrons(hostUrl, [path]);
    out[path] = batch[path] ?? 'error';
    if (out[path] !== 'ok') break;
  }
  return out;
}
