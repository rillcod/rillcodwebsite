import { NextRequest, NextResponse } from 'next/server';
import { geminiGenerateImage } from '@/lib/gemini/client';
import { cloudflareGenerateImage } from '@/lib/ai/cloudflare-ai';
import { withApiProxy } from '@/lib/api-wrapper';

/**
 * POST /api/ai/image
 *
 * Image generation priority (free tier exhausted in order):
 *   1. Gemini 2.0 Flash image generation  (15 RPM / 1 500 RPD free)
 *   2. Imagen 3                            (20 RPM free)
 *   3. Pollinations.ai                     (always free, no key, final fallback)
 */
async function postHandler(req: NextRequest) {
    try {
        const body = await req.json();
        const { prompt, title, subject, gradeLevel } = body;

        let finalPrompt = prompt?.trim() || '';
        if (!finalPrompt) {
            const parts = [
                title ? `"${title}"` : 'a STEM lesson',
                subject ? `subject: ${subject}` : null,
                gradeLevel ? `grade level: ${gradeLevel}` : null,
            ].filter(Boolean);
            finalPrompt = parts.join(', ');
        }

        if (!finalPrompt) {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }

        const enrichedPrompt = `Educational illustration for Nigerian secondary school students: ${finalPrompt}. Clean digital art style, white background, classroom-safe, vibrant and engaging, high fidelity.`;

        // ── 1. Try Gemini (2.0 Flash → Imagen 3) ─────────────────────────────
        const geminiResult = await geminiGenerateImage(enrichedPrompt);

        if (geminiResult) {
            const dataUrl = `data:${geminiResult.mimeType};base64,${geminiResult.base64}`;
            return NextResponse.json({
                url: dataUrl,
                data: { url: dataUrl, prompt: finalPrompt },
                model: geminiResult.model,
                source: 'gemini',
            });
        }

        // ── 2. Cloudflare Workers AI — FLUX.1 Schnell ────────────────────────
        // Free on the daily Neuron allocation (~2,000 small images), on the
        // account this site already deploys from, and unwatermarked. It sits
        // above Pollinations because Pollinations' anonymous tier is capped at
        // one request every 15 seconds and its free output can be watermarked —
        // acceptable as a last resort, not as the normal path for lesson art.
        const cloudflareResult = await cloudflareGenerateImage(enrichedPrompt);

        if (cloudflareResult) {
            const dataUrl = `data:${cloudflareResult.mimeType};base64,${cloudflareResult.base64}`;
            return NextResponse.json({
                url: dataUrl,
                data: { url: dataUrl, prompt: finalPrompt },
                model: cloudflareResult.model,
                source: 'cloudflare',
            });
        }

        // ── 3. Fallback: Pollinations.ai (always free, no key) ───────────────
        console.warn('[AI Image] Gemini and Cloudflare unavailable — falling back to Pollinations.ai');
        const encoded = encodeURIComponent(enrichedPrompt);
        const pollinationsUrl = `https://image.pollinations.ai/prompt/${encoded}?nologo=true&width=1024&height=1024&model=flux&seed=${Math.floor(Math.random() * 99999)}`;

        const pollinationsRes = await fetch(pollinationsUrl, {
            headers: { Accept: 'image/png,image/*' },
        });

        if (!pollinationsRes.ok) {
            return NextResponse.json(
                { error: `Image generation failed (${pollinationsRes.status}). Try again.` },
                { status: 500 },
            );
        }

        const contentType = pollinationsRes.headers.get('content-type') || 'image/png';
        const arrayBuffer = await pollinationsRes.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;

        return NextResponse.json({
            url: dataUrl,
            data: { url: dataUrl, prompt: finalPrompt },
            model: 'flux',
            source: 'pollinations',
        });

    } catch (error: any) {
        console.error('[AI Image] Route error:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}

// Lesson-authoring tool: same surface as the lesson editor that calls it.
// withApiProxy supplies auth, the role gate, the write-burst limit and the
// browser-origin check in one place, so this route cannot drift open again.
export const POST = (req: any, ctx: any) =>
  withApiProxy(postHandler, {
    requireAuth: true,
    requireTenant: false,
    roles: ['admin', 'teacher'],
  })(req, ctx);
