import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openRouterComplete,
  orderFreeFirst,
  FREE_FALLBACK_MODELS,
  MAX_OPENROUTER_CONTINUATIONS,
} from "./openrouter";

function reply(content: string, finish_reason: string, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ choices: [{ message: { content }, finish_reason }] }),
  } as unknown as Response;
}

const ARGS = {
  apiKey: "k",
  model: "some/model:free",
  system: "s",
  user: "u",
  maxTokens: 100,
};

afterEach(() => vi.unstubAllGlobals());

describe("openRouterComplete", () => {
  it("returns a completed answer without resuming", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply("all done", "stop"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await openRouterComplete(ARGS);

    expect(result).toMatchObject({ content: "all done", continued: 0, truncated: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resumes when the ceiling is hit and joins without a separator", async () => {
    // The join must not insert whitespace: a body cut mid-token has to close up.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply('{"a":1,"b":"hel', "length"))
      .mockResolvedValueOnce(reply('lo"}', "stop"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await openRouterComplete({ ...ARGS, json: true });

    expect(result.content).toBe('{"a":1,"b":"hello"}');
    expect(JSON.parse(result.content)).toEqual({ a: 1, b: "hello" });
    expect(result).toMatchObject({ continued: 1, truncated: false });
  });

  it("only asks for json_object on the first pass", async () => {
    // A resumed fragment is not a whole document; demanding the format again
    // makes the model start a fresh object instead of carrying on.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply("{", "length"))
      .mockResolvedValueOnce(reply("}", "stop"));
    vi.stubGlobal("fetch", fetchMock);

    await openRouterComplete({ ...ARGS, json: true });

    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(first.response_format).toEqual({ type: "json_object" });
    expect(second.response_format).toBeUndefined();
    expect(second.messages.map((m: any) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
  });

  it("stops resuming when the model says it is finished", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply("part", "length"))
      .mockResolvedValueOnce(reply("   ", "stop"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await openRouterComplete(ARGS);

    expect(result.content).toBe("part");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the pass limit and says it is still unfinished", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply("x", "length"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await openRouterComplete(ARGS);

    expect(result.truncated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_OPENROUTER_CONTINUATIONS + 1);
  });

  it("keeps what it already has when a resume pass fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply("kept", "length"))
      .mockResolvedValueOnce(reply("", "error", false));
    vi.stubGlobal("fetch", fetchMock);

    const result = await openRouterComplete(ARGS);

    expect(result.content).toBe("kept");
    expect(result.truncated).toBe(true);
  });

  it("throws when the very first call fails, since there is nothing to keep", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("", "error", false)));
    await expect(openRouterComplete(ARGS)).rejects.toThrow("OpenRouter 500");
  });
});

describe("orderFreeFirst", () => {
  const PAID_AND_FREE = [
    "google/gemini-2.5-flash",
    "qwen/qwen3-235b-a22b:free",
    "x-ai/grok-2-1212",
    "deepseek/deepseek-r1:free",
  ];

  afterEach(() => {
    delete process.env.AI_FREE_MODELS_ONLY;
  });

  it("puts every free model ahead of every paid one, order preserved within each", () => {
    expect(orderFreeFirst(PAID_AND_FREE)).toEqual([
      "qwen/qwen3-235b-a22b:free",
      "deepseek/deepseek-r1:free",
      "google/gemini-2.5-flash",
      "x-ai/grok-2-1212",
    ]);
  });

  it("keeps the paid models so an exhausted free tier degrades instead of failing", () => {
    // This is the whole reason they are reordered rather than removed.
    expect(orderFreeFirst(PAID_AND_FREE)).toContain("google/gemini-2.5-flash");
  });

  it("tries the free list first even when the queue names no free model", () => {
    expect(orderFreeFirst(["x-ai/grok-2-1212"])).toEqual([
      ...FREE_FALLBACK_MODELS,
      "x-ai/grok-2-1212",
    ]);
  });

  it("never returns an empty queue", () => {
    expect(orderFreeFirst([])).toEqual(FREE_FALLBACK_MODELS);
  });

  it("drops the paid tail only when free-only is explicitly demanded", () => {
    process.env.AI_FREE_MODELS_ONLY = "true";
    expect(orderFreeFirst(PAID_AND_FREE)).toEqual([
      "qwen/qwen3-235b-a22b:free",
      "deepseek/deepseek-r1:free",
    ]);
  });

  it("only counts an exact :free suffix", () => {
    // ":free-preview" or a name merely containing "free" is not the free tier.
    expect(orderFreeFirst(["vendor/free-model"])).toEqual([
      ...FREE_FALLBACK_MODELS,
      "vendor/free-model",
    ]);
  });

  it("ships a fallback list that is itself entirely free", () => {
    expect(FREE_FALLBACK_MODELS.every((m) => m.endsWith(":free"))).toBe(true);
  });
});

describe("a resume pass that starts over instead of continuing", () => {
  it("does not weld two half-documents together", () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply('{"a":1,"b":"hel', "length"))
      // Ignored the instruction and answered the whole thing again.
      .mockResolvedValueOnce(reply('{"a":1,"b":"hello","c":2}', "stop"));
    vi.stubGlobal("fetch", fetchMock);

    return openRouterComplete({ ...ARGS, json: true }).then((result) => {
      expect(result.content).toBe('{"a":1,"b":"hello","c":2}');
      expect(() => JSON.parse(result.content)).not.toThrow();
    });
  });

  it("keeps the longer text when the continuation repeats the opening", async () => {
    const first = "The lesson begins with a warm-up activity that";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(first, "length"))
      .mockResolvedValueOnce(reply(`${first} lasts ten minutes.`, "stop"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await openRouterComplete(ARGS);

    expect(result.content).toBe(`${first} lasts ten minutes.`);
  });
});
