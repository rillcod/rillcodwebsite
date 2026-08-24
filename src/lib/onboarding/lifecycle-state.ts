export type FamilyLifecycleActionKind =
  | 'complete_form'
  | 'review_finance'
  | 'contact_school'
  | 'view_overview'
  | 'retry';

export type FamilyLifecycleAction = {
  kind: FamilyLifecycleActionKind;
  label: string;
  description: string;
  href: string;
  owner: 'parent' | 'school' | 'system';
};

export type FamilyLifecycleState = {
  identity: 'matched';
  claim: 'complete';
  consent: 'not_required' | 'complete' | 'action_available' | 'status_unavailable';
  finance: 'clear' | 'action_available';
  access: 'available';
  nextAction: FamilyLifecycleAction;
};

type FamilyLifecycleInput = {
  childId: string;
  enrollmentActive?: boolean;
  consentRequired?: boolean;
  consentComplete?: boolean;
  consentStatusAvailable?: boolean;
  consentFormUrl?: string | null;
  consentFormTitle?: string | null;
  unpaidInvoiceCount?: number;
};

/**
 * One customer-facing lifecycle for parent onboarding and retention.
 * Finance and optional intake forms produce useful actions, never hidden locks.
 */
export function deriveFamilyLifecycle(input: FamilyLifecycleInput): FamilyLifecycleState {
  const consentAvailable = input.consentStatusAvailable !== false;
  const consent = !consentAvailable
    ? 'status_unavailable'
    : !input.consentRequired
      ? 'not_required'
      : input.consentComplete
        ? 'complete'
        : 'action_available';
  const finance = (input.unpaidInvoiceCount ?? 0) > 0 ? 'action_available' : 'clear';

  let nextAction: FamilyLifecycleAction;
  // Current placement is the first operational dependency. Optional forms and
  // finance must never distract from a learner who needs the school to restore
  // an active class/enrolment context.
  if (input.enrollmentActive === false) {
    nextAction = {
      kind: 'contact_school',
      label: 'Confirm current enrolment',
      description: 'The learner remains linked, but the school should confirm the current class placement.',
      href: '/dashboard/support',
      owner: 'school',
    };
  } else if (!consentAvailable) {
    nextAction = {
      kind: 'retry',
      label: 'Refresh form status',
      description: 'We could not confirm the latest school forms. Your portal access remains available.',
      href: '/dashboard/my-children',
      owner: 'system',
    };
  } else if (consent === 'action_available' && input.consentFormUrl) {
    nextAction = {
      kind: 'complete_form',
      label: `Open ${input.consentFormTitle || 'school form'}`,
      description: 'Complete this optional school form when convenient. It does not lock reports or portal access.',
      href: input.consentFormUrl,
      owner: 'parent',
    };
  } else if (consent === 'action_available') {
    nextAction = {
      kind: 'retry',
      label: 'Refresh school forms',
      description: 'A school form is available, but its safe link could not be prepared. Your reports and portal remain available.',
      href: '/dashboard/my-children',
      owner: 'system',
    };
  } else if (finance === 'action_available') {
    nextAction = {
      kind: 'review_finance',
      label: 'Review outstanding invoices',
      description: 'Payment follow-up is separate from learning records and does not hide available reports.',
      href: `/dashboard/parent-invoices?student=${encodeURIComponent(input.childId)}`,
      owner: 'parent',
    };
  } else {
    nextAction = {
      kind: 'view_overview',
      label: 'View learner overview',
      description: 'Identity, family link, enrolment and account status are in order.',
      href: `/dashboard/parent-results?student=${encodeURIComponent(input.childId)}`,
      owner: 'parent',
    };
  }

  return {
    identity: 'matched',
    claim: 'complete',
    consent,
    finance,
    // This is deliberately independent of finance and optional-form state.
    access: 'available',
    nextAction,
  };
}
