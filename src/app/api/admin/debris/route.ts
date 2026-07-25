import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('id, role, full_name').eq('id', user.id).single();
  if (!data || data.role !== 'admin') return null;
  return { id: user.id, full_name: data.full_name };
}

// GET /api/admin/debris — inspect legacy debris, orphaned records, and dead fragments for system sanitization
export async function GET() {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const db = createAdminClient();

  // 1. Orphaned Lessons & Assignments (Metadata points to deleted lesson plan)
  const { data: plans } = await db.from('lesson_plans').select('id');
  const planIds = new Set((plans ?? []).map((p: { id: string }) => p.id));

  const { data: lessons } = await db
    .from('lessons')
    .select('id, title, metadata, created_at')
    .not('metadata', 'is', null)
    .filter('metadata->>lesson_plan_id', 'neq', '');

  const orphanedLessons = (lessons ?? []).filter((l: { metadata: unknown }) => {
    const meta = l.metadata as Record<string, unknown> | null;
    const lpId = meta?.lesson_plan_id as string | undefined;
    return lpId && !planIds.has(lpId);
  });

  const { data: assignments } = await db
    .from('assignments')
    .select('id, title, metadata, created_at')
    .not('metadata', 'is', null)
    .filter('metadata->>lesson_plan_id', 'neq', '');

  const orphanedAssignments = (assignments ?? []).filter((a: { metadata: unknown }) => {
    const meta = a.metadata as Record<string, unknown> | null;
    const lpId = meta?.lesson_plan_id as string | undefined;
    return lpId && !planIds.has(lpId);
  });

  // 2. Soft-deleted student/user accounts in portal_users (is_deleted = true)
  const { data: deletedUsers } = await db
    .from('portal_users')
    .select('id, full_name, email, role, created_at')
    .eq('is_deleted', true);

  // 3. Empty classes with 0 students
  const { data: allClasses } = await db.from('classes').select('id, name');
  const { data: userClasses } = await db.from('portal_users').select('class_id').not('class_id', 'is', null);
  const activeClassIds = new Set((userClasses ?? []).map((u: any) => u.class_id));

  const emptyClasses = (allClasses ?? []).filter((c: any) => !activeClassIds.has(c.id));

  // 4. Disconnected Parent Links (Parent or student account deleted)
  const { data: parentLinks } = await db.from('parent_student_links').select('id, parent_id, student_id');
  const { data: validUsers } = await db.from('portal_users').select('id');
  const validUserIds = new Set((validUsers ?? []).map((v: any) => v.id));

  const disconnectedLinks = (parentLinks ?? []).filter((link: any) => !validUserIds.has(link.parent_id));

  return NextResponse.json({
    debris: {
      orphaned_lessons: { count: orphanedLessons.length, items: orphanedLessons },
      orphaned_assignments: { count: orphanedAssignments.length, items: orphanedAssignments },
      deleted_accounts: { count: (deletedUsers ?? []).length, items: deletedUsers ?? [] },
      empty_classes: { count: emptyClasses.length, items: emptyClasses },
      disconnected_links: { count: disconnectedLinks.length, items: disconnectedLinks },
      total_items: orphanedLessons.length + orphanedAssignments.length + (deletedUsers ?? []).length + emptyClasses.length + disconnectedLinks.length,
    },
  });
}

// DELETE /api/admin/debris — execute system sanitization & audit trail record
export async function DELETE(req: Request) {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === 'true';
  const purgeType = url.searchParams.get('type') || 'all';

  const db = createAdminClient();

  // 1. Fetch orphaned lessons & assignments
  const { data: plans } = await db.from('lesson_plans').select('id');
  const planIds = new Set((plans ?? []).map((p: { id: string }) => p.id));

  const { data: lessons } = await db.from('lessons').select('id, metadata').not('metadata', 'is', null).filter('metadata->>lesson_plan_id', 'neq', '');
  const orphanedLessonIds = (lessons ?? []).filter((l: any) => l.metadata?.lesson_plan_id && !planIds.has(l.metadata.lesson_plan_id)).map((l: any) => l.id);

  const { data: assignments } = await db.from('assignments').select('id, metadata').not('metadata', 'is', null).filter('metadata->>lesson_plan_id', 'neq', '');
  const orphanedAssignmentIds = (assignments ?? []).filter((a: any) => a.metadata?.lesson_plan_id && !planIds.has(a.metadata.lesson_plan_id)).map((a: any) => a.id);

  // 2. Fetch soft-deleted users
  const { data: deletedUsers } = await db.from('portal_users').select('id').eq('is_deleted', true);
  const deletedUserIds = (deletedUsers ?? []).map((u: any) => u.id);

  // 3. Fetch disconnected parent links
  const { data: parentLinks } = await db.from('parent_student_links').select('id, parent_id');
  const { data: validUsers } = await db.from('portal_users').select('id');
  const validUserIds = new Set((validUsers ?? []).map((v: any) => v.id));
  const disconnectedLinkIds = (parentLinks ?? []).filter((l: any) => !validUserIds.has(l.parent_id)).map((l: any) => l.id);

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      would_purge: {
        orphaned_lessons: orphanedLessonIds.length,
        orphaned_assignments: orphanedAssignmentIds.length,
        deleted_accounts: deletedUserIds.length,
        disconnected_links: disconnectedLinkIds.length,
      },
    });
  }

  let purgedCount = 0;

  if ((purgeType === 'all' || purgeType === 'orphaned') && orphanedLessonIds.length > 0) {
    await db.from('lessons').delete().in('id', orphanedLessonIds);
    purgedCount += orphanedLessonIds.length;
  }

  if ((purgeType === 'all' || purgeType === 'orphaned') && orphanedAssignmentIds.length > 0) {
    await db.from('assignments').delete().in('id', orphanedAssignmentIds);
    purgedCount += orphanedAssignmentIds.length;
  }

  if ((purgeType === 'all' || purgeType === 'deleted_accounts') && deletedUserIds.length > 0) {
    await db.from('portal_users').delete().in('id', deletedUserIds);
    purgedCount += deletedUserIds.length;
  }

  if ((purgeType === 'all' || purgeType === 'disconnected_links') && disconnectedLinkIds.length > 0) {
    await db.from('parent_student_links').delete().in('id', disconnectedLinkIds);
    purgedCount += disconnectedLinkIds.length;
  }

  // Audit trail record for complete system sanitization
  await logAudit(db, {
    action: 'system_sanitization_purge_executed',
    actorId: actor.id,
    newValues: {
      actor_name: actor.full_name,
      purge_type: purgeType,
      items_purged: purgedCount,
      timestamp: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    success: true,
    message: `System Sanitized: Successfully purged ${purgedCount} legacy item(s) and logged audit trial.`,
    purged_count: purgedCount,
  });
}
