import { describe, expect, it } from 'vitest';
import { formatAuditWho, getAuditViewerRole, humanizeAuditAction } from './humanize';

/**
 * Result-check viewer attribution.
 *
 * The bug these encode: the viewer label was derived from `parentCaptured`, which is a
 * property of the CHILD (a parent link exists), not of the requester. Once any parent
 * claimed a child, every later RC-number holder opened the report and was recorded as
 * "Linked parent" — anonymous views filed under a real parent's identity, on a
 * safeguarding surface.
 */
function row(viewer: string, viewerRole: string | null, action = 'result_check_verified') {
  return {
    action,
    user_id: null,
    new_values: {
      viewer,
      viewer_role: viewerRole,
      access_method: 'typed',
      access_method_label: 'typed RC number',
    },
  };
}

describe('result-check viewer attribution', () => {
  it('an anonymous code holder is never titled as a parent', () => {
    const who = formatAuditWho(row('Code holder · child is claimed', 'visitor'));
    expect(who.title).toBe('Code holder · child is claimed');
    expect(who.title).not.toMatch(/linked parent/i);
  });

  it('a code holder counts as a visitor, not a parent, for role filters', () => {
    expect(getAuditViewerRole(row('Code holder · child is claimed', 'visitor'))).toBe('visitor');
  });

  it('a signed-in linked parent is still titled as a parent', () => {
    const who = formatAuditWho(row('Linked parent (signed in)', 'parent'));
    expect(who.title).toBe('Linked parent (signed in)');
    expect(getAuditViewerRole(row('Linked parent (signed in)', 'parent'))).toBe('parent');
  });

  it('an auto-matched signed-in parent is a parent', () => {
    expect(getAuditViewerRole(row('Linked parent (signed in, auto-matched)', 'parent'))).toBe('parent');
  });

  it('a plain visitor stays a visitor', () => {
    expect(getAuditViewerRole(row('Visitor', 'visitor'))).toBe('visitor');
    expect(formatAuditWho(row('Visitor', 'visitor')).title).toBe('Visitor');
  });

  // Rows written before the fix cannot be trusted as evidence a parent was present.
  it('legacy "Linked parent" rows are marked unverified rather than silently trusted', () => {
    const who = formatAuditWho({
      action: 'result_check_verified',
      user_id: null,
      new_values: { viewer: 'Linked parent', viewer_role: 'parent' },
    });
    expect(who.subtitle).toMatch(/unverified/i);
  });

  it('a signed-in label is not downgraded to unverified', () => {
    const who = formatAuditWho({
      action: 'result_check_verified',
      user_id: null,
      new_values: { viewer: 'Linked parent (signed in)', viewer_role: 'parent' },
    });
    expect(who.subtitle).not.toMatch(/unverified/i);
  });

  it('a public scan never inherits Admin from a joined staff row', () => {
    expect(getAuditViewerRole({
      action: 'result_check_verified',
      user_id: null,
      new_values: { viewer: 'Code holder · child is claimed', viewer_role: 'visitor' },
      portal_users: { role: 'admin' },
    })).toBe('visitor');
  });

  it('staff bypass views are still attributed to the staff member', () => {
    const who = formatAuditWho(row('Admin · Mrs Grace Ogbebor', 'admin'));
    expect(who.title).toBe('Admin · Mrs Grace Ogbebor');
    expect(getAuditViewerRole(row('Admin · Mrs Grace Ogbebor', 'admin'))).toBe('admin');
  });
});

describe('parent claim activity labels', () => {
  it('uses professional labels instead of internal action keys', () => {
    expect(humanizeAuditAction('parent_claim_completion_failed')).toBe('Parent setup needs attention');
    expect(humanizeAuditAction('parent_claim_otp_verified')).toBe('Parent identity verified');
    expect(humanizeAuditAction('parent_claim_code_delivery_failed')).toBe('Verification code delivery needs attention');
  });
});
