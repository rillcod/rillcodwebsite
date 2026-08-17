import { describe, expect, it } from 'vitest';

import type { ProgressionLevel } from '@/lib/partnerships/curriculum';
import { buildWorkbookHTML, describeWorkbookCost } from './workbook-html';
import {
  MONO_INK_END,
  MONO_INK_START,
  findGreyscaleViolations,
  findNonGreyColours,
  isGreyHex,
  isGreyRgb,
} from './greyscale';
import {
  COLOUR_SIGNATURE_PAGES,
  PRINT_COST,
  TEACHING_WEEKS_PER_TERM,
  costWorkbook,
  planWorkbook,
} from './plan';

/** Basic 1, as it is actually stored — the pilot year group, 200 learners. */
const BASIC_1: ProgressionLevel = {
  year_number: 1,
  grade: 'Basic 1',
  theme: 'Digital Discovery + AI Awareness',
  terms: [
    { term: 1, focus: 'Computer hardware basics, Scratch 3.0 UI & smart concepts.' },
    { term: 2, focus: 'Animations, sprite interaction, AI voice & toy control.' },
    { term: 3, focus: 'Storytelling games, intelligent responses & pattern games.' },
  ],
  capstone: 'Voice-Controlled Storytelling Robot.',
  portfolio: '3 Scratch Games + 1 AI Story.',
};

describe('what the book is made of', () => {
  it('is as long as the teaching the school bought', () => {
    // One class a week over three twelve-week terms is thirty-six sessions. A
    // book sized for one class a week and sold to a two-class school runs out
    // in February, with the empty half as the evidence.
    const weekly = planWorkbook(BASIC_1, 1);
    const twice = planWorkbook(BASIC_1, 2);

    const sessions = (p: typeof weekly) => p.pages.filter((x) => x.kind === 'session').length;
    expect(sessions(weekly)).toBe(TEACHING_WEEKS_PER_TERM * 3);
    expect(sessions(twice)).toBe(TEACHING_WEEKS_PER_TERM * 3 * 2);
  });

  it('spends colour only where nobody writes', () => {
    const plan = planWorkbook(BASIC_1, 1);
    const colour = plan.pages.filter((p) => p.ink === 'colour');

    // Four cover pages plus one eight-page signature, and nothing else.
    expect(colour).toHaveLength(4 + COLOUR_SIGNATURE_PAGES);
    // Every page a child works on is mono, because mono is half the price and
    // pencil reads better on it.
    for (const kind of ['session', 'term-opener', 'capstone', 'glossary', 'portfolio'] as const) {
      for (const page of plan.pages.filter((p) => p.kind === kind)) {
        expect(page.ink, `${kind} must be mono`).toBe('mono');
      }
    }
  });

  it('costs what the printer said it costs', () => {
    const cost = costWorkbook([
      { kind: 'cover-front', ink: 'colour', title: '' },
      { kind: 'session', ink: 'mono', title: '' },
      { kind: 'session', ink: 'mono', title: '' },
    ]);

    expect(cost.colourCost).toBe(PRINT_COST.colour);
    expect(cost.monoCost).toBe(PRINT_COST.mono * 2);
    expect(cost.perCopy).toBe(PRINT_COST.colour + PRINT_COST.mono * 2 + PRINT_COST.bindingEstimate);
  });

  it('prices a real Basic 1 book inside what a parent will pay', () => {
    const plan = planWorkbook(BASIC_1, 1);

    // 12 colour at ₦80 and 41 mono at ₦40, plus binding. The number that has
    // to stay true is the one a cover price is set against — if this test
    // fails, the price on the invoice is wrong, not the test.
    expect(plan.cost.colourPages).toBe(12);
    expect(plan.cost.perCopy).toBe(12 * 80 + plan.cost.monoPages * 40 + PRINT_COST.bindingEstimate);
    expect(plan.cost.perCopy).toBeLessThan(4000);
  });

  it('says what it costs in one line', () => {
    expect(describeWorkbookCost(planWorkbook(BASIC_1, 1))).toContain('per copy');
  });
});

describe('the greyscale rule', () => {
  it('knows a grey from a colour', () => {
    expect(isGreyHex('#666666')).toBe(true);
    expect(isGreyHex('#fff')).toBe(true);
    expect(isGreyHex('#7a0606')).toBe(false);
    expect(isGreyRgb('rgba(0,0,0,.4)')).toBe(true);
    expect(isGreyRgb('rgb(127,178,255)')).toBe(false);
  });

  it('flags a hue however it is written', () => {
    // oklch and hsl carry a hue channel by construction, so using them on a
    // one-ink page is a colour decision whether or not it renders grey today.
    expect(findNonGreyColours('color: #7a0606;')).toContain('#7a0606');
    expect(findNonGreyColours('background: oklch(0.7 0.15 250);')).toHaveLength(1);
    expect(findNonGreyColours('border-color: red;')).toContain('red');
    // And leaves greys alone.
    expect(findNonGreyColours('color: #000000; background: #eeeeee; border: 1px solid #666666;')).toHaveLength(0);
  });

  /*
    The one that matters.

    A mono page designed in colour and flattened by the printer arrives as a
    page where the warning box and the well-done box are the same mid-grey, and
    a six-year-old cannot tell them apart. Nobody finds out until two hundred
    copies are in a box, so this reads the real rendered output rather than
    trusting the stylesheet's good intentions.
  */
  it('holds every printed mono page to one ink', () => {
    const html = buildWorkbookHTML({ level: BASIC_1, schoolName: 'Bay-Flowers International School' });
    const violations = findGreyscaleViolations(html);

    expect(
      violations,
      violations.map((v) => `p${v.page}: ${v.value} — ${v.context}`).join('\n'),
    ).toHaveLength(0);
  });

  /*
    A guard that checks nothing passes everything.

    The stylesheet region is found by markers. If those markers are ever
    dropped — renamed, refactored, lost in a merge — the regex stops matching,
    the region checked becomes empty, and the greyscale test above goes green
    while proving nothing at all. So the markers themselves are asserted, and
    so is the size of what sits between them.
  */
  it('is actually reading the mono stylesheet, not an empty region', () => {
    const html = buildWorkbookHTML({ level: BASIC_1 });

    expect(html).toContain(MONO_INK_START);
    expect(html).toContain(MONO_INK_END);

    const region = html.slice(
      html.indexOf(MONO_INK_START) + MONO_INK_START.length,
      html.indexOf(MONO_INK_END),
    );
    // The mono half of the stylesheet is most of the design; a few hundred
    // characters would mean the markers had drifted apart from the rules.
    expect(region.length).toBeGreaterThan(1500);
    expect(region).toContain('.page-mono');
  });

  it('catches a colour in the mono stylesheet, not just in the markup', () => {
    const html = buildWorkbookHTML({ level: BASIC_1 }).replace(
      '.page-mono { background: #ffffff; color: #000000; }',
      '.page-mono { background: #ffffff; color: #7a0606; }',
    );

    const found = findGreyscaleViolations(html);
    expect(found.some((v) => v.value === '#7a0606')).toBe(true);
    // Page 0 means the stylesheet rather than a page body.
    expect(found.find((v) => v.value === '#7a0606')?.page).toBe(0);
  });

  it('catches a colour smuggled onto a mono page', () => {
    const bad = '<section class="page page-mono"><p style="color:#7a0606">Look at me</p></section>';
    const found = findGreyscaleViolations(bad);

    expect(found).toHaveLength(1);
    expect(found[0].value).toBe('#7a0606');
  });

  it('leaves the colour pages alone, since they are paid for', () => {
    const colourful = '<section class="page page-colour"><p style="color:#7a0606">Fine</p></section>';
    expect(findGreyscaleViolations(colourful)).toHaveLength(0);
  });
});

describe('the printed book', () => {
  it('says nothing the curriculum row did not say', () => {
    const html = buildWorkbookHTML({ level: BASIC_1 });

    expect(html).toContain('Digital Discovery + AI Awareness');
    expect(html).toContain('Voice-Controlled Storytelling Robot');
    expect(html).toContain('3 Scratch Games + 1 AI Story');
    expect(html).toContain('Basic 1');
  });

  it('gives every taught session its own page, in order', () => {
    const html = buildWorkbookHTML({ level: BASIC_1 });
    const pages = html.match(/<section class="page /g) ?? [];
    const plan = planWorkbook(BASIC_1, 1);

    expect(pages).toHaveLength(plan.pages.length);
    // A page a child can find from what the teacher says out loud.
    expect(html).toContain('Week 1');
    expect(html).toContain(`Week ${TEACHING_WEEKS_PER_TERM}`);
  });

  it('closes every working page with something a parent can see', () => {
    const html = buildWorkbookHTML({ level: BASIC_1 });
    const ticks = html.match(/class="done-box"/g) ?? [];
    const plan = planWorkbook(BASIC_1, 1);
    const workedPages = plan.pages.filter((p) => p.kind === 'session' || p.kind === 'capstone');

    expect(ticks).toHaveLength(workedPages.length);
  });

  it('names the school on the cover when there is one to name', () => {
    expect(buildWorkbookHTML({ level: BASIC_1, schoolName: 'Bay-Flowers' })).toContain('Bay-Flowers');
    // And leaves a rule to write on when there is not.
    expect(buildWorkbookHTML({ level: BASIC_1 })).toContain('cov-rule');
  });
});
