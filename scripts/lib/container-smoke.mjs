const TRANSIENT = new Set([502, 503, 504]);

/** Deployment-only readiness checks: never replay writes or accept a persistent outage. */
export async function checkSmokePath(url, expected, {
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.log,
  attempts = 3,
  timeoutMs = 30_000,
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let retryable = false;
    try {
      const response = await fetchImpl(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'rillcod-cf-smoke/1.0' },
      });
      const ok = expected.includes(response.status);
      retryable = TRANSIENT.has(response.status);
      const willRetry = !ok && retryable && attempt < attempts;
      const ray = response.headers.get('cf-ray');
      log(`${ok ? 'OK' : willRetry ? 'RETRY' : 'FAIL'} ${response.status} ${url} (attempt ${attempt}/${attempts})${ray ? ` cf-ray=${ray}` : ''}`);
      await response.body?.cancel().catch(() => {});
      if (ok) return true;
    } catch (error) {
      retryable = true;
      log(`${attempt < attempts ? 'RETRY' : 'FAIL'} ${url}: ${error?.message || error} (attempt ${attempt}/${attempts})`);
    }
    if (!retryable || attempt === attempts) return false;
    await sleep(attempt * 2_000);
  }
  return false;
}
