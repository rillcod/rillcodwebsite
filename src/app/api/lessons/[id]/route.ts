import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller;
}

// GET /api/lessons/[id]
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id } = await context.params;
  const { data, error } = await adminClient()
    .from('lessons')
    .select('*, courses ( id, title, programs ( name ) ), lesson_plans (*)')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
  return NextResponse.json({ data });
}

// PATCH /api/lessons/[id] — update lesson
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  if (caller.role === 'school') return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const { id } = await context.params;

  // Teachers can only edit their own lessons
  if (caller.role === 'teacher') {
    const { data: existing } = await adminClient().from('lessons').select('created_by').eq('id', id).single();
    if (!existing) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    if (existing.created_by !== caller.id) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const body = await request.json();

  const allowed: Record<string, unknown> = {};
  const allowedFields = ['title', 'description', 'content', 'lesson_notes', 'lesson_type', 'status',
    'duration_minutes', 'order_index', 'video_url', 'is_active', 'session_date', 'content_layout', 'course_id'];
  for (const f of allowedFields) {
    if (f in body) allowed[f] = body[f] ?? null;
  }
  allowed.updated_at = new Date().toISOString();

  const admin = adminClient();
  const { error } = await admin.from('lessons').update(allowed).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Optionally upsert lesson_plan if included in body
  if (body.lesson_plan && typeof body.lesson_plan === 'object') {
    await admin.from('lesson_plans').upsert(
      { ...body.lesson_plan, lesson_id: id, updated_at: new Date().toISOString() },
      { onConflict: 'lesson_id' },
    );
  }

  return NextResponse.json({ success: true });
}

// PUT /api/lessons/[id] — alias for PATCH
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return PATCH(request, ctx);
}

// DELETE /api/lessons/[id]
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  if (caller.role === 'school') return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const { id } = await context.params;

  // Teachers can only delete their own lessons
  if (caller.role === 'teacher') {
    const { data: existing } = await adminClient().from('lessons').select('created_by').eq('id', id).single();
    if (!existing) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    if (existing.created_by !== caller.id) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { error } = await adminClient()
    .from('lessons')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
