/**
 * OpenRouter chat completion that finishes what it starts.
 *
 * A single completion is capped by `max_tokens`, and OpenRouter reports hitting
 * that ceiling as `finish_reason: "length"`. Nothing here used to read it, so a
 * long lesson came back cut mid-token: prose stopping mid-sentence, or JSON
 * missing its closing braces that the parser then rejected. The generation
 * looked like a model failure, the code moved to the next model in the queue,
 * and that one produced the same length and the same cut.
 *
 * When the ceiling is hit the answer is resumed instead: the model is shown
 * what it has already written and asked to carry on from that exact character.
 * Pieces are joined without a separator, so a body split mid-token still closes
 * correctly.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function isFreeModel(modelId: string): boolean {
  return modelId.endsWith(":free");
}

/**
 * Last-resort free models, longest context first.
 *
 * Only reached when the live catalogue cannot be fetched. Every previous
 * hardcoded list in this codebase had rotted — checked against OpenRouter,
 * none of qwen3-235b, deepseek-r1, qwen3-30b or llama-3.1-8b still existed,
 * so "free first" was really "404 first, then bill the paid model behind it".
 * That is why the live list below is preferred over this one.
 */
export const FREE_FALLBACK_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
  "openai/gpt-oss-20b:free",
];

const MODELS_URL = "https://openrouter.ai/api/v1/models";
/** A model catalogue does not change minute to minute. */
const CATALOGUE_TTL_MS = 60 * 60 * 1000;

let cachedFreeModels: { at: number; ids: string[] } | null = null;

/**
 * Free models that OpenRouter is serving right now, longest context first.
 *
 * Asking the catalogue rather than trusting a list in the repo is the whole
 * point: model ids are retired without notice, and a stale one costs a wasted
 * round trip and a silent fall through to something billable. Failures are
 * swallowed — an unreachable catalogue must not take generation down with it.
 */
export async function availableFreeModels(signal?: AbortSignal): Promise<string[]> {
  const fresh =
    cachedFreeModels && Date.now() - cachedFreeModels.at < CATALOGUE_TTL_MS;
  if (fresh) return cachedFreeModels!.ids;

  try {
    const response = await fetch(MODELS_URL, { signal });
    if (!response.ok) throw new Error(`catalogue ${response.status}`);
    const body = await response.json();

    const ids: string[] = (body?.data ?? [])
      .filter((model: any) => typeof model?.id === "string" && isFreeModel(model.id))
      .sort(
        (a: any, b: any) => (b?.context_length ?? 0) - (a?.context_length ?? 0)
      )
      .map((model: any) => model.id as string);

    if (!ids.length) throw new Error("catalogue listed no free models");
    cachedFreeModels = { at: Date.now(), ids };
    return ids;
  } catch {
    return cachedFreeModels?.ids ?? FREE_FALLBACK_MODELS;
  }
}

/** Testing seam — clears the cached catalogue. */
export function resetFreeModelCache(): void {
  cachedFreeModels = null;
}

export type FreeModelDrift = {
  /** Ids this repo still names that OpenRouter no longer serves. */
  retired: string[];
  /** Free models being served that the fallback list does not know about. */
  added: string[];
  /** Fallback entries that are no longer real, so the fallback itself is rotting. */
  staleFallback: string[];
  live: string[];
  checkedAt: string;
  /** False when the catalogue could not be read, so nothing here is conclusive. */
  catalogueReachable: boolean;
};

/**
 * Compare the model ids this codebase names against what OpenRouter serves.
 *
 * The runtime already heals itself — resolveModelQueue drops dead ids on every
 * call — but healing silently is how the rot went unnoticed in the first place:
 * every :free id in the repo had been retired and generation had been quietly
 * falling through to billable models. This is the part that says so out loud.
 */
export async function detectFreeModelDrift(
  referencedIds: string[],
  signal?: AbortSignal
): Promise<FreeModelDrift> {
  resetFreeModelCache(); // a scheduled check must not read an hour-old answer
  const live = await availableFreeModels(signal);
  const catalogueReachable = live !== FREE_FALLBACK_MODELS;
  const liveSet = new Set(live);

  const referencedFree = [...new Set(referencedIds.filter(isFreeModel))];

  return {
    retired: referencedFree.filter((id) => !liveSet.has(id)),
    added: live.filter((id) => !FREE_FALLBACK_MODELS.includes(id)),
    staleFallback: FREE_FALLBACK_MODELS.filter((id) => !liveSet.has(id)),
    live,
    checkedAt: new Date().toISOString(),
    catalogueReachable,
  };
}

/**
 * Free tier first, paid kept behind it.
 *
 * The per-task queues name paid and free models interleaved, in a dozen places,
 * so whichever happened to be listed first is what got billed. Ordering here
 * makes free-first hold for every queue without depending on each list being
 * kept honest.
 *
 * Paid models are reordered, not removed. Dropping them would mean a
 * rate-limited free tier fails the teacher's request outright; keeping them at
 * the back means the free models are always tried first and paid is only
 * reached when every free option is exhausted. A queue naming no free model at
 * all still gets one attempt at the free list before its paid entries.
 *
 * AI_FREE_MODELS_ONLY=true drops the paid tail for hard cost control, accepting
 * that generation fails when the free tier is out.
 */
export function orderFreeFirst(queue: string[]): string[] {
  const free = queue.filter(isFreeModel);
  const paid = queue.filter((model) => !isFreeModel(model));
  const freeTier = free.length ? free : FREE_FALLBACK_MODELS;

  if (process.env.AI_FREE_MODELS_ONLY === "true") return freeTier;
  return [...freeTier, ...paid];
}

/**
 * The queue to actually call, with dead free models removed.
 *
 * A queue's own free entries are kept only if OpenRouter is still serving them;
 * the rest of the live free tier follows, longest context first, so the free
 * options are genuinely exhausted before anything billable is reached. Paid
 * entries stay at the back for the same reason as in orderFreeFirst — an
 * exhausted free tier should degrade, not fail.
 */
export async function resolveModelQueue(
  queue: string[],
  signal?: AbortSignal
): Promise<string[]> {
  const live = await availableFreeModels(signal);
  const liveSet = new Set(live);

  const requestedAndLive = queue.filter(
    (model) => isFreeModel(model) && liveSet.has(model)
  );
  const remainingLive = live.filter((model) => !requestedAndLive.includes(model));
  const freeTier = [...requestedAndLive, ...remainingLive];
  const paid = queue.filter((model) => !isFreeModel(model));

  if (process.env.AI_FREE_MODELS_ONLY === "true") {
    return freeTier.length ? freeTier : FREE_FALLBACK_MODELS;
  }
  return [...freeTier, ...paid];
}

/**
 * How many times one answer may be resumed.
 *
 * Each pass spends another full allowance, so this bounds cost and latency.
 * Three covers any prompt in this codebase at the production output cap; raise
 * AI_MAX_CONTINUATIONS for a genuinely enormous generation rather than editing
 * code. Clamped so a stray value cannot spin forever or disable resuming.
 */
export function maxContinuations(): number {
  const configured = Number(process.env.AI_MAX_CONTINUATIONS);
  if (!Number.isFinite(configured)) return 3;
  return Math.max(1, Math.min(10, Math.floor(configured)));
}

/** @deprecated read maxContinuations() — kept so existing imports still resolve. */
export const MAX_OPENROUTER_CONTINUATIONS = 3;

/**
 * Output ceiling for a single request.
 *
 * Deliberately not raised beyond what free models reliably accept: several
 * reject a larger value outright with a 400, which would cost the whole
 * generation rather than lengthen it. Length is bought with continuation
 * instead, which every model supports — three passes carry roughly 64k tokens
 * of finished content, far more than a full lesson needs.
 */
export const OPENROUTER_MAX_OUTPUT_TOKENS = 16_000;

/**
 * Shortest reply worth accepting for a content task, in characters.
 *
 * A free model under load sometimes returns a stub — an opening paragraph, or a
 * JSON skeleton with empty fields. That parses, so it used to be accepted and
 * delivered as a lesson. Treating it as a failure lets the queue fall through
 * to a stronger model, which is the point of having a queue.
 */
export const MIN_CONTENT_CHARS = 400;

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenRouterResult = {
  content: string;
  model: string;
  /** How many resume passes were needed. */
  continued: number;
  /** True when it was still unfinished after the last allowed pass. */
  truncated: boolean;
};

const RESUME_INSTRUCTION = [
  "Your previous response was cut off because it ran out of room.",
  "Continue from the exact point it stopped — the next character you write is",
  "appended directly to the end of it. Do not repeat anything already written,",
  "do not restate the beginning, do not add a preamble, and do not wrap the",
  "continuation in code fences. If the response is already complete, reply with",
  "nothing at all.",
].join(" ");

/**
 * True when a resume pass looks like a fresh start rather than a continuation.
 *
 * Models sometimes ignore "carry on from here" and reply with the whole answer
 * again. Detected by the shape of the opening: a body that already began as a
 * JSON document, answered with another one; or a repeat of the text already
 * written.
 */
function restartsInsteadOfContinuing(assembled: string, addition: string): boolean {
  const soFar = assembled.trimStart();
  const next = addition.trimStart();
  if (!soFar || !next) return false;

  const bothOpenJson =
    (soFar.startsWith("{") && next.startsWith("{")) ||
    (soFar.startsWith("[") && next.startsWith("["));
  if (bothOpenJson) return true;

  // A continuation that opens with the first words of the answer is a repeat.
  const opening = soFar.slice(0, 40);
  return opening.length >= 20 && next.startsWith(opening);
}

export async function openRouterComplete(input: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  json?: boolean;
  signal?: AbortSignal;
  /** Called before each resume pass, for progress reporting. */
  onContinue?: (pass: number) => void;
}): Promise<OpenRouterResult> {
  const baseMessages: OpenRouterMessage[] = [
    { role: "system", content: input.system },
    { role: "user", content: input.user },
  ];

  let assembled = "";
  let continued = 0;

  const passLimit = maxContinuations();
  for (let pass = 0; pass <= passLimit; pass++) {
    if (input.signal?.aborted) break;
    if (pass > 0) input.onContinue?.(pass);

    const messages: OpenRouterMessage[] =
      pass === 0
        ? baseMessages
        : [
            ...baseMessages,
            { role: "assistant", content: assembled },
            { role: "user", content: RESUME_INSTRUCTION },
          ];

    const body: Record<string, unknown> = {
      model: input.model,
      messages,
      max_tokens: input.maxTokens,
      temperature: input.temperature ?? 0.7,
    };
    // A resumed fragment is not a whole JSON document, so demanding json_object
    // on the continuation would make the model start a fresh object instead of
    // carrying on. Only the first pass asks for it.
    if (input.json && pass === 0) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "X-Title": "Rillcod Technologies (Kid-Friendly Platform)",
        "Content-Type": "application/json",
      },
      signal: input.signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (assembled) break; // keep what we have rather than losing it
      throw new Error(`OpenRouter ${response.status}`);
    }

    const data = await response.json();
    const choice = data?.choices?.[0];
    const addition: string = choice?.message?.content ?? "";

    if (!addition.trim()) break; // nothing more to add

    if (pass > 0 && restartsInsteadOfContinuing(assembled, addition)) {
      // The model ignored the instruction and began again. Concatenating would
      // produce two half-documents welded together, which is worse than the
      // truncated one — keep whichever is longer and stop asking.
      if (addition.length > assembled.length) assembled = addition;
      break;
    }

    assembled += addition;
    if (pass > 0) continued = pass;

    if (choice?.finish_reason !== "length") {
      return { content: assembled, model: input.model, continued, truncated: false };
    }
  }

  return {
    content: assembled,
    model: input.model,
    continued,
    truncated: true,
  };
}
