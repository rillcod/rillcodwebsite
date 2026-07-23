/** Canonical app URL for login links and credential messages. */
export function portalAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, '');
}
