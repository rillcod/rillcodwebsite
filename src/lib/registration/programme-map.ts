/**
 * Central registration → programme mapping (DRY).
 * One map used by the public form, payment API, approvals, and ensureDefaultEnrollment.
 */

export type RegistrationEnrollmentType = 'school' | 'online' | 'in_person' | 'bootcamp' | '';

/** Canonical programme picks shown on the public form (labels must stay stable). */
export const SCHOOL_PROGRAMME_OPTIONS = [
  { value: 'Young Innovators', label: 'Young Innovators (Ages 6–12)', match: ['young innovator'] },
  { value: 'Teen Developers', label: 'Teen Developers (Ages 12–18)', match: ['teen developer'] },
] as const;

export const SPECIALIST_PROGRAMME_OPTIONS = [
  { value: 'Python Programming', label: 'Python Programming', match: ['python'] },
  { value: 'Web Development', label: 'Web Development', match: ['web development', 'web dev', 'full-stack', 'full stack'] },
  { value: 'AI & Data Science', label: 'AI & Data Science', match: ['ai engineering', 'data analysis', 'ai &', 'machine learning'] },
  { value: 'Robotics & IoT', label: 'Robotics & IoT', match: ['robotics', 'iot'] },
  { value: 'Scratch & Game Design', label: 'Scratch & Game Design', match: ['young innovator', 'scratch'] },
  { value: 'UI/UX Design', label: 'UI/UX Design', match: ['ui/ux', 'ui ux', 'design mastery'] },
  { value: 'Full-Stack Development', label: 'Full-Stack Development', match: ['full-stack', 'full stack'] },
  { value: 'Digital Skills & Entrepreneurship', label: 'Digital Skills & Entrepreneurship', match: ['entrepreneur', 'digital skills'] },
  { value: 'Teen Developers', label: 'Foundations (Teen Developers path)', match: ['teen developer'] },
] as const;

/** Substrings to find an active `programs.name` from a form course_interest value. */
export function courseInterestMatchNeedles(courseInterest?: string | null): string[] {
  const interest = (courseInterest || '').trim();
  if (!interest) return [];
  const lower = interest.toLowerCase();
  const needles = new Set<string>([lower]);

  for (const opt of [...SCHOOL_PROGRAMME_OPTIONS, ...SPECIALIST_PROGRAMME_OPTIONS]) {
    if (opt.value.toLowerCase() === lower || lower.includes(opt.value.toLowerCase())) {
      opt.match.forEach((m) => needles.add(m));
    }
  }

  // Extra aliases marketing copy often uses
  if (lower.includes('ai') && lower.includes('data')) {
    needles.add('ai engineering');
    needles.add('data analysis');
  }
  if (lower.includes('scratch') || lower.includes('game design')) needles.add('young innovator');
  if (lower.includes('cyber')) needles.add('teen developer');

  return [...needles];
}

export function resolveProgramFromInterest(
  programs: Array<{ id: string; name: string }>,
  courseInterest?: string | null,
): { id: string; name: string } | null {
  const needles = courseInterestMatchNeedles(courseInterest);
  if (!needles.length) return null;

  for (const needle of needles) {
    const hit = programs.find((p) => {
      const n = p.name.toLowerCase();
      return n === needle || n.includes(needle) || needle.includes(n);
    });
    if (hit) return hit;
  }
  return null;
}

export function isAdultOrIndividualGrade(grade?: string | null): boolean {
  const g = (grade || '').toLowerCase();
  return /\b(adult|individual|professional|university|nysc|working)\b/.test(g);
}

/** Partner-school path may only sell flagship programmes at subsidised fee. */
export function isAllowedSchoolCourseInterest(courseInterest?: string | null): boolean {
  const v = (courseInterest || '').trim();
  return SCHOOL_PROGRAMME_OPTIONS.some((o) => o.value === v);
}

export const REGISTRATION_GRADE_OPTIONS = [
  { value: 'Basic 1-3', label: 'Basic 1–3' },
  { value: 'Basic 4-6', label: 'Basic 4–6' },
  { value: 'JSS 1-3', label: 'JSS 1–3' },
  { value: 'SS 1-3', label: 'SS 1–3' },
  { value: 'Adult', label: 'Adult Learner' },
  { value: 'Individual', label: 'Individual / Professional' },
] as const;

export const REGISTRATION_TRUST_POINTS = [
  { title: 'One academy path', body: 'Special cohorts and term classes stay in the same Rillcod system.' },
  { title: 'Kids → adults', body: 'School-age, teens, adults, and individual learners are all welcome.' },
  { title: 'Stay after the cohort', body: 'We help you continue into Young Innovators, Teen Developers, or a specialist track.' },
] as const;

export const RETENTION_PITCH = {
  heading: 'Stay with Rillcod after this term',
  body: 'Learners who continue term-on-term keep portal access, progress, certificates, and WhatsApp community — the AI era rewards consistency.',
  ctaTerm: 'Continue with term enrolment',
  ctaSpecial: 'Join the active special programme',
};
