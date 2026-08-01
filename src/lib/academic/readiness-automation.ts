import { selectAutomaticClassTeacher } from '@/lib/classes/teacher-allocation';
import { describeInference, inferClassCourse } from '@/lib/academic/infer-class-course';
import {
  mapOfficialCurriculumToCalendarWeeks,
  resolveOfficialCurriculumDirection,
  resolveOfficialDeliverySchedule,
} from '@/lib/curriculum/official-direction';
import { humanEntryPoint, humanTermLabel } from '@/lib/academic/labels';

type DbClient = { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => any };

type AcademicClass = {
  id: string;
  name: string;
  school_id: string;
  teacher_id: string | null;
  program_id: string | null;
  current_course_id: string | null;
  term_id: string | null;
  offering_period_id: string | null;
  academic_offering_id: string | null;
  academic_terms?: any;
  academic_offering_periods?: any;
};

export type AcademicAutomationIssue = {
  classId: string;
  className: string;
  code: 'no_teacher' | 'no_course' | 'no_period' | 'no_direction' | 'notification_failed' | 'automation_failed';
  message: string;
};

export type AcademicAutomationReport = {
  scanned: number;
  teachersAssigned: number;
  coursesInferred: number;
  plansCreated: number;
  plansRefreshed: number;
  issues: AcademicAutomationIssue[];
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

async function teacherCanOwnClass(db: DbClient, teacherId: string | null, schoolId: string): Promise<boolean> {
  if (!teacherId) return false;
  const { data: teacher } = await db.from('portal_users')
    .select('id,role,school_id,is_active,is_deleted')
    .eq('id', teacherId)
    .maybeSingle();
  if (!teacher || teacher.role !== 'teacher' || teacher.is_active === false || teacher.is_deleted === true) return false;
  if (teacher.school_id === schoolId) return true;
  const { data } = await db.from('teacher_schools')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('school_id', schoolId)
    .maybeSingle();
  return Boolean(data);
}

function issue(
  report: AcademicAutomationReport,
  klass: AcademicClass,
  code: AcademicAutomationIssue['code'],
  message: string,
) {
  report.issues.push({ classId: klass.id, className: klass.name, code, message });
}

export async function runAcademicReadinessAutomation(
  db: DbClient,
  scope: { classIds?: string[]; offeringId?: string; courseId?: string; limit?: number } = {},
): Promise<AcademicAutomationReport> {
  const report: AcademicAutomationReport = {
    scanned: 0,
    teachersAssigned: 0,
    coursesInferred: 0,
    plansCreated: 0,
    plansRefreshed: 0,
    issues: [],
  };

  let query = db.from('classes').select(
    'id,name,school_id,teacher_id,program_id,current_course_id,term_id,offering_period_id,academic_offering_id,status,academic_terms(academic_year,term_number),academic_offering_periods(label)',
  ).or('status.is.null,status.neq.archived').limit(Math.min(Math.max(scope.limit ?? 200, 1), 500));
  if (scope.classIds?.length) query = query.in('id', scope.classIds);
  if (scope.offeringId) query = query.eq('academic_offering_id', scope.offeringId);
  if (scope.courseId) query = query.eq('current_course_id', scope.courseId);

  const { data: rows, error: classError } = await query;
  if (classError) throw new Error(`Academic readiness could not read classes: ${classError.message}`);
  const classes = (rows ?? []) as AcademicClass[];
  report.scanned = classes.length;

  const programIds = Array.from(new Set(classes.map((klass) => klass.program_id).filter(Boolean))) as string[];
  const { data: courseRows, error: courseError } = programIds.length
    ? await db.from('courses').select('id,program_id').in('program_id', programIds)
    : { data: [], error: null };
  if (courseError) throw new Error(`Academic readiness could not read programme courses: ${courseError.message}`);
  const coursesByProgram = new Map<string, string[]>();
  for (const row of courseRows ?? []) {
    const list = coursesByProgram.get(row.program_id) ?? [];
    list.push(row.id);
    coursesByProgram.set(row.program_id, list);
  }

  // Which courses each school actually holds a live edition for. This is what lets a class in a
  // multi-course programme be resolved without asking anyone: if only one of the programme's
  // courses has been published and adopted by the school, that is the course the class teaches.
  const schoolIds = Array.from(new Set(classes.map((klass) => klass.school_id).filter(Boolean))) as string[];
  const { data: adoptionRows, error: adoptionError } = schoolIds.length
    ? await db
      .from('academic_curriculum_adoptions')
      .select('school_id,course_id')
      .in('school_id', schoolIds)
      .eq('status', 'active')
    : { data: [], error: null };
  if (adoptionError) {
    throw new Error(`Academic readiness could not read school curriculum adoptions: ${adoptionError.message}`);
  }
  const adoptedCoursesBySchool = new Map<string, string[]>();
  for (const row of adoptionRows ?? []) {
    const list = adoptedCoursesBySchool.get(row.school_id) ?? [];
    list.push(row.course_id);
    adoptedCoursesBySchool.set(row.school_id, list);
  }

  for (const klass of classes) {
    try {
      let teacherId = klass.teacher_id;
      if (!await teacherCanOwnClass(db, teacherId, klass.school_id)) {
        const candidate = await selectAutomaticClassTeacher(db, klass.school_id);
        if (!candidate) {
          issue(report, klass, 'no_teacher', 'No active teacher is assigned to this school yet.');
          continue;
        }
        const { error: ownerError } = await db.from('classes')
          .update({ teacher_id: candidate.id, updated_at: new Date().toISOString() })
          .eq('id', klass.id);
        if (ownerError) throw new Error(ownerError.message);
        teacherId = candidate.id;
        report.teachersAssigned += 1;
      }

      const programmeCourses = klass.program_id ? coursesByProgram.get(klass.program_id) ?? [] : [];
      const adoptedCourses = klass.school_id ? adoptedCoursesBySchool.get(klass.school_id) ?? [] : [];
      const inference = inferClassCourse({
        currentCourseId: klass.current_course_id,
        programmeCourses,
        adoptedCourseIds: adoptedCourses,
      });
      let courseId = inference.courseId;

      if (courseId && inference.reason !== 'already_set') {
        const { error: courseUpdateError } = await db.from('classes')
          .update({ current_course_id: courseId, updated_at: new Date().toISOString() })
          .eq('id', klass.id);
        if (courseUpdateError) throw new Error(courseUpdateError.message);
        report.coursesInferred += 1;
      }
      if (!courseId) {
        const adoptedInProgramme = programmeCourses.filter((id) => adoptedCourses.includes(id)).length;
        issue(report, klass, 'no_course', describeInference(inference, adoptedInProgramme));
        continue;
      }
      if (!klass.term_id && !klass.offering_period_id) {
        issue(report, klass, 'no_period', 'Give this class an academic term or a delivery period.');
        continue;
      }

      const term = one<any>(klass.academic_terms);
      const period = one<any>(klass.academic_offering_periods);
      const { data: existing } = await db.from('lesson_plans')
        .select('id,curriculum_release_id,plan_data,metadata')
        .eq('class_id', klass.id)
        .eq('course_id', courseId)
        .eq(klass.term_id ? 'term_id' : 'offering_period_id', klass.term_id ?? klass.offering_period_id)
        .neq('status', 'archived')
        .limit(1)
        .maybeSingle();

      const direction = await resolveOfficialCurriculumDirection(db, {
        schoolId: klass.school_id,
        offeringId: klass.academic_offering_id,
        courseId,
        academicSession: term?.academic_year ?? null,
        academicTermNumber: term?.term_number ?? null,
        pinnedReleaseId: existing?.curriculum_release_id ?? null,
      });
      if (!direction) {
        issue(report, klass, 'no_direction', 'The Academic Office has not assigned an official edition to this pathway and course.');
        continue;
      }

      const schedule = (await resolveOfficialDeliverySchedule(db, {
        schoolId: klass.school_id,
        classId: klass.id,
        courseId,
        releaseId: direction.id,
      })) ?? {
        entry_term_number: direction.effective_term_number ?? term?.term_number ?? 1,
        entry_week_number: 1,
        curriculum_year_number: 1,
        curriculum_term_number: 1,
        curriculum_week_number: 1,
        sessions_per_week: 1,
      };

      const { data: ensured, error: ensureError } = await db.rpc('ensure_class_teaching_plan', {
        p_class_id: klass.id,
        p_course_id: courseId,
        p_curriculum_version_id: direction.source_curriculum_id,
        p_actor_id: teacherId,
        p_academic_term_id: klass.term_id,
        p_offering_period_id: klass.term_id ? null : klass.offering_period_id,
        p_sessions_per_week: Number(schedule.sessions_per_week) || 1,
      });
      if (ensureError) throw new Error(ensureError.message);
      const result = ensured as { plan_id: string; created: boolean };

      const currentPlanData = existing?.plan_data && typeof existing.plan_data === 'object' ? existing.plan_data : {};
      const currentMetadata = existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
      const alreadyHasWeeks = Array.isArray((currentPlanData as any).weeks) && (currentPlanData as any).weeks.length > 0;
      if (result.created || !alreadyHasWeeks || !existing?.curriculum_release_id) {
        const calendarTerm = klass.term_id
          ? Number(term?.term_number) || 1
          : Number(schedule.entry_term_number) || 1;
        const currentSession = klass.term_id ? term?.academic_year ?? null : direction.academic_session;
        const weeks = mapOfficialCurriculumToCalendarWeeks({
          content: direction.content,
          directionAcademicSession: direction.academic_session,
          currentAcademicSession: currentSession,
          calendarTerm,
          schedule,
        });
        const { error: planUpdateError } = await db.from('lesson_plans').update({
          curriculum_release_id: direction.id,
          curriculum_version_id: direction.source_curriculum_id,
          plan_data: {
            ...(currentPlanData as Record<string, unknown>),
            academic_direction: {
              title: direction.title,
              academic_session: direction.academic_session,
              entry_point: humanEntryPoint({
                termNumber: Number(schedule.entry_term_number) || 1,
                weekNumber: Number(schedule.entry_week_number) || 1,
              }),
              current_term: klass.term_id
                ? humanTermLabel(Number(term?.term_number) || 1)
                : period?.label ?? 'Delivery period',
            },
            starts_at_week: Number(schedule.entry_week_number) || 1,
            ...(alreadyHasWeeks ? {} : { weeks }),
          },
          metadata: {
            ...(currentMetadata as Record<string, unknown>),
            academic_automation: { prepared_at: new Date().toISOString(), source: 'official_direction' },
            auto_generate_settings: (currentMetadata as any).auto_generate_settings ?? {
              enabled: true,
              types: ['lessons', 'assignments', 'projects'],
              maxWeeksPerBatch: 1,
            },
          },
          updated_at: new Date().toISOString(),
        }).eq('id', result.plan_id);
        if (planUpdateError) throw new Error(planUpdateError.message);
        if (result.created) report.plansCreated += 1;
        else report.plansRefreshed += 1;
      }

      if (result.created && teacherId) {
        const { error: notificationError } = await db.from('notifications').insert({
          user_id: teacherId,
          title: 'Your class teaching plan is ready',
          message: `${klass.name} now follows ${direction.title}. Review the prepared weeks, adapt them for your learners, then publish when ready.`,
          type: 'info',
          action_url: `/dashboard/classes/${klass.id}?operation=teaching&course_id=${courseId}`,
          is_read: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (notificationError) {
          issue(report, klass, 'notification_failed', `The plan is ready, but the teacher alert could not be saved: ${notificationError.message}`);
        }
      }
    } catch (error) {
      issue(report, klass, 'automation_failed', error instanceof Error ? error.message : 'Academic automation failed.');
    }
  }

  return report;
}
