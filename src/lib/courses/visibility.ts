/**
 * Course & programme visibility — application-layer policy.
 *
 * This module is the single source of truth for "who sees what" in the
 * academic catalogue (programmes, courses, lessons). **Only admins**
 * see every programme in API catalog responses. Teachers, schools, and
 * learners use the two flagship programmes (Teen Developer, Young Innovator(s))
 * for selection UIs, except where noted below (e.g. teachers still see
 * empty courses in flagship programmes so they can add content).
 *
 * ─────────────────────────────────────────────────────────────────────
 * Flagship programmes
 * ─────────────────────────────────────────────────────────────────────
 * `ALWAYS_PUBLIC_PROGRAMS` is the allow-list of programmes that MUST
 * reach schools, students, and parents, and the DEFAULT for teachers
 * in syllabus / course pickers. (Bootcamp, summer school, online, etc.
 * are admin-only in catalog APIs until a formal rollout flag exists.)
 *
 *  - Young Innovator(s)
 *  - Teen Developer(s)
 *
 * ─────────────────────────────────────────────────────────────────────
 * Content gate
 * ─────────────────────────────────────────────────────────────────────
 * A course is "ready for students" when it has at least one lesson OR
 * one assignment. Empty courses are hidden from learner surfaces so
 * the catalogue never shows "0/0 modules" placeholder cards.
 * Staff surfaces still see every course so they can populate content.
 */

export type LearnerRole = 'student' | 'parent' | 'public';
export type StaffRole = 'admin' | 'teacher' | 'school';
export type AnyRole = LearnerRole | StaffRole;

export const ALWAYS_PUBLIC_PROGRAMS = [
  'young innovator',
  'young innovators',
  'teen developer',
  'teen developers',
] as const;

export function isAlwaysPublicProgramName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return ALWAYS_PUBLIC_PROGRAMS.some((p) => n === p || n.startsWith(p));
}

/**
 * Platform staff in the "builder" sense (can author curriculum; used for
 * per-course access rules elsewhere). This is **not** the same as "sees
 * every programme" — for catalog listing, use `isAdminOnlyProgramCatalog` or
 * `isProgramVisibleToRole` instead.
 */
export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return role === 'admin' || role === 'teacher';
}

export function isLearnerRole(role: string | null | undefined): boolean {
  return !isStaffRole(role);
}

/**
 * Programme-level visibility for catalog / syllabus pickers.
 *
 * Rules (in order):
 *   1. Inactive programmes are always hidden.
 *   2. Admins see every active programme.
 *   3. All other roles (teacher, school, student, parent, public) only see
 *      flagship names (Teen Developer, Young Innovator(s)) — bootcamp and
 *      other tracks stay off the default list.
 */
export function isProgramVisibleToRole(
  program: { name?: string | null; is_active?: boolean | null },
  role: string | null | undefined,
): boolean {
  if (program.is_active === false) return false;
  if (role === 'admin') return true;
  return isAlwaysPublicProgramName(program.name ?? null);
}

/**
 * A course is "ready for students" when it has at least one lesson
 * OR one assignment. This helper works with the embedded shape:
 *   select('*, lessons(id), assignments(id)')
 * or with explicit counts.
 */
export function hasCourseContent(course: {
  lessons?: Array<unknown> | null;
  assignments?: Array<unknown> | null;
  lesson_count?: number | null;
  assignment_count?: number | null;
}): boolean {
  const lessonCount = course.lesson_count ?? course.lessons?.length ?? 0;
  const assignmentCount = course.assignment_count ?? course.assignments?.length ?? 0;
  return lessonCount > 0 || assignmentCount > 0;
}

/**
 * Decides whether a course should be visible to learners (student,
 * parent, guest, public, **and** partner school catalog views).
 * Admin/teacher "full list" per programme does not use the content gate
 * the same way — see /api/programs.
 *
 * A course is visible to learners when ALL of the following hold:
 *  - it is active (`is_active !== false`)
 *  - its programme is flagship OR the course is not locked
 *  - when `requireContent` is true (default on learner pages), the
 *    course must also have at least one lesson or assignment.
 */
export function isCourseVisibleToLearners(
  course: {
    is_locked?: boolean | null;
    is_active?: boolean | null;
    programs?: { name?: string | null } | null;
    program?: { name?: string | null } | null;
    program_name?: string | null;
    lessons?: Array<unknown> | null;
    assignments?: Array<unknown> | null;
    lesson_count?: number | null;
    assignment_count?: number | null;
  },
  opts: { requireContent?: boolean } = {},
): boolean {
  if (course.is_active === false) return false;
  const programName =
    course.programs?.name ?? course.program?.name ?? course.program_name ?? null;
  const visibleByLock = isAlwaysPublicProgramName(programName) || course.is_locked !== true;
  if (!visibleByLock) return false;
  if (opts.requireContent && !hasCourseContent(course)) return false;
  return true;
}

export function applyCourseVisibilityFilter<
  T extends Parameters<typeof isCourseVisibleToLearners>[0],
>(rows: T[] | null | undefined, opts: { requireContent?: boolean } = {}): T[] {
  if (!rows) return [];
  return rows.filter((r) => isCourseVisibleToLearners(r, opts));
}

/**
 * Array helper for programmes. Strips:
 *  - programmes invisible to the caller's role
 *  - courses that fail the learner visibility rule
 *  - (when `requireCourseContent`) empty courses
 */
export function applyProgramVisibilityFilter<
  P extends {
    name?: string | null;
    is_active?: boolean | null;
    courses?: Array<{
      is_locked?: boolean | null;
      is_active?: boolean | null;
      lessons?: Array<unknown> | null;
      assignments?: Array<unknown> | null;
      lesson_count?: number | null;
      assignment_count?: number | null;
    }> | null;
  },
>(
  rows: P[] | null | undefined,
  role: string | null | undefined,
  opts: { requireCourseContent?: boolean } = {},
): P[] {
  if (!rows) return [];
  const staff = isStaffRole(role);
  return rows
    .filter((r) => isProgramVisibleToRole(r, role))
    .map((r) => {
      if (staff) return r;
      const courses = (r.courses ?? []).filter((c) =>
        isCourseVisibleToLearners(
          { ...c, programs: { name: r.name ?? null } },
          { requireContent: opts.requireCourseContent },
        ),
      );
      return { ...r, courses } as P;
    });
}
