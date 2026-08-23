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

/**
 * The school's own Jitsi classroom, on the account in JAAS_APP_ID.
 *
 * Distinct from `isJitsiUrl`, which matches the free public meet.jit.si server. That
 * one is what the LiveKit failure screens fall back to, and it has no access control
 * at all: the room name is derived from the session id, so anyone who can guess or
 * is passed the link walks into a class of children. This scheme routes to the
 * authenticated tenant instead, where a signed token decides who gets in and who
 * moderates.
 */
export function isJaasUrl(url?: string | null): boolean {
  return !!url && /^jaas:[a-z0-9-]+$/i.test(url.trim());
}

/** Either of the classrooms we host ourselves, as opposed to an external link. */
export function isInternalClassroomUrl(url?: string | null): boolean {
  return isLiveKitUrl(url) || isJaasUrl(url);
}

/** One destination contract for create, edit, start, and join. */
export function normalizeLiveSessionUrl(
  value: unknown,
  options: { sessionId?: string; allowInternal?: boolean } = {},
): string | null {
  if (value == null || String(value).trim() === '') return null;
  const raw = String(value).trim();

  const lowered = raw.toLowerCase();
  if (lowered.startsWith('livekit:') || lowered.startsWith('jaas:')) {
    const scheme = lowered.startsWith('jaas:') ? 'jaas' : 'livekit';
    if (!options.allowInternal || !options.sessionId || raw !== `${scheme}:${options.sessionId}`) {
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
