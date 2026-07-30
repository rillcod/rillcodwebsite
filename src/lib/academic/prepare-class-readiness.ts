import { createAdminClient } from '@/lib/supabase/admin';

/** Run academic-readiness for a single class (teaching plan, teacher, auto-gen settings). */
export async function runClassAcademicReadiness(classId: string): Promise<void> {
  if (!classId) return;
  try {
    const { runAcademicReadinessAutomation } = await import('@/lib/academic/readiness-automation');
    await runAcademicReadinessAutomation(createAdminClient() as any, { classIds: [classId], limit: 1 });
  } catch (error) {
    console.error('[academic-readiness] class preparation failed:', classId, error);
  }
}
