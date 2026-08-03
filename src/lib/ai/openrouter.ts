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

/** Each pass spends another full allowance, so this bounds cost and latency. */
export const MAX_OPENROUTER_CONTINUATIONS = 3;

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

  for (let pass = 0; pass <= MAX_OPENROUTER_CONTINUATIONS; pass++) {
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
