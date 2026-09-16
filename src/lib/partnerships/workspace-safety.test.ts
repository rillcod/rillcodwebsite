import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');

describe('partnership workspace integration guards', () => {
  it('exposes actionable gaps and makes optional wording discoverable', () => {
    const composer = source('src/components/partnerships/PartnershipDocumentComposer.tsx');
    expect(composer).toContain('<section aria-label="Proposal details to check"');
    expect(composer).toContain('Check before sending');
    expect(composer).toContain('Edit proposal wording');
    expect(composer).toContain('aria-controls="proposal-wording-editor"');
  });
  it('offers accessible zoom and horizontal document scrolling on phones', () => {
    const preview = source('src/components/partnerships/IssuedDocumentPreview.tsx');
    expect(preview).toContain('aria-label="Document zoom" className="flex');
    expect(preview).toContain('aria-pressed={zoom === z}');
    expect(preview).toContain('className="overflow-x-auto bg-slate-100');
    expect(preview).toContain('aria-label="Recipient email address"');
    expect(preview).not.toContain('navigator.clipboard.writeText(body).catch(() => null)');
  });
  it('keeps school address fields directly accessible in both document editors', () => {
    const composer = source('src/components/partnerships/PartnershipDocumentComposer.tsx');
    expect(composer).not.toContain('showSchoolDetailsEditor');
    expect(composer).toContain('School address and contact');
    expect(composer).toContain('htmlFor="school-address">School address');
    expect(composer).toContain('autoComplete="street-address"');
    expect(composer).toContain('address: schoolAddress.trim() || null');
    expect(composer).toContain('school_details: p.school_details');
    expect(composer.indexOf('id="school-address"')).toBeLessThan(composer.indexOf('id="proposal-roll"'));
    expect(composer.indexOf('id="school-address"')).toBeLessThan(composer.indexOf('Which years does this school run?'));
  });
  it('rejects stale school loads and makes incomplete loads recoverable', () => {
    const page = source('src/app/dashboard/partnerships/page.tsx');
    expect(page).toContain('if (request !== detailRequest.current) return;');
    expect(page).toContain('activeSchoolId.current !== schoolId');
    expect(page).toContain('!Array.isArray(termsJson.terms)');
    expect(page).toContain('!Array.isArray(docsJson.documents)');
    expect(page).toContain('Retry school details');
    expect(page).toContain('if (!selected || detailError || loadingSchool) return null;');
    expect(page).toContain('key={selected.id}');
  });
  it('enforces the same proposal permission in creation and sending', () => {
    expect(source('src/app/api/partnerships/documents/route.ts'))
      .toContain('canPreparePartnershipDocument(actor.role, kind)');
    expect(source('src/app/api/partnerships/documents/send/route.ts'))
      .toContain('canPreparePartnershipDocument(profile.role, doc.document_kind)');
    expect(source('src/app/api/partnerships/outreach/route.ts'))
      .toContain("documentQuery.eq('document_kind', 'proposal')");
  });
});
