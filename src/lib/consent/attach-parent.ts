import type { SupabaseClient } from '@supabase/supabase-js';
import { findOrCreateParentPortal } from '@/lib/parents/provision';
import { linkAndHarmonizeConsentLeadChildren } from '@/lib/consent/sync-lead-linked-identity';
import { linkParentSiblings, type SiblingLinkResult } from '@/lib/parents/sibling-links';

type AnySupabase = SupabaseClient<any>;

export type AttachConsentParentInput = {
  leadId: string;
  parentEmail: string;
  parentName: string;
  parentPhone?: string | null;
  parentSchoolId: string;
  parentSchoolName?: string | null;
  matchedStudentId?: string | null;
  childMatches: Array<{ childIndex: number; studentId: string }>;
  formClassId?: string | null;
  archiveCredentials?: boolean;
  /** Staff member performing the action — stamped on the sibling link audit rows. */
  actorId?: string | null;
  /**
   * Skip sibling reconciliation. Default is to run it: a consent lead names one
   * child, but the parent usually has more on the same roster, and leaving them
   * unlinked is what forced staff to link each one by hand.
   */
  skipSiblingReconciliation?: boolean;
};

/**
 * Shared write path for consent create-portal + bulk-portals:
 * provision parent → link/harmonize matched children → stamp matched_parent_id.
 */
export async function attachConsentParentToLead(
  admin: AnySupabase,
  input: AttachConsentParentInput,
): Promise<{
  ok: boolean;
  error?: string;
  status?: number;
  parentId?: string;
  created?: boolean;
  password?: string | null;
  /** Family members linked (or surfaced) alongside the lead's own child. */
  siblings?: SiblingLinkResult;
}> {
  const provisioned = await findOrCreateParentPortal(admin, {
    email: input.parentEmail,
    fullName: input.parentName,
    phone: input.parentPhone ?? null,
    schoolId: input.parentSchoolId,
    schoolName: input.parentSchoolName ?? null,
    passwordPolicy: 'set',
    preserveExistingProfile: true,
    archiveCredentials: input.archiveCredentials === true,
    batchLabel: 'Consent Form Parent',
  });
  if (!provisioned.ok || !provisioned.parentId) {
    return {
      ok: false,
      status: provisioned.status || 500,
      error: provisioned.error || 'Failed to create or resolve parent account',
    };
  }

  await linkAndHarmonizeConsentLeadChildren(admin, {
    leadId: input.leadId,
    parentId: provisioned.parentId,
    parentEmail: input.parentEmail,
    parentName: input.parentName,
    parentPhone: input.parentPhone ?? null,
    matchedStudentId: input.matchedStudentId ?? null,
    childMatches: input.childMatches,
    formClassId: input.formClassId ?? null,
  });

  await admin.from('form_leads').update({
    matched_parent_id: provisioned.parentId,
  }).eq('id', input.leadId);

  // The lead only ever names the child(ren) on the form. Pull in the rest of the
  // family from the roster so a consent-onboarded parent ends up owning the same
  // set a self-service claim would have given them. Never fatal — the portal
  // account is the deliverable here.
  let siblings: SiblingLinkResult | undefined;
  if (!input.skipSiblingReconciliation) {
    try {
      siblings = await linkParentSiblings(admin, {
        parentId: provisioned.parentId,
        schoolId: input.parentSchoolId,
        actorId: input.actorId ?? null,
        source: 'consent.attachParent.siblings',
      });
    } catch (err) {
      console.error('[attachConsentParentToLead] sibling reconciliation failed (non-fatal):', err);
    }
  }

  return {
    ok: true,
    parentId: provisioned.parentId,
    created: !!provisioned.created,
    password: provisioned.password ?? null,
    siblings,
  };
}
