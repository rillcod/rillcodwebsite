export const DEFAULT_UI_TIMEOUT_MS = 12_000;

export async function withTimeout(
  promise: PromiseLike<unknown>,
  fallback: unknown,
  label: string,
  ms = DEFAULT_UI_TIMEOUT_MS,
): Promise<any> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise).catch((err) => {
        console.warn(`[timeout] ${label} failed`, err);
        return fallback;
      }),
      new Promise((resolve) => {
        timer = setTimeout(() => {
          console.warn(`[timeout] ${label} timed out after ${ms}ms`);
          resolve(fallback);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchJsonWithTimeout<T extends Record<string, unknown>>(
  url: string,
  fallback: T,
  label: string,
  init: RequestInit = {},
  ms = DEFAULT_UI_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { cache: 'no-store', ...init, signal: controller.signal });
    if (!res.ok) return fallback;
    return await res.json();
  } catch (err) {
    console.warn(`[timeout] ${label} failed`, err);
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
