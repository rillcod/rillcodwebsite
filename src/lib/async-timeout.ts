export const DEFAULT_UI_TIMEOUT_MS = 12_000;

/** Parse JSON without throwing when the body is empty or truncated. */
export async function parseJsonResponse<T extends Record<string, unknown>>(
  response: Response,
): Promise<Partial<T>> {
  if (response.status === 204 || response.status === 205) return {};
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Partial<T>;
    }
    return {};
  } catch {
    return {};
  }
}

/** Turn low-level fetch/JSON failures into copy safe to show on public forms. */
export function friendlyActionError(
  error: unknown,
  fallback: string,
): string {
  const message = error instanceof Error ? error.message : '';
  if (
    message.includes('Unexpected end of JSON input')
    || message.includes("Failed to execute 'json' on 'Response'")
    || message.includes('JSON.parse')
  ) {
    return 'The server returned an empty response. Please check your connection and try again.';
  }
  if (message.includes('AbortError') || message.includes('aborted')) {
    return fallback;
  }
  return message || fallback;
}

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

/**
 * Use for customer actions where a fallback could be mistaken for success.
 * Unlike `withTimeout`, this rejects with a safe, caller-supplied message.
 */
export async function withTimeoutOrThrow<T>(
  promise: PromiseLike<T>,
  message: string,
  ms = DEFAULT_UI_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Use for browser requests that must never leave a customer action spinning.
 * The request is aborted at the deadline and rejects with customer-safe copy.
 */
export async function fetchWithTimeoutOrThrow(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMessage = 'This is taking longer than expected. Please check your connection and try again.',
  ms = DEFAULT_UI_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error(timeoutMessage);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchActionJson<T extends Record<string, unknown>>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMessage?: string,
  ms?: number,
): Promise<{ response: Response; data: Partial<T> }> {
  const response = await fetchWithTimeoutOrThrow(input, init, timeoutMessage, ms);
  const data = await parseJsonResponse<T>(response);
  return { response, data };
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
    const data = await parseJsonResponse<T>(res);
    return { ...fallback, ...data };
  } catch (err) {
    console.warn(`[timeout] ${label} failed`, err);
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
