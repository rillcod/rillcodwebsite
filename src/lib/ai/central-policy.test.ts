import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Model choice belongs in one place.
 *
 * Every AI route used to carry its own hand-written queue, and they drifted:
 * only one got the free-first fix, and all of them named free models OpenRouter
 * had retired. Nothing failed loudly — a dead id just fell through to the next
 * model, often a billable one. A rule written in a dozen files is a rule
 * enforced in none, so this test is what keeps the rule.
 *
 * A route may still express a preference. What it may not do is loop over its
 * own list of model ids and call them.
 */
const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** Files that legitimately name models: the policy itself, and its tests. */
const ALLOWED = [
  "src/lib/ai/openrouter.ts",
  "src/lib/ai/model-policy.ts",
  "src/lib/gemini/client.ts",
];

/** A vendor/model id, as OpenRouter writes them. */
const MODEL_ID =
  /["'`]((?:google|deepseek|meta-llama|x-ai|qwen|mistralai|moonshotai|nvidia|openai|cohere|inclusionai|poolside|zhipuai|xiaomi|minimax|stepfun)\/[a-z0-9][\w.-]*(?::[a-z0-9-]+)?)["'`]/gi;

function sourcesThatCallOpenRouter(): string[] {
  return walk(join(ROOT, "src"))
    .filter((file) => {
      const rel = file.replace(ROOT + "\\", "").replace(/\\/g, "/");
      if (ALLOWED.includes(rel)) return false;
      if (rel.endsWith(".test.ts")) return false;
      const src = readFileSync(file, "utf8");
      return src.includes("openrouter.ai/api/v1/chat/completions") ||
        /baseURL:\s*["'`]https:\/\/openrouter\.ai/.test(src);
    })
    .map((file) => file.replace(ROOT + "\\", "").replace(/\\/g, "/"));
}

describe("model choice stays central", () => {
  it("routes that name models resolve them through the policy", () => {
    const offenders = sourcesThatCallOpenRouter().filter((rel) => {
      const src = readFileSync(join(ROOT, rel), "utf8");
      const namesModels = [...src.matchAll(MODEL_ID)].length > 0;
      if (!namesModels) return false;
      // Naming models is fine as a preference — passing them to the policy is
      // what makes them a preference rather than a decision.
      return !src.includes("modelQueueFor");
    });

    expect(
      offenders,
      `these choose their own models instead of asking modelQueueFor:\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("keeps the policy itself as the only ranking authority", () => {
    // If a second file starts ranking free models, the two will disagree.
    const rankers = walk(join(ROOT, "src/app"))
      .filter((file) => {
        const src = readFileSync(file, "utf8");
        return src.includes("endsWith(\":free\")") || src.includes("endsWith(':free')");
      })
      .map((file) => file.replace(ROOT + "\\", "").replace(/\\/g, "/"));

    expect(rankers).toEqual([]);
  });
});
