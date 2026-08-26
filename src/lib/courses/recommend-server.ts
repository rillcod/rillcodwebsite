/**
 * Server-side evidence gathering for {@link recommendCourse}.
 *
 * Kept apart from the pure ranking so the same reads back both the picker endpoint and the
 * class-creation path — a class created through the API lands on the same course the UI would
 * have proposed, instead of waiting for the nightly readiness sweep to fill it in.
 */
import { recommendCourse, type CourseRecommendation, type CourseSignals } from '@/lib/courses/course-recommendation';
import { bandForGrade, parseBandLabel } from '@/lib/classes/naming';
import { canonicalGradeLevels, canonicalLevelOrder } from '@/lib/courses/school-pathway';

type DbClient = { from: (table: string) => any };

export type CourseRecommendationScope = {
  programId: string;
  schoolId?: string | null;
  /** Grade or band the class serves ("Basic 5", "JSS 1-3"). */
  grade?: string | null;
  classLabel?: string | null;
  /** Excluded from sibling counts so a class never counts itself as evidence. */
  classId?: string | null;
  currentCourseId?: string | null;
};

function gradeLevelsOf(metadata: unknown): string[] {
  const tags = (metadata as { grade_levels?: unknown } | null)?.grade_levels;
  return Array.isArray(tags) ? tags.map((tag) => String(tag || '').trim()).filter(Boolean) : [];
}

export async function loadCourseRecommendation(
  db: DbClient,
  scope: CourseRecommendationScope,
): Promise<CourseRecommendation> {
  const { programId, schoolId, grade, classLabel, classId, currentCourseId } = scope;

  const empty = () => recommendCourse({
    courses: [],
    grade,
    classLabel,
    currentCourseId,
  });
  if (!programId) return empty();

  let courseQuery = db
    .from('courses')
    .select('id,title,program_id,is_active,level_order,school_id,metadata,programs(name)')
    .eq('program_id', programId)
    .eq('is_active', true);
  // Same tenancy rule the course list has always used: global courses plus this school's
  // own. Without it this helper would widen every picker it replaced to other schools' courses.
  if (schoolId) courseQuery = courseQuery.or(`school_id.eq.${schoolId},school_id.is.null`);
  const { data: courseRows, error } = await courseQuery.order('level_order', { ascending: true });
  if (error) throw new Error(error.message);

  const courses = (courseRows ?? []) as any[];
  const courseIds = courses.map((row) => String(row.id));
  if (!courseIds.length) return empty();

  const [adoptionsRes, releasesRes, curriculaRes, classesRes] = await Promise.all([
    schoolId
      ? db.from('academic_curriculum_adoptions')
        .select('course_id')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .in('course_id', courseIds)
      : Promise.resolve({ data: [] }),
    db.from('academic_curriculum_releases')
      .select('course_id')
      .eq('status', 'published')
      .in('course_id', courseIds),
    db.from('course_curricula')
      .select('course_id')
      .in('course_id', courseIds),
    schoolId
      ? db.from('classes')
        .select('id,name,current_course_id')
        .eq('school_id', schoolId)
        .in('current_course_id', courseIds)
        .or('status.is.null,status.neq.archived')
      : Promise.resolve({ data: [] }),
  ]);

  const adopted = new Set(((adoptionsRes.data ?? []) as any[]).map((row) => String(row.course_id)));
  const released = new Set(((releasesRes.data ?? []) as any[]).map((row) => String(row.course_id)));
  const withSyllabus = new Set(((curriculaRes.data ?? []) as any[]).map((row) => String(row.course_id)));

  // Sibling classes, split by whether they serve the same band as the one being created.
  const wantedBand = grade ? (bandForGrade(grade, 'fixed') || parseBandLabel(grade)) : null;
  const classCount = new Map<string, number>();
  const bandClassCount = new Map<string, number>();
  for (const row of (classesRes.data ?? []) as any[]) {
    const courseId = String(row.current_course_id || '');
    if (!courseId) continue;
    if (classId && String(row.id) === classId) continue;
    classCount.set(courseId, (classCount.get(courseId) ?? 0) + 1);
    if (!wantedBand) continue;
    const rowBand = parseBandLabel(String(row.name || '').split('·').pop()?.trim() || '');
    const overlaps = rowBand
      && rowBand.lvl.toUpperCase() === wantedBand.lvl.toUpperCase()
      && rowBand.low <= wantedBand.high
      && rowBand.high >= wantedBand.low;
    if (overlaps) bandClassCount.set(courseId, (bandClassCount.get(courseId) ?? 0) + 1);
  }

  const signals: CourseSignals[] = courses.map((row) => {
    const id = String(row.id);
    const programme = Array.isArray(row.programs) ? row.programs[0] : row.programs;
    const programmeName = programme?.name ? String(programme.name) : null;
    const title = String(row.title || 'Untitled course');
    return {
      id,
      title,
      programId: row.program_id ? String(row.program_id) : null,
      programmeName,
      levelOrder: canonicalLevelOrder(programmeName, title)
        ?? (typeof row.level_order === 'number' ? row.level_order : null),
      gradeLevels: gradeLevelsOf(row.metadata).length
        ? gradeLevelsOf(row.metadata)
        : canonicalGradeLevels(programmeName, title),
      adopted: adopted.has(id),
      hasPublishedRelease: released.has(id),
      hasCurriculum: withSyllabus.has(id) || released.has(id),
      classCount: classCount.get(id) ?? 0,
      bandClassCount: bandClassCount.get(id) ?? 0,
    };
  });

  return recommendCourse({ courses: signals, grade, classLabel, currentCourseId });
}
