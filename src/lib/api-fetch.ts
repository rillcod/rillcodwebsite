/**
 * Utility to handle API calls in a way that supports both web and native apps.
 * In a native app (Capacitor), relative URLs like '/api/...' won't work because 
 * there is no local server. This utility prepends the base URL from environment variables.
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || '';

export async function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  let url = input.toString();

  // Only prepend BASE_URL if we are in a native Capacitor environment
  if (url.startsWith('/api/') && typeof window !== 'undefined') {
    const isCapacitor = !!(window as any).Capacitor;
    if (isCapacitor) {
      url = `${BASE_URL}${url}`;
    }
  }

  return fetch(url, init);
}
