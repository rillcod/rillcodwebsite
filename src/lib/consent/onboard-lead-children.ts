import type { SupabaseClient } from '@supabase/supabase-js';
import { onboardStudentFromProspect } from '@/lib/students/onboard-from-prospect';

type AnySupabase = SupabaseClient<any>;

/**
 * Shared: turn a consent-form lead's UNMATCHED children into real student
 * accounts (login + school + class + enrolment) linked to the given parent.
 *
 * Used by BOTH the single (create-portal-account) and bulk (bulk-portals) flows
 * so they behave identically — a brand-new child always becomes an operational
 * student that shows on the parent dashboard, never just a parent with no kids.
 *
 * Returns the newly-created student logins so callers can deliver them.
 */
export interface LeadChildContext {
  lead: {
    school_id?: string | null;
    matched_school_id?: string | null;
    matched_student_id?: string | null;
    response_data?: any;
  };
  parentId: string;
  parentEmail: string;
  parentName: string;
  parentPhone?: string | null;
  approvedBy?: string | null;
  /** Optional staff class choice. */
  classId?: string | null;
  className?: string | null;
}

const programLabel = (p?: string | null): string | null =>
  p === 'young_innovators' ? 'Young Innovators'
    : p === 'teen_developers' ? 'Teen Developers'
      : (p || null);

export async function onboardLeadChildren(
  admin: AnySupabase,
  ctx: LeadChildContext,
): Promise<Array<{ name: string; email: string; password: string; studentPortalId: string }>> {
  const rd = (ctx.lead.response_data ?? {}) as Record<string, any>;
  const str = (k: string) => ((rd[k] as string) ?? '').trim();
  const childName = str('child_name');
  const childClass = str('child_class') || null;
  const childGender = str('child_gender') || null;
  const childrenArr = Array.isArray(rd.children) ? (rd.children as Array<Record<string, string>>) : null;
  const childMatches = Array.isArray(rd.child_matches)
    ? (rd.child_matches as Array<{ childIndex: number; studentId: string }>)
    : [];

  const created: Array<{ name: string; email: string; password: string; studentPortalId: string }> = [];
  const tasks: Array<{ name: string; klass: string | null; age: string | null; gender: string | null; program: string | null }> = [];

  // Primary child — unmatched when the lead has no matched_student_id.
  if (!ctx.lead.matched_student_id && childName) {
    tasks.push({ name: childName, klass: childClass, age: str('child_age') || null, gender: childGender, program: str('program_category') || null });
  }
  // Additional children (index ≥ 1) not present in child_matches.
  if (childrenArr && childrenArr.length > 1) {
    const matchedIdx = new Set(childMatches.map((m) => m.childIndex));
    for (let ci = 1; ci < childrenArr.length; ci++) {
      const c = childrenArr[ci];
      if (!c?.name?.trim() || matchedIdx.has(ci)) continue;
      tasks.push({ name: c.name, klass: c.class || null, age: c.age || null, gender: c.gender || null, program: c.program || null });
    }
  }

  for (const t of tasks) {
    try {
      const res = await onboardStudentFromProspect(admin, {
        full_name: t.name,
        grade: t.klass,
        age: t.age ? parseInt(t.age, 10) : null,
        gender: t.gender,
        course_interest: programLabel(t.program),
        parent_email: ctx.parentEmail,
        parent_name: ctx.parentName,
        parent_phone: ctx.parentPhone || null,
        // School the form was created for (then current-school match, then online).
        school_id: ctx.lead.school_id ?? ctx.lead.matched_school_id ?? null,
      }, {
        parentId: ctx.parentId,
        // Consent-form children always belong to a partner school → classify as 'school'.
        enrollmentType: 'school',
        approvedBy: ctx.approvedBy,
        classId: ctx.classId,
        className: ctx.className,
      });
      if (res.created) created.push({ name: t.name, email: res.studentEmail, password: res.studentPassword, studentPortalId: res.studentPortalId });
    } catch (e) {
      console.error('[onboardLeadChildren] failed for', t.name, e);
    }
  }

  return created;
}
