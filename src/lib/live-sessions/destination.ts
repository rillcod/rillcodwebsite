export class LiveSessionDestinationError extends Error {}

export function isJitsiUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'meet.jit.si';
  } catch {
    return false;
  }
}

export function isLiveKitUrl(url?: string | null): boolean {
  return !!url && /^livekit:[a-z0-9-]+$/i.test(url.trim());
}

/** One destination contract for create, edit, start, and join. */
export function normalizeLiveSessionUrl(
  value: unknown,
  options: { sessionId?: string; allowInternal?: boolean } = {},
): string | null {
  if (value == null || String(value).trim() === '') return null;
  const raw = String(value).trim();

  if (raw.toLowerCase().startsWith('livekit:')) {
    if (!options.allowInternal || !options.sessionId || raw !== `livekit:${options.sessionId}`) {
      throw new LiveSessionDestinationError('The secure classroom address is not valid for this session.');
    }
    return raw;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new LiveSessionDestinationError('Enter a complete classroom link beginning with https://.');
  }
  const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase());
  if (parsed.protocol !== 'https:' && !localHttp) {
    throw new LiveSessionDestinationError('Classroom links must use a secure https:// address.');
  }
  if (parsed.username || parsed.password) {
    throw new LiveSessionDestinationError('Classroom links cannot contain embedded sign-in details.');
  }
  return parsed.toString();
}
