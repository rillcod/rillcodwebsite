import { describe, expect, it } from 'vitest';
import { deriveFamilyLifecycle } from './lifecycle-state';

describe('family onboarding lifecycle', () => {
  it('keeps learning access available when an invoice needs attention', () => {
    const state = deriveFamilyLifecycle({ childId: 'student-1', unpaidInvoiceCount: 2 });

    expect(state.finance).toBe('action_available');
    expect(state.access).toBe('available');
    expect(state.nextAction.kind).toBe('review_finance');
  });

  it('offers the current school form before finance without making it an access lock', () => {
    const state = deriveFamilyLifecycle({
      childId: 'student-1',
      consentRequired: true,
      consentComplete: false,
      consentFormUrl: '/consent/CF-1234-5678',
      consentFormTitle: 'Registration form',
      unpaidInvoiceCount: 1,
    });

    expect(state.consent).toBe('action_available');
    expect(state.access).toBe('available');
    expect(state.nextAction).toMatchObject({
      kind: 'complete_form',
      href: '/consent/CF-1234-5678',
      owner: 'parent',
    });
  });

  it('surfaces a failed status check without silently blocking the family', () => {
    const state = deriveFamilyLifecycle({ childId: 'student-1', consentStatusAvailable: false });

    expect(state.consent).toBe('status_unavailable');
    expect(state.access).toBe('available');
    expect(state.nextAction.kind).toBe('retry');
  });

  it('returns a calm overview action when the lifecycle is clear', () => {
    const state = deriveFamilyLifecycle({
      childId: 'student-1',
      enrollmentActive: true,
      consentRequired: false,
      unpaidInvoiceCount: 0,
    });

    expect(state.nextAction.kind).toBe('view_overview');
  });
});
