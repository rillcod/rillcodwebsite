/**
 * Trigger code-base cron jobs that are NOT registered on the external scheduler by calling their
 * own endpoints, so they still run without a new cron-job.org entry. Each target runs as its own
 * serverless invocation (its own maxDuration), so a heavy job never blocks the host.
 *
 * Call this from a registered host cron via Next's `after()` so the host responds to the scheduler
 * immediately and the fan-out happens in the background. Never throws.
 */
/**
 * Origin to call children on. Normally the incoming request's own origin, but a gateway may hand
 * the app an internal hostname it cannot reach itself — the Cloudflare Containers gateway proxies
 * to `http://container.local`, which parses as a valid URL yet resolves from nowhere, so a
 * self-call would fail DNS and silently drop every child job. Fall back to the configured public
 * URL for those. Real hosts, including `localhost` in development, are used as-is.
 */
export function resolveFanoutOrigin(hostUrl: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  try {
    const url = new URL(hostUrl);
    if (!url.hostname.endsWith('.local')) return url.origin;
  } catch {
    // Unparseable — fall through to the configured origin.
  }
  return configured || 'https://www.rillcod.com';
}

export async function fanoutCrons(hostUrl: string, paths: string[]): Promise<Record<string, string>> {
  const secret = process.env.CRON_SECRET || process.env.BILLING_CRON_SECRET || '';
  const out: Record<string, string> = {};
  if (!secret) {
    for (const p of paths) out[p] = 'no-secret';
    return out;
  }
  const origin = resolveFanoutOrigin(hostUrl);

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
