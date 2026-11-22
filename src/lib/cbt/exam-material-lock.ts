import type { SupabaseClient } from '@supabase/supabase-js';
import { extractStoragePathFromMediaUrl } from '@/lib/files/compress-student-image';

export interface ActiveExamLockRecord {
  id: string;
  title: string;
  course_id?: string | null;
  class_id?: string | null;
  school_id?: string | null;
  lesson_id?: string | null;
  is_active?: boolean | null;
  start_date?: string | null;
  end_date?: string | null;
  metadata?: Record<string, any> | null;
}

export interface MaterialLockResult {
  locked: boolean;
  examId?: string;
  examTitle?: string;
  unlocksAt?: string | null;
  reason?: string;
}

/** True when an exam is currently live (active and inside its scheduled window, if any). */
export function isExamCurrentlyLive(exam: ActiveExamLockRecord, nowMs = Date.now()): boolean {
  if (!exam?.is_active) return false;
  const startMs = exam.start_date ? new Date(exam.start_date).getTime() : Number.NEGATIVE_INFINITY;
  const endMs = exam.end_date ? new Date(exam.end_date).getTime() : Number.POSITIVE_INFINITY;
  if (Number.isFinite(startMs) && nowMs < startMs) return false;
  if (Number.isFinite(endMs) && nowMs > endMs) return false;
  return true;
}

/**
 * Pure matcher: checks whether a given lesson, course, or media path is locked
 * by any currently live exam (applies across ALL student accounts & devices).
 */
export function findBlockingExamForMaterial(
  liveExams: ActiveExamLockRecord[],
  target: {
    lessonId?: string | null;
    courseId?: string | null;
    mediaPath?: string | null;
  },
  nowMs = Date.now(),
): MaterialLockResult {
  const normMedia = target.mediaPath ? target.mediaPath.replace(/^\/+/, '').toLowerCase() : '';

  for (const exam of liveExams) {
    if (!isExamCurrentlyLive(exam, nowMs)) continue;
    const meta = exam.metadata && typeof exam.metadata === 'object' ? exam.metadata : {};
    // Practice-only exams never lock study materials
    if (meta.assessment_scope === 'practice' || meta.result_eligible === false) continue;
    // Allow explicit opt-out only if teacher turned locking off
    if (meta.lock_materials_during_exam === false) continue;

    const refLessonIds = new Set<string>(
      [
        ...(Array.isArray(meta.referenced_lesson_ids) ? meta.referenced_lesson_ids : []),
        ...(exam.lesson_id ? [exam.lesson_id] : []),
      ]
        .map((id) => String(id ?? '').trim())
        .filter(Boolean),
    );

    const refMediaPaths = new Set<string>(
      (Array.isArray(meta.referenced_material_urls) ? meta.referenced_material_urls : [])
        .map((u: unknown) => {
          const s = String(u ?? '').trim();
          const extracted = extractStoragePathFromMediaUrl(s) || s;
          return extracted.replace(/^\/+/, '').toLowerCase();
        })
        .filter(Boolean),
    );

    const matchesLesson = Boolean(target.lessonId && refLessonIds.has(target.lessonId));
    const matchesMedia = Boolean(normMedia && refMediaPaths.has(normMedia));
    const matchesCourse = Boolean(
      target.courseId &&
        exam.course_id &&
        exam.course_id === target.courseId &&
        meta.lock_course_materials !== false,
    );

    if (matchesLesson || matchesMedia || matchesCourse) {
      return {
        locked: true,
        examId: exam.id,
        examTitle: exam.title || 'Active Examination',
        unlocksAt: exam.end_date ?? null,
        reason: `Study materials are locked across all student accounts while "${exam.title || 'an examination'}" is live.`,
      };
    }
  }

  return { locked: false };
}

/**
 * Server-side DB check used by lesson pages, learning hub, and `/api/media/[...key]`.
 * Teachers/admins are never blocked; ALL student accounts are blocked during live exams.
 */
export async function checkExamMaterialLock(
  admin: SupabaseClient<any>,
  params: {
    userRole: string;
    lessonId?: string | null;
    courseId?: string | null;
    mediaPath?: string | null;
  },
): Promise<MaterialLockResult> {
  const role = (params.userRole || '').toLowerCase();
  // Staff can always inspect, teach, and grade materials
  if (role === 'admin' || role === 'teacher' || role === 'school') {
    return { locked: false };
  }

  // Load all active exams (cross-account: locks apply to EVERY student account during a live exam)
  const { data: activeExams } = await admin
    .from('cbt_exams')
    .select('id, title, course_id, class_id, school_id, lesson_id, is_active, start_date, end_date, metadata')
    .eq('is_active', true)
    .limit(200);

  const liveExams = (activeExams ?? []) as ActiveExamLockRecord[];
  if (liveExams.length === 0) return { locked: false };

  // Global check (e.g. AI Study Assistant or Learning Hub banner): if no specific
  // lesson/course/media was passed, check if ANY official exam with locking enabled is live.
  if (!params.lessonId && !params.courseId && !params.mediaPath) {
    const anyLive = liveExams.find((exam) => {
      if (!isExamCurrentlyLive(exam)) return false;
      const meta = exam.metadata && typeof exam.metadata === 'object' ? exam.metadata : {};
      if (meta.assessment_scope === 'practice' || meta.result_eligible === false) return false;
      if (meta.lock_materials_during_exam === false) return false;
      return true;
    });
    if (anyLive) {
      return {
        locked: true,
        examId: anyLive.id,
        examTitle: anyLive.title || 'Active Examination',
        unlocksAt: anyLive.end_date ?? null,
        reason: `Study materials and AI Study Assistant are locked across all student accounts while "${anyLive.title || 'an examination'}" is live.`,
      };
    }
    return { locked: false };
  }

  // Also resolve courseId from lessonId if only lessonId was provided
  let resolvedCourseId = params.courseId ?? null;
  if (!resolvedCourseId && params.lessonId) {
    const { data: lessonRow } = await admin
      .from('lessons')
      .select('course_id')
      .eq('id', params.lessonId)
      .maybeSingle();
    resolvedCourseId = lessonRow?.course_id ?? null;
  }

  // Direct match on lesson, course, or referenced material URL
  const direct = findBlockingExamForMaterial(liveExams, {
    lessonId: params.lessonId,
    courseId: resolvedCourseId,
    mediaPath: params.mediaPath,
  });
  if (direct.locked) return direct;

  // If checking a direct media file path, also verify if that file belongs to a locked lesson_materials row
  if (params.mediaPath) {
    const normPath = params.mediaPath.replace(/^\/+/, '');
    const { data: mats } = await admin
      .from('lesson_materials')
      .select('lesson_id, file_url')
      .ilike('file_url', `%${normPath}%`)
      .limit(10);

    for (const mat of mats ?? []) {
      if (!mat?.lesson_id) continue;
      const { data: lessonRow } = await admin
        .from('lessons')
        .select('id, course_id')
        .eq('id', mat.lesson_id)
        .maybeSingle();
      if (lessonRow) {
        const viaMat = findBlockingExamForMaterial(liveExams, {
          lessonId: lessonRow.id,
          courseId: lessonRow.course_id,
          mediaPath: normPath,
        });
        if (viaMat.locked) return viaMat;
      }
    }
  }

  return { locked: false };
}
