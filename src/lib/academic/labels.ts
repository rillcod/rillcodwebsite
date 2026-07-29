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
