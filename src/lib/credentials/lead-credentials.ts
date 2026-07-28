import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverPortalCredentials } from '@/lib/credentials/deliver-portal-credentials';
import { collectLeadStudentPortalIds } from '@/lib/consent/lead-child-links';
import { getExistingParentLink, resolveStudentRowId } from '@/lib/parents/links';

type AnySupabase = SupabaseClient<any>;

/**
 * One entry point for every credential delivery driven by a consent lead.
 *
 * Why this exists: five call sites across two routes each answered "which children
 * belong to this lead, and what happens to their passwords" by hand, and they did not
 * agree. The resend path in particular collected children with NO link-status filter,
 * so a `candidate` — a machine guess written by the public consent form and never
 * approved by staff — could have its password reset and its working login emailed to a
 * parent who may not be theirs. Delivery was already unified in
 * `deliverPortalCredentials`; the *decision* was not. This is that decision, once.
 *
 * Call sites declare INTENT. They no longer choose audience or reset policy.
 */

export type LeadCredentialIntent =
  /** A parent portal was just created from the lead; passwords are already known. */
  | 'portal_created'
  /** New student logins were added to an existing parent account. */
  | 'students_added'
  /** Staff re-sending logins for an existing account. Audience comes from the lead. */
  | 'resend';

export type LeadStudentCredential = {
  studentPortalId: string;
  email: string;
  name: string;
  password: string;
};

export type DeliverLeadCredentialsResult = {
  email: boolean;
  whatsapp: boolean;
  channels: string[];
  parent: { email: string; password: string | null };
  students: Array<{ name: string; email: string; password: string | null }>;
  /** Children excluded because their active link belongs to a different parent. */
  withheld: Array<{ studentPortalId: string; reason: 'owned_by_other_parent' }>;
};

const INTENT_POLICY = {
  portal_created: {
    // The caller just generated these passwords — re-rolling them would invalidate
    // the credentials it is about to show on screen.
    resetPolicy: 'never' as const,
    title: (school: string | null) => `Welcome to ${school ?? 'Rillcod'}`,
    emailSubject: 'Your Rillcod Parent Portal Account Details',
  },
  students_added: {
    resetPolicy: 'never' as const,
    title: (_school: string | null, count = 1) => `New Student Login${count > 1 ? 's' : ''} Ready`,
    emailSubject: "Your Child's Rillcod Student Login",
  },
  resend: {
    // NOT 'always'. A blanket reset locks out any child who is actively using their
    // account, every time staff click Resend. 'if-never-signed-in' issues a password
    // only to accounts that have never been used, and tells everyone else to use the
    // password they already have.
    resetPolicy: 'if-never-signed-in' as const,
    title: () => 'Your Rillcod Login Details',
    emailSubject: 'Your Rillcod Login Details',
  },
};

/**
 * Children eligible to receive credentials for this lead.
 *
 * Two filters, both safety-critical:
 *   1. active links only (approved / onboarded) — enforced by collectLeadStudentPortalIds
 *   2. the child must not already belong to a DIFFERENT parent. A lead can be stale or
 *      wrongly matched; the junction table is the authority on who a child belongs to.
 */
async function resolveLeadAudience(
  admin: AnySupabase,
  leadId: string,
  parentId: string,
): Promise<{
  students: Array<{ userId: string; email: string; displayName: string; role: 'student' }>;
  withheld: Array<{ studentPortalId: string; reason: 'owned_by_other_parent' }>;
}> {
  const portalIds = await collectLeadStudentPortalIds(admin, leadId);
  const students: Array<{ userId: string; email: string; displayName: string; role: 'student' }> = [];
  const withheld: Array<{ studentPortalId: string; reason: 'owned_by_other_parent' }> = [];

  for (const portalId of portalIds) {
    const rowId = await resolveStudentRowId(admin, portalId);
    if (rowId) {
      let owner: { parentId: string } | null = null;
      try {
        owner = await getExistingParentLink(admin, rowId);
      } catch {
        owner = null;
      }
      if (owner?.parentId && owner.parentId !== parentId) {
        withheld.push({ studentPortalId: portalId, reason: 'owned_by_other_parent' });
        continue;
      }
    }

    const { data } = await admin
      .from('portal_users')
      .select('email, full_name')
      .eq('id', portalId)
      .eq('role', 'student')
      .maybeSingle();
    if (!data?.email) continue;
    students.push({
      userId: portalId,
      email: data.email,
      displayName: data.full_name || 'Student',
      role: 'student',
    });
  }

  return { students, withheld };
}

export async function deliverLeadCredentials(
  admin: AnySupabase,
  input: {
    leadId: string;
    intent: LeadCredentialIntent;
    parentId: string;
    parentEmail: string;
    parentName: string;
    parentPhone?: string | null;
    schoolId?: string | null;
    schoolName?: string | null;
    /** Creation intents only: students just provisioned, with known passwords. */
    newStudents?: LeadStudentCredential[];
    /** `portal_created` only: the password just generated for the parent. */
    parentPassword?: string | null;
    silent?: boolean;
    bodyIntro?: string;
  },
): Promise<DeliverLeadCredentialsResult> {
  const policy = INTENT_POLICY[input.intent];
  const newStudents = input.newStudents ?? [];

  // Creation intents carry their own freshly-provisioned audience. Resend derives it
  // from the lead, which is the path that must be filtered and ownership-checked.
  const derived = input.intent === 'resend'
    ? await resolveLeadAudience(admin, input.leadId, input.parentId)
    : { students: [], withheld: [] as Array<{ studentPortalId: string; reason: 'owned_by_other_parent' }> };

  const studentTargets = input.intent === 'resend'
    ? derived.students
    : newStudents.map((s) => ({
      userId: s.studentPortalId,
      email: s.email,
      displayName: s.name,
      role: 'student' as const,
      storedPassword: s.password,
    }));

  if (input.intent === 'students_added' && newStudents.length === 0) {
    return {
      email: false,
      whatsapp: false,
      channels: [],
      parent: { email: input.parentEmail, password: null },
      students: [],
      withheld: derived.withheld,
    };
  }

  const delivery = await deliverPortalCredentials(admin, {
    parent: {
      userId: input.parentId,
      email: input.parentEmail,
      displayName: input.parentName,
      role: 'parent',
      ...(input.intent === 'portal_created' ? { storedPassword: input.parentPassword ?? null } : {}),
      ...(input.intent === 'students_added' ? { storedPassword: null } : {}),
    },
    students: studentTargets as any,
    parentPhone: input.parentPhone ?? null,
    parentName: input.parentName,
    schoolName: input.schoolName ?? null,
    schoolId: input.schoolId ?? null,
    resetPolicy: policy.resetPolicy,
    archiveToRegistrationResults: true,
    emailChannel: 'system',
    skipDelivery: input.silent === true,
    title: policy.title(input.schoolName ?? null, newStudents.length || studentTargets.length),
    emailSubject: policy.emailSubject,
    bodyIntro: input.bodyIntro,
  });

  return {
    email: delivery.email,
    whatsapp: delivery.whatsapp,
    channels: delivery.channels,
    parent: { email: input.parentEmail, password: delivery.parent?.password ?? null },
    students: (delivery.students ?? []).map((s: any) => ({
      name: s.name,
      email: s.email,
      password: s.password ?? null,
    })),
    withheld: derived.withheld,
  };
}
