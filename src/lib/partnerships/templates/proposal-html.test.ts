import { describe, expect, it } from 'vitest';
import { buildPartnershipProposalHTML } from './proposal-html';
import { PARTNERSHIP_OFFERS } from '../offers';
import type { CurriculumProgression } from '../curriculum';
import type { PartnershipTerms } from '../terms';
import { defaultStudioConfig } from '../studio-config';
import { PARTNERSHIP_PHOTOS } from '../proposal-sections';

const curriculum: CurriculumProgression = {
  id: 'prog-1',
  slug: 'k12-ai-coding',
  title: 'AI-Integrated Coding & Robotics Progression',
  subtitle: 'Basic 1 to SS 3',
  summary: null,
  edition: 1,
  status: 'published',
  levels: [
    {
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
    },
    {
      year_number: 12,
      grade: 'SS 3',
      theme: 'Mobile AI + Tech Entrepreneurship',
      terms: [
        { term: 1, focus: 'Mobile app foundations.' },
        { term: 2, focus: 'On-device AI features.' },
        { term: 3, focus: 'Launch, pitch and portfolio.' },
      ],
      capstone: 'Shipped mobile AI product.',
      portfolio: '1 published app.',
    },
  ],
};

const school = { name: 'Bay-Flowers International School', city: 'Benin City', state: 'Edo' };
const base = { school, curriculum, reference: 'RC-PROP-0007', dateLabel: '14 August 2026' };

describe('the partnership proposal', () => {
  it('names the school it was prepared for', () => {
    const html = buildPartnershipProposalHTML(base);
    expect(html).toContain('Bay-Flowers International School');
    expect(html).toContain('Benin City, Edo');
    expect(html).toContain('RC-PROP-0007');
  });

  it('prints the curriculum from stored data, not a literal', () => {
    const html = buildPartnershipProposalHTML(base);

    expect(html).toContain('Digital Discovery + AI Awareness');
    expect(html).toContain('Computer hardware basics, Scratch 3.0 UI &amp; smart concepts.');
    expect(html).toContain('Voice-Controlled Storytelling Robot.');
    expect(html).toContain('Mobile AI + Tech Entrepreneurship');
  });

  it('splits primary and secondary onto their own pages', () => {
    const html = buildPartnershipProposalHTML(base);
    expect(html).toContain('Primary Pathway');
    expect(html).toContain('Secondary Pathway');
  });

  it('offers all three standard options with their fees', () => {
    const html = buildPartnershipProposalHTML(base);

    for (const offer of PARTNERSHIP_OFFERS) {
      expect(html).toContain(`Option ${offer.code}`);
    }
    expect(html).toContain('₦25,000–₦30,000 per student per term');
    expect(html).toContain('₦10,000 per student per term');
    expect(html).toContain('₦15,000 per student per term');
  });

  it('states agreed terms once a rate exists, from the same record the MoU uses', () => {
    const agreedTerms: PartnershipTerms = {
      id: 't1',
      school_id: 's1',
      billing_model: 'per_student',
      currency: 'NGN',
      billing_cycle: 'term',
      amount_per_student: 30000,
      fixed_package_price: null,
      tiers: null,
      deposit_amount: null,
      rillcod_share_percent: 70,
      school_share_percent: 30,
      status: 'agreed',
    };

    const html = buildPartnershipProposalHTML({ ...base, agreedTerms });

    expect(html).toContain('Agreed terms');
    expect(html).toContain('₦30,000 per student per term, shared Rillcod 70% / school 30%');
    // The menu stays, demoted — a school can still see what it did not take.
    expect(html).toContain('Standard options for reference');
  });

  it('shows the menu as a choice when nothing is agreed yet', () => {
    const html = buildPartnershipProposalHTML(base);
    expect(html).toContain('Choose the shape that fits your school');
    expect(html).not.toContain('Agreed terms');
  });

  it('still renders without a curriculum rather than failing a quote', () => {
    const html = buildPartnershipProposalHTML({ ...base, curriculum: null });

    expect(html).toContain('Bay-Flowers International School');
    expect(html).toContain('Option A');
    expect(html).not.toContain('Primary Pathway');
  });

  it('always gives both sides somewhere to sign', () => {
    // The close and the signature block used to live inside the secondary-years
    // page, so a proposal whose curriculum did not load printed no closing and
    // nowhere to sign — on the document whose entire purpose is being agreed to.
    for (const input of [base, { ...base, curriculum: null }]) {
      const html = buildPartnershipProposalHTML(input);
      expect(html).toContain('Next step');
      expect(html).toContain('For RILLCOD LTD (trading as Rillcod Technologies)');
      expect(html).toContain('For Bay-Flowers International School');
    }
  });

  describe('when one option has been picked for this school', () => {
    /*
      A proposal that prints three options at the same size has made no
      recommendation — the head teacher is left to choose unaided, and some of
      them will take the cheapest rather than the right one. Once a shape has
      been chosen for a particular roll, one option leads and the rest become
      evidence that the price came off a standard menu.
    */
    it('leads with the quoted option and demotes the rest to one line', () => {
      const html = buildPartnershipProposalHTML({ ...base, scopeToOffer: 'B1' });

      expect(html).toContain('What we recommend for Bay-Flowers International School');
      expect(html).toContain('Recommended for your school');
      // Exactly one recommendation, and exactly one full card with it.
      expect(html.match(/Recommended for your school/g)).toHaveLength(1);
      expect(html.match(/class="offer offer-picked"/g)).toHaveLength(1);
      expect(html.match(/<article class="offer/g)).toHaveLength(1);

      // The other two are still there, small.
      expect(html).toContain('Also available on the standard menu');
      expect(html.match(/class="offer-alt"/g)).toHaveLength(2);
      expect(html).toContain('₦25,000–₦30,000 per student per term');
      expect(html).toContain('₦15,000 per student per term');
    });

    it('emphasises one option when two of them share a scope line', () => {
      // B1 and B2 are both "All classes, primary to secondary". Matching on the
      // scope lit up both of them, which is no emphasis at all.
      const html = buildPartnershipProposalHTML({
        ...base,
        scopeToOffer: 'All classes, primary to secondary',
      });

      expect(html.match(/class="offer offer-picked"/g)).toHaveLength(1);
    });

    it('shows the whole menu as equals when nothing has been picked', () => {
      const html = buildPartnershipProposalHTML(base);

      expect(html).toContain('Choose the shape that fits your school');
      expect(html).not.toContain('Recommended for your school');
      expect(html).not.toContain('Also available on the standard menu');
      expect(html.match(/<article class="offer/g)).toHaveLength(PARTNERSHIP_OFFERS.length);
    });
  });

  it('states the year range it is actually selling', () => {
    const full = buildPartnershipProposalHTML(base);
    expect(full).toContain('Basic 1 to SS 3');

    // Option A stops at SS 2, so the cover must not still claim SS 3.
    const scoped = buildPartnershipProposalHTML({ ...base, scopeToOffer: 'Basic 1 through SS 2' });
    expect(scoped).toContain('1 school year<');
    expect(scoped).not.toContain('Basic 1 to SS 3');
  });

  it('quotes one stage when that is all the school runs', () => {
    // A primary school reading about SS 3 learns we did not look at them.
    const primaryOnly = buildPartnershipProposalHTML({ ...base, stage: 'primary' });
    expect(primaryOnly).toContain('Primary Pathway');
    expect(primaryOnly).not.toContain('Secondary Pathway');
    expect(primaryOnly).toContain('Basic 1 to Basic 1');

    const secondaryOnly = buildPartnershipProposalHTML({ ...base, stage: 'secondary' });
    expect(secondaryOnly).toContain('Secondary Pathway');
    expect(secondaryOnly).not.toContain('Primary Pathway');

    // Either way there is still a place to sign.
    expect(primaryOnly).toContain('For RILLCOD LTD');
    expect(secondaryOnly).toContain('For RILLCOD LTD');
  });

  it('quotes all twelve years by default', () => {
    const both = buildPartnershipProposalHTML({ ...base, stage: 'both' });
    expect(both).toContain('Primary Pathway');
    expect(both).toContain('Secondary Pathway');
  });

  it('dates how long the quoted fees stand', () => {
    const html = buildPartnershipProposalHTML({ ...base, validUntilLabel: '12 November 2026' });

    expect(html).toContain('Fees valid until');
    expect(html).toContain('These fees stand until 12 November 2026');
  });

  it('says nothing about validity when none was set', () => {
    const html = buildPartnershipProposalHTML(base);
    expect(html).not.toContain('Fees valid until');
    expect(html).not.toContain('These fees stand until');
  });

  it('escapes a school name that contains markup', () => {
    const html = buildPartnershipProposalHTML({
      ...base,
      school: { name: '<script>alert(1)</script> Academy' },
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('is a complete printable document', () => {
    const html = buildPartnershipProposalHTML(base);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('@page { size: A4');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });
});

/**
 * The photographs are the only evidence in the document. They went missing for
 * a reason nothing else could catch: the desk builds its studio config from
 * `defaultStudioConfig()`, that defaulted to no photographs, and
 * `normaliseStudioConfig` honours an explicit empty array — so every proposal
 * issued from the desk quietly printed none, while a direct call to the
 * template (every test, and every render I measured) printed all six.
 */
describe('the photographs a proposal actually prints', () => {
  it('prints the house selection under the desk default', () => {
    const html = buildPartnershipProposalHTML({ ...base, studio: defaultStudioConfig() });

    for (const src of PARTNERSHIP_PHOTOS) {
      const encoded = src.replace(/^\//, '').split('/').map(encodeURIComponent).join('/');
      expect(html).toContain(encoded);
    }
  });

  it('prints all six across the two strips, none twice', () => {
    const html = buildPartnershipProposalHTML({ ...base, studio: defaultStudioConfig() });
    const srcs = [...html.matchAll(/<img src="([^"]*EVENTS[^"]*)"/g)].map((m) => m[1]);

    expect(srcs).toHaveLength(6);
    expect(new Set(srcs).size).toBe(6);
  });

  it('still lets the studio clear them deliberately', () => {
    const studio = { ...defaultStudioConfig(), photos: [] };
    const html = buildPartnershipProposalHTML({ ...base, studio });

    expect(html).not.toContain('EVENTS');
    expect(html).not.toContain('The programme running');
  });
});

/**
 * The cover headline is the one narrative field a person types and a model
 * writes. It was interpolated raw while `opening` and `closing` beside it were
 * escaped — so an ampersand in a school's chosen headline printed as markup, and
 * anything sharper printed as markup too.
 */
describe('the cover headline', () => {
  it('escapes an ampersand rather than printing entity soup', () => {
    const html = buildPartnershipProposalHTML({
      ...base,
      studio: { ...defaultStudioConfig(), copy: { headline: 'Coding & Robotics' } },
    });

    expect(html).toContain('Coding &amp; Robotics');
    expect(html).not.toContain('Coding &amp;amp; Robotics');
  });

  it('escapes markup somebody types into the studio', () => {
    const html = buildPartnershipProposalHTML({
      ...base,
      studio: {
        ...defaultStudioConfig(),
        copy: { headline: '<img src=x onerror=alert(1)>' },
      },
    });

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});
