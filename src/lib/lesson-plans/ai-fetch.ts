import { generateAIContent, type GenerateRequest } from '@/lib/ai/generate-core';

export class AIFetchError extends Error {
  constructor(
    public readonly reason: string,
    public readonly httpStatus?: number,
  ) {
    super(reason);
    this.name = 'AIFetchError';
  }
}

/** Reasons worth telling a teacher apart from "it failed". */
function classify(message: string): string {
  if (/quota|rate.?limit|429|RESOURCE_EXHAUSTED/i.test(message)) return 'AI quota exceeded';
  if (/malformed|invalid JSON|parse/i.test(message)) return 'AI returned malformed content';
  if (/no OpenRouter key|not configured/i.test(message)) return 'AI service not configured';
  if (/timeout|abort|deadline/i.test(message)) return 'AI timed out';
  return message || 'AI generation failed';
}

/**
 * Runs a generation for the lesson-plan generators.
 *
 * This used to POST to `${baseUrl}/api/ai/generate` and forward the caller's
 * cookie. That indirection is why lessons, slides, assignments and projects all
 * failed while flashcards — which call Gemini in-process — succeeded: the
 * self-fetch had to re-authenticate against a base URL taken from
 * NEXT_PUBLIC_APP_URL, which points at production regardless of where the code
 * is actually running, and it spent the caller's remaining function budget on a
 * second cold request. None of those are real constraints for code that is
 * already running on the server with the user's request authorised.
 *
 * So it calls the engine directly. Authorisation stays with the caller, which
 * has already established staff role and lesson scope before getting here.
 */
export async function fetchAIGenerate(
  payload: Record<string, unknown>,
): Promise<{ success: true; data: unknown }> {
  let result;
  try {
    result = await generateAIContent(payload as unknown as GenerateRequest);
  } catch (error) {
    throw new AIFetchError(
      classify(error instanceof Error ? error.message : String(error)),
    );
  }
  if (!result?.data) {
    throw new AIFetchError('Invalid AI response');
  }
  return { success: true, data: result.data };
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
