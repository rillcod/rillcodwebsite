/**
 * API fetch for web + Capacitor.
 *
 * Live-URL Capacitor shells already load https://www.rillcod.com, so relative
 * `/api/...` paths are same-origin and must stay relative — rewriting to
 * NEXT_PUBLIC_APP_URL (e.g. https://rillcod.com without www) caused cross-origin
 * requests that dropped session cookies and broke /api/auth/me for everyone
 * once @capacitor/core was bundled into the app.
 */

const FALLBACK_ORIGIN = 'https://www.rillcod.com';

function resolveApiUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  if (!path.startsWith('/api/')) return path;

  const origin = window.location.origin;
  // Browser / PWA / live-URL WebView — keep relative (correct host + cookies).
  if (/^https?:\/\//i.test(origin)) return path;

  // Rare offline/file Capacitor origins only.
  const base = (process.env.NEXT_PUBLIC_APP_URL || FALLBACK_ORIGIN).replace(/\/$/, '');
  return `${base}${path}`;
}

export interface ApiFetchOptions extends RequestInit {
  /** Maximum retries when the container is starting up (defaults to 3). */
  maxStartingRetries?: number;
}

export async function apiFetch(input: string | URL | Request, init?: ApiFetchOptions): Promise<Response> {
  const url = typeof input === 'string' ? resolveApiUrl(input) : input;
  const maxAttempts = (init?.maxStartingRetries ?? 3) + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...init,
    });

    if (response.status === 503 && attempt < maxAttempts) {
      const isStartingHeader = response.headers.get('x-rillcod-service-state') === 'starting';
      let isStarting = isStartingHeader;
      if (!isStarting) {
        try {
          const body = await response.clone().json();
          if (body?.code === 'SERVICE_STARTING' || String(body?.error || '').includes('Rillcod is starting')) {
            isStarting = true;
          }
        } catch {
          // not json
        }
      }

      if (isStarting) {
        const retryAfterHeader = Number(response.headers.get('retry-after'));
        const delayMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? Math.min(retryAfterHeader * 1000, 3500)
          : Math.min(1000 * attempt, 3000);

        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
    }

    return response;
  }

  // Fallback if loop finishes unexpectedly
  return fetch(url, {
    credentials: 'same-origin',
    ...init,
  });
}
