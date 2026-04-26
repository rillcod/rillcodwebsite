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
): Promise<{ success: true; data: unknown }> {
  const res = await fetch(`${baseUrl}/api/ai/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
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
