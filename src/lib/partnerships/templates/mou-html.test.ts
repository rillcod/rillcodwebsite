import { describe, expect, it } from 'vitest';
import { buildPartnershipMouHTML } from './mou-html';
import type { CurriculumProgression } from '../curriculum';
import type { PartnershipTerms } from '../terms';

const terms: PartnershipTerms = {
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

const curriculum: CurriculumProgression = {
  id: 'p1',
  slug: 'k12-ai-coding',
  title: 'AI-Integrated Coding & Robotics Progression',
  subtitle: 'Basic 1 to SS 3',
  summary: null,
  edition: 1,
  status: 'published',
  levels: [
    {
      year_number: 1, grade: 'Basic 1', theme: 'Digital Discovery + AI Awareness',
      terms: [{ term: 1, focus: 'Hardware basics.' }, { term: 2, focus: 'Animations.' }, { term: 3, focus: 'Storytelling.' }],
      capstone: 'Voice-Controlled Storytelling Robot.', portfolio: '3 Scratch Games.',
    },
    {
      year_number: 12, grade: 'SS 3', theme: 'Mobile AI + Tech Entrepreneurship',
      terms: [{ term: 1, focus: 'Mobile foundations.' }, { term: 2, focus: 'On-device AI.' }, { term: 3, focus: 'Launch.' }],
      capstone: 'Shipped mobile AI product.', portfolio: '1 published app.',
    },
  ],
};

const base = {
  school: { name: 'Bay-Flowers International School', city: 'Benin City', state: 'Edo' },
  terms,
  curriculum,
  reference: 'RC-MOU-0001',
  dateLabel: '14 August 2026',
};

describe('the Memorandum of Understanding', () => {
  it('names both parties', () => {
    const html = buildPartnershipMouHTML(base);
    expect(html).toContain('Party A');
    expect(html).toContain('Party B');
    expect(html).toContain('Bay-Flowers International School');
  });

  it('states the agreed terms in the same sentence every document uses', () => {
    const html = buildPartnershipMouHTML(base);
    expect(html).toContain('₦30,000 per student per term, shared Rillcod 70% / school 30%');
  });

  it('gives Rillcod the larger share when the split is worked through', () => {
    // 100 students × ₦30,000 = ₦3,000,000, split 70/30.
    const html = buildPartnershipMouHTML({ ...base, illustrativeStudents: 100 });

    expect(html).toContain('₦3,000,000');
    expect(html).toContain('₦2,100,000');
    expect(html).toContain('₦900,000');
    expect(html).toContain('At 100 enrolled students');
  });

  it('reports the whole amount as payable when no split is agreed', () => {
    const flat = { ...terms, rillcod_share_percent: null, school_share_percent: null };
    const html = buildPartnershipMouHTML({ ...base, terms: flat, illustrativeStudents: 10 });

    expect(html).toContain('Payable to RILLCOD LTD');
    expect(html).toContain('₦300,000');
    // A flat rate is not a 0% share of anything.
    expect(html).not.toContain('share (0%)');
  });

  it('shows a deposit and the balance it leaves', () => {
    const withDeposit = { ...terms, deposit_amount: 500000 };
    const html = buildPartnershipMouHTML({ ...base, terms: withDeposit, illustrativeStudents: 100 });

    expect(html).toContain('Less agreed deposit');
    expect(html).toContain('Balance due');
    expect(html).toContain('₦2,500,000');
  });

  it('omits the worked example rather than printing zeros', () => {
    const html = buildPartnershipMouHTML(base);

    expect(html).not.toContain('At 0 enrolled students');
    expect(html).toContain('against actual enrolment');
  });

  it('schedules the curriculum it is agreeing to teach', () => {
    const html = buildPartnershipMouHTML(base);

    expect(html).toContain('Schedule of Learning');
    expect(html).toContain('Basic 1');
    expect(html).toContain('SS 3');
    expect(html).toContain('Voice-Controlled Storytelling Robot.');
    expect(html).toContain('Edition 1');
  });

  it('remains a valid agreement without a curriculum attached', () => {
    const html = buildPartnershipMouHTML({ ...base, curriculum: null });

    expect(html).toContain('Financial Framework');
    expect(html).toContain('Execution');
    expect(html).not.toContain('Schedule of Learning');
  });

  it('carries the clauses that make it enforceable', () => {
    const html = buildPartnershipMouHTML(base);

    expect(html).toContain('Term, Review and Termination');
    expect(html).toContain("one full term's written notice");
    expect(html).toContain('Federal Republic of Nigeria');
    expect(html).toContain('Execution');
  });

  it('escapes a school name containing markup', () => {
    const html = buildPartnershipMouHTML({
      ...base,
      school: { name: '<img src=x onerror=alert(1)> School' },
    });

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('contracts as the registered company, not the trading name', () => {
    const html = buildPartnershipMouHTML(base);

    // The Python generator named RILLCOD ACADEMY and RILLCOD TECHNOLOGIES in the
    // same contract. Only the registered entity can be party to an agreement —
    // and it is the one whose bank account the fees are actually paid into, so a
    // school's accountant must find the same name on both.
    expect(html).toContain('RILLCOD LTD');
    expect(html).toContain('RC 1781500');
    expect(html).not.toContain('Rillcod Academy');

    // The trading name still appears, but only to connect the two.
    expect(html).toContain('Trading as Rillcod Technologies');
  });

  it('is a complete printable document', () => {
    const html = buildPartnershipMouHTML(base);

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('@page { size: A4');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });
});

/**
 * The signature line printed "Name &amp; signature" to the school, because the
 * fallback was written pre-escaped and then escaped again on the way out. On the
 * line whose whole job is to be signed.
 */
describe('the signature block', () => {
  it('prints a readable fallback, not a double-escaped entity', () => {
    const html = buildPartnershipMouHTML(base);

    expect(html).not.toContain('&amp;amp;');
    expect(html).toContain('Name &amp; signature');
  });

  it('uses the school signatory when one is on record', () => {
    const html = buildPartnershipMouHTML({
      ...base,
      school: { ...base.school, signatoryName: 'Mrs A. Okafor' },
    });

    expect(html).toContain('Mrs A. Okafor');
  });
});
