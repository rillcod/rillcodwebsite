import { describe, expect, it } from 'vitest';
import { buildPartnershipProposalHTML } from './proposal-html';
import { PARTNERSHIP_OFFERS } from '../offers';
import type { CurriculumProgression } from '../curriculum';
import type { PartnershipTerms } from '../terms';

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
