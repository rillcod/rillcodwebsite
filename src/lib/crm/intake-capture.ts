/**
 * Central intake capture hub — every public/staff entry point should route here.
 *
 * Progressive capture → captureIntakeLead()
 * Abandoned checkout  → captureDroppedFromStudent/Prospect()
 * Paid / enrolled     → finalizeEnrollmentIntake()
 * School partnership  → captureSchoolPartnershipLead()
 * Portal self-signup  → capturePortalSignupLead()
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  captureLeadToContactBook,
  canCaptureLead,
  type CaptureLeadInput,
  type CaptureStage,
} from '@/lib/crm/capture-lead';
import { upsertBookParent, promoteBookLeadToPortalIfLinked, resolveCanonicalCrmContactId } from '@/lib/crm/contact-book';
import { insertCrmInteraction, upsertCrmPipeline } from '@/lib/crm/pipeline';
import { crmContactTypeFromRole } from '@/lib/crm/stages';
import {
  syncDroppedPayerFromProspect,
  syncDroppedPayerFromStudent,
} from '@/lib/crm/sync-dropped-payer';
import { upsertBookAndCrmPipeline } from '@/lib/crm/upsert-book-crm';
import { provisionParentAndLinkChild } from '@/lib/parent-claim/provision';
import { getExistingParentLink, resolveOrCreateStudentRowId, syncExplicitParentStudentLink } from '@/lib/parents/links';

type AnySupabase = SupabaseClient<any>;

export type IntakeChannel =
  | 'portal_registration'
  | 'special_program'
  | 'consent_form'
  | 'school_partnership'
  | 'portal_signup'
  | 'parent_claim'
  | 'general';

export type IntakeLeadInput = Omit<CaptureLeadInput, 'formType'> & {
  channel: IntakeChannel;
};

export type EnrollmentFinalizeInput = {
  channel: IntakeChannel;
  parentName: string;
  parentEmail?: string | null;
  parentPhone?: string | null;
  studentName: string;
  studentPortalUserId: string;
  studentRowId?: string | null;
  schoolName?: string | null;
  className?: string | null;
  programTitle?: string | null;
  courseInterest?: string | null;
  /** Create parent portal only when none exists. Default true. Never overrides existing links. */
  provisionParent?: boolean;
};

export type EnrollmentFinalizeResult = {
  bookId: string | null;
  parentId: string | null;
  crmContactId: string | null;
  linkEnsured: boolean;
  usedExistingParent: boolean;
  usedExistingLink: boolean;
};

/**
 * Reuse existing parent portal + junction link when present.
 * Creates parent account only when missing and email is available.
 */
async function ensureParentChildLink(
  sb: AnySupabase,
  input: {
    parentEmail?: string | null;
    parentPhone?: string | null;
    parentName: string;
    studentPortalUserId: string;
    studentRowId: string | null;
    createIfMissing: boolean;
  },
): Promise<{ parentId: string | null; linkEnsured: boolean; accountCreated: boolean; usedExistingLink: boolean; usedExistingParent: boolean }> {
  const email = (input.parentEmail || '').trim().toLowerCase();
  const studentRowId =
    input.studentRowId ?? (await resolveOrCreateStudentRowId(sb, input.studentPortalUserId));
  if (!studentRowId) {
    return { parentId: null, linkEnsured: false, accountCreated: false, usedExistingLink: false, usedExistingParent: false };
  }

  const existingLink = await getExistingParentLink(sb, studentRowId);
  if (existingLink?.parentId) {
    return {
      parentId: existingLink.parentId,
      linkEnsured: true,
      accountCreated: false,
      usedExistingLink: true,
      usedExistingParent: true,
    };
  }

  if (email) {
    const { data: portalUser } = await sb
      .from('portal_users')
      .select('id, role')
      .eq('email', email)
      .maybeSingle();

    if (portalUser?.role === 'parent') {
      await syncExplicitParentStudentLink(sb, portalUser.id, studentRowId);
      return {
        parentId: portalUser.id,
        linkEnsured: true,
        accountCreated: false,
        usedExistingLink: false,
        usedExistingParent: true,
      };
    }

    if (portalUser && portalUser.role !== 'parent') {
      return { parentId: null, linkEnsured: false, accountCreated: false, usedExistingLink: false, usedExistingParent: false };
    }
  }

  if (input.createIfMissing && email.includes('@')) {
    const provision = await provisionParentAndLinkChild(sb as any, {
      email,
      phone: input.parentPhone ?? null,
      fullName: input.parentName,
      studentId: input.studentPortalUserId,
      preserveExistingProfile: true,
    });
    if (provision.ok && provision.parentId) {
      return {
        parentId: provision.parentId,
        linkEnsured: true,
        accountCreated: !!provision.accountCreated,
        usedExistingLink: false,
        usedExistingParent: !provision.accountCreated,
      };
    }
  }

  return { parentId: null, linkEnsured: false, accountCreated: false, usedExistingLink: false, usedExistingParent: false };
}

const CHANNEL_SOURCE: Record<IntakeChannel, string> = {
  portal_registration: 'portal_registration',
  special_program: 'special_program',
  consent_form: 'consent_form',
  school_partnership: 'school_partnership',
  portal_signup: 'portal_signup',
  parent_claim: 'result_checker',
  general: 'form_capture',
};

function channelToFormType(channel: IntakeChannel): CaptureLeadInput['formType'] {
  if (channel === 'school_partnership' || channel === 'portal_signup' || channel === 'parent_claim') {
    return 'general';
  }
  return channel;
}

/** Progressive / partial capture from any intake form. */
export async function captureIntakeLead(sb: AnySupabase, input: IntakeLeadInput): Promise<string | null> {
  const { channel, ...rest } = input;
  return captureLeadToContactBook(sb, {
    ...rest,
    formType: channelToFormType(channel),
  });
}

export { canCaptureLead, type CaptureStage };

/** Unpaid term registration → Contact Directory. */
export async function captureDroppedFromStudent(
  sb: AnySupabase,
  student: Record<string, unknown>,
): Promise<string | null> {
  return syncDroppedPayerFromStudent(sb, student);
}

/** Unpaid special-program prospect → Contact Directory. */
export async function captureDroppedFromProspect(
  sb: AnySupabase,
  prospect: Record<string, unknown>,
): Promise<string | null> {
  return syncDroppedPayerFromProspect(sb, prospect);
}

/**
 * Post-enrollment: reconcile book + CRM won without overriding existing portals/links.
 * Used after term registration payment, summer onboard, staff approvals.
 */
export async function finalizeEnrollmentIntake(
  sb: AnySupabase,
  input: EnrollmentFinalizeInput,
): Promise<EnrollmentFinalizeResult> {
  const {
    channel,
    parentName,
    parentEmail,
    parentPhone,
    studentName,
    studentPortalUserId,
    schoolName,
    className,
    programTitle,
    courseInterest,
    provisionParent = true,
  } = input;

  const source = CHANNEL_SOURCE[channel];
  const program = programTitle || courseInterest || null;
  let parentId: string | null = null;
  let bookId: string | null = null;
  let crmContactId: string | null = null;
  let linkEnsured = false;
  let usedExistingParent = false;
  let usedExistingLink = false;

  const studentRowId =
    input.studentRowId ?? (await resolveOrCreateStudentRowId(sb, studentPortalUserId));

  const normalizedParentEmail = (parentEmail || '').trim().toLowerCase();
  const hasParentContact = normalizedParentEmail.includes('@') || (parentPhone || '').replace(/\D/g, '').length >= 10;

  try {
    await upsertBookParent(sb, {
      fullName: studentName,
      email: null,
      phone: null,
      schoolName: schoolName ?? null,
      className: className ?? null,
      source,
      lastChannel: 'portal',
      role: 'student',
      userId: studentPortalUserId,
      extraMeta: {
        intake_channel: channel,
        enrolled_at: new Date().toISOString(),
        program_title: program,
        is_enrolled: true,
        payment_status: 'completed',
      },
    });
  } catch (err) {
    console.error('[intake-capture] student book sync failed:', err);
  }

  if (hasParentContact) {
    try {
      const result = await upsertBookAndCrmPipeline(sb, {
        fullName: parentName || 'Parent/Guardian',
        contactName: parentName || 'Parent/Guardian',
        email: normalizedParentEmail || null,
        phone: parentPhone ?? null,
        schoolName: schoolName ?? null,
        className: className ?? null,
        source,
        lastChannel: 'portal',
        role: 'external',
        childEntry: {
          name: studentName,
          grade: className ?? null,
          program,
          school: schoolName ?? null,
        },
        extraMeta: {
          intake_channel: channel,
          enrolled_at: new Date().toISOString(),
          payment_status: 'completed',
          is_enrolled: true,
          is_dropped_payer: false,
        },
      });
      bookId = result.bookId;
      crmContactId = result.crmContactId;
    } catch (err) {
      console.error('[intake-capture] parent book sync failed:', err);
    }

    try {
      const promo = await promoteBookLeadToPortalIfLinked(sb, {
        bookId,
        email: normalizedParentEmail || null,
        phone: parentPhone ?? null,
      });
      if (promo.portalId) {
        crmContactId = promo.portalId;
        usedExistingParent = true;
      }
    } catch {
      /* non-fatal */
    }

    if (provisionParent) {
      const linkResult = await ensureParentChildLink(sb, {
        parentEmail: normalizedParentEmail || null,
        parentPhone: parentPhone ?? null,
        parentName: parentName || 'Parent/Guardian',
        studentPortalUserId,
        studentRowId,
        createIfMissing: true,
      });
      parentId = linkResult.parentId;
      linkEnsured = linkResult.linkEnsured;
      usedExistingLink = linkResult.usedExistingLink;
      usedExistingParent = usedExistingParent || linkResult.usedExistingParent;
      if (parentId) crmContactId = parentId;
    }
  }

  if (!crmContactId && hasParentContact) {
    try {
      const canonical = await resolveCanonicalCrmContactId(sb, {
        email: normalizedParentEmail || null,
        phone: parentPhone ?? null,
        bookId,
      });
      crmContactId = canonical.contactId;
      if (canonical.kind === 'portal') usedExistingParent = true;
    } catch {
      /* non-fatal */
    }
  }

  if (crmContactId) {
    try {
      if (parentId) {
        const { autoPromoteParentPipeline } = await import('@/lib/crm/auto-promote-parent');
        await autoPromoteParentPipeline(sb, {
          parentId,
          email: normalizedParentEmail || null,
          phone: parentPhone ?? null,
          contactName: parentName || 'Parent/Guardian',
          forceStage: linkEnsured,
        });
      } else {
        const contactType = crmContactTypeFromRole('form_lead');
        await upsertCrmPipeline(sb, {
          contactId: crmContactId,
          contactName: parentName || studentName,
          contactType,
          stage: 'won',
          promoteOnly: true,
        });
      }

      await insertCrmInteraction(sb, {
        contactId: crmContactId,
        contactName: parentName || studentName,
        contactType: crmContactTypeFromRole(parentId ? 'parent' : 'form_lead'),
        type: 'enrollment',
        direction: 'internal',
        content: `${studentName} enrolled via ${channel.replace(/_/g, ' ')}${program ? ` (${program})` : ''}.`,
      });
    } catch (err) {
      console.error('[intake-capture] CRM won promotion failed:', err);
    }
  }

  return { bookId, parentId, crmContactId, linkEnsured, usedExistingParent, usedExistingLink };
}

/** Special-program prospect after onboard — delegates to finalizeEnrollmentIntake. */
export async function captureProspectEnrollment(
  sb: AnySupabase,
  prospect: Record<string, unknown>,
  studentPortalUserId?: string | null,
): Promise<void> {
  if (!studentPortalUserId) return;

  const notesStr = String(prospect.notes ?? '');
  const studentPhoneMatch = notesStr.match(/\[Student Phone:\s*([^\]]+)\]/i);
  const studentPhone = studentPhoneMatch ? studentPhoneMatch[1].trim() : null;

  await finalizeEnrollmentIntake(sb, {
    channel: 'special_program',
    parentName: String(prospect.parent_name || 'Parent/Guardian'),
    parentEmail: (prospect.parent_email || prospect.email) as string | null,
    parentPhone: (prospect.parent_phone || studentPhone) as string | null,
    studentName: String(prospect.full_name || 'Student'),
    studentPortalUserId,
    schoolName: (prospect.school_name as string) || null,
    className: (prospect.grade as string) || null,
    programTitle: String(prospect.course_interest || 'Special Programme'),
    courseInterest: (prospect.course_interest as string) || null,
  });
}

/** School partnership application → Contact Directory. */
export async function captureSchoolPartnershipLead(
  sb: AnySupabase,
  input: {
    schoolName: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    programInterest?: string | null;
    studentCount?: number | null;
  },
): Promise<string | null> {
  const contactName = (input.contactName || input.schoolName || '').trim();
  if (!canCaptureLead({ fullName: contactName, email: input.email, phone: input.phone })) {
    if (!contactName || contactName.length < 2) return null;
  }

  const { bookId } = await upsertBookAndCrmPipeline(sb, {
    fullName: contactName,
    contactName,
    email: input.email,
    phone: input.phone,
    schoolName: input.schoolName,
    role: 'external',
    source: 'school_partnership',
    lastChannel: 'school_registration',
    extraMeta: {
      intake_channel: 'school_partnership',
      school_address: input.address ?? null,
      program_interest: input.programInterest ?? null,
      student_count: input.studentCount ?? null,
      capture_stage: 'submitted',
    },
  });

  if (bookId) {
    await upsertCrmPipeline(sb, {
      contactId: bookId,
      contactName,
      contactType: 'external',
      stage: 'prospect',
      promoteOnly: true,
    });
  }

  return bookId;
}

/** Promote school partnership CRM to won after admin approval. */
export async function finalizeSchoolPartnershipIntake(
  sb: AnySupabase,
  input: {
    schoolId: string;
    schoolName: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
  },
): Promise<void> {
  const email = (input.email || '').trim().toLowerCase();
  const contactName = (input.contactName || input.schoolName || '').trim();
  if (!email && !contactName) return;

  try {
    let bookId: string | null = null;
    if (email) {
      const { data: book } = await sb
        .from('customer_contact_book')
        .select('id')
        .ilike('email', email)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      bookId = book?.id ?? null;
    }

    if (!bookId && contactName) {
      const { bookId: created } = await upsertBookAndCrmPipeline(sb, {
        fullName: contactName,
        contactName,
        email: email || null,
        phone: input.phone ?? null,
        schoolName: input.schoolName,
        role: 'external',
        source: 'school_partnership',
        lastChannel: 'school_approval',
        extraMeta: {
          intake_channel: 'school_partnership',
          school_id: input.schoolId,
          capture_stage: 'approved',
          is_enrolled: true,
        },
      });
      bookId = created;
    }

    if (bookId) {
      await upsertCrmPipeline(sb, {
        contactId: bookId,
        contactName,
        contactType: 'external',
        stage: 'won',
        promoteOnly: true,
      });
      await insertCrmInteraction(sb, {
        contactId: bookId,
        contactName,
        contactType: 'external',
        type: 'note',
        content: `School partnership approved — ${input.schoolName}`,
      });
    }
  } catch (err) {
    console.error('[intake-capture] school partnership finalize failed:', err);
  }
}

/** Public portal self-signup → Contact Directory + contacted stage for parents. */
export async function capturePortalSignupLead(
  sb: AnySupabase,
  input: {
    userId: string;
    fullName: string;
    email: string;
    role: 'student' | 'parent';
    schoolName?: string | null;
    childName?: string | null;
    phone?: string | null;
  },
): Promise<string | null> {
  const isParent = input.role === 'parent';

  if (isParent) {
    const { bookId, crmContactId } = await upsertBookAndCrmPipeline(sb, {
      fullName: input.fullName,
      contactName: input.fullName,
      email: input.email,
      phone: input.phone ?? null,
      schoolName: input.schoolName ?? null,
      role: 'parent',
      userId: input.userId,
      source: 'portal_signup',
      lastChannel: 'portal_signup',
      childEntry: input.childName
        ? { name: input.childName, school: input.schoolName ?? null }
        : null,
      extraMeta: {
        intake_channel: 'portal_signup',
        portal_role: 'parent',
        signup_at: new Date().toISOString(),
      },
    });
    return crmContactId ?? bookId;
  }

  await upsertBookParent(sb, {
    fullName: input.fullName,
    email: input.email,
    phone: input.phone ?? null,
    schoolName: input.schoolName ?? null,
    role: 'student',
    userId: input.userId,
    source: 'portal_signup',
    lastChannel: 'portal_signup',
    extraMeta: {
      intake_channel: 'portal_signup',
      portal_role: 'student',
      signup_at: new Date().toISOString(),
    },
  });

  return null;
}
