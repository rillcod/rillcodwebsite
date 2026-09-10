import { describe, expect, it } from 'vitest';
import { canPreparePartnershipDocument } from './permissions';

describe('partnership document permissions', () => {
  it('lets teachers create and send proposals, not contracts', () => {
    expect(canPreparePartnershipDocument('teacher', 'proposal')).toBe(true);
    expect(canPreparePartnershipDocument('teacher', 'mou')).toBe(false);
  });
  it('keeps both document kinds available to administrators', () => {
    expect(canPreparePartnershipDocument('admin', 'proposal')).toBe(true);
    expect(canPreparePartnershipDocument('admin', 'mou')).toBe(true);
  });
  it.each(['student', 'parent', 'school', undefined])('denies authoring to %s', (role) => {
    expect(canPreparePartnershipDocument(role, 'proposal')).toBe(false);
    expect(canPreparePartnershipDocument(role, 'mou')).toBe(false);
  });
  it('does not authorize unknown document kinds', () => {
    expect(canPreparePartnershipDocument('admin', 'contract')).toBe(false);
  });
});
