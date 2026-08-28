export type ContainerFailureKind = 'retryable' | 'unavailable';

const RETRYABLE_CONTAINER_FAILURES = [
  'error proxying request to container: the container is not running',
  'container suddenly disconnected',
  'failed to start container:',
  'network connection lost',
] as const;

const UNAVAILABLE_CONTAINER_FAILURES = [
  'there is no container instance available at this time',
] as const;

/**
 * Classify only errors emitted by the Cloudflare container transport.
 *
 * Application 500 responses must pass through untouched: replacing or retrying
 * those would hide a real product error and could repeat application work.
 */
export function classifyContainerFailure(
  status: number,
  responseBody: string,
): ContainerFailureKind | null {
  if (status < 500) return null;

  const normalized = responseBody.trim().toLowerCase();
  if (RETRYABLE_CONTAINER_FAILURES.some((marker) => normalized.includes(marker))) {
    return 'retryable';
  }
  if (UNAVAILABLE_CONTAINER_FAILURES.some((marker) => normalized.includes(marker))) {
    return 'unavailable';
  }
  return null;
}

/**
 * A transport retry is allowed only when HTTP semantics make replay safe.
 * Cron GET routes are intentionally excluded because they perform work.
 */
export function canReplayContainerRequest(request: Pick<Request, 'method' | 'headers' | 'url'>) {
  const method = request.method.toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
  if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') return false;

  const pathname = new URL(request.url).pathname;
  return !pathname.startsWith('/api/cron/');
}

