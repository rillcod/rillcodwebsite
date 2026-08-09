export type AuditLogType = 'audit' | 'activity';

export type ParsedLogQuery = {
  type: AuditLogType;
  userId: string | null;
  eventPatterns: string[];
  accessMethod: 'qr' | 'typed' | 'link' | null;
  from: string | null;
  to: string | null;
};

export type ParsedLogQueryResult =
  | { ok: true; value: ParsedLogQuery }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_PATTERN = /^[a-zA-Z0-9_.:*\-]{1,100}$/;

function validDate(value: string | null, field: string) {
  if (!value) return { ok: true as const, value: null };
  if (Number.isNaN(new Date(value).getTime())) {
    return { ok: false as const, error: `${field} must be a valid date` };
  }
  return { ok: true as const, value };
}

/** Shared, injection-safe parser for the log list and CSV export routes. */
export function parseLogQuery(searchParams: URLSearchParams): ParsedLogQueryResult {
  const type: AuditLogType = searchParams.get('type') === 'audit' ? 'audit' : 'activity';
  const userId = searchParams.get('user_id')?.trim() || null;
  if (userId && !UUID.test(userId)) return { ok: false, error: 'user_id must be a valid id' };

  const rawPatterns = searchParams.get('event_type') || '';
  const eventPatterns = rawPatterns.split(',').map((value) => value.trim()).filter(Boolean);
  if (eventPatterns.length > 10 || eventPatterns.some((value) => !EVENT_PATTERN.test(value))) {
    return { ok: false, error: 'event_type contains an unsupported filter pattern' };
  }

  const accessMethodRaw = (searchParams.get('access_method') || '').trim().toLowerCase();
  const accessMethod = ['qr', 'typed', 'link'].includes(accessMethodRaw)
    ? accessMethodRaw as ParsedLogQuery['accessMethod']
    : null;
  if (accessMethodRaw && !accessMethod) {
    return { ok: false, error: 'access_method must be qr, typed, or link' };
  }

  const from = validDate(searchParams.get('from'), 'from');
  if (!from.ok) return from;
  const to = validDate(searchParams.get('to'), 'to');
  if (!to.ok) return to;
  if (from.value && to.value && new Date(from.value) > new Date(to.value)) {
    return { ok: false, error: 'from cannot be later than to' };
  }

  return {
    ok: true,
    value: { type, userId, eventPatterns, accessMethod, from: from.value, to: to.value },
  };
}

export function postgrestEventFilter(eventColumn: string, patterns: string[]) {
  return patterns.map((pattern) => {
    if (pattern.includes('*')) return `${eventColumn}.like.${pattern.replace(/\*/g, '%')}`;
    return `${eventColumn}.eq.${pattern}`;
  });
}
