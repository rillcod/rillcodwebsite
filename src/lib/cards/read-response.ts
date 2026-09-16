import { withTimeoutOrThrow } from '@/lib/async-timeout';

/** Bound both the connection and response body; never retry card mutations. */
export async function readCardResponse(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  const controller = new AbortController();
  try {
    return await withTimeoutOrThrow((async () => {
      const response = await fetch(url, { ...init, method: 'GET', signal: controller.signal });
      const body = await response.arrayBuffer();
      return new Response(response.status === 204 || response.status === 205 ? null : body, {
        status: response.status, statusText: response.statusText, headers: response.headers,
      });
    })(), 'Loading took too long. Please try again.', timeoutMs);
  } finally {
    controller.abort();
  }
}
