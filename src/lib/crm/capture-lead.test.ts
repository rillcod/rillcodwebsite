import { describe, expect, it } from 'vitest';
import { canCaptureLead } from '@/lib/crm/capture-lead';

describe('canCaptureLead', () => {
  it('requires name plus email or phone', () => {
    expect(canCaptureLead({ fullName: 'Jane Okonkwo', email: 'jane@example.com', phone: null })).toBe(true);
    expect(canCaptureLead({ fullName: 'Jane Okonkwo', email: null, phone: '08031234567' })).toBe(true);
    expect(canCaptureLead({ fullName: 'Jane Okonkwo', email: null, phone: null })).toBe(false);
    expect(canCaptureLead({ fullName: 'J', email: 'jane@example.com', phone: null })).toBe(false);
  });

  it('rejects invalid email without phone', () => {
    expect(canCaptureLead({ fullName: 'Jane Okonkwo', email: 'not-an-email', phone: null })).toBe(false);
  });

  it('accepts phone with fewer than 13 digits when at least 10 digits', () => {
    expect(canCaptureLead({ fullName: 'Jane Okonkwo', email: null, phone: '8031234567' })).toBe(true);
  });
});
