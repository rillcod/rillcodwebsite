import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every OpenRouter model id this codebase names.
 *
 * Read out of the source rather than kept as a second list, because a second
 * list is exactly what rots: the ids live in per-task queues scattered through
 * the engine and the AI routes, and a drift check comparing against a stale
 * copy of them would report nothing while the real queues went dead.
 *
 * Reading the source is not immune to that either, as this file proved. It was
 * written pointing at src/app/api/ai/generate/route.ts, which held 89 model ids
 * at the time and was the only place they lived. Later the same day the engine
 * was extracted into src/lib/ai/generate-core.ts, taking every id with it and
 * leaving the route with none. Nothing failed: the drift job kept running daily,
 * kept reading a file with no models in it, and kept reporting that nothing had
 * been retired — while four of the ids it should have been naming had already
 * been withdrawn by OpenRouter. A check that cannot fail loudly has to be
 * pinned by a test instead, which is what referenced-models.test.ts now does.
 *
 * Best-effort by design. If a file cannot be read — a bundler that does not
 * ship sources, a changed path — the caller gets what the other files yielded
 * rather than the whole check throwing.
 */
export const SOURCES = [
  // The engine. Holds every per-task queue, and the union of free ids named
  // anywhere in the app — the routes below name only subsets of these.
  "src/lib/ai/generate-core.ts",
  // The routes carry their own preferences, which modelQueueFor treats as hints
  // and filters against the live catalogue. A retired id here costs nothing at
  // request time; it is still dead weight worth being told about.
  "src/app/api/ai/graphics/route.ts",
  "src/app/api/ai/lane-suggest/route.ts",
  "src/app/api/ai/project-builder/route.ts",
  "src/app/api/ai/project-gen/route.ts",
  "src/app/api/ai/special-program-build/route.ts",
  "src/app/api/ai/spine-regen/route.ts",
  "src/app/api/ai/study-chat/route.ts",
  "src/app/api/curricula/route.ts",
  // School report narratives. The one place a retirement has already caused
  // real damage twice: a dead id made every report fall back to template text,
  // which looks like a valid report, so nobody noticed either time.
  "src/lib/school-reports/narrative.ts",
];

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
