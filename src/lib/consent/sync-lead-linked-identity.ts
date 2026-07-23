import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveStudentRowId, syncExplicitParentStudentLink } from '@/lib/parents/links';
import {
  harmonizeStudentParentIdentity,
  syncParentContactAcrossStores,
} from '@/lib/sync/student-parent-identity';
import { applyConsentSpellingToLinkedStudents } from '@/lib/consent/resolve-consent-lead-match';

type AnySupabase = SupabaseClient<any>;

export type ConsentChildMatch = {
  childIndex: number;
  studentId: string;
};

/**
 * Link matched consent children to a parent and harmonise identity across all stores.
 * Replaces inline students/portal_users/auth triple-writes in portal-creation flows.
 */
export async function linkAndHarmonizeConsentLeadChildren(
  admin: AnySupabase,
  params: {
    leadId: string;
    parentId: string;
    parentEmail: string;
    parentName: string;
    parentPhone: string | null;
    matchedStudentId?: string | null;
    childMatches?: ConsentChildMatch[];
    formClassId?: string | null;
  },
): Promise<string[]> {
  const linkedPortalIds: string[] = [];

  if (params.matchedStudentId) {
    const rowId = await resolveStudentRowId(admin, params.matchedStudentId);
    if (rowId) await syncExplicitParentStudentLink(admin, params.parentId, rowId);
    linkedPortalIds.push(params.matchedStudentId);
  }

  for (const match of params.childMatches ?? []) {
    if (linkedPortalIds.includes(match.studentId)) continue;
    const rowId = await resolveStudentRowId(admin, match.studentId);
    if (rowId) await syncExplicitParentStudentLink(admin, params.parentId, rowId);
    linkedPortalIds.push(match.studentId);
  }

  await syncParentContactAcrossStores(admin, params.parentId, {
    full_name: params.parentName,
    email: params.parentEmail,
    phone: params.parentPhone,
  });

  if (params.formClassId && linkedPortalIds.length > 0) {
    const { data: cls } = await admin
      .from('classes')
      .select('name')
      .eq('id', params.formClassId)
      .maybeSingle();
    const sectionLabel = (cls?.name as string | undefined)?.trim() || null;
    await admin
      .from('portal_users')
      .update({
        class_id: params.formClassId,
        ...(sectionLabel ? { section_class: sectionLabel } : {}),
      })
      .in('id', linkedPortalIds)
      .is('class_id', null);
  }

  await applyConsentSpellingToLinkedStudents(admin, params.leadId);

  for (const studentPortalId of linkedPortalIds) {
    await harmonizeStudentParentIdentity(admin, {
      studentUserId: studentPortalId,
      parentId: params.parentId,
      parentPhone: params.parentPhone,
    });
  }

  return linkedPortalIds;
}
