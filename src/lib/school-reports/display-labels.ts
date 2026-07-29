import { cleanClassName } from '@/lib/classes/naming';
import { normalizeProgrammeLabel } from '@/lib/courses/class-course-resolution';

const DISPLAY_ACRONYMS = new Set([
  'AI', 'API', 'CBT', 'GRA', 'ICT', 'JSS', 'LMS', 'PDF', 'QA', 'SS', 'SSS',
  'STEM', 'TVET', 'UK', 'USA',
]);

function formatNamePart(part: string): string {
  if (!part) return part;
  const lettersAndNumbers = part.replace(/[^a-z0-9]/gi, '');
  const upper = lettersAndNumbers.toUpperCase();
  if (DISPLAY_ACRONYMS.has(upper)) return upper;
  if (/^[a-z]$/i.test(part)) return part.toUpperCase();

  const cased = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  return cased.replace(/^Mc([a-z])/, (_, letter: string) => 'Mc' + letter.toUpperCase());
}

function formatDisplayName(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return fallback;
  return text
    .split(' ')
    .map((word) => word.split(/([-'\u2019])/).map(formatNamePart).join(''))
    .join(' ');
}

/** Human-readable learner, parent, teacher, and staff names. Stored data is never changed. */
export function formatPersonDisplayName(value: unknown, fallback = 'Learner'): string {
  return formatDisplayName(value, fallback);
}

/** Human-readable school name while retaining familiar academic and technical acronyms. */
export function formatSchoolDisplayName(value: unknown, fallback = 'Partner school'): string {
  return formatDisplayName(value, fallback);
}

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
