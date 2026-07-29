/**
 * How an official edition reaches a class depends on the pathway, and the two
 * routes are mutually exclusive. This mirrors resolveOfficialCurriculumDirection()
 * in src/lib/curriculum/official-direction.ts — if that resolver changes, this
 * file changes with it.
 *
 *   school   → inherits the school's adoption (academic_curriculum_adoptions)
 *   anything → must own an explicit direction
 *   else       (academic_offering_curriculum_directions) and never inherits
 *
 * The second rule is not an edge case. An Online or Special pathway with no
 * direction of its own cannot teach, even when its school has adopted an
 * edition for the same course.
 */

/** academic_offerings.enrollment_type */
export type EnrollmentType = "school" | "online" | "in_person" | "special";

/** academic_offerings.pathway */
export type PathwayKind =
  | "school_term"
  | "online_school"
  | "bootcamp"
  | "holiday_programme"
  | "short_course";

export type DirectionRoute = "adoption" | "own_edition";

/**
 * Which route a pathway uses. Absent offering data we assume the school route,
 * matching the resolver's own default for classes with no offering attached.
 */
export function directionRoute(
  enrollmentType: EnrollmentType | string | null | undefined
): DirectionRoute {
  const type = enrollmentType ?? "school";
  return type === "school" ? "adoption" : "own_edition";
}

export function isIndependentPathway(
  enrollmentType: EnrollmentType | string | null | undefined
): boolean {
  return directionRoute(enrollmentType) === "own_edition";
}

export const PATHWAY_LABEL: Record<PathwayKind, string> = {
  school_term: "Regular School",
  online_school: "Online School",
  bootcamp: "Bootcamp",
  holiday_programme: "Holiday Programme",
  short_course: "Short Course",
};

export const ENROLLMENT_LABEL: Record<EnrollmentType, string> = {
  school: "Regular School",
  online: "Online School",
  in_person: "In-person Programme",
  special: "Special Programme",
};

export function pathwayLabel(
  pathway: PathwayKind | string | null | undefined,
  enrollmentType?: EnrollmentType | string | null
): string {
  if (pathway && pathway in PATHWAY_LABEL) {
    return PATHWAY_LABEL[pathway as PathwayKind];
  }
  if (enrollmentType && enrollmentType in ENROLLMENT_LABEL) {
    return ENROLLMENT_LABEL[enrollmentType as EnrollmentType];
  }
  return "Academic pathway";
}

/**
 * Staff-facing explanation of how this pathway receives its curriculum, and
 * what an administrator must do when it has none. One wording, everywhere.
 */
export function routeCopy(
  enrollmentType: EnrollmentType | string | null | undefined
): { route: DirectionRoute; how: string; whenMissing: string; action: string } {
  if (directionRoute(enrollmentType) === "adoption") {
    return {
      route: "adoption",
      how: "This pathway automatically receives the central official edition adopted by its school.",
      whenMissing:
        "The school has not adopted an official edition for this course yet.",
      action: "Assign the official edition to this school.",
    };
  }
  return {
    route: "own_edition",
    how: "This pathway keeps its own official edition. A central edition never overwrites it.",
    whenMissing:
      "This Online or Special pathway has no edition of its own, and it cannot borrow the school's.",
    action: "Assign an official edition directly to this pathway.",
  };
}
