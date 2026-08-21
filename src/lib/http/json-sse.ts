export type JsonSSEMessage = Record<string, unknown>;

/**
 * Consume a server-sent-event response whose `data:` payloads are JSON.
 *
 * Network chunks are not event boundaries. A JSON payload can be split across
 * two reads (or several events can arrive in one read), so callers must keep a
 * buffer until the blank line that terminates an SSE frame. Keeping this in one
 * browser/server-neutral helper prevents each generation screen from parsing
 * the same stream differently.
 */
export async function consumeJsonSSE<T extends JsonSSEMessage = JsonSSEMessage>(
  response: Response,
  onMessage?: (message: T) => void
): Promise<T[]> {
  if (!response.body) return [];

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const messages: T[] = [];
  let buffer = "";

  const consumeFrame = (frame: string) => {
    const payload = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!payload) return;

    const message = JSON.parse(payload) as T;
    messages.push(message);
    onMessage?.(message);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) consumeFrame(frame);

      if (done) break;
    }

    if (buffer.trim()) consumeFrame(buffer);
    return messages;
  } finally {
    reader.releaseLock();
  }
}

