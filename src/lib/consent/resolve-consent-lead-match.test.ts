import { describe, expect, it } from 'vitest';
import {
  isAutoResolvableConsentMatch,
  submittedChildNameForIndex,
} from './resolve-consent-lead-match';

describe('submittedChildNameForIndex', () => {
  it('reads primary child_name for index 0', () => {
    expect(
      submittedChildNameForIndex({ child_name: '  Chidi Okoro  ' }, 0),
    ).toBe('Chidi Okoro');
  });

  it('reads multi-child array names for sibling slots', () => {
    expect(
      submittedChildNameForIndex(
        { children: [{ name: 'Amina' }, { name: 'Bello Hassan' }] },
        1,
      ),
    ).toBe('Bello Hassan');
  });

  it('returns empty string when no name is present', () => {
    expect(submittedChildNameForIndex({ children: [{ name: 'Amina' }] }, 1)).toBe('');
  });
});

describe('isAutoResolvableConsentMatch', () => {
  it('auto-resolves when parent matches and names are fuzzy-equal', () => {
    expect(
      isAutoResolvableConsentMatch({
        submittedName: 'Chidi Okoro',
        candidateName: 'Chidi Okoro',
        parentMatch: true,
        confidence: 'medium',
        parentPortalVerified: false,
      }),
    ).toBe(true);
  });

  it('auto-resolves typo when parent portal is verified and confidence is high', () => {
    expect(
      isAutoResolvableConsentMatch({
        submittedName: 'Chidi Okro',
        candidateName: 'Chidi Okoro',
        parentMatch: false,
        confidence: 'high',
        parentPortalVerified: true,
      }),
    ).toBe(true);
  });

  it('does not auto-resolve when names clearly differ', () => {
    expect(
      isAutoResolvableConsentMatch({
        submittedName: 'Adaobi Nwankwo',
        candidateName: 'Emeka Okafor',
        parentMatch: true,
        confidence: 'high',
        parentPortalVerified: true,
      }),
    ).toBe(false);
  });

  it('does not auto-resolve high confidence without verified parent when parent does not match', () => {
    expect(
      isAutoResolvableConsentMatch({
        submittedName: 'Chidi Okoro',
        candidateName: 'Chidi Okoro',
        parentMatch: false,
        confidence: 'high',
        parentPortalVerified: false,
      }),
    ).toBe(false);
  });
});
