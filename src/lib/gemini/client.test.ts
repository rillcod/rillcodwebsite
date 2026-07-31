import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    generateContent: vi.fn(),
    generateImages: vi.fn(),
    /** Every call recorded as { apiKey, model, config } so we can assert routing. */
    calls: [] as { apiKey: string; model: string; config: any; contents: string }[],
}));

vi.mock('@google/genai', () => ({
    GoogleGenAI: class {
        apiKey: string;
        models: Record<string, unknown>;
        constructor(opts: { apiKey: string }) {
            this.apiKey = opts.apiKey;
            this.models = {
                generateContent: (args: any) => {
                    mocks.calls.push({
                        apiKey: this.apiKey,
                        model: args.model,
                        config: args.config,
                        contents: args.contents,
                    });
                    return mocks.generateContent(args, this.apiKey);
                },
                generateImages: (args: any) => mocks.generateImages(args, this.apiKey),
            };
        }
    },
}));

import { geminiGenerateText, estimateTokens, hasGeminiKey, TEXT_MODELS } from './client';

/** Build a Gemini SDK-shaped response. */
function reply(text: string, finishReason = 'STOP') {
    return {
        text,
        candidates: [{ finishReason }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    };
}

function apiError(status: number) {
    return Object.assign(new Error(`boom ${status}`), { status });
}

beforeEach(() => {
    mocks.generateContent.mockReset();
    mocks.generateImages.mockReset();
    mocks.calls.length = 0;
    delete process.env.GEMINI_API_KEY_2;
    delete process.env.GEMINI_API_KEYS;
    process.env.GEMINI_API_KEY = 'key-one';
});

describe('geminiGenerateText', () => {
    it('returns text and the model that produced it', async () => {
        mocks.generateContent.mockResolvedValue(reply('hello world'));

        const result = await geminiGenerateText('sys', 'user');

        expect(result).toMatchObject({ text: 'hello world', model: TEXT_MODELS[0] });
        expect(mocks.calls[0].config.systemInstruction).toBe('sys');
    });

    it('returns null when no API key is configured', async () => {
        delete process.env.GEMINI_API_KEY;
        expect(hasGeminiKey()).toBe(false);

        expect(await geminiGenerateText('sys', 'user')).toBeNull();
        expect(mocks.generateContent).not.toHaveBeenCalled();
    });

    it('enables thinking by default and lets callers turn it off', async () => {
        mocks.generateContent.mockResolvedValue(reply('ok'));

        await geminiGenerateText('sys', 'user');
        expect(mocks.calls[0].config.thinkingConfig.thinkingBudget).toBeGreaterThan(0);

        mocks.calls.length = 0;
        await geminiGenerateText('sys', 'user', { reasoning: 'none' });
        expect(mocks.calls[0].config.thinkingConfig.thinkingBudget).toBe(0);
    });

    it('retries with thinking disabled when the model runs out of output budget', async () => {
        // Thinking eating the whole output allowance is the most common cause of an
        // empty-looking 2.5 response; it must not fall through to a weaker model.
        mocks.generateContent
            .mockResolvedValueOnce(reply('', 'MAX_TOKENS'))
            .mockResolvedValueOnce(reply('recovered answer'));

        const result = await geminiGenerateText('sys', 'user');

        expect(result).toMatchObject({ text: 'recovered answer', model: TEXT_MODELS[0] });
        expect(mocks.calls[0].config.thinkingConfig.thinkingBudget).toBeGreaterThan(0);
        expect(mocks.calls[1].config.thinkingConfig.thinkingBudget).toBe(0);
    });

    it('returns partial output rather than nothing when truncation persists', async () => {
        mocks.generateContent.mockResolvedValue(reply('half an ans', 'MAX_TOKENS'));

        const result = await geminiGenerateText('sys', 'user');

        expect(result).toMatchObject({ text: 'half an ans', truncated: true });
    });

    it('retries the same model on the next key before downgrading the model', async () => {
        process.env.GEMINI_API_KEY_2 = 'key-two';
        mocks.generateContent
            .mockRejectedValueOnce(apiError(429))
            .mockResolvedValueOnce(reply('second key worked'));

        const result = await geminiGenerateText('sys', 'user');

        expect(result?.text).toBe('second key worked');
        // Same (strongest) model on both attempts — quota loss must not cost quality.
        expect(mocks.calls.map(c => c.model)).toEqual([TEXT_MODELS[0], TEXT_MODELS[0]]);
        expect(new Set(mocks.calls.map(c => c.apiKey))).toEqual(new Set(['key-one', 'key-two']));
    });

    it('falls down the model ladder once every key is exhausted', async () => {
        mocks.generateContent
            .mockRejectedValueOnce(apiError(429))
            .mockResolvedValueOnce(reply('weaker model answered'));

        const result = await geminiGenerateText('sys', 'user');

        expect(result?.text).toBe('weaker model answered');
        expect(mocks.calls.map(c => c.model)).toEqual([TEXT_MODELS[0], TEXT_MODELS[1]]);
    });

    it('treats a quota message with no status code as a quota failure', async () => {
        mocks.generateContent
            .mockRejectedValueOnce(new Error('RESOURCE_EXHAUSTED: quota exceeded'))
            .mockResolvedValueOnce(reply('ok'));

        expect((await geminiGenerateText('sys', 'user'))?.text).toBe('ok');
    });

    it('returns null when every model on every key fails', async () => {
        mocks.generateContent.mockRejectedValue(apiError(429));

        expect(await geminiGenerateText('sys', 'user')).toBeNull();
        expect(mocks.calls).toHaveLength(TEXT_MODELS.length);
    });

    it('supports the legacy boolean jsonMode signature', async () => {
        mocks.generateContent.mockResolvedValue(reply('{"a":1}'));

        await geminiGenerateText('sys', 'user', true);

        expect(mocks.calls[0].config.responseMimeType).toBe('application/json');
    });

    it('places long-form context before the instruction', async () => {
        mocks.generateContent.mockResolvedValue(reply('ok'));

        await geminiGenerateText('sys', 'ANSWER THIS', { context: ['DOC A', 'DOC B'] });

        const { contents } = mocks.calls[0];
        expect(contents.indexOf('DOC A')).toBeLessThan(contents.indexOf('ANSWER THIS'));
        expect(contents).toContain('DOC B');
    });

    it('never lets the thinking budget swallow the output allowance', async () => {
        // A 200-token answer with a 4k thinking budget would finish as MAX_TOKENS
        // with nothing visible — the budget has to be clamped to the cap.
        mocks.generateContent.mockResolvedValue(reply('two short sentences'));

        await geminiGenerateText('sys', 'user', { maxOutputTokens: 200, reasoning: 'high' });

        expect(mocks.calls[0].config.thinkingConfig.thinkingBudget).toBeLessThanOrEqual(100);
    });

    it('caps output tokens to what the chosen model actually supports', async () => {
        mocks.generateContent.mockResolvedValue(reply('ok'));

        await geminiGenerateText('sys', 'user', { maxOutputTokens: 10_000_000 });

        expect(mocks.calls[0].config.maxOutputTokens).toBeLessThanOrEqual(65_536);
    });

    it('skips an empty non-truncated response instead of returning blank text', async () => {
        mocks.generateContent
            .mockResolvedValueOnce(reply('', 'SAFETY'))
            .mockResolvedValueOnce(reply('real answer'));

        expect((await geminiGenerateText('sys', 'user'))?.text).toBe('real answer');
    });
});

describe('estimateTokens', () => {
    it('scales with input length and never returns zero for real text', () => {
        expect(estimateTokens('a')).toBeGreaterThan(0);
        expect(estimateTokens('x'.repeat(4000))).toBeGreaterThan(estimateTokens('x'.repeat(400)));
    });
});
