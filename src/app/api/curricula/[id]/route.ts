import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function requireTeacher() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient() as any;
  const { data: profile } = await admin
    .from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  if (!profile || !['admin', 'teacher'].includes(profile.role)) return null;
  return profile;
}

async function callerCanManageCurriculumSchool(
  admin: any,
  caller: { id: string; role: string; school_id: string | null },
  curriculumSchoolId: string | null,
): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (!curriculumSchoolId) return false;
  if (caller.school_id === curriculumSchoolId) return true;
  const { data: ts } = await admin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', caller.id)
    .eq('school_id', curriculumSchoolId)
    .maybeSingle();
  return !!ts;
}

// GET /api/curricula/[id] — fetch a single curriculum
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const caller = await requireTeacher();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const admin = createAdminClient() as any;

  const { data: row, error: rowErr } = await admin
    .from('course_curricula')
    .select('id, course_id, school_id, content, version, is_visible_to_school, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Curriculum not found' }, { status: 404 });

  const ok = await callerCanManageCurriculumSchool(admin, caller, row.school_id ?? null);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ data: row });
}

// PATCH /api/curricula/[id] — update is_visible_to_school and/or content
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const caller = await requireTeacher();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const body = await req.json();

  const admin = createAdminClient() as any;
  const { data: row, error: rowErr } = await admin
    .from('course_curricula')
    .select('id, school_id, version')
    .eq('id', id)
    .maybeSingle();
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Curriculum not found' }, { status: 404 });
  const ok = await callerCanManageCurriculumSchool(admin, caller, row.school_id ?? null);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.is_visible_to_school === 'boolean') {
    updatePayload.is_visible_to_school = body.is_visible_to_school;
  }
  if (body.content !== undefined) {
    updatePayload.content = body.content;
    updatePayload.version = (row.version ?? 1) + 1;
  }

  if (Object.keys(updatePayload).length === 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('course_curricula')
    .update(updatePayload)
    .eq('id', id)
    .select('id, is_visible_to_school, version, content')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/curricula/[id] — permanently delete a syllabus (admin only)
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const caller = await requireTeacher();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (caller.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { id } = await context.params;
  const admin = createAdminClient() as any;

  const { data: row, error: rowErr } = await admin
    .from('course_curricula')
    .select('id, school_id')
    .eq('id', id)
    .maybeSingle();
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Curriculum not found' }, { status: 404 });

  // Also delete related week tracking
  await admin.from('curriculum_week_tracking').delete().eq('curriculum_id', id);

  const { error } = await admin.from('course_curricula').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
