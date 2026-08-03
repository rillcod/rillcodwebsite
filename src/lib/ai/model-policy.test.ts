import { afterEach, describe, expect, it, vi } from "vitest";
import { modelQueueFor } from "./model-policy";
import { resetFreeModelCache, FREE_FALLBACK_MODELS } from "./openrouter";

vi.mock("./model-catalogue-store", () => ({
  readStoredFreeModels: vi.fn().mockResolvedValue(null),
  writeStoredFreeModels: vi.fn(),
}));

type Spec = {
  id: string;
  context_length: number;
  json?: boolean;
  input?: string[];
  output?: string[];
};

function catalogue(specs: Spec[]) {
  return {
    ok: true,
    json: async () => ({
      data: specs.map((s) => ({
        id: s.id,
        context_length: s.context_length,
        architecture: {
          input_modalities: s.input ?? ["text"],
          output_modalities: s.output ?? ["text"],
        },
        supported_parameters: s.json ? ["response_format", "tools"] : ["tools"],
      })),
    }),
  } as unknown as Response;
}

const BIG = { id: "vendor/big:free", context_length: 1_000_000, json: true };
const SMALL = { id: "vendor/small:free", context_length: 8_000, json: false };

afterEach(() => {
  resetFreeModelCache();
  vi.unstubAllGlobals();
  delete process.env.AI_FREE_MODELS_ONLY;
});

describe("modelQueueFor — the one place models are chosen", () => {
  it("never offers a safety classifier as a writer", async () => {
    // Sorting the raw catalogue by context window put a content-safety model in
    // the queue to write lesson plans. It would not error — it would return a
    // safety verdict where a curriculum was expected.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        catalogue([
          { id: "nvidia/nemotron-3.5-content-safety:free", context_length: 999_999 },
          BIG,
        ])
      )
    );

    const queue = await modelQueueFor({});

    expect(queue).not.toContain("nvidia/nemotron-3.5-content-safety:free");
    expect(queue[0]).toBe(BIG.id);
  });

  it("excludes models that cannot output text at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        catalogue([
          { id: "vendor/draws:free", context_length: 999_999, output: ["image"] },
          BIG,
        ])
      )
    );

    expect(await modelQueueFor({})).toEqual([BIG.id]);
  });

  it("offers only models that can promise JSON when JSON is required", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(catalogue([SMALL, BIG])));

    const queue = await modelQueueFor({ needsJson: true });

    expect(queue).toEqual([BIG.id]);
  });

  it("still returns something when no model can promise JSON", async () => {
    // A model that cannot guarantee the format usually still produces it, and
    // the callers' parser recovers fenced or prefixed output. Returning nothing
    // would fail the request outright, which is worse.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(catalogue([SMALL])));

    expect(await modelQueueFor({ needsJson: true })).toEqual([SMALL.id]);
  });

  it("skips models whose window is smaller than the input", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(catalogue([SMALL, BIG])));

    const queue = await modelQueueFor({ contextTokensNeeded: 100_000 });

    expect(queue).toEqual([BIG.id]);
  });

  it("leads with a route's own pick when it is still served", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(catalogue([BIG, SMALL])));

    const queue = await modelQueueFor({ prefer: [SMALL.id] });

    expect(queue[0]).toBe(SMALL.id);
    expect(queue).toContain(BIG.id);
  });

  it("silently drops a preferred model that has been retired", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(catalogue([BIG])));

    const queue = await modelQueueFor({ prefer: ["gone/model:free"] });

    expect(queue).toEqual([BIG.id]);
  });

  it("keeps preferred paid models behind the whole free tier", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(catalogue([BIG, SMALL])));

    const queue = await modelQueueFor({ prefer: ["vendor/paid-model"] });

    expect(queue[queue.length - 1]).toBe("vendor/paid-model");
    expect(queue.indexOf(BIG.id)).toBeLessThan(queue.indexOf("vendor/paid-model"));
  });

  it("drops the paid tail when free-only is demanded", async () => {
    process.env.AI_FREE_MODELS_ONLY = "true";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(catalogue([BIG])));

    expect(await modelQueueFor({ prefer: ["vendor/paid-model"] })).toEqual([
      BIG.id,
    ]);
  });

  it("never hands back an empty queue", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    expect(await modelQueueFor({})).toEqual(FREE_FALLBACK_MODELS);
  });
});
