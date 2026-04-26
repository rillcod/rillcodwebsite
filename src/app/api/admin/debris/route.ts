import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!data || !['admin', 'teacher'].includes(data.role)) return null;
  return { id: user.id, role: data.role as string, school_id: data.school_id as string | null };
}

// GET /api/admin/debris
// Returns counts of orphaned lessons and assignments whose lesson_plan_id
// in metadata points to a plan that no longer exists.
export async function GET() {
  const actor = await requireStaff();
  if (!actor) return NextResponse.json({ error: 'Staff only' }, { status: 403 });

  const db = createAdminClient();

  // Fetch all existing lesson plan IDs scoped to this staff member's school if teacher
  let plansQuery = db.from('lesson_plans').select('id');
  if (actor.role === 'teacher' && actor.school_id) {
    plansQuery = plansQuery.eq('school_id', actor.school_id) as typeof plansQuery;
  }
  const { data: plans } = await plansQuery;
  const planIds = new Set((plans ?? []).map((p: { id: string }) => p.id));

  // Fetch lessons that have a lesson_plan_id in metadata (scoped by school for teacher)
  let lessonsQuery = db
    .from('lessons')
    .select('id, title, metadata')
    .not('metadata', 'is', null)
    .filter('metadata->>lesson_plan_id', 'neq', '');
  if (actor.role === 'teacher' && actor.school_id) {
    lessonsQuery = lessonsQuery.eq('school_id', actor.school_id) as typeof lessonsQuery;
  }
  const { data: lessons } = await lessonsQuery;

  const orphanedLessons = (lessons ?? []).filter((l: { metadata: unknown }) => {
    const meta = l.metadata as Record<string, unknown> | null;
    const lpId = meta?.lesson_plan_id as string | undefined;
    return lpId && !planIds.has(lpId);
  });

  // Fetch assignments that have a lesson_plan_id in metadata (scoped by school for teacher)
  let assignmentsQuery = db
    .from('assignments')
    .select('id, title, metadata')
    .not('metadata', 'is', null)
    .filter('metadata->>lesson_plan_id', 'neq', '');
  if (actor.role === 'teacher' && actor.school_id) {
    assignmentsQuery = assignmentsQuery.eq('school_id', actor.school_id) as typeof assignmentsQuery;
  }
  const { data: assignments } = await assignmentsQuery;

  const orphanedAssignments = (assignments ?? []).filter((a: { metadata: unknown }) => {
    const meta = a.metadata as Record<string, unknown> | null;
    const lpId = meta?.lesson_plan_id as string | undefined;
    return lpId && !planIds.has(lpId);
  });

  return NextResponse.json({
    debris: {
      lessons: {
        count: orphanedLessons.length,
        items: orphanedLessons.map((l: { id: string; title: string; metadata: unknown }) => ({
          id: l.id,
          title: l.title,
          orphaned_plan_id: (l.metadata as Record<string, unknown>).lesson_plan_id,
        })),
      },
      assignments: {
        count: orphanedAssignments.length,
        items: orphanedAssignments.map((a: { id: string; title: string; metadata: unknown }) => ({
          id: a.id,
          title: a.title,
          orphaned_plan_id: (a.metadata as Record<string, unknown>).lesson_plan_id,
        })),
      },
      total: orphanedLessons.length + orphanedAssignments.length,
    },
  });
}

// DELETE /api/admin/debris
// Removes all orphaned lessons and assignments.
// Pass ?dry_run=true to only count without deleting.
export async function DELETE(req: Request) {
  const actor = await requireStaff();
  if (!actor) return NextResponse.json({ error: 'Staff only' }, { status: 403 });

  const dryRun = new URL(req.url).searchParams.get('dry_run') === 'true';
  const db = createAdminClient();

  const { data: plans } = await db.from('lesson_plans').select('id');
  const planIds = new Set((plans ?? []).map((p: { id: string }) => p.id));

  const { data: lessons } = await db
    .from('lessons')
    .select('id, metadata')
    .not('metadata', 'is', null)
    .filter('metadata->>lesson_plan_id', 'neq', '');

  const orphanedLessonIds = (lessons ?? [])
    .filter((l: { metadata: unknown }) => {
      const meta = l.metadata as Record<string, unknown> | null;
      const lpId = meta?.lesson_plan_id as string | undefined;
      return lpId && !planIds.has(lpId);
    })
    .map((l: { id: string }) => l.id);

  const { data: assignments } = await db
    .from('assignments')
    .select('id, metadata')
    .not('metadata', 'is', null)
    .filter('metadata->>lesson_plan_id', 'neq', '');

  const orphanedAssignmentIds = (assignments ?? [])
    .filter((a: { metadata: unknown }) => {
      const meta = a.metadata as Record<string, unknown> | null;
      const lpId = meta?.lesson_plan_id as string | undefined;
      return lpId && !planIds.has(lpId);
    })
    .map((a: { id: string }) => a.id);

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      would_delete: {
        lessons: orphanedLessonIds.length,
        assignments: orphanedAssignmentIds.length,
      },
    });
  }

  let deletedLessons = 0;
  let deletedAssignments = 0;

  if (orphanedLessonIds.length > 0) {
    const { error } = await db.from('lessons').delete().in('id', orphanedLessonIds);
    if (!error) deletedLessons = orphanedLessonIds.length;
  }

  if (orphanedAssignmentIds.length > 0) {
    const { error } = await db.from('assignments').delete().in('id', orphanedAssignmentIds);
    if (!error) deletedAssignments = orphanedAssignmentIds.length;
  }

  return NextResponse.json({
    deleted: { lessons: deletedLessons, assignments: deletedAssignments },
  });
}
