/**
 * Which course should this class teach? — decided from evidence, not from a dropdown.
 *
 * Course pickers used to list every published course in a programme, in no order, with nothing
 * to separate "the edition this school actually adopted" from "a course somebody created once
 * and never wrote a curriculum for". Young Innovators and Teen Developers each carry several
 * courses, so every class creation became a guess, and a wrong guess points the content engine
 * at a course with no curriculum — which is exactly how lessons get generated for things the
 * school does not teach.
 *
 * The database already knows the answer in almost every case:
 *   - `academic_curriculum_adoptions` — the Academic Office rolled an edition out to this school
 *   - `academic_curriculum_releases`  — a published edition exists for the course at all
 *   - `course_curricula`              — a syllabus draft exists
 *   - sibling classes at the same school already teaching a course for this band
 *   - `courses.metadata.grade_levels` — which grades the course is written for
 *
 * This module turns those into one ranked answer plus the reason for it. It follows the same
 * conservatism as `inferClassCourse`: a single adopted course is a real answer; two live
 * editions is a genuine choice and stays with a person. Silently teaching the wrong half of a
 * programme is worse than asking.
 */
import { bandForGrade, bandCoversGrade, parseBandLabel, parseGrade } from '@/lib/classes/naming';
import { matchCourseFromCatalog } from '@/lib/courses/class-course-resolution';

/** Curriculum state of a course, worst to best. The engine may only build on `adopted`/`published`. */
export type CourseCurriculumStatus = 'adopted' | 'published' | 'draft' | 'none';

/** How well a course's declared grade levels fit the band the class is for. */
export type CourseGradeFit = 'match' | 'unknown' | 'mismatch';

export type CourseSignals = {
  id: string;
  title: string;
  programId: string | null;
  programmeName?: string | null;
  levelOrder?: number | null;
  /** `courses.metadata.grade_levels` — free-form grade tags such as "Basic 1-3", "JSS 2". */
  gradeLevels?: string[];
  /** This school holds an active adoption for the course. */
  adopted?: boolean;
  /** A published release exists for the course (adoptable anywhere). */
  hasPublishedRelease?: boolean;
  /** A syllabus draft exists, published or not. */
  hasCurriculum?: boolean;
  /** Classes at this school already teaching the course. */
  classCount?: number;
  /** Classes at this school teaching it for this same grade band. */
  bandClassCount?: number;
};

export type CourseChoice = CourseSignals & {
  score: number;
  status: CourseCurriculumStatus;
  gradeFit: CourseGradeFit;
  /** Short, human reasons — rendered under the option so the pick is never a black box. */
  reasons: string[];
  /** Safe to point the content engine at (a curriculum exists to build from). */
  teachable: boolean;
};

export type RecommendationConfidence = 'certain' | 'likely' | 'ambiguous' | 'none';

export type CourseRecommendation = {
  recommended: CourseChoice | null;
  confidence: RecommendationConfidence;
  /** One sentence explaining the pick, or explaining why a person has to choose. */
  reason: string;
  /** Every candidate, best first. */
  options: CourseChoice[];
  /** Courses with no curriculum at all — listed so nobody points the engine at one unknowingly. */
  withoutCurriculum: CourseChoice[];
};

export type RecommendationInput = {
  courses: CourseSignals[];
  /** Grade or band the class is for ("Basic 5", "JSS 1-3"). */
  grade?: string | null;
  /** Class name / label, when one already exists — matched against course titles. */
  classLabel?: string | null;
  /** Course already chosen for this class; always wins. */
  currentCourseId?: string | null;
};

const WEIGHT = {
  adopted: 100,
  publishedRelease: 40,
  curriculumDraft: 8,
  bandSibling: 30,
  schoolSibling: 12,
  gradeMatch: 22,
  labelMatch: 16,
  /** Anything with no curriculum sits below everything that has one, whatever else it scores. */
  noCurriculum: -60,
  gradeMismatch: -80,
};

/** A clear winner needs this much daylight over the runner-up before we auto-apply it. */
const DECISIVE_GAP = 30;

function statusOf(course: CourseSignals): CourseCurriculumStatus {
  if (course.adopted) return 'adopted';
  if (course.hasPublishedRelease) return 'published';
  if (course.hasCurriculum) return 'draft';
  return 'none';
}

/**
 * Compare a course's declared grade tags against the class band.
 *
 * Courses are tagged loosely ("Basic 1-3", "JSS", "Basic 4") so this accepts a band label, a
 * single grade, or a bare level. An untagged course is `unknown`, never a mismatch — most
 * courses carry no tags and demoting them would bury the whole catalogue.
 */
export function gradeFitFor(course: CourseSignals, grade: string | null | undefined): CourseGradeFit {
  const tags = (course.gradeLevels ?? []).map((tag) => String(tag || '').trim()).filter(Boolean);
  if (!tags.length) return 'unknown';
  const wanted = String(grade || '').trim();
  if (!wanted) return 'unknown';

  const classBand = bandForGrade(wanted, 'fixed') || parseBandLabel(wanted);
  const classGrade = parseGrade(wanted);
  if (!classBand && !classGrade) return 'unknown';
  const classLevel = (classBand?.lvl || classGrade?.lvl || '').toUpperCase();

  let sawComparableTag = false;
  for (const tag of tags) {
    const tagBand = parseBandLabel(tag);
    if (tagBand) {
      sawComparableTag = true;
      // Overlap either way: a "Basic 1-3" course fits a "Basic 2" class and vice versa.
      if (classGrade && bandCoversGrade(tagBand, wanted)) return 'match';
      if (classBand && tagBand.lvl.toUpperCase() === classBand.lvl.toUpperCase()
        && tagBand.low <= classBand.high && tagBand.high >= classBand.low) return 'match';
      continue;
    }
    // Bare level tag ("JSS", "Basic") — level agreement is enough.
    const tagLevel = parseBandLabel(`${tag} 1`)?.lvl?.toUpperCase();
    if (tagLevel) {
      sawComparableTag = true;
      if (tagLevel === classLevel) return 'match';
    }
  }

  return sawComparableTag ? 'mismatch' : 'unknown';
}

function scoreCourse(course: CourseSignals, opts: {
  gradeFit: CourseGradeFit;
  labelMatchId: string | null;
}): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (course.adopted) {
    score += WEIGHT.adopted;
    reasons.push('This school has adopted this edition');
  } else if (course.hasPublishedRelease) {
    score += WEIGHT.publishedRelease;
    reasons.push('A published edition exists, not yet adopted here');
  } else if (course.hasCurriculum) {
    score += WEIGHT.curriculumDraft;
    reasons.push('Syllabus drafted, not published yet');
  } else {
    score += WEIGHT.noCurriculum;
    reasons.push('No curriculum yet — nothing for the engine to teach from');
  }

  const bandSiblings = course.bandClassCount ?? 0;
  const schoolSiblings = course.classCount ?? 0;
  if (bandSiblings > 0) {
    score += WEIGHT.bandSibling;
    reasons.push(`Already taught to this band here (${bandSiblings} class${bandSiblings === 1 ? '' : 'es'})`);
  } else if (schoolSiblings > 0) {
    score += WEIGHT.schoolSibling;
    reasons.push(`Taught elsewhere in this school (${schoolSiblings} class${schoolSiblings === 1 ? '' : 'es'})`);
  }

  if (opts.gradeFit === 'match') {
    score += WEIGHT.gradeMatch;
    reasons.push('Written for this grade band');
  } else if (opts.gradeFit === 'mismatch') {
    score += WEIGHT.gradeMismatch;
    reasons.push('Tagged for a different grade band');
  }

  if (opts.labelMatchId === course.id) {
    score += WEIGHT.labelMatch;
    reasons.push('Matches the class name');
  }

  // Earlier levels first when everything else ties, so a programme is entered at its start.
  score -= Math.max(0, (course.levelOrder ?? 1) - 1) * 0.5;

  return { score, reasons };
}

/**
 * Rank a programme's courses for one class and say whether the top one can be applied
 * without asking. Pure — every database read happens in the caller.
 */
export function recommendCourse(input: RecommendationInput): CourseRecommendation {
  const courses = input.courses.filter((course) => course?.id);

  const labelMatchId = input.classLabel
    ? matchCourseFromCatalog(
      input.classLabel,
      courses.map((course) => ({ id: course.id, title: course.title, program_id: course.programId, is_active: true })),
    )?.id ?? null
    : null;

  const options: CourseChoice[] = courses
    .map((course) => {
      const gradeFit = gradeFitFor(course, input.grade);
      const { score, reasons } = scoreCourse(course, { gradeFit, labelMatchId });
      const status = statusOf(course);
      return { ...course, score, status, gradeFit, reasons, teachable: status === 'adopted' || status === 'published' };
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  const withoutCurriculum = options.filter((option) => option.status === 'none');

  if (!options.length) {
    return {
      recommended: null,
      confidence: 'none',
      reason: 'This programme has no active courses yet. Add one before creating classes for it.',
      options,
      withoutCurriculum,
    };
  }

  // An explicit existing choice is never second-guessed.
  if (input.currentCourseId) {
    const chosen = options.find((option) => option.id === input.currentCourseId);
    if (chosen) {
      return {
        recommended: chosen,
        confidence: 'certain',
        reason: 'Already set for this class.',
        options,
        withoutCurriculum,
      };
    }
  }

  const eligible = options.filter((option) => option.gradeFit !== 'mismatch');
  const pool = eligible.length ? eligible : options;
  const [top, runnerUp] = pool;

  if (pool.length === 1) {
    return {
      recommended: top,
      confidence: 'certain',
      reason: top.status === 'none'
        ? `${top.title} is the only course in this programme, but it has no curriculum yet.`
        : `${top.title} is the only course this programme offers.`,
      options,
      withoutCurriculum,
    };
  }

  const adopted = pool.filter((option) => option.adopted);
  if (adopted.length === 1) {
    return {
      recommended: adopted[0],
      confidence: 'certain',
      reason: `${adopted[0].title} is the only edition this school has adopted for this programme.`,
      options,
      withoutCurriculum,
    };
  }
  if (adopted.length > 1) {
    // Two live editions is a real decision — but a band match is decisive evidence between them.
    const bandMatched = adopted.filter((option) => option.gradeFit === 'match' || (option.bandClassCount ?? 0) > 0);
    if (bandMatched.length === 1) {
      return {
        recommended: bandMatched[0],
        confidence: 'likely',
        reason: `${bandMatched[0].title} is the adopted edition for this grade band.`,
        options,
        withoutCurriculum,
      };
    }
    return {
      recommended: null,
      confidence: 'ambiguous',
      reason: `This school has adopted ${adopted.length} editions in this programme. Choose the one this class teaches.`,
      options,
      withoutCurriculum,
    };
  }

  const gap = top.score - (runnerUp?.score ?? -Infinity);
  if (top.teachable && gap >= DECISIVE_GAP) {
    return {
      recommended: top,
      confidence: 'likely',
      reason: `${top.title} is the strongest match — ${top.reasons[0]!.toLowerCase()}.`,
      options,
      withoutCurriculum,
    };
  }

  return {
    recommended: null,
    confidence: 'ambiguous',
    reason: options.every((option) => option.status === 'none')
      ? 'No course in this programme has a curriculum yet. Publish one, or choose the course this class teaches.'
      : 'Several courses fit equally. Choose the one this class teaches.',
    options,
    withoutCurriculum,
  };
}

/** Badge wording for a course's curriculum state — one vocabulary across every picker. */
export function curriculumStatusLabel(status: CourseCurriculumStatus): string {
  if (status === 'adopted') return 'Adopted here';
  if (status === 'published') return 'Published edition';
  if (status === 'draft') return 'Draft syllabus';
  return 'No curriculum';
}
