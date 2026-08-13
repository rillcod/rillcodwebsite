import { createAdminClient } from '@/lib/supabase/admin';
import { bootstrapClassTeachingWeek } from '@/lib/academic/bootstrap-class-week';

/** Run academic-readiness for a single class, then generate Week 1 content. */
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
