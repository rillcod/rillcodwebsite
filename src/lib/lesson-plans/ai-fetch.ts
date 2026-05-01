export class AIFetchError extends Error {
  constructor(
    public readonly reason: string,
    public readonly httpStatus?: number,
  ) {
    super(reason);
    this.name = 'AIFetchError';
  }
}

export async function fetchAIGenerate(
  baseUrl: string,
  cookieHeader: string,
  payload: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Promise<{ success: true; data: unknown }> {
  const res = await fetch(`${baseUrl}/api/ai/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      'x-cron-secret': process.env.CRON_SECRET || process.env.BILLING_CRON_SECRET || '',
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const reason = res.status === 429 ? 'AI quota exceeded' : `AI error (${res.status})`;
    throw new AIFetchError(reason, res.status);
  }
  const json = await res.json();
  if (!json.success || !json.data) {
    throw new AIFetchError('Invalid AI response');
  }
  return json as { success: true; data: unknown };
}

export async function consumeSSEUntilDone(res: Response): Promise<{
  generated: number;
  skipped: number;
  failures: Array<{ week: number; topic: string; reason: string }>;
  truncated: boolean;
}> {
  const fallback = { generated: 0, skipped: 0, failures: [], truncated: false };
  if (!res.body) return fallback;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let result = fallback;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const d = JSON.parse(line.slice(6));
          if (d.done) {
            result = {
              generated: d.generated ?? 0,
              skipped: d.skipped ?? 0,
              failures: d.failures ?? [],
              truncated: d.truncated ?? false,
            };
          }
        } catch { /* ignore parse errors on partial chunks */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return result;
}
