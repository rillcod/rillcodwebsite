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

export async function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? resolveApiUrl(input) : input;
  return fetch(url, {
    credentials: 'same-origin',
    ...init,
  });
}
