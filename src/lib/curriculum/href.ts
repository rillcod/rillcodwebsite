function withQuery(
  path: string,
  args: Record<string, string | null | undefined>
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(args)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** Canonical link into the curriculum builder. */
export function buildCurriculumHref(
  args: {
    courseId?: string | null;
    programId?: string | null;
  } = {}
): string {
  return withQuery("/dashboard/curriculum", {
    course: args.courseId,
    program: args.programId,
  });
}

/** Academic review before publication. */
export function buildCertifyHref(
  args: {
    curriculumId?: string | null;
    courseId?: string | null;
  } = {}
): string {
  return withQuery("/dashboard/academic/certify", {
    curriculum_id: args.curriculumId,
    course_id: args.courseId,
  });
}

/** Protect and assign an official edition to schools. */
export function buildDistributeHref(
  args: {
    curriculumId?: string | null;
    courseId?: string | null;
  } = {}
): string {
  return withQuery("/dashboard/academic/distribute", {
    curriculum_id: args.curriculumId,
    course_id: args.courseId,
  });
}

/** Set real school/class entry points for a published edition. */
export function buildTimingHref(
  args: {
    courseId?: string | null;
    releaseId?: string | null;
  } = {}
): string {
  return withQuery("/dashboard/academic/timing", {
    course_id: args.courseId,
    release_id: args.releaseId,
  });
}

/** Params carried across the curriculum asset lane (author → timing). */
export const ASSET_LANE_QUERY_KEYS = [
  "curriculum_id",
  "course_id",
] as const;

export function pickAssetLaneQuery(
  source: URLSearchParams | string
): URLSearchParams {
  const from =
    typeof source === "string" ? new URLSearchParams(source) : source;
  const out = new URLSearchParams();
  for (const key of ASSET_LANE_QUERY_KEYS) {
    const value = from.get(key);
    if (value) out.set(key, value);
  }
  return out;
}

export function mergeAssetLaneHref(
  basePath: string,
  source: URLSearchParams | string
): string {
  const query = pickAssetLaneQuery(source).toString();
  return query ? `${basePath}?${query}` : basePath;
}
