import { describe, expect, it } from 'vitest';
import {
  consentProgramLongLabel,
  consentProgramShortLabel,
} from '@/lib/consent/lead-notifications';
import { buildLeadEnrolledParentEmail } from '@/lib/email/rillcod-transactional-email';

describe('consent lead notifications', () => {
  it('maps programme categories consistently', () => {
    expect(consentProgramShortLabel('young_innovators')).toBe('Young Innovators');
    expect(consentProgramLongLabel('teen_developers')).toBe('Teen Developers (SEC)');
    expect(consentProgramShortLabel(null)).toBe('coding');
  });

  it('builds enrolled parent email html', () => {
    const html = buildLeadEnrolledParentEmail({
      parentName: 'Ada Okoro',
      childName: 'Chidi',
      programLabel: 'Young Innovators (PRY)',
    });
    expect(html).toContain('Ada Okoro');
    expect(html).toContain('Chidi');
    expect(html).toContain('Young Innovators (PRY)');
    expect(html).toContain('portal login');
  });
});
