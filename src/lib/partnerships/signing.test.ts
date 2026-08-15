import { describe, expect, it } from 'vitest';
import {
  MAX_SIGNATURE_BYTES,
  SIGNATURE_ANCHOR,
  SIGNATURE_DATA_URL_PATTERN,
  buildSignatureStamp,
  escapeHtml,
  isValidDocumentIdentifier,
  isValidShareToken,
  stampSignature,
} from './signing';
import { buildPartnershipProposalHTML } from './templates/proposal-html';
import { buildPartnershipMouHTML } from './templates/mou-html';
import type { PartnershipTerms } from './terms';

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
    expect(html).toContain(SIGNATURE_ANCHOR);
  });

  it('is present in an MoU', () => {
    const html = buildPartnershipMouHTML({
      school,
      terms,
      curriculum,
      reference: 'RC-MOU-0007',
      dateLabel: '14 August 2026',
    });
    expect(html).toContain(SIGNATURE_ANCHOR);
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
