import { cleanClassName } from '@/lib/classes/naming';
import { normalizeProgrammeLabel } from '@/lib/courses/class-course-resolution';

/** Canonical programme label for reports (e.g. "teen dev" → "Teen Developers"). */
export function formatProgrammeDisplay(label: unknown): string {
  return normalizeProgrammeLabel(String(label ?? '').trim());
}

/** Course title as stored — trimmed only; course names are usually title-cased in catalog. */
export function formatCourseDisplay(label: unknown): string {
  const text = String(label ?? '').trim();
  return text || 'Course';
}

/** Full class name with consistent segment casing. */
export function formatClassDisplay(label: unknown): string {
  const raw = String(label ?? '').trim();
  if (!raw) return 'Class';
  return cleanClassName(raw) || raw;
}

/** Programme + course line for charts and compact rows. */
export function formatProgrammeCourseDisplay(programme: unknown, course: unknown): string {
  return `${formatProgrammeDisplay(programme)} · ${formatCourseDisplay(course)}`;
}

/** Consistent statistical labels for school report PDF and UI (international reporting standard). */
export const REPORT_METRIC_LABELS = {
  meanScore: 'Mean score',
  meanAchievement: 'Mean achievement',
  meanPercent: 'Mean %',
  schoolMeanScore: 'School mean score',
  classMeanScores: 'Class mean scores',
  meanByProgrammeCourse: 'Mean score by programme and course',
  programmeCourseOutcomes: 'Programme and course outcomes',
  assessedLearners: 'Assessed',
  enrolledLearners: 'Enrolled',
} as const;
