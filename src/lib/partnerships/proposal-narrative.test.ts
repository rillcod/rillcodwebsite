import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateAIContent } = vi.hoisted(() => ({ generateAIContent: vi.fn() }));
vi.mock('@/lib/ai/generate-core', () => ({ generateAIContent }));

import {
  AUTHORED_NARRATIVE,
  buildProposalNarrative,
  containsCommercialClaim,
  isUsableNarrative,
} from './proposal-narrative';

const ctx = { school: { name: 'Bay-Flowers International School', city: 'Benin City', state: 'Edo' } };

const good = {
  headline: 'Preparing your students for the work ahead',
  opening:
    'Parents in Benin City increasingly choose a school on whether it will prepare their children for work that does not exist yet. A structured coding and robotics programme is the clearest evidence a school can offer, and the clearest reason for a family to choose you over a neighbouring school.',
  benefits: [
    { title: 'Taught on your site', body: 'Our facilitators run every session in your classrooms, to your timetable, with your own teachers observing and gradually taking it on.' },
    { title: 'A ladder, not a club', body: 'Structured progression across every year group, so a child who begins in the first year leaves having built and shipped genuine work.' },
    { title: 'Evidence for parents', body: 'Each learner keeps a portfolio and completes a capstone build every term, so progress is demonstrated to families rather than asserted.' },
    { title: 'Nothing to buy', body: 'Hardware, curriculum, platform and facilitator training are all ours; the school provides a room and a slot on the timetable.' },
  ],
  closing: 'If the shape works, we issue a Memorandum of Understanding and can begin the following term.',
};

describe('the price is never generated', () => {
  it.each([
    ['naira figures', 'It costs ₦30,000 per term.'],
    ['a bare amount', 'Schools pay 30,000 each term.'],
    ['a percentage', 'We retain 70% of the revenue.'],
    ['a per-student rate', 'A modest fee per student covers everything.'],
    ['a discount promise', 'We are offering a discount this term.'],
    ['a guarantee', 'We guarantee enrolment growth.'],
  ])('rejects %s', (_label, text) => {
    expect(containsCommercialClaim(text)).toBe(true);
  });

  it('allows ordinary persuasive copy', () => {
    expect(containsCommercialClaim(good.opening)).toBe(false);
    expect(containsCommercialClaim(good.closing)).toBe(false);
  });

  it('throws out an otherwise good narrative that names a price', () => {
    const priced = {
      ...good,
      benefits: [
        ...good.benefits.slice(0, 3),
        { title: 'Great value', body: 'The whole programme runs at just ₦10,000 per student per term, which is remarkable value for a school of your size.' },
      ],
    };
    expect(isUsableNarrative(priced)).toBe(false);
  });
});

describe('quality gate', () => {
  it('accepts a complete narrative', () => {
    expect(isUsableNarrative({ ...good, source: 'ai' })).toBe(true);
  });

  it.each([
    ['a thin opening', { ...good, opening: 'Coding is good.' }],
    ['three benefits', { ...good, benefits: good.benefits.slice(0, 3) }],
    ['five benefits', { ...good, benefits: [...good.benefits, good.benefits[0]] }],
    ['an empty headline', { ...good, headline: '' }],
    ['a one-word benefit body', { ...good, benefits: [{ title: 'Good', body: 'Yes.' }, ...good.benefits.slice(1)] }],
  ])('rejects %s', (_label, value) => {
    expect(isUsableNarrative(value)).toBe(false);
  });

  it('rejects nonsense', () => {
    expect(isUsableNarrative(null)).toBe(false);
    expect(isUsableNarrative('a proposal')).toBe(false);
    expect(isUsableNarrative({})).toBe(false);
  });
});

describe('building a narrative', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('uses the authored copy unless AI is asked for', async () => {
    const n = await buildProposalNarrative(ctx);

    expect(n).toBe(AUTHORED_NARRATIVE);
    expect(generateAIContent).not.toHaveBeenCalled();
  });

  it('tailors the copy when AI is enabled', async () => {
    generateAIContent.mockResolvedValueOnce({ success: true, content: JSON.stringify(good) });

    const n = await buildProposalNarrative(ctx, { useAI: true });

    expect(n.source).toBe('ai');
    expect(n.headline).toBe(good.headline);
    // The school and its city reach the model, so the copy can be specific.
    const prompt = generateAIContent.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Bay-Flowers International School');
    expect(prompt).toContain('Benin City');
  });

  it('reads JSON out of a fenced answer', async () => {
    generateAIContent.mockResolvedValueOnce({
      success: true,
      content: '```json\n' + JSON.stringify(good) + '\n```',
    });

    expect((await buildProposalNarrative(ctx, { useAI: true })).source).toBe('ai');
  });

  it('falls back to authored copy when the model fails', async () => {
    generateAIContent.mockRejectedValueOnce(new Error('all providers exhausted'));

    // A school waiting on a proposal must never be blocked by an AI provider.
    expect(await buildProposalNarrative(ctx, { useAI: true })).toBe(AUTHORED_NARRATIVE);
  });

  it.each([
    ['unparseable output', { success: true, content: 'Sure! Here is your proposal.' }],
    ['a short answer', { success: true, content: JSON.stringify({ ...good, opening: 'Too short.' }) }],
    ['a priced answer', {
      success: true,
      content: JSON.stringify({ ...good, closing: 'Sign today and pay only ₦10,000 per student.' }),
    }],
  ])('falls back on %s', async (_label, result) => {
    generateAIContent.mockResolvedValueOnce(result);
    expect(await buildProposalNarrative(ctx, { useAI: true })).toBe(AUTHORED_NARRATIVE);
  });
});
