/**
 * How a Young Innovators or Teen Developers class maps onto the courses those
 * programmes already have.
 *
 * The catalogue lists six courses in each programme, all at level_order 1, with
 * empty grade tags. Live classes therefore all land on the one published
 * edition (Scratch or Python). This file is the missing band → course table.
 * It does not invent programmes, and it does not yank a class off a course it
 * is already teaching.
 *
 * Home course = what a new class in that band should learn (and what is
 * currently published). Acceptable = still a fit for this band, including the
 * live Scratch/Python year while later courses have no edition yet.
 */
import {
  canonicalTier,
  parseBandLabel,
  parseGrades,
  type CanonicalBand,
} from '@/lib/classes/naming';

export const YOUNG_PROGRAMME = 'Young Innovators';
export const TEEN_PROGRAMME = 'Teen Developers';

export const YOUNG_COURSES = {
  helloWorld: 'Hello World: Introduction to Computers',
  scratch: 'Creative Coding with Scratch',
  safety: 'Internet Safety & Digital Citizenship',
  robots: 'Fun with Robots: Introduction to Robotics',
  art: 'Digital Art & Animation',
  showcase: 'Mini-Maker Showcase',
} as const;

export const TEEN_COURSES = {
  python: 'Python for Beginners',
  html: 'Introduction to Web Pages: HTML & CSS',
  javascript: 'JavaScript Fundamentals',
  electronics: 'Electronics & Circuits Fundamentals',
  arduino: 'Building Smart Robots with Arduino',
  apps: 'App Ideas & Prototyping',
} as const;

export type SchoolProgrammeName = typeof YOUNG_PROGRAMME | typeof TEEN_PROGRAMME;

export type SchoolCourseSpec = {
  title: string;
  levelOrder: number;
  /** Tags stored on `courses.metadata.grade_levels` and used by gradeFitFor. */
  gradeLevels: string[];
};

/** Durable sequence. Tools may change; these titles are the ones already on file. */
export const YOUNG_COURSE_SPECS: SchoolCourseSpec[] = [
  {
    title: YOUNG_COURSES.helloWorld,
    levelOrder: 1,
    gradeLevels: ['Nursery 1-3', 'Nursery 1', 'Nursery 2', 'Nursery 3', 'Basic 1'],
  },
  {
    title: YOUNG_COURSES.scratch,
    levelOrder: 2,
    gradeLevels: [
      'Nursery 1-3', 'Nursery 1', 'Nursery 2', 'Nursery 3',
      'Basic 1', 'Basic 2', 'Basic 3', 'Basic 1-3', 'Basic 1-5', 'Basic 1-6', 'Basic 2-6',
      'Basic 4', 'Basic 5', 'Basic 6', 'Basic 4-6',
    ],
  },
  {
    title: YOUNG_COURSES.safety,
    levelOrder: 3,
    gradeLevels: ['Basic 1-3', 'Basic 4-6', 'Basic 1-6', 'Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6'],
  },
  {
    title: YOUNG_COURSES.robots,
    levelOrder: 4,
    gradeLevels: ['Basic 4-6', 'Basic 4', 'Basic 5', 'Basic 6'],
  },
  {
    title: YOUNG_COURSES.art,
    levelOrder: 5,
    gradeLevels: ['Basic 4-6', 'Basic 4', 'Basic 5', 'Basic 6'],
  },
  {
    title: YOUNG_COURSES.showcase,
    levelOrder: 6,
    gradeLevels: ['Basic 4-6', 'Basic 4', 'Basic 5', 'Basic 6', 'Basic 1-6'],
  },
];

export const TEEN_COURSE_SPECS: SchoolCourseSpec[] = [
  {
    title: TEEN_COURSES.python,
    levelOrder: 1,
    // JSS is the home. SS stays until HTML has an edition. Basic 4-6 covers
    // schools that start Teen early (Greenville, Quincy).
    gradeLevels: ['JSS 1-3', 'JSS 1', 'JSS 2', 'JSS 3', 'SS 1-3', 'SS 1', 'SS 2', 'SS 3', 'Basic 4-6', 'Basic 4', 'Basic 5', 'Basic 6'],
  },
  {
    title: TEEN_COURSES.html,
    levelOrder: 2,
    gradeLevels: ['JSS 1-3', 'JSS 1', 'JSS 2', 'JSS 3', 'SS 1-3', 'SS 1', 'SS 2', 'SS 3'],
  },
  {
    title: TEEN_COURSES.javascript,
    levelOrder: 3,
    gradeLevels: ['JSS 2', 'JSS 3', 'JSS 1-3', 'SS 1-3', 'SS 1', 'SS 2', 'SS 3'],
  },
  {
    title: TEEN_COURSES.electronics,
    levelOrder: 4,
    gradeLevels: ['JSS 1-3', 'JSS 1', 'JSS 2', 'JSS 3'],
  },
  {
    title: TEEN_COURSES.arduino,
    levelOrder: 5,
    gradeLevels: ['JSS 1-3', 'JSS 2', 'JSS 3', 'SS 1'],
  },
  {
    title: TEEN_COURSES.apps,
    levelOrder: 6,
    gradeLevels: ['SS 1-3', 'SS 1', 'SS 2', 'SS 3', 'JSS 3'],
  },
];

export function isSchoolProgramme(name: string | null | undefined): name is SchoolProgrammeName {
  const tier = canonicalTier(name);
  return tier === YOUNG_PROGRAMME || tier === TEEN_PROGRAMME;
}

export function schoolProgrammeOf(name: string | null | undefined): SchoolProgrammeName | null {
  const tier = canonicalTier(name);
  if (tier === YOUNG_PROGRAMME || tier === TEEN_PROGRAMME) return tier;
  return null;
}

export function specsForProgramme(programme: string | null | undefined): SchoolCourseSpec[] {
  const tier = schoolProgrammeOf(programme);
  if (tier === YOUNG_PROGRAMME) return YOUNG_COURSE_SPECS;
  if (tier === TEEN_PROGRAMME) return TEEN_COURSE_SPECS;
  return [];
}

export function canonicalGradeLevels(programme: string | null | undefined, title: string): string[] {
  const spec = specsForProgramme(programme).find((row) => row.title === title);
  return spec?.gradeLevels ?? [];
}

export function canonicalLevelOrder(programme: string | null | undefined, title: string): number | null {
  const spec = specsForProgramme(programme).find((row) => row.title === title);
  return spec?.levelOrder ?? null;
}

/** Last " · " segment, which is where the grade/band lives on a composed class name. */
export function classNameGradeSegment(className: string | null | undefined): string {
  const raw = String(className || '').trim();
  if (!raw) return '';
  const segment = raw.includes('·') ? raw.split('·').pop()!.trim() : raw;
  return segment.replace(/\s+/g, ' ');
}

/**
 * Best band we can read from a class name. Mixed labels ("JSS 1 - SS 3",
 * "KG 3 & Basic 1 - 3") keep every parsed level so home-course rules can see them.
 */
export function bandsFromClassName(className: string | null | undefined): CanonicalBand[] {
  const segment = classNameGradeSegment(className);
  if (!segment) return [];
  const direct = parseBandLabel(segment);
  if (direct) return [direct];

  const grades = parseGrades(segment);
  if (!grades.length) return [];
  const byLvl = new Map<string, { low: number; high: number }>();
  for (const grade of grades) {
    const current = byLvl.get(grade.lvl);
    if (!current) {
      byLvl.set(grade.lvl, { low: grade.n, high: grade.n });
      continue;
    }
    current.low = Math.min(current.low, grade.n);
    current.high = Math.max(current.high, grade.n);
  }
  return [...byLvl.entries()].map(([lvl, range]) => ({
    lvl,
    low: range.low,
    high: range.high,
    label: range.low === range.high ? `${lvl} ${range.low}` : `${lvl} ${range.low}-${range.high}`,
  }));
}

function hasLevel(bands: CanonicalBand[], lvl: string): boolean {
  return bands.some((band) => band.lvl === lvl);
}

function covers(bands: CanonicalBand[], lvl: string, n: number): boolean {
  return bands.some((band) => band.lvl === lvl && band.low <= n && band.high >= n);
}

function onlyNursery(bands: CanonicalBand[]): boolean {
  return bands.length > 0 && bands.every((band) => band.lvl === 'Nursery');
}

function touchesUpperBasic(bands: CanonicalBand[]): boolean {
  return bands.some((band) => band.lvl === 'Basic' && band.high >= 4);
}

function touchesLowerBasic(bands: CanonicalBand[]): boolean {
  return bands.some((band) => band.lvl === 'Basic' && band.low <= 3);
}

/**
 * The course a NEW class in this band should open on, given what is published
 * today. Later editions (robots, HTML) stay in acceptableCourseTitles until
 * they have a live curriculum.
 */
export function homeCourseTitle(input: {
  programme?: string | null;
  className?: string | null;
  grade?: string | null;
}): string | null {
  const programme = schoolProgrammeOf(input.className) || schoolProgrammeOf(input.programme);
  const bands = [
    ...bandsFromClassName(input.className),
    ...bandsFromClassName(input.grade),
  ];
  if (!programme) return null;

  if (programme === YOUNG_PROGRAMME) {
    if (!bands.length) return null;
    // JSS/SS on a Young Innovators label is a naming error, not a Scratch class.
    if (onlyNursery(bands)) return YOUNG_COURSES.helloWorld;
    if (touchesLowerBasic(bands) || touchesUpperBasic(bands) || hasLevel(bands, 'Nursery')) {
      return YOUNG_COURSES.scratch;
    }
    return null;
  }

  return TEEN_COURSES.python;
}

export function acceptableCourseTitles(input: {
  programme?: string | null;
  className?: string | null;
  grade?: string | null;
}): string[] {
  const programme = schoolProgrammeOf(input.className) || schoolProgrammeOf(input.programme);
  const bands = [
    ...bandsFromClassName(input.className),
    ...bandsFromClassName(input.grade),
  ];
  if (!programme) return [];

  if (programme === YOUNG_PROGRAMME) {
    const titles = new Set<string>();
    if (onlyNursery(bands) || covers(bands, 'Nursery', 1) || covers(bands, 'Nursery', 3)) {
      titles.add(YOUNG_COURSES.helloWorld);
      titles.add(YOUNG_COURSES.scratch);
    }
    if (touchesLowerBasic(bands) || bands.length === 0) {
      titles.add(YOUNG_COURSES.helloWorld);
      titles.add(YOUNG_COURSES.scratch);
      titles.add(YOUNG_COURSES.safety);
    }
    if (touchesUpperBasic(bands) || bands.some((band) => band.lvl === 'Basic' && band.low === 1 && band.high >= 6)) {
      titles.add(YOUNG_COURSES.scratch);
      titles.add(YOUNG_COURSES.safety);
      titles.add(YOUNG_COURSES.robots);
      titles.add(YOUNG_COURSES.art);
      titles.add(YOUNG_COURSES.showcase);
    }
    if (titles.size === 0) titles.add(YOUNG_COURSES.scratch);
    return [...titles];
  }

  const titles = new Set<string>([TEEN_COURSES.python]);
  if (hasLevel(bands, 'JSS') || bands.length === 0 || touchesUpperBasic(bands)) {
    titles.add(TEEN_COURSES.html);
    titles.add(TEEN_COURSES.javascript);
    titles.add(TEEN_COURSES.electronics);
    titles.add(TEEN_COURSES.arduino);
  }
  if (hasLevel(bands, 'SS') || hasLevel(bands, 'JSS')) {
    titles.add(TEEN_COURSES.html);
    titles.add(TEEN_COURSES.javascript);
    titles.add(TEEN_COURSES.apps);
  }
  return [...titles];
}

export function courseFitsSchoolClass(input: {
  programme?: string | null;
  courseTitle?: string | null;
  className?: string | null;
  grade?: string | null;
}): boolean {
  const title = String(input.courseTitle || '').trim();
  if (!title) return false;
  return acceptableCourseTitles(input).includes(title);
}

