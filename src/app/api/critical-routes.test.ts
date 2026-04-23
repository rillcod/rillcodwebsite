import { describe, expect, it } from 'vitest';
import { hasPlanBindings, isConversationInScope, missingCustomerTags, normalizeGradeValue } from '@/lib/api-guards';

describe('inbox/email tag guard', () => {
  it('returns missing school/class tags', () => {
    expect(missingCustomerTags({ school_name: '', section_class: null })).toEqual(['school_name', 'section_class']);
    expect(missingCustomerTags({ school_name: 'Rillcod', section_class: 'JSS1' })).toEqual([]);
  });

  it('treats whitespace-only values as missing', () => {
    expect(missingCustomerTags({ school_name: '   ', section_class: '\n' })).toEqual(['school_name', 'section_class']);
  });
});

describe('assignments grade normalization', () => {
  it('normalizes grade values safely', () => {
    expect(normalizeGradeValue(88)).toBe(88);
    expect(normalizeGradeValue(null)).toBeNull();
    expect(normalizeGradeValue('88')).toBeUndefined();
  });

  it('rejects NaN and Infinity branches', () => {
    expect(normalizeGradeValue(Number.NaN)).toBeUndefined();
    expect(normalizeGradeValue(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});

describe('lesson plan bindings guard', () => {
  it('requires both course and school ids', () => {
    expect(hasPlanBindings({ course_id: 'c1', school_id: 's1' })).toBe(true);
    expect(hasPlanBindings({ course_id: 'c1', school_id: null })).toBe(false);
    expect(hasPlanBindings({ course_id: null, school_id: 's1' })).toBe(false);
  });
});

describe('conversation scope guard', () => {
  it('blocks out-of-scope school users', () => {
    expect(isConversationInScope({ role: 'admin', school_id: null }, { school_id: 'A' })).toBe(true);
    expect(isConversationInScope({ role: 'teacher', school_id: 'A' }, { school_id: 'B' })).toBe(false);
    expect(isConversationInScope({ role: 'teacher', school_id: 'A' }, { school_id: 'A' })).toBe(true);
  });

  it('allows legacy null-school conversations for non-admin staff', () => {
    expect(isConversationInScope({ role: 'school', school_id: 'A' }, { school_id: null })).toBe(true);
  });
});
