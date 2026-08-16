import { describe, expect, it } from 'vitest';
import {
  MAX_SIGNATURE_BYTES,
  SIGNATURE_ANCHOR,
  SIGNATURE_SLOT_END,
  SIGNATURE_SLOT_START,
  SIGNATURE_DATA_URL_PATTERN,
  buildDocumentShareUrl,
  buildSignatureStamp,
  hasSignatureSlot,
  escapeHtml,
  isValidDocumentIdentifier,
  isValidShareToken,
  stampSignature,
} from './signing';
import { buildPartnershipProposalHTML } from './templates/proposal-html';
import { buildPartnershipMouHTML } from './templates/mou-html';
import type { PartnershipTerms } from './terms';
import { brandContact } from '@/config/brand';

/**
 * The public signing link is the only unauthenticated write in the partnership
 * desk, and what it writes is a contract. Everything here guards a specific way
 * that went wrong.
 */

describe('the share token gate', () => {
  it('accepts a uuid in either case', () => {
    expect(isValidShareToken('7f3a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b')).toBe(true);
    expect(isValidShareToken('7F3A1C2E-4B5D-4E6F-8A9B-0C1D2E3F4A5B')).toBe(true);
  });

  it('refuses a document reference', () => {
    // The whole point. References are sequential and printed on the document, so
    // keying the public route on one let anybody count from RC-PROP-2026-00042
    // down to 00001 and read every school's agreed fees.
    expect(isValidShareToken('RC-PROP-2026-00042')).toBe(false);
    expect(isValidShareToken('RC-MOU-0007')).toBe(false);
  });

  it('refuses anything that is not a token at all', () => {
    for (const bad of ['', '   ', 'null', '../../etc/passwd', "' or 1=1--", '%00', 'undefined']) {
      expect(isValidShareToken(bad)).toBe(false);
    }
    expect(isValidShareToken(null)).toBe(false);
    expect(isValidShareToken(42)).toBe(false);
  });
});

describe('what a signature image may be', () => {
  it('accepts the raster formats a canvas produces', () => {
    expect(SIGNATURE_DATA_URL_PATTERN.test('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(SIGNATURE_DATA_URL_PATTERN.test('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
  });

  it('refuses anything that could execute or navigate', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'https://example.com/pixel.png',
      'x" onerror="fetch(`https://evil.test`)',
    ]) {
      expect(SIGNATURE_DATA_URL_PATTERN.test(bad)).toBe(false);
    }
  });

  it('caps the size, because this is an unauthenticated write', () => {
    expect(MAX_SIGNATURE_BYTES).toBeGreaterThan(50 * 1024);
    expect(MAX_SIGNATURE_BYTES).toBeLessThanOrEqual(1024 * 1024);
  });
});

describe('the stamp put into a contract', () => {
  const signedAt = '2026-08-14T10:00:00.000Z';

  it('escapes a name that tries to close the markup', () => {
    const stamp = buildSignatureStamp({
      signatoryName: '</div><h1>VOID — no fee payable</h1>',
      signatoryRole: 'Proprietor',
      signatureDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      signedAt,
    });

    // A stranger with the link must not be able to rewrite what a signed
    // contract says. The sandboxed preview stops a script running; it does not
    // stop the page being made to read differently, and this HTML is emailed.
    expect(stamp).not.toContain('<h1>');
    expect(stamp).toContain('&lt;/div&gt;&lt;h1&gt;');
  });

  it('escapes a data url that tries to break out of the src attribute', () => {
    const stamp = buildSignatureStamp({
      signatoryName: 'A Head',
      signatoryRole: 'Proprietor',
      signatureDataUrl: 'x" onerror="alert(1)',
      signedAt,
    });

    expect(stamp).not.toContain('onerror="alert(1)"');
    expect(stamp).toContain('&quot;');
  });

  it('escapes the role as well as the name', () => {
    const stamp = buildSignatureStamp({
      signatoryName: 'A Head',
      signatoryRole: '<script>x</script>',
      signatureDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      signedAt,
    });
    expect(stamp).not.toContain('<script>');
  });
});

describe('escapeHtml', () => {
  it('covers every character that changes markup', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('escapes the ampersand first, so nothing is double-decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});

describe('where the stamp lands', () => {
  const curriculum = null;
  const school = { name: 'Bay-Flowers International School', city: 'Benin City', state: 'Edo' };

  const terms = {
    id: 't1',
    school_id: 's1',
    billing_model: 'per_student',
    amount_per_student: 15000,
    fixed_package_price: null,
    tiers: null,
    currency: 'NGN',
    billing_cycle: 'term',
    rillcod_share_percent: 70,
    school_share_percent: 30,
    deposit_amount: 0,
    status: 'agreed',
  } as unknown as PartnershipTerms;

  it('is present in a proposal', () => {
    // This is the bug the anchor replaced: the stamp used to replace the literal
    // "Official stamp", which only the MoU contains — so signing a proposal set
    // the status to signed and put nothing on the page.
    const html = buildPartnershipProposalHTML({
      school,
      curriculum,
      reference: 'RC-PROP-0042',
      dateLabel: '14 August 2026',
    });
    expect(hasSignatureSlot(html)).toBe(true);
  });

  it('is present in an MoU', () => {
    const html = buildPartnershipMouHTML({
      school,
      terms,
      curriculum,
      reference: 'RC-MOU-0007',
      dateLabel: '14 August 2026',
    });
    expect(hasSignatureSlot(html)).toBe(true);
  });

  it('replaces the anchor and leaves the rest of the document alone', () => {
    const html = `<div>before</div>${SIGNATURE_ANCHOR}<div>after</div>`;
    const out = stampSignature(html, '<b>SIGNED</b>');

    expect(out).toBe('<div>before</div><b>SIGNED</b><div>after</div>');
    expect(out).not.toContain(SIGNATURE_ANCHOR);
  });

  it('refuses rather than silently signing a document with nowhere to sign', () => {
    // Returning null is what lets the route answer 409 instead of recording a
    // signature that appears nowhere on the page.
    expect(stampSignature('<div>no slot here</div>', '<b>SIGNED</b>')).toBeNull();
  });
});

/**
 * The rule that keeps one school's proposal from unlocking every other.
 *
 * References are sequential — the counter guarantees it — and printed on the
 * face of every document. This has now been reverted twice, so it is a test
 * rather than a comment: hold RC-PROP-2026-00001 and you must not be able to
 * count to 00002 and read another school's agreed fees, or sign in their name.
 */
describe('what may address a document publicly', () => {
  it('accepts a share token', () => {
    expect(isValidDocumentIdentifier('7f3a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b')).toBe(true);
  });

  it('accepts a six-digit access code', () => {
    expect(isValidDocumentIdentifier('782587')).toBe(true);
    expect(isValidDocumentIdentifier('000001')).toBe(true);
  });

  it('refuses a document reference, in every shape it is written', () => {
    for (const reference of [
      'RC-PROP-2026-00001',
      'RC-MOU-2026-00042',
      'PROP-2026-0001',
      'MOU-2026-0002',
      'rc-prop-2026-00001',
    ]) {
      expect(isValidDocumentIdentifier(reference)).toBe(false);
    }
  });

  it('refuses anything that is neither', () => {
    for (const bad of ['', '   ', '12345', '1234567', 'null', 'undefined', '../../etc/passwd', 'abc']) {
      expect(isValidDocumentIdentifier(bad)).toBe(false);
    }
    expect(isValidDocumentIdentifier(null)).toBe(false);
    expect(isValidDocumentIdentifier(782587)).toBe(false);
  });

  it('refuses the characters that would break a PostgREST filter', () => {
    // These identifiers are interpolated into `.eq()`, and were once into
    // `.or()`. Nothing that could close a filter clause is a valid identifier.
    for (const bad of ["a'b", 'a,b', 'a%b', 'a/b', 'a.b', 'a)b']) {
      expect(isValidDocumentIdentifier(bad)).toBe(false);
    }
  });
});

describe('buildDocumentShareUrl', () => {
  const TOKEN = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

  it('builds the link from the share token', () => {
    expect(buildDocumentShareUrl('https://www.rillcod.com', TOKEN)).toBe(
      `https://www.rillcod.com/p/${TOKEN}`,
    );
  });

  it('does not double the slash when the origin carries one', () => {
    expect(buildDocumentShareUrl('https://www.rillcod.com/', TOKEN)).toBe(
      `https://www.rillcod.com/p/${TOKEN}`,
    );
  });

  /*
    The regression this function exists for.

    Three separate call sites — the follow-up email, both WhatsApp buttons, and
    all four clipboard pitches in the preview — independently arrived at
    `reference || share_token`. A reference is never null, so that expression
    always chose the reference: the sequential number printed on the face of the
    document. It is guessable by counting, and the public route stopped
    accepting it, so the links were dead as well.

    A reference must never come back from here, whatever it is passed as.
  */
  it('refuses a document reference outright', () => {
    for (const reference of [
      'RC-PROP-2026-00001',
      'RC-MOU-2026-00042',
      'MOU-2026-0002',
      'rc-prop-2026-00001',
    ]) {
      expect(buildDocumentShareUrl('https://www.rillcod.com', reference)).toBeNull();
    }
  });

  it('returns null rather than a link to nowhere when there is no token', () => {
    expect(buildDocumentShareUrl('https://www.rillcod.com', null)).toBeNull();
    expect(buildDocumentShareUrl('https://www.rillcod.com', undefined)).toBeNull();
    expect(buildDocumentShareUrl('https://www.rillcod.com', '')).toBeNull();
    expect(buildDocumentShareUrl('https://www.rillcod.com', '   ')).toBeNull();
  });

  it('refuses a six-digit access code, which is a way in but not a link', () => {
    // The code addresses a document at /p, but it is typed by a person who
    // already holds it — it is not something to paste into a school's inbox.
    expect(buildDocumentShareUrl('https://www.rillcod.com', '482915')).toBeNull();
  });

  it('never emits anything that could break out of the path', () => {
    for (const bad of ['../../admin', 'a/b', "a'b", 'a,b', 'a b']) {
      expect(buildDocumentShareUrl('https://www.rillcod.com', bad)).toBeNull();
    }
  });
});

/**
 * The executed document must not still be asking to be signed.
 *
 * The anchor marked a single point, so stamping inserted the signature and left
 * the placeholder above it: a signed MoU printed a blank ruled line reading
 * "Name & signature / Date" and an empty "Official stamp" square, and then the
 * school's actual signature underneath. On paper that reads as an unsigned
 * contract with something stuck to the bottom.
 */
describe('signing replaces the placeholder rather than writing around it', () => {
  const school = { name: 'Bay-Flowers International School', city: 'Benin City', state: 'Edo' };
  const terms = {
    id: 't1',
    school_id: 's1',
    billing_model: 'per_student',
    amount_per_student: 15000,
    fixed_package_price: null,
    tiers: null,
    currency: 'NGN',
    billing_cycle: 'term',
    rillcod_share_percent: 70,
    school_share_percent: 30,
    deposit_amount: 0,
    status: 'agreed',
  } as unknown as PartnershipTerms;

  const stamp = '<div class="e-signature-stamp">SIGNED</div>';

  it('takes the whole region between the markers', () => {
    const html = `<div>before</div>${SIGNATURE_SLOT_START}<div class="line">Name &amp; signature</div>${SIGNATURE_SLOT_END}<div>after</div>`;
    const out = stampSignature(html, stamp);

    expect(out).toBe(`<div>before</div>${stamp}<div>after</div>`);
    expect(out).not.toContain('Name &amp; signature');
    expect(out).not.toContain(SIGNATURE_SLOT_START);
    expect(out).not.toContain(SIGNATURE_SLOT_END);
  });

  it('leaves no blank signing line in a signed MoU', () => {
    const html = buildPartnershipMouHTML({
      school,
      terms,
      curriculum: null,
      reference: 'RC-MOU-0007',
      dateLabel: '14 August 2026',
    });
    const signed = stampSignature(html, stamp);

    expect(signed).not.toBeNull();
    // Party A keeps its own stamp caption; Party B's must be gone, along with
    // the blank line that invited a wet signature.
    expect(signed).toContain(stamp);
    expect(signed).not.toContain('Name &amp; signature');
  });

  it('leaves no "Name, signature and date" caption in a signed proposal', () => {
    const html = buildPartnershipProposalHTML({
      school,
      curriculum: null,
      reference: 'RC-PROP-0042',
      dateLabel: '14 August 2026',
    });
    const signed = stampSignature(html, stamp);

    expect(signed).not.toBeNull();
    expect(signed).toContain(stamp);
    expect(signed).not.toContain('Name, signature and date');
  });

  it('still signs a document issued before the paired markers existed', () => {
    // Rows already stored carry the old single anchor and must stay signable.
    const legacy = `<div>before</div>${SIGNATURE_ANCHOR}<div>after</div>`;
    expect(stampSignature(legacy, stamp)).toBe(`<div>before</div>${stamp}<div>after</div>`);
    expect(hasSignatureSlot(legacy)).toBe(true);
  });

  it('refuses a document with no slot at all', () => {
    expect(stampSignature('<div>nothing here</div>', stamp)).toBeNull();
    expect(hasSignatureSlot('<div>nothing here</div>')).toBe(false);
  });
});

/**
 * What a printed document tells a school to scan and to type.
 *
 * Both templates carried a second access panel that disagreed with the first.
 * It pulled its QR from api.qrserver.com — a network dependency at print time,
 * and the reference handed to a third party on the way past — and both that QR
 * and the caption under it used `input.reference`. So the page invited the
 * reader to open /p?code=RC-MOU-2026-00007 or type that string in, and the
 * public route refuses references: the instruction printed on the agreement
 * did not work.
 */
describe('the access panel printed on a document', () => {
  const school = { name: 'Bay-Flowers International School', city: 'Benin City', state: 'Edo' };
  const terms = {
    id: 't1',
    school_id: 's1',
    billing_model: 'per_student',
    amount_per_student: 15000,
    fixed_package_price: null,
    tiers: null,
    currency: 'NGN',
    billing_cycle: 'term',
    rillcod_share_percent: 70,
    school_share_percent: 30,
    deposit_amount: 0,
    status: 'agreed',
  } as unknown as PartnershipTerms;

  const CODE = '482915';
  const QR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=';

  const rendered = () => [
    [
      'mou',
      buildPartnershipMouHTML({
        school,
        terms,
        curriculum: null,
        reference: 'RC-MOU-2026-00007',
        dateLabel: '16 August 2026',
        accessCode: CODE,
        accessQrDataUrl: QR,
      }),
    ],
    [
      'proposal',
      buildPartnershipProposalHTML({
        school,
        curriculum: null,
        reference: 'RC-PROP-2026-00042',
        dateLabel: '16 August 2026',
        accessCode: CODE,
        accessQrDataUrl: QR,
      }),
    ],
  ] as const;

  it('never fetches its QR from a third party', () => {
    // A QR that needs the internet is a QR that is blank on a printed page, and
    // the request tells someone else which document was opened and when.
    for (const [name, html] of rendered()) {
      expect(html, name).not.toContain('api.qrserver.com');
      expect(html, name).not.toContain('chart.googleapis.com');
    }
  });

  it('prints the six-digit code, not the reference, as the way in', () => {
    for (const [name, html] of rendered()) {
      expect(html, name).toContain(CODE);
      // No caption may offer a reference as something to type.
      expect(html.replace(/\s+/g, ' '), name).not.toMatch(
        /(Quick Access Code|Access code|Document Code)\s*:?\s*<[^>]*>\s*RC-/i,
      );
    }
  });

  it('encodes the share-token QR it was handed, and only that', () => {
    for (const [name, html] of rendered()) {
      expect(html, name).toContain(QR);
      expect(html, name).not.toContain('/p?code=');
    }
  });

  it('prints no access panel at all when there is no code to print', () => {
    // A preview has no row, so no code and no token. Better a document with no
    // invitation than one inviting the reader to type something that fails.
    const html = buildPartnershipMouHTML({
      school,
      terms,
      curriculum: null,
      reference: 'RC-MOU-2026-00007',
      dateLabel: '16 August 2026',
    });
    expect(html).not.toContain('Access code:');
    expect(html).not.toContain('api.qrserver.com');
  });
});

/**
 * The way in is printed where a reader is, not once and out of the way.
 *
 * A proprietor meets these documents twice: at the front, deciding whether to
 * read on, and at the back, deciding whether to sign. The scan card appears at
 * both, doing a different job each time — "open this on your phone" on the
 * front, "sign it from your phone" at the execution block.
 *
 * It also has to be legible, which is not as obvious as it sounds: the cover
 * card set its text to white and its bold to pure white on the white middle of
 * the cover, so the heading and the six-digit code were invisible on a printed
 * page. The tests below pin what must be there; the A4 page-fit guard covers
 * whether it still fits once it is.
 */
describe('the scan card, front and back', () => {
  const school = { name: 'Bay-Flowers International School', city: 'Benin City', state: 'Edo' };
  const terms = {
    id: 't1',
    school_id: 's1',
    billing_model: 'per_student',
    amount_per_student: 15000,
    fixed_package_price: null,
    tiers: null,
    currency: 'NGN',
    billing_cycle: 'term',
    rillcod_share_percent: 70,
    school_share_percent: 30,
    deposit_amount: 0,
    status: 'agreed',
  } as unknown as PartnershipTerms;

  const CODE = '482915';
  const QR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=';

  const mou = () =>
    buildPartnershipMouHTML({
      school,
      terms,
      curriculum: null,
      reference: 'RC-MOU-2026-00007',
      dateLabel: '16 August 2026',
      accessCode: CODE,
      accessQrDataUrl: QR,
    });

  const proposal = () =>
    buildPartnershipProposalHTML({
      school,
      curriculum: null,
      reference: 'RC-PROP-2026-00042',
      dateLabel: '16 August 2026',
      accessCode: CODE,
      accessQrDataUrl: QR,
    });

  const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

  it('says "scan" in words, so the QR is not left to explain itself', () => {
    expect(mou().toLowerCase()).toContain('scan');
    expect(proposal().toLowerCase()).toContain('scan');
  });

  it('carries the QR and the code in more than one place in each document', () => {
    for (const [name, html] of [['mou', mou()], ['proposal', proposal()]] as const) {
      expect(occurrences(html, QR), `${name}: QR placements`).toBeGreaterThanOrEqual(2);
      expect(occurrences(html, CODE), `${name}: code placements`).toBeGreaterThanOrEqual(2);
    }
  });

  it('tells the reader what to do without a camera', () => {
    // The code is only useful with somewhere to type it. A bare six digits on a
    // page is a puzzle, not an instruction.
    for (const html of [mou(), proposal()]) {
      expect(html).toMatch(/No camera\?/);
      expect(html).toContain(`${brandContact.web}/p`);
    }
  });

  it('asks the MoU reader to sign, not merely to read', () => {
    // The execution block is where the decision is made; "read this online"
    // there wastes the one prompt that matters.
    expect(mou().toLowerCase()).toContain('scan to sign');
  });

  it('never prints the card with no code behind it', () => {
    // A preview has no row, so no code and no token: better a document with no
    // invitation than one inviting the reader to type nothing.
    const noCode = buildPartnershipMouHTML({
      school,
      terms,
      curriculum: null,
      reference: 'RC-MOU-2026-00007',
      dateLabel: '16 August 2026',
    });
    // Asserted on the markup, not the prose: the stylesheet's own section
    // comment says "Scan me" too, and a substring search cannot tell a comment
    // in a <style> block from a heading on the page.
    expect(noCode).not.toContain('class="online-lead"');
    expect(noCode).not.toContain('class="sign-scan-lead"');
    expect(noCode).not.toContain(QR);
  });
});

/**
 * A preview is a preview of the document that gets issued.
 *
 * The scan card only rendered when there was a code, and a preview has no row
 * and therefore no code — so it was omitted entirely. That made the preview a
 * different document: somebody read a proposal, approved it, issued it, and the
 * real thing carried a panel roughly 30mm tall that the preview never showed.
 * On a cover with 51px of clearance that is the difference between a page that
 * fits and one that does not.
 *
 * `accessPending` draws the card at full size and says the code is assigned on
 * issue: the geometry matches, and nothing false is printed.
 */
describe('the preview shows the card it will print', () => {
  const school = { name: 'Bay-Flowers International School', city: 'Benin City', state: 'Edo' };
  const terms = {
    id: 't1',
    school_id: 's1',
    billing_model: 'per_student',
    amount_per_student: 15000,
    fixed_package_price: null,
    tiers: null,
    currency: 'NGN',
    billing_cycle: 'term',
    rillcod_share_percent: 70,
    school_share_percent: 30,
    deposit_amount: 0,
    status: 'agreed',
  } as unknown as PartnershipTerms;

  const pendingProposal = () =>
    buildPartnershipProposalHTML({
      school,
      curriculum: null,
      reference: 'Proposal — not yet issued',
      dateLabel: '16 August 2026',
      accessPending: true,
    });

  const pendingMou = () =>
    buildPartnershipMouHTML({
      school,
      terms,
      curriculum: null,
      reference: 'MoU — not yet issued',
      dateLabel: '16 August 2026',
      accessPending: true,
    });

  it('draws the card on a preview', () => {
    expect(pendingProposal()).toContain('class="scan-lead"');
    expect(pendingMou()).toContain('class="online-lead"');
  });

  it('leaves the QR plate empty rather than inventing a code to scan', () => {
    expect(pendingProposal()).toContain('scan-qr-pending');
    expect(pendingMou()).toContain('online-qr-pending');
    // No <img> QR, because there is no link to encode yet.
    expect(pendingProposal()).not.toContain('data:image/png;base64');
  });

  it('says where the code comes from instead of printing digits', () => {
    for (const html of [pendingProposal(), pendingMou()]) {
      expect(html).toContain('assigned when this is issued');
      // Nothing that could be mistaken for a real six-digit code.
      expect(html).not.toMatch(/and type\s*<span class="(scan|sign-scan|online)-code">/);
    }
  });

  it('still prints nothing at all when neither a code nor a pending flag is given', () => {
    // The issue path passes a code; the preview path passes the flag. A caller
    // that passes neither is not previewing — it gets no card.
    const bare = buildPartnershipProposalHTML({
      school,
      curriculum: null,
      reference: 'RC-PROP-2026-00042',
      dateLabel: '16 August 2026',
    });
    expect(bare).not.toContain('class="scan-lead"');
  });
});
