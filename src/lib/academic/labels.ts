/**
 * One spelling for academic vocabulary across every surface.
 *
 * Term, grade, session and entry-point wording already lives in
 * src/lib/curriculum/humanLabels.ts and is re-exported here so callers have a
 * single import. This file only adds what was missing: Programme → Course →
 * Class context, and how an official edition names itself.
 */

export {
  humanTermLabel,
  humanGradeLabel,
  humanProgrammeYear,
  humanAcademicSession,
  humanEntryPoint,
  humanCurriculumContext,
} from "@/lib/curriculum/humanLabels";

import { humanTermLabel } from "@/lib/curriculum/humanLabels";

/** Supabase embeds arrive as an object or a single-element array. */
export function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export type CourseContext = {
  programmeName?: string | null;
  courseTitle?: string | null;
  className?: string | null;
};

/** "Coding & Robotics · Generative Art · Basic 1 Blue" — omitting what is absent. */
export function contextLine(input: CourseContext): string {
  return [input.programmeName, input.courseTitle, input.className]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" · ");
}

export function courseLabel(input: CourseContext): string {
  return input.courseTitle?.trim() || "Course";
}

export function programmeLabel(input: CourseContext): string {
  return input.programmeName?.trim() || "Programme";
}

export type EditionLike = {
  title?: string | null;
  release_number?: number | null;
  academic_session?: string | null;
  effective_term_number?: number | null;
  published_at?: string | null;
};

export function editionName(edition: EditionLike | null | undefined): string {
  if (!edition) return "No official edition";
  return edition.title?.trim() || "Official edition";
}

/**
 * The same ideas, in the words a school actually uses.
 *
 * The system speaks its own dialect — "official academic direction", "adoption",
 * "delivery schedule", "rollout", "entry point", "readiness". Those names are
 * precise and they earn their place in the code. In front of a teacher or a head
 * of school they are a second language: "The Academic Office has not assigned an
 * official edition to this pathway and course" tells someone that something is
 * wrong and nothing about what to do next.
 *
 * One translation table, so a screen and an error message never call the same
 * thing by two different names.
 */
export const PLAIN_WORDS = {
  /** academic direction / official edition */
  curriculum: 'approved curriculum',
  /** adoption */
  usingCurriculum: 'the curriculum this school follows',
  /** rollout */
  sendToSchools: 'sending it to schools',
  /** delivery schedule */
  startPoint: 'when this school starts teaching it',
  /** readiness */
  readyToTeach: 'ready to teach',
} as const;

/**
 * Why a class is not ready, said as something a person can act on.
 *
 * Each one names the thing that is missing and who fixes it. The old wording
 * named internal concepts and left the reader to work out both.
 */
export const NOT_READY_REASONS = {
  no_teacher: 'No teacher has been added to this school yet, so nobody can be given this class.',
  no_period:
    'This class has no term yet, so there is no way to tell which teaching week it is in. '
    + 'Set its term and it will pick up from there.',
  no_direction:
    `No ${PLAIN_WORDS.curriculum} has been sent to this school for this course yet. `
    + 'Publish it in the Academic Office and every class here will be set up automatically.',
} as const;

/** "Could not save when St. Bryan starts teaching: <reason>" */
export function startPointNotSaved(detail: string): string {
  return `Could not save ${PLAIN_WORDS.startPoint}: ${detail}`;
}

/** "Edition 2 · First Term 2026/2027 · Published 28 Jul 2026" */
export function editionMeta(edition: EditionLike | null | undefined): string {
  if (!edition) return "";
  const parts: string[] = [];
  if (edition.release_number) parts.push(`Edition ${edition.release_number}`);
  if (edition.academic_session) {
    parts.push(
      edition.effective_term_number
        ? `${humanTermLabel(edition.effective_term_number)} ${edition.academic_session}`
        : edition.academic_session
    );
  }
  if (edition.published_at) {
    parts.push(`Published ${new Date(edition.published_at).toLocaleDateString()}`);
  }
  return parts.join(" · ");
}
