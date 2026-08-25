import { hasCloudflareAi } from '@/lib/ai/cloudflare-ai';

/**
 * Semantic safety classification for learner and parent messages.
 *
 * The existing gate in abusePolicy matches a configured keyword list. That is
 * fast, free and exact — and exact is its limit: it catches the words on the
 * list and nothing phrased any other way. Llama Guard reads meaning, so it adds
 * a net under paraphrase.
 *
 * ── What this is NOT ─────────────────────────────────────────────────────────
 *
 * It is not a grooming detector, and must never be described as one to a
 * safeguarding lead. Checked against this model before wiring it up:
 *
 *   "Hey, do not tell your parents. Meet me alone after school and bring
 *    your phone."                                             -> safe
 *
 * Secrecy, isolation and boundary-testing — the actual early pattern of
 * grooming — are not in its taxonomy and it rates them harmless. It reliably
 * caught explicit self-harm (S11) and explicit violence (S1) in the same test.
 * So it is a useful second net for stated harm, and no substitute at all for the
 * keyword list, reporting routes, or people who know the children.
 *
 * ── Why a flag is not always a block ─────────────────────────────────────────
 *
 * The instinct with a safety classifier is to block what it catches. For
 * self-harm that instinct is wrong and dangerous: a child writing "I want to
 * hurt myself" most needs an adult to see it. Silently refusing to send that
 * message is the worst available outcome — it teaches them the platform is not
 * a place to say it, and no one is alerted.
 *
 * So S11 escalates and delivers. Violence and criminal categories block. The
 * distinction is deliberate.
 *
 * ── Failure posture ──────────────────────────────────────────────────────────
 *
 * Fails OPEN. A slow or unavailable model must not stop a parent contacting the
 * school; the keyword list, rate limits and human review still stand behind it.
 * A missed classification is recoverable, a school that cannot be contacted is
 * not.
 */

const MODEL = '@cf/meta/llama-guard-3-8b';

/**
 * Llama Guard 3 hazard codes, and what this platform does about each.
 *
 * 'escalate' delivers the message and raises it for urgent human attention.
 * 'block' refuses it. 'note' records it without acting, for pattern-spotting.
 */
const CATEGORY_ACTIONS: Record<string, { label: string; action: 'block' | 'escalate' | 'note' }> = {
  S1: { label: 'Violent crimes', action: 'block' },
  S2: { label: 'Non-violent crimes', action: 'block' },
  S3: { label: 'Sex-related crimes', action: 'block' },
  S4: { label: 'Child sexual exploitation', action: 'escalate' },
  S5: { label: 'Defamation', action: 'note' },
  S6: { label: 'Specialised advice', action: 'note' },
  S7: { label: 'Privacy', action: 'note' },
  S8: { label: 'Intellectual property', action: 'note' },
  S9: { label: 'Indiscriminate weapons', action: 'block' },
  S10: { label: 'Hate', action: 'block' },
  // Delivered on purpose. See the header: a child saying this needs to be heard,
  // not silenced. It is raised for urgent attention at the same time.
  S11: { label: 'Suicide and self-harm', action: 'escalate' },
  S12: { label: 'Sexual content', action: 'block' },
  S13: { label: 'Elections', action: 'note' },
};

export type MessageSafetyVerdict = {
  /** False only when the model ran and judged the text unsafe. */
  safe: boolean;
  /** What to do. 'allow' also covers every case where the check did not run. */
  action: 'allow' | 'block' | 'escalate';
  categories: Array<{ code: string; label: string }>;
  /** True when the classifier did not run — unconfigured, slow, or failed. */
  skipped: boolean;
  reason?: string;
};

const ALLOW: MessageSafetyVerdict = { safe: true, action: 'allow', categories: [], skipped: true };

/** Long enough for a real answer, short enough not to hold up a message. */
const TIMEOUT_MS = 4_000;

/** Beyond this the classifier is being fed a document, not a message. */
const MAX_CHARS = 4_000;

/**
 * Parse Llama Guard's reply.
 *
 * It answers with a bare word and, when unsafe, newline-separated hazard codes:
 *   "\n\nsafe"  or  "\n\nunsafe\nS11"
 */
export function parseGuardResponse(raw: string): MessageSafetyVerdict {
  const text = (raw ?? '').trim();
  if (!text) return { ...ALLOW, reason: 'empty response' };

  const [verdictLine, ...rest] = text.split('\n').map((line) => line.trim()).filter(Boolean);

  if (verdictLine.toLowerCase() === 'safe') {
    return { safe: true, action: 'allow', categories: [], skipped: false };
  }

  if (verdictLine.toLowerCase() !== 'unsafe') {
    // An unrecognised shape is not a licence to block someone.
    return { ...ALLOW, reason: `unrecognised verdict: ${verdictLine.slice(0, 40)}` };
  }

  const codes = rest
    .flatMap((line) => line.split(','))
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^S\d{1,2}$/.test(code));

  const categories = codes.map((code) => ({
    code,
    label: CATEGORY_ACTIONS[code]?.label ?? 'Unclassified hazard',
  }));

  // Strongest action across the reported categories wins.
  let action: MessageSafetyVerdict['action'] = 'allow';
  for (const code of codes) {
    const mapped = CATEGORY_ACTIONS[code]?.action ?? 'escalate';
    if (mapped === 'block') { action = 'block'; break; }
    if (mapped === 'escalate') action = 'escalate';
  }

  // Unsafe with no parsable category: treat as worth a human look, not a block.
  if (!codes.length) {
    return { safe: false, action: 'escalate', categories: [], skipped: false, reason: 'unsafe, category unknown' };
  }

  return { safe: false, action, categories, skipped: false };
}

/**
 * Classify a message. Never throws, never blocks on failure.
 */
export async function classifyMessageSafety(message: string): Promise<MessageSafetyVerdict> {
  if (!hasCloudflareAi()) return { ...ALLOW, reason: 'classifier not configured' };

  const text = message?.trim();
  if (!text) return { ...ALLOW, reason: 'empty message' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${MODEL}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: text.slice(0, MAX_CHARS) }] }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return { ...ALLOW, reason: `classifier ${response.status}` };
    }

    const data = await response.json().catch(() => null);
    const raw = data?.result?.response;
    if (typeof raw !== 'string') return { ...ALLOW, reason: 'classifier gave no verdict' };

    return parseGuardResponse(raw);
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    return { ...ALLOW, reason: aborted ? 'classifier timed out' : 'classifier unreachable' };
  } finally {
    clearTimeout(timer);
  }
}
