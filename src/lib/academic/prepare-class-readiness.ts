import { createAdminClient } from '@/lib/supabase/admin';
import { bootstrapClassTeachingWeek } from '@/lib/academic/bootstrap-class-week';

/**
 * Run academic-readiness for a single class, then generate its first teachable week.
 *
 * Throws on failure. `prepareTeaching` awaits this and turns the throw into an
 * `ok: false` result the caller can report, which is the whole reason a failure
 * must not be swallowed here.
 *
 * Never call this bare from a background context — a rejected promise nobody
 * awaits is an unhandled rejection. Queue it through
 * `queuePrepareTeaching({ pathway: 'school', classId })` instead, which is the
 * one boundary that knows how to run preparation without failing its caller.
 */
export async function runClassAcademicReadiness(classId: string): Promise<void> {
  if (!classId) return;
  try {
    const { runAcademicReadinessAutomation } = await import('@/lib/academic/readiness-automation');
    await runAcademicReadinessAutomation(createAdminClient() as any, { classIds: [classId], limit: 1 });
    await bootstrapClassTeachingWeek(classId);
  } catch (error) {
    console.error('[academic-readiness] class preparation failed:', classId, error);
    throw error;
  }
}

