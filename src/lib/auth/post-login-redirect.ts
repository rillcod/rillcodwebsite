/**
 * Safe internal paths to return to after login (dashboard, result-check, etc.).
 */
export function safePostLoginRedirect(value: string | null | undefined): string {
  if (!value) return '/dashboard';
  try {
    const decoded = decodeURIComponent(value.trim());
    if (!decoded.startsWith('/') || decoded.startsWith('//')) return '/dashboard';
    const pathOnly = decoded.split('?')[0];
    if (pathOnly.startsWith('/dashboard')) return decoded;
    if (pathOnly.startsWith('/result-check')) return decoded;
    return '/dashboard';
  } catch {
    return '/dashboard';
  }
}

/** Accept `redirectedFrom` (middleware) or legacy `redirect` query param. */
export function readPostLoginRedirectParam(
  params: URLSearchParams | { get: (key: string) => string | null },
): string {
  return safePostLoginRedirect(
    params.get('redirectedFrom') ?? params.get('redirect'),
  );
}
