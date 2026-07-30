/**
 * Admin cleanup for a course_curricula draft row.
 * Keeps official release content (unlinks source only) and live teaching
 * history (detaches curriculum_version_id). Removes draft/archived plans
 * and week tracking tied to this draft, then deletes the row.
 */
export async function forceDeleteCurriculumDraft(
  admin: any,
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: holdingPlans, error: plansErr } = await admin
    .from("lesson_plans")
    .select("id, status")
    .eq("curriculum_version_id", id);
  if (plansErr) return { ok: false, error: plansErr.message };

  const plans = holdingPlans ?? [];
  const draftPlans = plans.filter(
    (p: { status: string }) => p.status === "draft" || p.status === "archived"
  );

  const { error: trackErr } = await admin
    .from("curriculum_week_tracking")
    .delete()
    .eq("curriculum_id", id);
  if (trackErr) return { ok: false, error: trackErr.message };

  if (draftPlans.length > 0) {
    const draftIds = draftPlans.map((p: { id: string }) => p.id);
    await admin.from("lessons").delete().in("lesson_plan_id", draftIds);
    const { error: draftErr } = await admin
      .from("lesson_plans")
      .delete()
      .in("id", draftIds);
    if (draftErr) return { ok: false, error: draftErr.message };
  }

  const { error: detachErr } = await admin
    .from("lesson_plans")
    .update({ curriculum_version_id: null })
    .eq("curriculum_version_id", id)
    .neq("status", "draft")
    .neq("status", "archived");
  if (detachErr) return { ok: false, error: detachErr.message };

  // Find linked releases
  const { data: releases } = await admin
    .from("academic_curriculum_releases")
    .select("id")
    .eq("source_curriculum_id", id);

  if (releases && releases.length > 0) {
    const releaseIds = releases.map((r: { id: string }) => r.id);
    await admin
      .from("academic_offering_curriculum_directions")
      .delete()
      .in("release_id", releaseIds);
    await admin
      .from("academic_curriculum_adoptions")
      .delete()
      .in("release_id", releaseIds);
    await admin
      .from("academic_curriculum_releases")
      .delete()
      .in("id", releaseIds);
  } else {
    await admin
      .from("academic_curriculum_releases")
      .update({ source_curriculum_id: null })
      .eq("source_curriculum_id", id);
  }

  await admin
    .from("academic_curriculum_quality_runs")
    .delete()
    .eq("curriculum_id", id);

  const { error } = await admin.from("course_curricula").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * One live row per (course_id, school_id). Keep `keepId`, remove same-scope
 * siblings so regenerate bumps a version number instead of spawning copies.
 */
export async function consolidateSameScopeCurricula(
  admin: any,
  opts: {
    courseId: string;
    schoolId: string | null;
    keepId: string;
  }
): Promise<{ removed: number; error?: string }> {
  let q = admin
    .from("course_curricula")
    .select("id")
    .eq("course_id", opts.courseId)
    .neq("id", opts.keepId);
  q = opts.schoolId
    ? q.eq("school_id", opts.schoolId)
    : q.is("school_id", null);

  const { data: siblings, error } = await q;
  if (error) return { removed: 0, error: error.message };

  let removed = 0;
  for (const row of siblings ?? []) {
    const result = await forceDeleteCurriculumDraft(admin, row.id);
    if (!result.ok) return { removed, error: result.error };
    removed += 1;
  }
  return { removed };
}
