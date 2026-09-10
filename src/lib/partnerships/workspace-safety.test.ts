import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');

describe('partnership workspace integration guards', () => {
  it('keeps school address fields directly accessible in both document editors', () => {
    const composer = source('src/components/partnerships/PartnershipDocumentComposer.tsx');
    expect(composer).not.toContain('showSchoolDetailsEditor');
    expect(composer).toContain('School address and contact');
    expect(composer).toContain('htmlFor="school-address">School address');
    expect(composer).toContain('autoComplete="street-address"');
    expect(composer).toContain('address: schoolAddress.trim() || null');
    expect(composer).toContain('school_details: p.school_details');
    expect(composer.indexOf('id="school-address"')).toBeLessThan(composer.indexOf('id="proposal-roll"'));
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
