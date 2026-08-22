import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { SOURCES, referencedOpenRouterModels } from "./referenced-models";

/**
 * The drift job can only report on ids it can find.
 *
 * This file exists because the finding silently stopped working. SOURCES named
 * the generate route, which held every model id until the engine was extracted
 * into generate-core.ts and took them all with it. The job kept running, kept
 * reading an empty file, and kept reporting a clean bill of health for months
 * while four already-retired ids sat in the queues.
 *
 * Nothing about that could fail on its own — an empty list is a valid answer to
 * "which models does the source name". So the invariant is asserted here
 * instead: the sources must exist, must actually contain ids, and must not miss
 * a free id that production code names.
 */
const ROOT = process.cwd();

function repoRelative(file: string): string {
  return relative(ROOT, file).split(sep).join("/");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * Deliberately the same shape as the one in referenced-models.ts. A looser
 * pattern here would flag ids the real reader cannot see, which is noise; a
 * tighter one would miss exactly what this is meant to catch.
 */
const MODEL_ID =
  /["'`]([a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?::[a-z0-9-]+)?)["'`]/gi;
const NOT_A_MODEL =
  /^(next\/|text\/|application\/|image\/|audio\/|video\/|@|\.|\/)|\.(ts|tsx|js|json|css|png|jpg|svg)$/i;

function freeIdsIn(file: string): string[] {
  const found = new Set<string>();
  for (const match of readFileSync(file, "utf8").matchAll(MODEL_ID)) {
    const id = match[1];
    if (NOT_A_MODEL.test(id)) continue;
    if (!id.endsWith(":free")) continue;
    found.add(id);
  }
  return [...found];
}

/**
 * Files that name free ids without being a place the app picks models.
 *
 * openrouter.ts holds FREE_FALLBACK_MODELS, which detectFreeModelDrift already
 * checks separately as staleFallback — listing it in SOURCES would report the
 * same dead id twice under two different names.
 */
const NOT_A_QUEUE = ["src/lib/ai/openrouter.ts"];

describe("the drift check can see the models it is checking", () => {
  it("finds ids at all", () => {
    // The exact failure this file was written for: a clean, confident, empty answer.
    expect(referencedOpenRouterModels().length).toBeGreaterThan(0);
  });

  it("finds free ids specifically, since those are all the job inspects", () => {
    // detectFreeModelDrift filters by isFreeModel before doing anything, so a
    // list of only paid ids would leave `retired` just as permanently empty.
    const free = referencedOpenRouterModels().filter((id) => id.endsWith(":free"));
    expect(free.length).toBeGreaterThan(0);
  });

  it("every source exists and still contains ids", () => {
    const empty = SOURCES.filter((rel) => {
      let src: string;
      try {
        src = readFileSync(join(ROOT, rel), "utf8");
      } catch {
        return true; // moved or renamed
      }
      return ![...src.matchAll(MODEL_ID)].some((m) => !NOT_A_MODEL.test(m[1]));
    });

    expect(
      empty,
      "these sources are missing or no longer name any model — the ids probably moved:\n  " +
        empty.join("\n  ")
    ).toEqual([]);
  });

  it("no production file names a free model the check cannot see", () => {
    const seen = new Set(referencedOpenRouterModels());
    const missed = new Map<string, string[]>();

    for (const file of walk(join(ROOT, "src"))) {
      const rel = repoRelative(file);
      if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
      if (NOT_A_QUEUE.includes(rel)) continue;

      const unseen = freeIdsIn(file).filter((id) => !seen.has(id));
      if (unseen.length) missed.set(rel, unseen);
    }

    expect(
      Object.fromEntries(missed),
      "these free ids are used but invisible to the drift job — add the file to SOURCES"
    ).toEqual({});
  }, 15_000);
});
