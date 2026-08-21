import { describe, expect, it, vi } from "vitest";

import { consumeJsonSSE } from "./json-sse";

function responseFromChunks(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } }
  );
}

describe("consumeJsonSSE", () => {
  it("keeps a JSON event intact when the network splits it across reads", async () => {
    const onMessage = vi.fn();
    const messages = await consumeJsonSSE(
      responseFromChunks([
        'data: {"generated":1,"sta',
        'tus":"Week 1 ready"}\n\n',
        'data: {"done":true,"generated":1,"skipped":0}\n\n',
      ]),
      onMessage
    );

    expect(messages).toEqual([
      { generated: 1, status: "Week 1 ready" },
      { done: true, generated: 1, skipped: 0 },
    ]);
    expect(onMessage).toHaveBeenCalledTimes(2);
  });

  it("reads several events delivered in one network chunk", async () => {
    const messages = await consumeJsonSSE(
      responseFromChunks([
        'data: {"generated":0}\n\ndata: {"done":true,"generated":2}\n\n',
      ])
    );

    expect(messages).toHaveLength(2);
    expect(messages.at(-1)).toMatchObject({ done: true, generated: 2 });
  });
});

