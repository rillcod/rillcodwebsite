/**
 * POST /api/classes/bulk-course — set one course on many classes at once.
 *
 * Body: { course_id, class_ids?: string[], program_id?: string, replace_existing?: boolean }
 *
 * Give it `class_ids` to assign an explicit set, or `program_id` to take every class in that
 * programme that has no course yet. `preview: true` returns the decision without writing, so the
 * exceptions can be seen before anything changes.
 *
 * A class may only take a course from its own programme — see bulk-course.ts. Refusals come back
 * per class with a reason rather than being dropped.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/log';
import { planBulkCourseAssignment, type BulkCourseCandidate } from '@/lib/classes/bulk-course';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = adminClient();
  const { data: profile } = await db
    .from('portal_users')
    .select('role, is_active, is_deleted')
    .eq('id', user.id)
    .maybeSingle();
  // Matches the single-class PATCH: the school role reads classes but does not mutate them.
  if (!profile?.is_active || profile.is_deleted || !['admin', 'teacher'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Only an admin or teacher can set a class course.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const courseId = String((body as any).course_id ?? '').trim();
  const programId = String((body as any).program_id ?? '').trim();
  const classIds = Array.isArray((body as any).class_ids)
    ? ((body as any).class_ids as unknown[]).map(String).filter(Boolean)
    : [];
  const replaceExisting = (body as any).replace_existing === true;
  const preview = (body as any).preview === true;

  if (!courseId) return NextResponse.json({ error: 'Choose a course.' }, { status: 400 });
  if (!classIds.length && !programId) {
    return NextResponse.json({ error: 'Choose the classes, or a programme to apply to.' }, { status: 400 });
  }

  const { data: course, error: courseError } = await db
    .from('courses')
    .select('id, title, program_id')
    .eq('id', courseId)
    .maybeSingle();
  if (courseError) return NextResponse.json({ error: courseError.message }, { status: 500 });
  if (!course) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });

  let query = db.from('classes').select('id, name, program_id, current_course_id');
  if (classIds.length) {
    query = query.in('id', classIds);
  } else {
    // Programme mode deliberately targets only the classes that are stuck with no course,
    // so it can never rewrite a class a teacher has already set deliberately.
    query = query.eq('program_id', programId).is('current_course_id', null);
  }
  const { data: classes, error: classError } = await query;
  if (classError) return NextResponse.json({ error: classError.message }, { status: 500 });

  const plan = planBulkCourseAssignment(
    (classes ?? []) as BulkCourseCandidate[],
    { id: course.id, program_id: course.program_id },
    { replaceExisting },
  );

  const summary = {
    course: { id: course.id, title: course.title },
    to_assign: plan.assign.length,
    already_set: plan.unchanged.length,
    refused: plan.refused.length,
    assign: plan.assign.map((c) => ({ id: c.id, name: c.name })),
    refusals: plan.refused,
  };

  if (preview) return NextResponse.json({ preview: true, ...summary });

  if (plan.assign.length === 0) {
    return NextResponse.json({ updated: 0, ...summary });
  }

  const { error: updateError } = await db
    .from('classes')
    .update({ current_course_id: course.id, updated_at: new Date().toISOString() })
    .in('id', plan.assign.map((c) => c.id));
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await logAudit(db as any, {
    action: 'class_course_bulk_assigned',
    actorId: user.id,
    tableName: 'classes',
    recordId: course.id,
    newValues: {
      course_id: course.id,
      course_title: course.title,
      class_count: plan.assign.length,
      class_ids: plan.assign.map((c) => c.id),
      replaced_existing: replaceExisting,
    },
  }).catch(() => { /* the assignment already succeeded; auditing must not undo it */ });

  return NextResponse.json({ updated: plan.assign.length, ...summary });
}
