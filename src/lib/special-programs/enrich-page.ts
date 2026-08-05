import { specialProgramsAdminClient } from '@/lib/special-programs/queries';
import { mapSpecialProgramRow } from '@/lib/special-programs/types';
import { readTeachingLaunchStatus } from '@/lib/special-programs/teaching-launch-status';
import { buildTeachingReadiness } from '@/lib/special-programs/teaching-readiness';
import {
  loadLinkableSchoolClasses,
  loadOfferingClasses,
  pickPrimaryCohort,
} from '@/lib/special-programs/ensure-cohort-class';

export async function enrichPageForAdmin(page: ReturnType<typeof mapSpecialProgramRow> | null) {
  if (!page) return null;
  const sb = specialProgramsAdminClient();
  const { data: row } = await sb
    .from('special_program_pages')
    .select('academic_offering_id')
    .eq('id', page.id)
    .maybeSingle();
  const offeringId = row?.academic_offering_id ? String(row.academic_offering_id) : null;
  let schoolId: string | null = null;
  if (offeringId) {
    const { data: offering } = await sb
      .from('academic_offerings')
      .select('school_id')
      .eq('id', offeringId)
      .maybeSingle();
    schoolId = offering?.school_id ? String(offering.school_id) : null;
  }
  const teaching_launch = await readTeachingLaunchStatus(sb, offeringId);
  const offering_classes = offeringId ? await loadOfferingClasses(sb, offeringId) : [];
  const cohort_class = pickPrimaryCohort(offering_classes);
  const linkable_classes =
    schoolId && offeringId ? await loadLinkableSchoolClasses(sb, schoolId, offeringId) : [];
  const readiness = buildTeachingReadiness({
    programId: page.program_id,
    schoolId,
    isPublished: page.is_published,
    startsOn: page.starts_on,
    cohortClass: cohort_class,
  });
  return {
    ...page,
    academic_offering_id: offeringId,
    school_id: schoolId,
    teaching_launch,
    cohort_class,
    offering_classes,
    linkable_classes,
    teaching_readiness: {
      ready: readiness.ready,
      can_prepare: readiness.can_prepare,
      missing: readiness.missing,
      steps: readiness.steps,
    },
  };
}
