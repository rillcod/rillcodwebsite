import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// POST /api/curricula/[id]/clone
// Clones a platform curriculum (school_id = null) to a specific school.
// Body: { school_id: "uuid" } — required when teacher has multiple schools, optional otherwise.
// Returns the newly created curriculum row.

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sourceId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;

  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'teacher'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch source curriculum
  const { data: source, error: srcErr } = await admin
    .from('course_curricula')
    .select('id, course_id, school_id, content, version')
    .eq('id', sourceId)
    .single();

  if (srcErr || !source) {
    return NextResponse.json({ error: 'Curriculum not found' }, { status: 404 });
  }

  // Only platform curricula (school_id = null) can be cloned
  if (source.school_id !== null) {
    return NextResponse.json(
      { error: 'Only platform (shared) curricula can be cloned. School curricula can be edited directly.' },
      { status: 400 }
    );
  }

  // Resolve target school
  const body = await req.json().catch(() => ({}));
  let targetSchoolId: string | null = body.school_id ?? profile.school_id ?? null;

  if (!targetSchoolId) {
    return NextResponse.json(
      { error: 'No school to clone to. Specify a school_id in the request body.' },
      { status: 400 }
    );
  }

  // Teachers can only clone to their assigned schools
  if (profile.role === 'teacher') {
    const { getTeacherSchoolIds } = await import('@/lib/auth-utils');
    const sids = await getTeacherSchoolIds(profile.id, profile.school_id);
    if (!sids.includes(targetSchoolId)) {
      return NextResponse.json(
        { error: 'You can only clone to a school you are assigned to.' },
        { status: 403 }
      );
    }
  }

  // Check if a curriculum already exists for (course_id, targetSchoolId)
  const { data: existing } = await admin
    .from('course_curricula')
    .select('id, version')
    .eq('course_id', source.course_id)
    .eq('school_id', targetSchoolId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = existing ? (existing.version as number) + 1 : 1;

  // Clone the content — tag description to indicate origin
  const clonedContent = {
    ...(source.content ?? {}),
    description: existing
      ? `Cloned from platform template (v${nextVersion})`
      : 'Cloned from platform template',
  };

  const write = existing
    ? admin
      .from('course_curricula')
      .update({
        content: clonedContent,
        version: nextVersion,
        is_visible_to_school: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    : admin
      .from('course_curricula')
      .insert({
        course_id: source.course_id,
        school_id: targetSchoolId,
        content: clonedContent,
        version: nextVersion,
        is_visible_to_school: false,
        created_by: user.id,
      });

  const { data: newCurr, error: insertErr } = await write
    .select('*, schools(id, name)')
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ data: newCurr }, { status: 201 });
}
