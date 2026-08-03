import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every OpenRouter model id this codebase names.
 *
 * Read out of the source rather than kept as a second list, because a second
 * list is exactly what rots: the ids live in per-task queues scattered through
 * the generate route, and a drift check comparing against a stale copy of them
 * would report nothing while the real queues went dead.
 *
 * Best-effort by design. If the file cannot be read — a bundler that does not
 * ship sources, a changed path — the caller gets an empty list and reports no
 * retirements, rather than the whole check throwing.
 */
const SOURCES = ["src/app/api/ai/generate/route.ts"];

/** vendor/model or vendor/model:tag — the shape OpenRouter ids take. */
const MODEL_ID = /["'`]([a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?::[a-z0-9-]+)?)["'`]/gi;

/** Paths and mime types match the id shape closely enough to need excluding. */
const NOT_A_MODEL =
  /^(next\/|text\/|application\/|image\/|audio\/|video\/|@|\.|\/)|\.(ts|tsx|js|json|css|png|jpg|svg)$/i;

export function referencedOpenRouterModels(): string[] {
  const found = new Set<string>();

  for (const relative of SOURCES) {
    let source: string;
    try {
      source = readFileSync(join(process.cwd(), relative), "utf8");
    } catch {
      continue;
    }
    for (const match of source.matchAll(MODEL_ID)) {
      const id = match[1];
      if (NOT_A_MODEL.test(id)) continue;
      found.add(id);
    }
  }

  return [...found];
}
