import { describe, expect, it } from 'vitest';
import { normalizeCustomerPhone, normalizeEmail } from './identity';
import { classifyCommunicationSensitivity, requiresRestrictedHumanHandling } from './sensitivity';

describe('cross-channel customer identity', () => {
  it('normalizes email and Nigerian phone aliases', () => {
    expect(normalizeEmail(' Ada@Example.COM ')).toBe('ada@example.com');
    expect(normalizeCustomerPhone('0803 123 4567')).toBe('+2348031234567');
  });
});

describe('restricted communication classification', () => {
  it('routes child safety, privacy, fraud, and complaints to humans', () => {
    for (const text of ['My child is unsafe', 'There was a data breach', 'This charge is fraud', 'I have a complaint']) {
      expect(requiresRestrictedHumanHandling(classifyCommunicationSensitivity('', text))).toBe(true);
    }
    expect(classifyCommunicationSensitivity('', 'What time is class?')).toBe('standard');
  });
});
