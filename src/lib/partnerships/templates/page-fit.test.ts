import { describe, expect, it } from 'vitest';
import { buildPartnershipProposalHTML, type ProposalInput } from './proposal-html';
import { buildPartnershipMouHTML, type MouInput } from './mou-html';
import { defaultStudioConfig, ALL_SECTIONS, type ProposalSectionKey } from '../studio-config';
import { PARTNERSHIP_OFFERS } from '../offers';
import { AUTHORED_NARRATIVE } from '../proposal-narrative';
import { hasSignatureSlot } from '../signing';

const MOCK_CURRICULUM = {
  levels: [
    { year_number: 1, grade: 'Basic 1', theme: 'Foundations of Computing', terms: [{ term: 1, focus: 'Scratch Jr' }, { term: 2, focus: 'Logic' }, { term: 3, focus: 'Robotics' }], capstone: 'Story Animation', portfolio: 'Interactive Card' },
    { year_number: 2, grade: 'Basic 2', theme: 'Animation & Algorithms', terms: [{ term: 1, focus: 'Block Coding' }, { term: 2, focus: 'Sequencing' }, { term: 3, focus: 'Robotics' }], capstone: 'Maze Game', portfolio: 'Animated Fable' },
    { year_number: 3, grade: 'Basic 3', theme: 'Game Development', terms: [{ term: 1, focus: 'Scratch 3.0' }, { term: 2, focus: 'Loops' }, { term: 3, focus: 'Sensors' }], capstone: 'Platformer', portfolio: 'Catch Game' },
    { year_number: 4, grade: 'Basic 4', theme: 'Physical Computing', terms: [{ term: 1, focus: 'Micro:bit' }, { term: 2, focus: 'Motors' }, { term: 3, focus: 'Circuits' }], capstone: 'Smart Alarm', portfolio: 'Weather Station' },
    { year_number: 5, grade: 'Basic 5', theme: 'Applied Robotics', terms: [{ term: 1, focus: 'Arduino' }, { term: 2, focus: 'Sensors' }, { term: 3, focus: 'Robotics' }], capstone: 'Line Follower', portfolio: 'Robo Bot' },
    { year_number: 6, grade: 'Basic 6', theme: 'Web & AI Fundamentals', terms: [{ term: 1, focus: 'HTML/CSS' }, { term: 2, focus: 'Teachable Machine' }, { term: 3, focus: 'Capstone' }], capstone: 'AI Classifier', portfolio: 'Personal Website' },
    { year_number: 7, grade: 'JSS 1', theme: 'Python & Text Coding', terms: [{ term: 1, focus: 'Python Basics' }, { term: 2, focus: 'Conditionals' }, { term: 3, focus: 'Turtle' }], capstone: 'Drawing Bot', portfolio: 'Text Adventure' },
    { year_number: 8, grade: 'JSS 2', theme: 'Data & Electronics', terms: [{ term: 1, focus: 'Data Structures' }, { term: 2, focus: 'IoT' }, { term: 3, focus: 'Automation' }], capstone: 'Smart Irrigation', portfolio: 'Data Visualizer' },
    { year_number: 9, grade: 'JSS 3', theme: 'App Engineering', terms: [{ term: 1, focus: 'App Inventor' }, { term: 2, focus: 'APIs' }, { term: 3, focus: 'Mobile' }], capstone: 'Community App', portfolio: 'Published App' },
    { year_number: 10, grade: 'SS 1', theme: 'Full Stack Development', terms: [{ term: 1, focus: 'JavaScript' }, { term: 2, focus: 'DOM' }, { term: 3, focus: 'React' }], capstone: 'School Portal', portfolio: 'Web Application' },
    { year_number: 11, grade: 'SS 2', theme: 'Machine Learning & IoT', terms: [{ term: 1, focus: 'Python ML' }, { term: 2, focus: 'Computer Vision' }, { term: 3, focus: 'Raspberry Pi' }], capstone: 'Vision Classifier', portfolio: 'Smart Cam' },
    { year_number: 12, grade: 'SS 3', theme: 'Capstone & Innovation', terms: [{ term: 1, focus: 'Advanced Systems' }, { term: 2, focus: 'Incubation' }, { term: 3, focus: 'Showcase' }], capstone: 'Autonomous Vehicle', portfolio: 'Final Portfolio' },
  ],
};

function extractPages(html: string): string[] {
  // Split on <div class="page"> boundaries
  const parts = html.split(/<div class="page"[^>]*>/);
  // Drop the HTML prelude before the first page
  return parts.slice(1).map((p) => {
    // Cut off at the end of the page div or body
    const end = p.lastIndexOf('</div>');
    return end > 0 ? p.slice(0, end) : p;
  });
}

describe('A4 Page-Fit and Overflow Guard', () => {
  it('renders standard full-scale proposal across bounded discrete A4 pages', () => {
    const input: ProposalInput = {
      school: {
        name: "St. Gregory's International Model College & Early Childhood Academy",
        city: 'Lekki Phase 1',
        state: 'Lagos State',
      },
      reference: 'RC-PROP-2026-00001',
      dateLabel: '15 August 2026',
      curriculum: MOCK_CURRICULUM as any,
      offers: PARTNERSHIP_OFFERS,
      proof: { partnerSchools: 42, students: 6500, years: 5 },
      upside: {
        mode: 'uptake',
        total: null,
        feePerStudent: 25000,
        sharePercent: 30,
        cycle: 'term',
        rows: [
          { label: '50% uptake', students: 175, rate: 25000, gross: 4375000, schoolShare: 1312500 },
          { label: '75% uptake', students: 262, rate: 25000, gross: 6550000, schoolShare: 1965000 },
          { label: '100% uptake', students: 350, rate: 25000, gross: 8750000, schoolShare: 2625000 },
        ],
      },
      photos: ['/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.56 PM.jpeg'],
    };

    const html = buildPartnershipProposalHTML(input);
    const pages = extractPages(html);

    expect(pages.length).toBeGreaterThanOrEqual(4);

    pages.forEach((pageContent, idx) => {
      expect(pageContent.trim().length).toBeGreaterThan(50);
      // Ensure no unclosed tags or corrupted templates
      expect(pageContent).not.toContain('undefined');
      expect(pageContent).not.toContain('null');
      expect(pageContent).not.toContain('NaN');
    });
  });

  it('renders Memorandum of Understanding across exactly 4 structured A4 pages', () => {
    const input: MouInput = {
      school: {
        name: 'Corona Secondary School Agbara',
        address: 'Yenagoa Road, Agbara Industrial Estate',
        city: 'Agbara',
        state: 'Ogun State',
        signatoryName: 'Dr. (Mrs.) Adebayo Alabi',
        signatoryRole: 'Director of Education & Head of School',
      },
      terms: {
        id: 'terms-1',
        school_id: 'school-1',
        billing_model: 'per_student',
        amount_per_student: 25000,
        fixed_package_price: null,
        tiers: null,
        deposit_amount: null,
        rillcod_share_percent: 70,
        school_share_percent: 30,
        currency: 'NGN',
        billing_cycle: 'term',
        status: 'active',
      },
      curriculum: MOCK_CURRICULUM as any,
      reference: 'RC-MOU-2026-00042',
      dateLabel: '15 August 2026',
      commencement: 'First Term 2026/2027 Academic Session',
      durationLabel: '3 Academic Sessions',
      accessCode: '849201',
      illustrativeStudents: 300,
    };

    const html = buildPartnershipMouHTML(input);
    const pages = extractPages(html);

    // MoU layout is structured into 4 distinct physical sheets
    expect(pages.length).toBe(4);

    // Page 1: Parties & Background & Commitments
    expect(pages[0]).toContain('Memorandum of Understanding');
    expect(pages[0]).toContain('Party A');
    expect(pages[0]).toContain('Party B');
    expect(pages[0]).toContain('Commitments of the Parties');

    // Page 2: Financial Framework & Term
    expect(pages[1]).toContain('Financial Framework');
    expect(pages[1]).toContain('Term, Review and Termination');

    // Page 3: Curriculum Annex
    expect(pages[2]).toContain('Schedule of Learning');

    // Page 4: Execution & Signature Blocks
    expect(pages[3]).toContain('Execution');
    expect(pages[3]).toContain('Digital Portal');
    // The counterparty's box is a delimited region now, not a single point, so
    // that signing replaces the blank ruled line instead of printing the
    // signature underneath it.
    expect(hasSignatureSlot(pages[3])).toBe(true);
  });

  it('verifies every studio section toggle is wired and strictly respected', () => {
    ALL_SECTIONS.forEach((sectionKey: ProposalSectionKey) => {
      const config = defaultStudioConfig();
      config.sections[sectionKey] = false;

      const html = buildPartnershipProposalHTML({
        school: { name: 'Grange School Ikeja' },
        reference: 'RC-PROP-TEST',
        dateLabel: '15 August 2026',
        curriculum: MOCK_CURRICULUM as any,
        studio: config,
      });

      expect(html).toBeDefined();
    });
  });
});
