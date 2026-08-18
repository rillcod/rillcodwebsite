import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  /*
    Split on sheet boundaries — including the sheets that carry a second class.

    This matched `class="page"` and nothing else, so `class="page page-money"`
    was not a boundary and the money sheet was silently glued onto the end of
    the fees sheet. Every assertion that went looking for "the money page" was
    handed both, which is how a test can pass while measuring the wrong thing.
  */
  const parts = html.split(/<div class="page[ "][^>]*>/);
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

    pages.forEach((pageContent) => {
      expect(pageContent.trim().length).toBeGreaterThan(50);
      /*
        Nothing interpolated into the page resolved to a missing value.

        Inline handlers are exempt, and have to be: the logo's fallback is
        `onerror="this.onerror=null; …"`, which is ordinary JavaScript and not a
        value that leaked out of the template. Once the cover became a page this
        test could see — it was glued to the prelude before — that handler failed
        the check, which is the assertion being wrong rather than the document.
      */
      const rendered = pageContent
        .replace(/\son[a-z]+="[^"]*"/g, '')
        .replace(/<script[\s\S]*?<\/script>/g, '');
      expect(rendered).not.toContain('undefined');
      expect(rendered).not.toContain('null');
      expect(rendered).not.toContain('NaN');
    });
  });

  it('renders Memorandum of Understanding across exactly 5 structured A4 pages', () => {
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
        settlement_days: null,
        settlement_trigger: null,
        withdrawal_policy: null,
        minimum_students: null,
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

    // Five sheets now: the records, media and data-protection clause earned one,
    // and execution keeps its own so a signed copy never shares a page.
    expect(pages.length).toBe(5);

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

    // Page 4: Records, media and data protection, then the general clauses.
    expect(pages[3]).toContain('Records, Media and Data Protection');
    expect(pages[3]).toContain('General');

    // Page 5: Execution & Signature Blocks — on a sheet of its own, so a signed
    // copy is never a page that also carried half a clause.
    expect(pages[4]).toContain('Execution');
    // The execution page carries the prompt to sign from a phone. It used to
    // read "Digital Portal & Online E-Signing", which named a feature; it now
    // asks for the action, which is the only thing this page wants.
    expect(pages[4]).toContain('Scan to sign');
    // The counterparty's box is a delimited region now, not a single point, so
    // that signing replaces the blank ruled line instead of printing the
    // signature underneath it.
    expect(hasSignatureSlot(pages[4])).toBe(true);
  });

  it('keeps the money page on one A4 sheet when the menu is shown equally', () => {
    const html = buildPartnershipProposalHTML({
      school: {
        name: "St. Gregory's International Model College & Early Childhood Academy",
        city: 'Lekki Phase 1',
        state: 'Lagos State',
      },
      reference: 'RC-PROP-2026-00001',
      dateLabel: '15 August 2026',
      curriculum: MOCK_CURRICULUM as any,
      offers: PARTNERSHIP_OFFERS,
      upside: {
        mode: 'menu',
        total: null,
        feePerStudent: 0,
        sharePercent: 30,
        cycle: 'term',
        rows: [
          { label: 'Option A', students: 150, rate: 25000, gross: 3_750_000, schoolShare: 1_125_000 },
          { label: 'Option B1', students: 150, rate: 10000, gross: 1_500_000, schoolShare: 450_000 },
          { label: 'Option B2', students: 150, rate: 15000, gross: 2_250_000, schoolShare: 675_000 },
        ],
      },
    });

    /*
      A sheet is A4 wide and at least A4 tall — and never clips.

      This asserted the opposite: a page pinned to exactly 297mm with its
      overflow hidden. That is not "keep it to a page", it is "delete whatever
      does not fit", and it did — a curriculum row typed longer than the sample
      took the last card off the sheet, and the fees page cut its own promises
      mid-sentence. A minimum lets a long page carry on to a second sheet
      instead, which costs paper rather than meaning.
    */
    expect(html).toContain('@page { size: A4 portrait; margin: 0; }');
    expect(html).toContain('width: 210mm; min-height: 297mm;');
    expect(html).toMatch(/@media print \{[\s\S]*?min-height: 297mm !important; height: auto !important;/);
    expect(html).toMatch(/@media print \{[\s\S]*?overflow: visible !important;/);
    expect(html).not.toMatch(/@media print \{[\s\S]*?\.page \{[^}]*overflow: hidden/);

    const returnPage = extractPages(html).find((p) => p.includes("The school's share")) ?? '';
    expect(returnPage).toContain('How programme fees would be shared');
    expect(returnPage).toContain('What this would return');
    expect(returnPage).toContain('What a parent would be paying for');
    expect(returnPage).toContain('upside-row');
    expect(returnPage).toContain('class="value"');
    expect(html).toContain('page-money');
    expect(returnPage).toContain('7.30.03%20PM.jpeg');
    expect(returnPage).toContain('>Students<');
    expect(returnPage).not.toContain('How and when');
    // Four columns beside the chart, not five.
    expect(returnPage.match(/<th>/g)).toHaveLength(4);
  });

  /*
    Every switch in the studio does what its label says.

    This test used to render each section off and assert the HTML was `defined`,
    which is true of every string ever returned — so four switches rotted behind
    it without a failure. "The standard options" printed the fee cards whatever
    it was set to, "What a parent gets to hold" and "Speak to us" the same, and
    "Student outcomes" toggled a block of questions while the outcomes block it
    named had been deleted from the document.

    A switch on a proposal is not cosmetic: it is how an operator keeps a fee
    page out of a document going to a school that has already agreed a rate. The
    marker below is a string only that section prints, so the assertion is the
    same in both directions — present when on, gone when off.
  */
  const SECTION_MARKERS: Record<ProposalSectionKey, string> = {
    proofBand: 'Schools partnered',
    intro: 'Who you would be partnering with',
    pitch: 'Why this, and why now',
    portfolio: 'What a parent gets to hold',
    journey: 'What a child walks out with',
    disciplines: 'What a parent can see',
    rollout: 'They see it before you sign',
    offers: 'class="offers',
    offersChart: 'per student, per year',
    split: 'How programme fees would be shared',
    upside: 'What this would return',
    sideBySide: 'What each side brings',
    curriculum: 'Primary Pathway',
    comparison: 'What changes, against what you run today',
    zeroCapex: 'What we commit to in writing',
    caseStudies: 'Questions we are usually asked',
    whyNow: '<h2>Why now</h2>',
    fieldProof: 'What our students have already done',
    photos: 'class="gallery',
    // The class, as written on the element — the stylesheet names it too, and a
    // marker that matches the CSS would pass with the block itself missing.
    contact: 'class="end-scan-contact"',
  };

  /** Everything a proposal needs before every section has something to draw. */
  const fullInput = (studio: ReturnType<typeof defaultStudioConfig>): ProposalInput => ({
    school: { name: 'Grange School Ikeja', city: 'Ikeja', state: 'Lagos' },
    reference: 'RC-PROP-TEST',
    dateLabel: '15 August 2026',
    curriculum: MOCK_CURRICULUM as any,
    offers: PARTNERSHIP_OFFERS,
    proof: { partnerSchools: 42, students: 6500, years: 5 },
    // A picked option is what compresses the fees page enough for the scope
    // table to print there, which is the only place it prints.
    scopeToOffer: 'B2',
    accessCode: '482915',
    validUntilLabel: '15 November 2026',
    narrative: AUTHORED_NARRATIVE,
    upside: {
      mode: 'uptake',
      total: null,
      feePerStudent: 25000,
      sharePercent: 30,
      cycle: 'term',
      rows: [
        { label: '50% uptake', students: 175, rate: 25000, gross: 4_375_000, schoolShare: 1_312_500 },
        { label: '100% uptake', students: 350, rate: 25000, gross: 8_750_000, schoolShare: 2_625_000 },
      ],
    },
    studio,
  });

  /*
    Nothing in either document is set below 10pt.

    These are printed on A4 and read by a proprietor across a desk, often on a
    photocopy of a photocopy. The type had drifted down to 6.2pt in places —
    legible on a screen at 150% and not on paper — because shrinking type is the
    easiest way to make a section fit. It is also the one way that costs the
    reader, so the floor is a test rather than an intention: a page that will not
    fit at 10pt has to give up spacing, or take another sheet.
  */
  /*
    Neither document may clip a page.

    The proposal's rule is asserted where its own page-fit test lives; this one
    holds the same line for the MoU, where the stake is higher. A clause that
    does not print is a clause that was not agreed to, on the copy a proprietor
    signed — and a page pinned to 297mm with its overflow hidden deletes exactly
    that, silently.
  */
  it('lets a long page take another sheet rather than cutting it, in both documents', () => {
    for (const file of ['proposal-html.ts', 'mou-html.ts']) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      const print = source.slice(source.indexOf('@media print'));
      // Not `min-height` — that is the rule we want. A bare `height` is the one
      // that turns a sheet into a guillotine.
      expect(print, `${file} pins its pages to exactly A4`).not.toMatch(
        /\.page \{[^}]*[^-]height: 297mm !important;/,
      );
      expect(print, `${file} hides what does not fit`).toMatch(
        /\.page \{[^}]*overflow: visible !important;/,
      );
    }
  });

  it('sets no type below 10pt in either document', () => {
    const sources = [
      ['the proposal', readFileSync(join(__dirname, 'proposal-html.ts'), 'utf8')],
      ['the MoU', readFileSync(join(__dirname, 'mou-html.ts'), 'utf8')],
    ] as const;

    for (const [name, source] of sources) {
      const tooSmall = [...source.matchAll(/font(?:-size)?: (?:[^;]*?\s)?([0-9.]+)pt/g)]
        .map((m) => Number(m[1]))
        .filter((size) => size < 10);
      expect(tooSmall, `${name} sets type below the 10pt floor: ${tooSmall.join(', ')}`).toEqual([]);
    }
  });

  it('prints every studio section when the studio is complete', () => {
    const html = buildPartnershipProposalHTML(fullInput(defaultStudioConfig()));
    ALL_SECTIONS.forEach((key: ProposalSectionKey) => {
      expect(html, `${key} should print when switched on`).toContain(SECTION_MARKERS[key]);
    });
  });

  it('drops exactly the section switched off, and nothing else', () => {
    ALL_SECTIONS.forEach((key: ProposalSectionKey) => {
      const studio = defaultStudioConfig();
      studio.sections[key] = false;
      const html = buildPartnershipProposalHTML(fullInput(studio));

      expect(html, `${key} should not print when switched off`).not.toContain(
        SECTION_MARKERS[key],
      );

      ALL_SECTIONS.filter((other) => other !== key).forEach((other) => {
        // The photo strips share one marker with the gallery, and the two
        // overview sheets trade sections between them, so a section that only
        // moved is not a section that vanished — every other marker must still
        // be somewhere in the document.
        expect(html, `${other} should survive switching ${key} off`).toContain(
          SECTION_MARKERS[other],
        );
      });
    });
  });

  /*
    A page is a 297mm box with overflow hidden, so a sheet holding nothing at all
    still prints: a running head, a page number, and half a millimetre of rule,
    in the middle of a document a head teacher is reading. Every combination of
    switches has to leave either content or no sheet.
  */
  it('prints no empty sheet, whatever the studio switches off', () => {
    const cases: Array<[string, ProposalSectionKey[]]> = [
      ['the whole overview', ['intro', 'pitch', 'portfolio']],
      ['the programme sheet', ['journey', 'disciplines', 'rollout']],
      ['the fees sheet', ['offers', 'offersChart', 'sideBySide']],
      ['the money sheet', ['split', 'upside']],
      ['the case sheet', ['comparison', 'zeroCapex', 'caseStudies']],
      ['everything', [...ALL_SECTIONS]],
    ];

    for (const [what, keys] of cases) {
      const studio = defaultStudioConfig();
      for (const key of keys) studio.sections[key] = false;
      const html = buildPartnershipProposalHTML(fullInput(studio));

      for (const page of extractPages(html)) {
        // What is left once the running head and the markup come off it.
        const text = page
          .replace(/<div class="pagehead">[\s\S]*?<\/div>/, '')
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<[^>]+>/g, '')
          .replace(/&[a-z]+;|&#\d+;/g, '')
          .trim();
        expect(text.length, `a blank sheet printed with ${what} switched off`).toBeGreaterThan(0);
      }
      // And the close is never one of the sheets that can be dropped: it carries
      // the signature block, so a proposal without it cannot be accepted.
      expect(html, `the close must survive ${what} being switched off`).toContain('Next step');
      expect(hasSignatureSlot(html)).toBe(true);
    }
  });
});
