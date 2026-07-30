/**
 * Explicit Dependency Declaration & Unpublish Engine for Rillcod Curriculum System
 *
 * Direct Database Dependency Chain for a `course_curricula` row:
 *
 * 1. `academic_offering_curriculum_directions` (release_id) ➔ Offering directions linked to official releases
 * 2. `academic_curriculum_adoptions` (release_id)           ➔ School adoptions of certified releases
 * 3. `academic_curriculum_releases` (source_curriculum_id)   ➔ Official published releases
 * 4. `academic_curriculum_quality_runs` (curriculum_id)      ➔ QA inspection history
 * 5. `lesson_plans` (curriculum_version_id) & `lessons`      ➔ Classroom teaching plans
 * 6. `curriculum_week_tracking` (curriculum_id)              ➔ Teacher weekly delivery logs
 */

export interface CurriculumDependencySummary {
  curriculumId: string;
  officialReleases: number;
  offeringDirections: number;
  schoolAdoptions: number;
  qualityRuns: number;
  holdingLessonPlans: number;
  trackingRecords: number;
  canUnpublish: boolean;
  canDelete: boolean;
}

/**
  Explicitly inspect all database dependencies holding a curriculum row.
 */
export async function getCurriculumDependencyTree(
  admin: any,
  curriculumId: string
): Promise<CurriculumDependencySummary> {
  // 1. Releases
  const { data: releases } = await admin
    .from('academic_curriculum_releases')
    .select('id, status')
    .eq('source_curriculum_id', curriculumId);

  const releaseIds = (releases || []).map((r: any) => r.id);

  // 2. Offering directions
  let offeringCount = 0;
  if (releaseIds.length > 0) {
    const { count } = await admin
      .from('academic_offering_curriculum_directions')
      .select('id', { count: 'exact', head: true })
      .in('release_id', releaseIds);
    offeringCount = count || 0;
  }

  // 3. Adoptions
  let adoptionCount = 0;
  if (releaseIds.length > 0) {
    const { count } = await admin
      .from('academic_curriculum_adoptions')
      .select('id', { count: 'exact', head: true })
      .in('release_id', releaseIds);
    adoptionCount = count || 0;
  }

  // 4. QA Runs
  const { count: qaCount } = await admin
    .from('academic_curriculum_quality_runs')
    .select('id', { count: 'exact', head: true })
    .eq('curriculum_id', curriculumId);

  // 5. Lesson Plans
  const { count: planCount } = await admin
    .from('lesson_plans')
    .select('id', { count: 'exact', head: true })
    .eq('curriculum_version_id', curriculumId);

  // 6. Tracking
  const { count: trackCount } = await admin
    .from('curriculum_week_tracking')
    .select('id', { count: 'exact', head: true })
    .eq('curriculum_id', curriculumId);

  return {
    curriculumId,
    officialReleases: (releases || []).length,
    offeringDirections: offeringCount,
    schoolAdoptions: adoptionCount,
    qualityRuns: qaCount || 0,
    holdingLessonPlans: planCount || 0,
    trackingRecords: trackCount || 0,
    canUnpublish: (releases || []).length > 0,
    canDelete: true,
  };
}

/**
  Explicitly unpublish / retire an official curriculum release.
  Changes release status to 'retired' and hides source curriculum from school view.
 */
export async function unpublishCurriculumRelease(
  admin: any,
  curriculumId: string
): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    // 1. Find linked releases
    const { data: releases, error: relErr } = await admin
      .from('academic_curriculum_releases')
      .select('id')
      .eq('source_curriculum_id', curriculumId);

    if (relErr) return { ok: false, count: 0, error: relErr.message };

    const releaseIds = (releases || []).map((r: any) => r.id);

    // 2. Remove active offering directions & adoptions
    if (releaseIds.length > 0) {
      await admin
        .from('academic_offering_curriculum_directions')
        .delete()
        .in('release_id', releaseIds);

      await admin
        .from('academic_curriculum_adoptions')
        .update({ status: 'archived' })
        .in('release_id', releaseIds);

      // 3. Mark releases as retired
      await admin
        .from('academic_curriculum_releases')
        .update({ status: 'retired' })
        .in('id', releaseIds);
    }

    // 4. Hide source curriculum from school view
    await admin
      .from('course_curricula')
      .update({ is_visible_to_school: false })
      .eq('id', curriculumId);

    return { ok: true, count: releaseIds.length };
  } catch (err: any) {
    return { ok: false, count: 0, error: err.message || 'Unpublish failed' };
  }
}
