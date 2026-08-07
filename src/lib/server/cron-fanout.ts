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
  return fanoutOriginCandidates(hostUrl)[0];
}

/**
 * Origins to try, in order, until one answers.
 *
 * Returning a single origin was the bug. This app runs as a Node container
 * behind a Worker gateway (see wrangler.toml and Dockerfile: `next start -H
 * 0.0.0.0 -p 3000`), and the gateway forwards the public Host through — so the
 * request's own origin is `https://www.rillcod.com`. A container calling that
 * has to leave Cloudflare and come back in through the edge, which it cannot
 * do. `fetch` threw, every child was recorded as `error`, and nine jobs stopped
 * running without one of them ever reporting a failure: a job that is never
 * invoked cannot fail, it simply has an old last_success_at that nothing reads.
 *
 * Verified on 2026-08-07 — every fan-out dispatch had been erroring for days
 * while POSTing the same paths from outside returned a healthy 401.
 *
 * Loopback leads because a self-call that never leaves the container cannot be
 * blocked by the edge, and it is correct in development too, where `next dev`
 * serves the same port. The public origins stay behind it so a host that does
 * not support loopback — a serverless platform giving each invocation its own
 * sandbox — still works exactly as before.
 */
export function fanoutOriginCandidates(hostUrl: string): string[] {
  const candidates: string[] = [`http://127.0.0.1:${process.env.PORT || '3000'}`];

  try {
    const url = new URL(hostUrl);
    // `.local` is the gateway's internal name: parses fine, resolves nowhere.
    if (!url.hostname.endsWith('.local')) candidates.push(url.origin);
  } catch {
    // Unparseable — the configured origin below is the answer.
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  candidates.push(configured || 'https://www.rillcod.com');

  return [...new Set(candidates)];
}

export async function fanoutCrons(hostUrl: string, paths: string[]): Promise<Record<string, string>> {
  const secret = process.env.CRON_SECRET || process.env.BILLING_CRON_SECRET || '';
  const out: Record<string, string> = {};
  if (!secret) {
    for (const p of paths) out[p] = 'no-secret';
    return out;
  }
  const origins = fanoutOriginCandidates(hostUrl);

  await Promise.allSettled(paths.map(async (p) => {
    // Each origin is tried until one answers at all. A 4xx/5xx is an ANSWER —
    // the job ran and rejected us — so it stops here rather than re-running the
    // same job against another origin. Only a throw moves on.
    let lastFailure = 'unreachable';

    for (const origin of origins) {
      try {
        const r = await fetch(`${origin}/api/cron/${p}`, {
          method: 'POST',
          headers: { 'x-cron-secret': secret },
          cache: 'no-store',
        });
        out[p] = r.ok ? 'ok' : `http_${r.status}`;
        return;
      } catch (error) {
        // Carrying the reason forward is the difference between "the fan-out is
        // broken" and four days of a bare `error` that named nothing.
        const cause = error instanceof Error ? (error.cause as { code?: string })?.code ?? error.message : '';
        lastFailure = `unreachable:${String(cause).slice(0, 40) || 'threw'}`;
      }
    }

    out[p] = lastFailure;
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
