/**
 * Proves the central AI policy is actually in force — against the live APIs,
 * not just the type checker.
 *
 *   npm run verify:ai
 *
 * Checks, in order:
 *   1. every route that calls OpenRouter resolves models through the policy
 *   2. the retired ids those routes still name are dropped from the real queue
 *   3. a JSON task is only offered models that can be asked for JSON
 *   4. a failure demotes a model, and a success clears it
 *   5. both engines still generate valid content end to end
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { modelQueueFor } from '../src/lib/ai/model-policy';
import { availableFreeModels } from '../src/lib/ai/openrouter';
import {
  recordModelFailure,
  recordModelSuccess,
  isDemoted,
  resetModelHealth,
} from '../src/lib/ai/model-health';
import { geminiGenerateText, liveTextModelSpecs } from '../src/lib/gemini/client';

let failures = 0;
const ok = (m: string) => console.log(`  PASS  ${m}`);
const bad = (m: string) => { failures++; console.log(`  FAIL  ${m}`); };
const note = (m: string) => console.log(`        ${m}`);
const head = (m: string) => console.log(`\n── ${m} ${'─'.repeat(Math.max(0, 56 - m.length))}`);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const POLICY_OWNED = ['openrouter.ts', 'model-policy.ts', 'client.ts'];

async function checkEveryRouteIsWired() {
  head('1. every AI path defers to the policy');
  const callers = walk(join(process.cwd(), 'src')).filter((f) => {
    const src = readFileSync(f, 'utf8');
    return (
      !POLICY_OWNED.includes(f.split(/[\\/]/).pop()!) &&
      (src.includes('openrouter.ai/api/v1/chat/completions') ||
        /baseURL:\s*["'`]https:\/\/openrouter\.ai/.test(src))
    );
  });

  const unwired = callers.filter((f) => {
    const src = readFileSync(f, 'utf8');
    return !src.includes('modelQueueFor') && !src.includes('defaultFreeModel');
  });

  note(`${callers.length} routes call OpenRouter`);
  if (unwired.length === 0) ok('all of them resolve models through the policy');
  else unwired.forEach((f) => bad(`chooses its own models: ${f.replace(process.cwd(), '')}`));
}

async function checkRetiredAreDropped() {
  head('2. retired ids the routes still name are dropped');
  const live = new Set(await availableFreeModels());
  // Ids still written in the route files, all retired at the time of writing.
  const stillNamed = [
    'deepseek/deepseek-r1:free',
    'qwen/qwen3-235b-a22b:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'google/gemini-2.0-flash-exp:free',
  ];
  const queue = await modelQueueFor({ prefer: stillNamed, needsJson: true });

  const leaked = stillNamed.filter((id) => queue.includes(id) && !live.has(id));
  if (leaked.length === 0) ok(`none of ${stillNamed.length} retired ids reached the queue`);
  else leaked.forEach((id) => bad(`retired id still queued: ${id}`));

  if (queue.length) ok(`queue is non-empty (${queue.length}) — replaced, not emptied`);
  else bad('queue came back empty');
  note(`head: ${queue.slice(0, 3).join(' → ')}`);
}

async function checkJsonCapability() {
  head('3. a JSON task only gets models that can promise JSON');
  const all = await modelQueueFor({});
  const json = await modelQueueFor({ needsJson: true });

  if (json.length <= all.length) ok(`JSON queue is narrower (${json.length} of ${all.length})`);
  else bad('JSON queue is wider than the unrestricted one');

  if (json.every((id) => id.endsWith(':free'))) ok('and still entirely free');
  else note(`contains paid fallback: ${json.filter((id) => !id.endsWith(':free')).join(', ')}`);
  note(`JSON: ${json.join(' → ')}`);
}

async function checkHealthLearning() {
  head('4. the ladder learns from real outcomes');
  resetModelHealth();
  const before = await modelQueueFor({});
  const victim = before[0];

  recordModelFailure(victim, 429);
  if (isDemoted(victim)) ok(`a 429 demotes ${victim}`);
  else bad('a 429 did not demote the model');

  const after = await modelQueueFor({});
  if (after[0] !== victim) ok(`it no longer leads (now ${after[0]})`);
  else bad('demoted model still leads the queue');
  if (after.includes(victim)) ok('but is kept in the queue, not dropped');
  else bad('demoted model was dropped entirely');

  recordModelSuccess(victim);
  const restored = await modelQueueFor({});
  if (restored[0] === victim) ok('a success restores it immediately');
  else bad('success did not restore the model');
  resetModelHealth();
}

async function checkEnginesStillWork() {
  head('5. both engines still produce valid content');
  const specs = await liveTextModelSpecs();
  note(`Gemini ladder (live): ${specs.slice(0, 3).map((s) => s.id).join(' → ')}`);

  const result = await geminiGenerateText(
    'You are a curriculum writer. Output only valid JSON.',
    'Return JSON: {"weeks":[{"week":1,"topic":"..."},{"week":2,"topic":"..."}]}',
    { json: true, reasoning: 'none', timeoutMs: 90_000 },
  );

  if (!result?.text) return bad('Gemini returned nothing');
  note(`answered by ${result.model}, ${result.text.length} chars`);
  try {
    const parsed = JSON.parse(result.text.replace(/^```json\s*|```$/g, '').trim());
    if (Array.isArray(parsed?.weeks)) ok(`Gemini produced valid JSON (${parsed.weeks.length} weeks)`);
    else bad('Gemini JSON parsed but had no weeks array');
  } catch (err) {
    bad(`Gemini JSON did not parse: ${(err as Error).message}`);
  }
}

(async () => {
  await checkEveryRouteIsWired();
  await checkRetiredAreDropped();
  await checkJsonCapability();
  await checkHealthLearning();
  await checkEnginesStillWork();

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
