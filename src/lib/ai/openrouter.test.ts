import { afterEach, describe, expect, it, vi } from "vitest";
import { openRouterComplete, MAX_OPENROUTER_CONTINUATIONS } from "./openrouter";

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
