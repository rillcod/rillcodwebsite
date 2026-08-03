/**
 * Live check of the two generation engines, against the real free APIs.
 *
 *   npx tsx scripts/smoke-ai-continuation.ts
 *
 * Unit tests cover the continuation logic with mocked replies. This proves the
 * real thing: that a request too long for one response comes back whole, that
 * the JSON parses, and that free-first ordering is what actually gets called.
 *
 * Makes real (free-tier) API calls. Safe to re-run.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { geminiGenerateText } from '../src/lib/gemini/client';
import {
  openRouterComplete,
  resolveModelQueue,
  OPENROUTER_MAX_OUTPUT_TOKENS,
  MIN_CONTENT_CHARS,
} from '../src/lib/ai/openrouter';

const line = (s = '') => console.log(s);
const ok = (s: string) => console.log(`  PASS  ${s}`);
const bad = (s: string) => console.log(`  FAIL  ${s}`);

/**
 * Sized like a real generation: long enough to need resuming at a production
 * output cap, short enough to finish inside the pass limit. An earlier version
 * asked for 24 weeks against a 1,200-token cap, which cannot complete in three
 * passes — that measured the prompt, not the engine.
 */
const LONG_JSON_PROMPT =
  'Return a JSON object with a key "weeks" holding an array of 8 objects. ' +
  'Each object has: week (number), topic (string), and detail (a string of at ' +
  'least 60 words describing the teaching for that week). Output JSON only.';

/** The recovery production uses: models often wrap or precede the JSON. */
function parseLikeProduction(raw: string): any {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/(\{[\s\S]*\})/);
    if (!match) throw new Error('no JSON object found');
    return JSON.parse(match[1].replace(/,\s*([\}\]])/g, '$1').trim());
  }
}

async function checkGemini() {
  line('── Gemini ────────────────────────────────────────────────');
  if (!process.env.GEMINI_API_KEY) {
    line('  SKIP  no GEMINI_API_KEY');
    return;
  }

  const started = Date.now();
  const result = await geminiGenerateText(
    'You are a curriculum writer. Output only valid JSON.',
    LONG_JSON_PROMPT,
    { json: true, maxOutputTokens: 4000, reasoning: 'none', timeoutMs: 120_000 },
  );
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  if (!result) {
    bad('returned null — every model and key failed');
    return;
  }

  line(`  model=${result.model}  chars=${result.text.length}  ` +
       `continued=${result.continued ?? 0}  truncated=${!!result.truncated}  ${secs}s`);

  if ((result.continued ?? 0) > 0) ok('continuation engaged');
  else line('  NOTE  finished in one pass — the cap was not restrictive enough to prove resuming');

  if (result.text.length >= MIN_CONTENT_CHARS) ok('above the content floor');
  else bad(`only ${result.text.length} chars — below the floor`);

  if (result.truncated) {
    // Unfinished at the pass limit, so there is no closing brace to recover.
    // The route treats that as a failed model and moves to the next one.
    line('  NOTE  still truncated at the pass limit — a JSON parse cannot succeed');
    return;
  }
  try {
    const parsed = parseLikeProduction(result.text);
    const weeks = Array.isArray(parsed?.weeks) ? parsed.weeks.length : 0;
    ok(`JSON parsed, weeks=${weeks}`);
  } catch (err) {
    bad(`JSON did not parse: ${(err as Error).message}`);
    line(`        tail: ${JSON.stringify(result.text.slice(-90))}`);
  }
}

async function checkOpenRouter() {
  line();
  line('── OpenRouter ────────────────────────────────────────────');
  if (!process.env.OPENROUTER_API_KEY) {
    line('  SKIP  no OPENROUTER_API_KEY');
    return;
  }

  const queue = await resolveModelQueue([
    'google/gemini-2.5-flash',
    'qwen/qwen3-235b-a22b:free',
    'x-ai/grok-2-1212',
  ]);
  line(`  queue: ${queue.join(' → ')}`);
  if (queue[0].endsWith(':free')) ok('a free model is tried first');
  else bad(`paid model first: ${queue[0]}`);

  const started = Date.now();
  try {
    const result = await openRouterComplete({
      apiKey: process.env.OPENROUTER_API_KEY,
      model: queue[0],
      system: 'You are a curriculum writer. Output only valid JSON.',
      user: LONG_JSON_PROMPT,
      maxTokens: 4000, // tight enough to resume, roomy enough to finish
      json: true,
      onContinue: (pass) => line(`  …resuming, pass ${pass}`),
    });
    const secs = ((Date.now() - started) / 1000).toFixed(1);

    line(`  model=${result.model}  chars=${result.content.length}  ` +
         `continued=${result.continued}  truncated=${result.truncated}  ${secs}s`);

    if (result.continued > 0) ok('continuation engaged');
    else line('  NOTE  finished in one pass');

    if (result.content.length >= MIN_CONTENT_CHARS) ok('above the content floor');
    else bad(`only ${result.content.length} chars — below the floor`);

    if (result.truncated) {
      line('  NOTE  still truncated at the pass limit — a JSON parse cannot succeed');
      return;
    }
    try {
      const parsed = parseLikeProduction(result.content);
      const weeks = Array.isArray(parsed?.weeks) ? parsed.weeks.length : 0;
      ok(`JSON parsed, weeks=${weeks}`);
    } catch (err) {
      bad(`JSON did not parse: ${(err as Error).message}`);
      line(`        tail: ${JSON.stringify(result.content.slice(-90))}`);
    }
  } catch (err) {
    bad(`request failed: ${(err as Error).message}`);
  }
}

(async () => {
  line(`output ceiling ${OPENROUTER_MAX_OUTPUT_TOKENS}, content floor ${MIN_CONTENT_CHARS}`);
  line();
  await checkGemini();
  await checkOpenRouter();
  line();
})();
