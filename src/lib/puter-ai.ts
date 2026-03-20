/**
 * Puter.js AI — free-tier browser-side AI (no API key required).
 * Requires the Puter.js CDN script to be loaded first:
 *   <Script src="https://js.puter.com/v2/" strategy="lazyOnload" />
 *
 * Available at: window.puter.ai.chat()
 * Docs: https://docs.puter.com/ai/
 */

declare global {
  interface Window {
    puter?: {
      ai: {
        chat: (
          prompt: string,
          options?: { model?: string; stream?: boolean }
        ) => Promise<{ message: { content: [{ text: string }] } }>;
        txt2img?: (
          prompt: string,
          options?: { model?: string }
        ) => Promise<{ src: string }>;
      };
    };
  }
}

/** Check if Puter.js is available in the current browser context */
export function isPuterAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.puter?.ai?.chat === 'function';
}

/**
 * Send a chat prompt to Puter.js free AI.
 * Falls back gracefully if Puter is not loaded yet.
 */
export async function puterChat(prompt: string, model = 'gpt-4o-mini'): Promise<string> {
  if (!isPuterAvailable()) {
    throw new Error('Puter.js is not available. Make sure the CDN script is loaded.');
  }
  const response = await window.puter!.ai.chat(prompt, { model });
  const r = response as any;

  // Format 1: content is an array of blocks → { message: { content: [{ text }] } }
  if (Array.isArray(r?.message?.content) && r.message.content[0]?.text) {
    return r.message.content[0].text;
  }
  // Format 2: content is a plain string → { message: { content: "..." } }
  if (typeof r?.message?.content === 'string') {
    return r.message.content;
  }
  // Format 3: some Puter models return the string directly at response level
  if (typeof r === 'string') return r;
  // Format 4: response is the message itself → { content: "..." }
  if (typeof r?.content === 'string') return r.content;
  if (Array.isArray(r?.content) && r.content[0]?.text) return r.content[0].text;

  throw new Error('Unexpected Puter.js response format');
}

/**
 * Generate an image via Puter.js (txt2img).
 * Returns a data URL or blob URL usable in <img src=…>
 */
export async function puterTxt2Img(prompt: string): Promise<string> {
  if (!isPuterAvailable() || !window.puter?.ai?.txt2img) {
    throw new Error('Puter.js image generation is not available.');
  }
  const result = await window.puter!.ai.txt2img!(prompt);
  return result.src;
}
