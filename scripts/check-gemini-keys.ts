/**
 * Does each Gemini key actually add quota?
 *
 * The free daily cap is counted per Google Cloud PROJECT, not per key — the
 * error names it: GenerateRequestsPerDayPerProjectPerModel-FreeTier. Two keys
 * created in one project therefore share one allowance, and the second buys
 * nothing while looking exactly like it should.
 *
 * That is not visible from .env.local: two keys look like twice the headroom.
 * This calls each one and reports what came back, so "I added a key" and "I
 * added quota" can be told apart.
 *
 *   npx tsx scripts/check-gemini-keys.ts
 *
 * Key VALUES are never printed — only the variable name, a short fingerprint,
 * and the result.
 */
import { config } from 'dotenv';
import { createHash } from 'node:crypto';

config({ path: '.env.local' });

const NAMES = [
  'GEMINI_API_KEY',
  'GEMINI_API_KEY_2',
  'GEMINI_API_KEY_3',
  'GEMINI_API_KEY_4',
  'GEMINI_API_KEY_5',
];

/** Enough to tell two keys apart in output without revealing either. */
const fingerprint = (key: string) => createHash('sha256').update(key).digest('hex').slice(0, 8);

type Probe = {
  name: string;
  fingerprint: string;
  ok: boolean;
  status: number;
  quotaIds: string[];
  retryAfter: string | null;
  message: string;
};

async function probe(name: string, key: string, model: string): Promise<Probe> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'ok' }] }] }),
    });
    const body: any = await response.json().catch(() => ({}));
    const violations =
      (body?.error?.details ?? []).find((d: any) => String(d['@type']).includes('QuotaFailure'))?.violations ?? [];
    const retry = (body?.error?.details ?? []).find((d: any) => String(d['@type']).includes('RetryInfo'))?.retryDelay;
    return {
      name,
      fingerprint: fingerprint(key),
      ok: response.ok,
      status: response.status,
      quotaIds: violations.map((v: any) => String(v.quotaId)),
      retryAfter: retry ?? null,
      message: String(body?.error?.message ?? '').slice(0, 90),
    };
  } catch (error) {
    return {
      name, fingerprint: fingerprint(key), ok: false, status: 0,
      quotaIds: [], retryAfter: null,
      message: error instanceof Error ? error.message.slice(0, 90) : 'request failed',
    };
  }
}

async function main() {
  const model = process.argv[2] ?? 'gemini-2.0-flash';
  const configured = NAMES
    .map((name) => ({ name, key: (process.env[name] ?? '').trim() }))
    .filter((entry) => entry.key);

  if (configured.length === 0) {
    console.log('\nNo Gemini keys configured.\n');
    return;
  }

  console.log(`\nChecking ${configured.length} key(s) against ${model}\n`);

  const seen = new Map<string, string>();
  for (const { name, key } of configured) {
    const print = fingerprint(key);
    if (seen.has(print)) {
      console.log(`  ${name.padEnd(18)} DUPLICATE of ${seen.get(print)} — the same key twice, no extra quota.`);
      continue;
    }
    seen.set(print, name);
  }

  const results: Probe[] = [];
  for (const { name, key } of configured) {
    results.push(await probe(name, key, model));
  }

  for (const r of results) {
    const verdict = r.ok
      ? 'OK — quota available'
      : r.status === 429
        ? 'EXHAUSTED'
        : `HTTP ${r.status}`;
    console.log(`  ${r.name.padEnd(18)} [${r.fingerprint}] ${verdict}`);
    if (!r.ok && r.message) console.log(`      ${r.message}`);
  }

  // The point of the whole script.
  const exhausted = results.filter((r) => r.status === 429);
  if (exhausted.length > 1) {
    const perProject = exhausted.every((r) => r.quotaIds.some((id) => id.includes('PerProject')));
    const sameRetry = new Set(exhausted.map((r) => r.retryAfter)).size === 1;
    console.log('\n  ---');
    if (perProject && sameRetry) {
      console.log('  These keys ran out together, on a per-PROJECT quota, with the same retry');
      console.log('  window. That is what sharing one Google Cloud project looks like — the');
      console.log('  extra keys are adding no headroom.');
      console.log('  Create each additional key in its OWN project to multiply the free tier.');
    } else {
      console.log('  Exhausted, but not in lockstep — they may well be on separate projects.');
    }
  }

  const live = results.filter((r) => r.ok).length;
  console.log(`\n  ${live} of ${results.length} key(s) can serve ${model} right now.`);
  console.log('  Quota is per project AND per model, so another model may still have room.\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
