import { GoogleGenAI } from '@google/genai';
import { healthiestFirst, recordModelFailure, recordModelSuccess } from '@/lib/ai/model-health';

/**
 * Rillcod AI engine — free-tier first, large context.
 *
 * Design goals:
 *  1. Never spend money when a free call would do (direct Gemini API before OpenRouter).
 *  2. Multiply the free quota by rotating across every Gemini key that is configured.
 *  3. Use the full 1M-token context window instead of truncating inputs.
 *  4. Use "thinking" for real reasoning gains — it is free on the Gemini free tier.
 *  5. Never silently return nothing: a truncated / thought-exhausted response is
 *     retried with a bigger output budget rather than falling through the chain.
 */

// ── Key pool ────────────────────────────────────────────────────────────────
// Set GEMINI_API_KEY plus optional GEMINI_API_KEY_2..._5, or a comma-separated
// GEMINI_API_KEYS. Each free key carries its own quota, so N keys ≈ N× headroom.
function loadKeys(): string[] {
    const raw = [
        process.env.GEMINI_API_KEY,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3,
        process.env.GEMINI_API_KEY_4,
        process.env.GEMINI_API_KEY_5,
        ...(process.env.GEMINI_API_KEYS ?? '').split(','),
    ];
    return Array.from(new Set(raw.map(k => k?.trim()).filter((k): k is string => !!k)));
}

const clientCache = new Map<string, GoogleGenAI>();

function clientFor(apiKey: string): GoogleGenAI {
    let client = clientCache.get(apiKey);
    if (!client) {
        client = new GoogleGenAI({ apiKey });
        clientCache.set(apiKey, client);
    }
    return client;
}

/** Round-robin cursor so load spreads across keys instead of always burning key #1. */
let keyCursor = 0;

function keyRotation(): string[] {
    const keys = loadKeys();
    if (keys.length <= 1) return keys;
    const start = keyCursor++ % keys.length;
    return [...keys.slice(start), ...keys.slice(0, start)];
}

/** Back-compat: the default client used by any caller that imported `gemini` directly. */
export const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

export function hasGeminiKey(): boolean {
    return loadKeys().length > 0;
}

// ── Error classification ────────────────────────────────────────────────────
function statusOf(err: any): number {
    const direct = err?.status ?? err?.httpStatusCode ?? err?.code ?? err?.error?.code;
    if (typeof direct === 'number' && direct >= 400) return direct;
    const text = String(err?.message ?? err ?? '');
    if (/RESOURCE_EXHAUSTED|quota|rate.?limit|\b429\b/i.test(text)) return 429;
    if (/UNAVAILABLE|overloaded|\b503\b/i.test(text)) return 503;
    if (/DEADLINE_EXCEEDED|timeout|\b504\b/i.test(text)) return 504;
    if (/INTERNAL|\b500\b/.test(text)) return 500;
    if (/API key|PERMISSION_DENIED|\b40[13]\b/i.test(text)) return 403;
    return 0;
}

/** Quota/availability failures — worth retrying on another key or model. */
const isTransient = (s: number) => s === 429 || s === 500 || s === 503 || s === 504;
/** A dead/invalid key: skip this key entirely, don't waste retries on it. */
const isKeyFailure = (s: number) => s === 401 || s === 403;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * How long to pause before retrying a transient failure.
 *
 * Tunable because the retry ladder is walked in full by the client's own tests —
 * every key against every model — and each rung was sleeping for real. That put
 * the file at 4.8s against vitest's 5s limit: green on its own, and seven
 * timeouts the moment the rest of the suite competed for the CPU. A flake that
 * only appears under load is the worst kind, because the failing test names have
 * nothing to do with the change that exposed them.
 *
 * Production keeps the 400ms step. setup-env.ts sets this to 0 for tests, which
 * exercises the same ladder without waiting on wall-clock time.
 */
const RETRY_BACKOFF_MS = (() => {
    const configured = Number(process.env.AI_RETRY_BACKOFF_MS);
    return Number.isFinite(configured) && configured >= 0 ? configured : 400;
})();

// ── Model ladder ────────────────────────────────────────────────────────────
export interface TextModelSpec {
    id: string;
    /** Input context window in tokens. */
    contextTokens: number;
    /** Hard cap on output tokens for this model. */
    maxOutput: number;
    /**
     * 'dynamic'   — thinking on, model picks the budget (default for 2.5 Flash)
     * 'optional'  — thinking supported but off unless we ask (2.5 Flash-Lite)
     * 'forced'    — thinking cannot be disabled (2.5 Pro)
     * 'none'      — model has no thinking mode (2.0 Flash)
     */
    thinking: 'dynamic' | 'optional' | 'forced' | 'none';
}

/**
 * Ordered best-value-first. The ladder leads with the strongest model that still
 * has a workable free daily quota, then degrades to higher-quota models so a busy
 * day downgrades quality instead of failing outright.
 */
/**
 * Limits below are the ones the API reports, not estimates — checked against
 * generativelanguage.googleapis.com/v1beta/models.
 *
 * The ladder sat on the 2.x line long after 3.x shipped. Each entry here was
 * called with this project's key before being added: 3.6 and 3.5 Flash answer
 * in about two seconds, and the Pro previews return 429 on the free tier, so
 * they are deliberately absent — a model that always refuses is a wasted round
 * trip on every generation. 2.5 and 2.0 Flash stay at the back as the
 * long-stable floor.
 */
export const TEXT_MODEL_SPECS: TextModelSpec[] = [
    { id: 'gemini-3.6-flash', contextTokens: 1_048_576, maxOutput: 65_536, thinking: 'dynamic' },
    { id: 'gemini-3.5-flash', contextTokens: 1_048_576, maxOutput: 65_536, thinking: 'dynamic' },
    { id: 'gemini-3.5-flash-lite', contextTokens: 1_048_576, maxOutput: 65_536, thinking: 'optional' },
    { id: 'gemini-2.5-flash', contextTokens: 1_048_576, maxOutput: 65_536, thinking: 'dynamic' },
    { id: 'gemini-2.0-flash', contextTokens: 1_048_576, maxOutput: 8_192, thinking: 'none' },
];

/** Back-compat: plain id list, same order as the ladder. */
export const TEXT_MODELS = TEXT_MODEL_SPECS.map(m => m.id);

// ── Live ladder ─────────────────────────────────────────────────────────────
/**
 * Google retires and ships models on its own schedule, and the list above is a
 * snapshot of one afternoon. Hardcoding it is the same mistake that left the
 * OpenRouter queue naming nine models that no longer existed — silent, because
 * a dead model simply fails over to the next one and nobody sees the waste.
 *
 * So the ladder is asked for, not assumed. Google is the authority on which of
 * its models this key may call and what their limits are; the constant above is
 * only the floor for when that cannot be reached.
 */
const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const LADDER_TTL_MS = 60 * 60 * 1000;

let cachedLadder: { at: number; specs: TextModelSpec[] } | null = null;

/** Not general writers: media, embeddings, robotics, agents, research pipelines. */
const NOT_A_TEXT_MODEL =
    /(embedding|aqa|imagen|veo|lyria|banana|image|tts|audio|robotics|computer-use|deep-research|omni|gemma)/i;

/** Rough recency from the family number in the id: 3.6 beats 3.5 beats 2.5. */
function versionRank(id: string): number {
    const match = id.match(/gemini-(\d+)(?:\.(\d+))?/i);
    if (!match) return 0;
    return Number(match[1]) * 100 + Number(match[2] ?? 0);
}

/**
 * Free-tier reality beats raw capability. Pro answers better but returns 429 on
 * this tier, and a model that always refuses costs a wasted round trip on every
 * single generation. Flash leads; anything unproven sits behind the stable
 * models rather than in front of them.
 */
function tierRank(id: string): number {
    if (/pro/i.test(id)) return 0;
    if (/preview|exp/i.test(id)) return 1;
    if (/lite/i.test(id)) return 2;
    return 3; // plain flash
}

export async function liveTextModelSpecs(signal?: AbortSignal): Promise<TextModelSpec[]> {
    if (cachedLadder && Date.now() - cachedLadder.at < LADDER_TTL_MS) {
        return cachedLadder.specs;
    }
    const key = loadKeys()[0];
    if (!key) return TEXT_MODEL_SPECS;

    try {
        const response = await fetch(`${GEMINI_MODELS_URL}?key=${key}&pageSize=200`, { signal });
        if (!response.ok) throw new Error(`models ${response.status}`);
        const body: any = await response.json();

        const specs: TextModelSpec[] = (body?.models ?? [])
            .filter((model: any) =>
                (model?.supportedGenerationMethods ?? []).includes('generateContent'))
            .map((model: any) => String(model?.name ?? '').replace(/^models\//, ''))
            .filter((id: string) => /^gemini-/i.test(id) && !NOT_A_TEXT_MODEL.test(id))
            .map((id: string) => {
                const model = (body.models as any[]).find(
                    (m: any) => String(m?.name).replace(/^models\//, '') === id);
                return {
                    id,
                    contextTokens: Number(model?.inputTokenLimit) || 1_048_576,
                    maxOutput: Number(model?.outputTokenLimit) || 8_192,
                    // Thinking cannot be read from this endpoint. 'dynamic' is the
                    // safe reading: thinkingBudgetFor clamps it either way, and a
                    // model without thinking ignores the field.
                    thinking: 'dynamic' as const,
                };
            })
            .sort((a: TextModelSpec, b: TextModelSpec) =>
                tierRank(b.id) - tierRank(a.id) || versionRank(b.id) - versionRank(a.id));

        if (!specs.length) throw new Error('no usable text models listed');
        cachedLadder = { at: Date.now(), specs };
        return specs;
    } catch {
        return cachedLadder?.specs ?? TEXT_MODEL_SPECS;
    }
}

/** Testing seam. */
export function resetGeminiLadderCache(): void {
    cachedLadder = null;
}

/** Largest input window across the ladder — useful for callers budgeting context. */
export const MAX_CONTEXT_TOKENS = Math.max(...TEXT_MODEL_SPECS.map(m => m.contextTokens));

/**
 * Rough token estimate (~4 chars/token for English + code). Deliberately
 * conservative so callers under-fill rather than overflow the window.
 */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.6);
}

// ── Text generation ─────────────────────────────────────────────────────────
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export interface GenerateTextOptions {
    /** Force JSON output. Equivalent to the legacy `jsonMode` argument. */
    json?: boolean;
    /** Optional response schema — far more reliable than prompting for JSON. */
    schema?: unknown;
    /** How much thinking budget to spend. Defaults to 'medium' (free, big quality win). */
    reasoning?: ReasoningEffort;
    /** Output token cap. Defaults to a generous per-model value. */
    maxOutputTokens?: number;
    temperature?: number;
    /** Per-attempt timeout in ms. Default 60s. */
    timeoutMs?: number;
    /** Extra long-form context (documents, transcripts, prior work) appended to the user turn. */
    context?: string | string[];
    /** Restrict the ladder to these model ids. */
    models?: string[];
    /** Abort the whole operation from the caller. */
    signal?: AbortSignal;
}

export interface GeneratedText {
    text: string;
    model: string;
    /** True when the model stopped because it ran out of output budget. */
    truncated?: boolean;
    /** How many resume passes were needed to finish this answer. */
    continued?: number;
    usage?: { input?: number; output?: number; thoughts?: number };
}

/**
 * Thinking budget per effort level, clamped so thinking can never eat the whole
 * output allowance. Thinking tokens are drawn from `maxOutputTokens`, so a short
 * task (say a 200-token answer) asking for a 4k thinking budget would finish with
 * finishReason=MAX_TOKENS and no visible text at all.
 */
function thinkingBudgetFor(
    effort: ReasoningEffort,
    spec: TextModelSpec,
    maxOutputTokens: number,
): number | undefined {
    if (spec.thinking === 'none') return undefined;

    // Leave at least half the allowance for the answer itself.
    const ceiling = Math.floor(maxOutputTokens / 2);

    if (spec.thinking === 'forced') {
        // 2.5 Pro cannot turn thinking off; 128 is the lowest it accepts.
        const wanted = effort === 'none' || effort === 'low' ? 128 : effort === 'medium' ? 4096 : 16_384;
        return Math.max(128, Math.min(wanted, ceiling));
    }

    const wanted = effort === 'none' ? 0 : effort === 'low' ? 1024 : effort === 'medium' ? 4096 : 16_384;
    return Math.min(wanted, ceiling);
}

/**
 * How many times a single answer may be resumed. Each pass spends another full
 * output allowance, so this bounds both cost and latency. Three passes over a
 * 65k cap carries roughly 200k tokens of answer, far beyond any prompt here.
 *
 * Read from AI_MAX_CONTINUATIONS — the same knob the OpenRouter engine uses, so
 * the two never drift — and clamped so a stray value cannot spin forever or
 * switch resuming off entirely.
 */
function maxContinuations(): number {
    const configured = Number(process.env.AI_MAX_CONTINUATIONS);
    if (!Number.isFinite(configured)) return 3;
    return Math.max(1, Math.min(10, Math.floor(configured)));
}

/**
 * True when a resume pass looks like a fresh start rather than a continuation.
 * Models sometimes ignore "carry on from here" and reply with the whole answer
 * again; concatenating that produces two half-documents welded together.
 */
function restartsInsteadOfContinuing(assembled: string, addition: string): boolean {
    const soFar = assembled.trimStart();
    const next = addition.trimStart();
    if (!soFar || !next) return false;

    const bothOpenJson =
        (soFar.startsWith('{') && next.startsWith('{')) ||
        (soFar.startsWith('[') && next.startsWith('['));
    if (bothOpenJson) return true;

    const opening = soFar.slice(0, 40);
    return opening.length >= 20 && next.startsWith(opening);
}

/**
 * Resume an answer that hit the output ceiling.
 *
 * The model is shown the original request and everything produced so far, and
 * asked to carry on from the exact character it stopped at. Pieces are joined
 * without a separator, so a JSON body split mid-token still closes correctly.
 *
 * Before this, a long generation came back as a partial: valid-looking prose
 * that stopped mid-sentence, or JSON missing its closing braces that every
 * caller then failed to parse. Retrying the whole thing produced the same
 * length and the same cut.
 */
async function continueUntilComplete(
    apiKey: string,
    spec: TextModelSpec,
    systemPrompt: string,
    originalContents: string,
    firstPartial: string,
    opts: GenerateTextOptions & { maxOutputTokens: number; timeoutMs: number },
): Promise<GeneratedText> {
    let assembled = firstPartial;

    const passLimit = maxContinuations();
    for (let pass = 0; pass < passLimit; pass++) {
        if (opts.signal?.aborted) break;

        const resumePrompt = [
            originalContents,
            '--- RESPONSE SO FAR ---',
            assembled,
            '--- INSTRUCTION ---',
            'Your previous response was cut off because it ran out of room.',
            'Continue from the exact point it stopped — the next character you write',
            'is appended directly to the text above. Do not repeat anything already',
            'written, do not restate the beginning, do not add a preamble, and do not',
            'wrap the continuation in code fences. If the response above is complete,',
            'reply with nothing at all.',
        ].join('\n\n');

        const next = await callModel(apiKey, spec, systemPrompt, resumePrompt, {
            ...opts,
            // Thinking here only eats the room needed to finish the answer.
            thinkingBudget: spec.thinking === 'forced' ? 128 : 0,
        });

        if (next.kind === 'error') break;

        const addition = next.kind === 'ok' ? next.value.text : next.partial;
        if (!addition?.trim()) break; // model says it is finished

        if (restartsInsteadOfContinuing(assembled, addition)) {
            // Ignored the instruction and began again. Welding two half-answers
            // together is worse than the truncated one, so keep the longer and
            // stop asking.
            if (addition.length > assembled.length) assembled = addition;
            break;
        }

        assembled += addition;

        if (next.kind === 'ok') {
            return { text: assembled, model: spec.id, continued: pass + 1 };
        }
        // Still truncated — go round again while passes remain.
    }

    return {
        text: assembled,
        model: spec.id,
        truncated: true,
        continued: passLimit,
    };
}

function buildContents(userPrompt: string, context?: string | string[]): string {
    const extra = (Array.isArray(context) ? context : context ? [context] : [])
        .map(c => c?.trim())
        .filter(Boolean);
    if (!extra.length) return userPrompt;
    // Reference material first, instruction last — models follow the final turn most closely.
    return `${extra.join('\n\n---\n\n')}\n\n---\n\n${userPrompt}`;
}

/**
 * Text generation across the free Gemini ladder.
 *
 * Retries the same model on another API key before dropping to a weaker model,
 * so a single key's rate limit no longer costs you output quality.
 *
 * Legacy signature `geminiGenerateText(system, user, true)` still works.
 */
export async function geminiGenerateText(
    systemPrompt: string,
    userPrompt: string,
    jsonModeOrOptions: boolean | GenerateTextOptions = false,
): Promise<GeneratedText | null> {
    const opts: GenerateTextOptions =
        typeof jsonModeOrOptions === 'boolean' ? { json: jsonModeOrOptions } : jsonModeOrOptions;

    const keys = keyRotation();
    if (!keys.length) {
        console.warn('[Gemini] no API key configured — skipping direct Gemini path');
        return null;
    }

    // Asked for, not assumed — see liveTextModelSpecs.
    const available = await liveTextModelSpecs(opts.signal);
    const requested = opts.models?.length
        ? available.filter(m => opts.models!.includes(m.id))
        : available;
    // Models that recently refused go to the back, so a listed-but-unusable
    // model is not re-discovered at the front of every single generation.
    const ladder = healthiestFirst(requested, m => m.id);

    const effort = opts.reasoning ?? 'medium';
    const contents = buildContents(userPrompt, opts.context);
    const timeoutMs = opts.timeoutMs ?? 60_000;

    let lastError: unknown = null;

    for (const spec of ladder) {
        // A model is only abandoned once every key has failed on it.
        for (const apiKey of keys) {
            // Two attempts per key: one retry absorbs a transient blip on a healthy key.
            for (let attempt = 0; attempt < 2; attempt++) {
                if (opts.signal?.aborted) return null;

                const maxOutput = Math.min(opts.maxOutputTokens ?? spec.maxOutput, spec.maxOutput);
                const budget = thinkingBudgetFor(effort, spec, maxOutput);

                const result = await callModel(apiKey, spec, systemPrompt, contents, {
                    ...opts,
                    thinkingBudget: budget,
                    maxOutputTokens: maxOutput,
                    timeoutMs,
                });

                if (result.kind === 'ok') {
                    recordModelSuccess(spec.id);
                    return result.value;
                }

                if (result.kind === 'truncated') {
                    // Ran out of budget — usually thinking eating the output allowance.
                    // Retry with thinking off before giving up on a model that was
                    // otherwise working. A caller-set cap is honoured: they asked for a
                    // short answer, so spend the whole cap on the answer instead of
                    // silently returning something ten times longer.
                    const retry = await callModel(apiKey, spec, systemPrompt, contents, {
                        ...opts,
                        thinkingBudget: spec.thinking === 'forced' ? 128 : 0,
                        maxOutputTokens: maxOutput,
                        timeoutMs,
                    });
                    if (retry.kind === 'ok') return retry.value;

                    // Thinking was not the problem: the answer is genuinely longer
                    // than one response can hold. Ask the model to carry on from
                    // where it stopped and stitch the pieces together, rather than
                    // handing back a half-finished lesson that fails to parse.
                    const partial =
                        (retry.kind === 'truncated' && retry.partial) || result.partial;
                    if (partial) {
                        return await continueUntilComplete(
                            apiKey,
                            spec,
                            systemPrompt,
                            contents,
                            partial,
                            { ...opts, maxOutputTokens: maxOutput, timeoutMs },
                        );
                    }
                    break; // next key
                }

                lastError = result.error;
                const status = statusOf(result.error);
                // Remember the refusal so the next generation does not lead with
                // a model this key cannot call. A dead key is the key's fault,
                // not the model's, so that is not held against it.
                if (!isKeyFailure(status) && status) recordModelFailure(spec.id, status);

                if (isKeyFailure(status)) break;            // dead key — next key
                if (status === 429) break;                   // quota gone on this key — next key
                if (isTransient(status) && attempt === 0) {
                    await sleep(RETRY_BACKOFF_MS * (attempt + 1));
                    continue;                                // brief blip — one retry
                }
                break;                                       // next key
            }
        }
        console.warn(`[Gemini Text] ${spec.id} exhausted on all keys, trying next model...`);
    }

    console.warn('[Gemini Text] all models failed:', (lastError as any)?.message ?? lastError);
    return null;
}

type CallResult =
    | { kind: 'ok'; value: GeneratedText }
    | { kind: 'truncated'; partial: string }
    | { kind: 'error'; error: unknown };

async function callModel(
    apiKey: string,
    spec: TextModelSpec,
    systemPrompt: string,
    contents: string,
    opts: GenerateTextOptions & { thinkingBudget?: number; maxOutputTokens: number; timeoutMs: number },
): Promise<CallResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onAbort);

    try {
        const config: Record<string, unknown> = {
            systemInstruction: systemPrompt,
            maxOutputTokens: opts.maxOutputTokens,
            abortSignal: controller.signal,
        };

        if (opts.temperature !== undefined) config.temperature = opts.temperature;
        if (opts.json || opts.schema) config.responseMimeType = 'application/json';
        if (opts.schema) config.responseSchema = opts.schema;
        if (opts.thinkingBudget !== undefined && spec.thinking !== 'none') {
            config.thinkingConfig = { thinkingBudget: opts.thinkingBudget };
        }

        const result = await clientFor(apiKey).models.generateContent({
            model: spec.id,
            contents,
            config: config as any,
        });

        const text = result.text ?? '';
        const finish = result.candidates?.[0]?.finishReason as string | undefined;
        const usage = {
            input: result.usageMetadata?.promptTokenCount,
            output: result.usageMetadata?.candidatesTokenCount,
            thoughts: (result.usageMetadata as any)?.thoughtsTokenCount,
        };

        if (finish === 'MAX_TOKENS') {
            return { kind: 'truncated', partial: text };
        }
        if (text.trim()) {
            return { kind: 'ok', value: { text, model: spec.id, usage } };
        }
        // Empty body with a non-length finish reason (SAFETY, RECITATION, …).
        return { kind: 'error', error: new Error(`empty response (finishReason=${finish ?? 'unknown'})`) };
    } catch (err) {
        return { kind: 'error', error: err };
    } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
    }
}

/**
 * Streaming variant — yields text chunks as they arrive.
 * Falls through the same key/model ladder if the stream never starts.
 */
export async function* geminiStreamText(
    systemPrompt: string,
    userPrompt: string,
    opts: GenerateTextOptions = {},
): AsyncGenerator<string, void, unknown> {
    const keys = keyRotation();
    if (!keys.length) return;

    // Asked for, not assumed — see liveTextModelSpecs.
    const available = await liveTextModelSpecs(opts.signal);
    const requested = opts.models?.length
        ? available.filter(m => opts.models!.includes(m.id))
        : available;
    // Models that recently refused go to the back, so a listed-but-unusable
    // model is not re-discovered at the front of every single generation.
    const ladder = healthiestFirst(requested, m => m.id);
    const contents = buildContents(userPrompt, opts.context);
    const effort = opts.reasoning ?? 'medium';

    for (const spec of ladder) {
        for (const apiKey of keys) {
            try {
                const config: Record<string, unknown> = {
                    systemInstruction: systemPrompt,
                    maxOutputTokens: Math.min(opts.maxOutputTokens ?? spec.maxOutput, spec.maxOutput),
                };
                if (opts.temperature !== undefined) config.temperature = opts.temperature;
                if (opts.json) config.responseMimeType = 'application/json';
                const budget = thinkingBudgetFor(effort, spec, config.maxOutputTokens as number);
                if (budget !== undefined && spec.thinking !== 'none') {
                    config.thinkingConfig = { thinkingBudget: budget };
                }

                const stream = await clientFor(apiKey).models.generateContentStream({
                    model: spec.id,
                    contents,
                    config: config as any,
                });

                let emitted = false;
                for await (const chunk of stream) {
                    const piece = chunk.text ?? '';
                    if (piece) {
                        emitted = true;
                        yield piece;
                    }
                }
                if (emitted) return;
            } catch (err) {
                const status = statusOf(err);
                if (isKeyFailure(status) || status === 429) continue; // next key
                console.warn(`[Gemini Stream] ${spec.id} error:`, (err as any)?.message ?? err);
                continue;
            }
        }
    }
}

// ── Image generation ────────────────────────────────────────────────────────
/**
 * Image generation model priority (free tier, exhausted in order):
 *
 * 1. gemini-2.0-flash-preview-image-generation — Gemini 2.0 Flash native image output
 * 2. imagen-3.0-generate-001 — Google Imagen 3
 * 3. Pollinations.ai — always-free, no key, final fallback (handled by the caller)
 */
export const IMAGE_MODELS = [
    'gemini-2.0-flash-preview-image-generation',
    'imagen-3.0-generate-001',
] as const;

export type ImageModel = typeof IMAGE_MODELS[number];

export interface GeneratedImage {
    base64: string;       // raw base64 (no data: prefix)
    mimeType: string;
    model: string;
}

/**
 * Try each Gemini image model on each configured key.
 * Returns null if all fail (caller should fall back to Pollinations).
 */
export async function geminiGenerateImage(prompt: string): Promise<GeneratedImage | null> {
    const keys = keyRotation();
    if (!keys.length) return null;

    for (const model of IMAGE_MODELS) {
        for (const apiKey of keys) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 60_000);
            try {
                const client = clientFor(apiKey);

                if (model === 'gemini-2.0-flash-preview-image-generation') {
                    const result = await client.models.generateContent({
                        model,
                        contents: prompt,
                        config: {
                            responseModalities: ['IMAGE', 'TEXT'],
                            abortSignal: controller.signal,
                        } as any,
                    });

                    const parts = result.candidates?.[0]?.content?.parts ?? [];
                    for (const part of parts) {
                        const inline = (part as any).inlineData;
                        if (inline?.data) {
                            return { base64: inline.data, mimeType: inline.mimeType ?? 'image/png', model };
                        }
                    }
                }

                if (model === 'imagen-3.0-generate-001') {
                    const result = await client.models.generateImages({
                        model,
                        prompt,
                        config: { numberOfImages: 1, abortSignal: controller.signal } as any,
                    });

                    const img = result.generatedImages?.[0]?.image;
                    if (img?.imageBytes) {
                        return {
                            base64: Buffer.from(img.imageBytes).toString('base64'),
                            mimeType: 'image/png',
                            model,
                        };
                    }
                }
            } catch (err: any) {
                const status = statusOf(err);
                if (isKeyFailure(status) || status === 429) continue; // next key
                if (isTransient(status)) {
                    console.warn(`[Gemini] ${model} unavailable, trying next...`);
                    continue;
                }
                console.warn(`[Gemini] ${model} error:`, err?.message ?? err);
                continue;
            } finally {
                clearTimeout(timer);
            }
        }
    }
    return null;
}
