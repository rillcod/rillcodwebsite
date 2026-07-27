import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { findOrCreateParentPortal } from '@/lib/parents/provision';
import {
  syncExplicitParentStudentLink,
  resolveOrCreateStudentRowId,
  isParentLinkConflict,
} from '@/lib/parents/links';
import { linkParentSiblings, siblingNames } from '@/lib/parents/sibling-links';

type Db = SupabaseClient<Database>;

export interface ProvisionInput {
  email: string;
  phone: string | null;
  fullName: string;
  relationship?: string | null;
  studentId: string; // scanned child — portal_users.id
  /** When reusing an existing parent portal, do not overwrite name/profile. Default true. */
  preserveExistingProfile?: boolean;
}

export interface ProvisionResult {
  ok: boolean;
  error?: string;
  status?: number;
  parentId?: string;
  childName?: string | null;
  schoolId?: string | null;
  schoolName?: string | null;
  accountCreated?: boolean;
  generatedPassword?: string | null;
}

/**
 * Self-service core: find-or-create a parent account (deduped by email, email
 * pre-confirmed), then link the scanned child. Returns a generated password only
 * when a NEW account was created, so the caller can deliver the login.
 */
export async function provisionParentAndLinkChild(admin: Db, input: ProvisionInput): Promise<ProvisionResult> {
  const { email, phone, fullName, relationship, studentId } = input;

  const { data: childPU } = await admin
    .from('portal_users').select('full_name, school_id, school_name').eq('id', studentId).maybeSingle();

  if (!childPU?.school_id) {
    return {
      ok: false,
      status: 400,
      error: 'This student has no school yet. Assign the student to a school and class before linking a parent.',
    };
  }

  const provisioned = await findOrCreateParentPortal(admin as any, {
    email,
    fullName,
    phone,
    schoolId: childPU.school_id,
    schoolName: childPU.school_name ?? null,
    passwordPolicy: 'set',
    preserveExistingProfile: input.preserveExistingProfile !== false,
    archiveCredentials: false,
    batchLabel: 'Parent Claim',
  });
  if (!provisioned.ok || !provisioned.parentId) {
    return {
      ok: false,
      status: provisioned.status || 500,
      error: provisioned.error || 'Could not create your parent account. Please try again.',
    };
  }

  const parentId = provisioned.parentId;
  const childRowId = await resolveOrCreateStudentRowId(admin as any, studentId);
  if (childRowId) {
    await admin.from('students').update({
      parent_email: email, parent_name: fullName, parent_phone: phone,
      parent_relationship: relationship ?? 'Guardian', updated_at: new Date().toISOString(),
    }).eq('id', childRowId);
    try {
      await syncExplicitParentStudentLink(admin as any, parentId, childRowId, {
        actorId: parentId,
        source: 'parent-claim.provision',
        // The parent reached here by holding the child's card AND passing the name
        // guard or an OTP on their own email/phone — this is self-verification.
        parentVerified: true,
      });
    } catch (err) {
      if (isParentLinkConflict(err)) {
        return { ok: false, status: 409, error: err.message, parentId };
      }
      throw err;
    }
  }

  return {
    ok: true, parentId,
    childName: childPU?.full_name ?? null,
    schoolId: childPU?.school_id ?? null,
    schoolName: childPU?.school_name ?? null,
    accountCreated: !!provisioned.created,
    generatedPassword: provisioned.created ? (provisioned.password ?? null) : null,
  };
}

/**
 * Auto-link every other child at the same school already carrying this parent's
 * contact on file (parent_email / parent_phone). Safe: only links students whose
 * record already names this contact, so a stranger can't be attached. Returns the
 * names linked.
 *
 * The matching policy itself lives in `@/lib/parents/sibling-links` so the staff /
 * consent onboarding paths apply exactly the same rules — this used to be the only
 * place families were expanded, which is why consent-onboarded parents ended up
 * owning a single child.
 */
export async function autoLinkSiblings(
  admin: Db,
  input: { parentId: string; email: string; phone: string | null; fullName: string; relationship?: string | null; schoolName: string | null; studentId: string },
): Promise<string[]> {
  const { parentId, email, phone, relationship, studentId } = input;

  const { data: scanned } = await admin.from('students').select('id').eq('user_id', studentId).maybeSingle();

  const result = await linkParentSiblings(admin as any, {
    parentId,
    excludeStudentRowIds: scanned?.id ? [scanned.id] : [],
    alsoMatch: { emails: [email], phones: [phone] },
    actorId: parentId,
    source: 'parent-claim.autoLinkSiblings',
  });

  // The link itself mirrors parent name/email/phone onto the student; relationship
  // is claim-specific, so it is stamped here.
  for (const sibling of result.linked) {
    await admin.from('students')
      .update({
        parent_relationship: relationship ?? 'Guardian',
        updated_at: new Date().toISOString(),
      })
      .eq('id', sibling.studentRowId);
  }

  return siblingNames(result);
}
