import { describe, expect, it } from 'vitest';
import { validateDeliverableAuthEmail } from './email-deliverability';

describe('validateDeliverableAuthEmail (Supabase bounce guard)', () => {
  it('blocks synthetic student portal logins so Supabase Auth never bounces', () => {
    expect(validateDeliverableAuthEmail('samuel123@rillcod.com', 'reset').ok).toBe(false);
    expect(validateDeliverableAuthEmail('ada@students.rillcod.com', 'reset').ok).toBe(false);
    expect(validateDeliverableAuthEmail('student.john@rillcod.com', 'signup').ok).toBe(false);
    expect(validateDeliverableAuthEmail('rc-1234@rillcod.com', 'reset').ok).toBe(false);
  });

  it('allows real staff @rillcod.com mailboxes and real parent/teacher emails', () => {
    expect(validateDeliverableAuthEmail('admin@rillcod.com', 'reset')).toEqual({
      ok: true,
      normalized: 'admin@rillcod.com',
    });
    expect(validateDeliverableAuthEmail('Parent.Name@gmail.com', 'signup')).toEqual({
      ok: true,
      normalized: 'parent.name@gmail.com',
    });
  });

  it('catches common domain typos and test/disposable domains before sending', () => {
    const typo = validateDeliverableAuthEmail('ada@gamil.com', 'signup');
    expect(typo.ok).toBe(false);
    if (!typo.ok) expect(typo.message).toContain('ada@gmail.com');

    expect(validateDeliverableAuthEmail('tester@example.com', 'signup').ok).toBe(false);
    expect(validateDeliverableAuthEmail('fake@mailinator.com', 'reset').ok).toBe(false);
  });
});
