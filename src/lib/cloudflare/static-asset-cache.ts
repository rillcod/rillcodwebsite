/** Only Next's versioned build assets are eligible; never HTML, APIs or user uploads. */
export function isVersionedAssetRequest(request: Request): boolean {
  const url = new URL(request.url);
  return request.method === 'GET' && url.pathname.startsWith('/_next/static/')
    && !request.headers.has('range');
}

export function isCacheableVersionedAsset(response: Response): boolean {
  const control = response.headers.get('cache-control') ?? '';
  return response.status === 200 && !response.headers.has('set-cookie')
    && /\bimmutable\b/i.test(control) && /\bpublic\b/i.test(control)
    && !/\b(private|no-store|no-cache)\b/i.test(control)
    && !(response.headers.get('vary') ?? '').includes('*');
}
