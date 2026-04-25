import { GoogleGenAI } from '@google/genai';

export const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

/**
 * Image generation model priority (free tier, exhausted in order):
 *
 * 1. gemini-2.0-flash-preview-image-generation  — Gemini 2.0 Flash native image output
 *    Free: 15 RPM / 1 500 RPD
 *
 * 2. imagen-3.0-generate-001  — Google Imagen 3
 *    Free: 20 RPM (no daily cap published)
 *
 * 3. Pollinations.ai  — always-free, no key, final fallback
 */
export const IMAGE_MODELS = [
    'gemini-2.0-flash-preview-image-generation',
    'imagen-3.0-generate-001',
] as const;

export type ImageModel = typeof IMAGE_MODELS[number];

export interface GeneratedImage {
    base64: string;       // raw base64 (no data: prefix)
    mimeType: string;
    model: string;
}

/**
 * Try each Gemini image model in order.
 * Returns null if all fail (caller should fall back to Pollinations).
 */
export async function geminiGenerateImage(prompt: string): Promise<GeneratedImage | null> {
    for (const model of IMAGE_MODELS) {
        try {
            if (model === 'gemini-2.0-flash-preview-image-generation') {
                const result = await gemini.models.generateContent({
                    model,
                    contents: prompt,
                    config: {
                        responseModalities: ['IMAGE', 'TEXT'],
                        numberOfImages: 1,
                    } as any,
                });

                const parts = result.candidates?.[0]?.content?.parts ?? [];
                for (const part of parts) {
                    if ((part as any).inlineData?.data) {
                        const inline = (part as any).inlineData;
                        return {
                            base64: inline.data,
                            mimeType: inline.mimeType ?? 'image/png',
                            model,
                        };
                    }
                }
            }

            if (model === 'imagen-3.0-generate-001') {
                const result = await gemini.models.generateImages({
                    model,
                    prompt,
                    config: { numberOfImages: 1 },
                });

                const img = result.generatedImages?.[0]?.image;
                if (img?.imageBytes) {
                    return {
                        base64: Buffer.from(img.imageBytes).toString('base64'),
                        mimeType: 'image/png',
                        model,
                    };
                }
            }
        } catch (err: any) {
            const status = err?.status ?? err?.httpStatusCode ?? 0;
            // 429 = rate limit, 503 = overloaded — try next model
            if (status === 429 || status === 503 || status === 500) {
                console.warn(`[Gemini] ${model} rate-limited or unavailable, trying next...`);
                continue;
            }
            // Unexpected error — still try next
            console.warn(`[Gemini] ${model} error:`, err?.message ?? err);
            continue;
        }
    }
    return null;
}

/**
 * Text generation with Gemini 2.5 Flash (free tier).
 * Falls back through model list on rate limit.
 */
export const TEXT_MODELS = [
    'gemini-2.5-flash',      // Gemini 2.5 Flash (stable) — best free quality, 1M ctx
    'gemini-2.5-pro',        // Gemini 2.5 Pro — most capable, lower free quota
    'gemini-2.0-flash',      // Gemini 2.0 Flash — fast, reliable fallback
    'gemini-2.5-flash-lite', // Flash-Lite — lightweight last resort
] as const;

export async function geminiGenerateText(
    systemPrompt: string,
    userPrompt: string,
    jsonMode = false,
): Promise<{ text: string; model: string } | null> {
    for (const model of TEXT_MODELS) {
        try {
            const result = await gemini.models.generateContent({
                model,
                contents: userPrompt,
                config: {
                    systemInstruction: systemPrompt,
                    ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
                },
            });
            const text = result.text ?? '';
            if (text) return { text, model };
        } catch (err: any) {
            const status = err?.status ?? err?.httpStatusCode ?? 0;
            if (status === 429 || status === 503) {
                console.warn(`[Gemini Text] ${model} rate-limited, trying next...`);
                continue;
            }
            console.warn(`[Gemini Text] ${model} error:`, err?.message ?? err);
            continue;
        }
    }
    return null;
}
