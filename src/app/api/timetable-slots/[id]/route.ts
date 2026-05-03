import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireTeacherOrAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher'].includes(profile.role)) return null;
  return profile as { id: string; role: string; school_id: string | null };
}

async function assertTeacherCanAccessSlot(
  caller: { id: string; role: string; school_id: string | null },
  slotId: string,
): Promise<boolean> {
  if (caller.role === 'admin') return true;
  const admin = adminClient();
  const { data: slot } = await admin
    .from('timetable_slots')
    .select('timetable_id, timetables(school_id)')
    .eq('id', slotId)
    .maybeSingle();
  if (!slot) return false;
  const slotSchool = (slot as any).timetables?.school_id ?? null;
  if (!slotSchool) return true; // unscoped timetable — allow
  const { data: tsRows } = await admin.from('teacher_schools').select('school_id').eq('teacher_id', caller.id);
  const schoolIds = new Set<string>();
  if (caller.school_id) schoolIds.add(caller.school_id);
  for (const r of tsRows ?? []) { if ((r as any).school_id) schoolIds.add((r as any).school_id); }
  return schoolIds.has(slotSchool);
}

// PATCH /api/timetable-slots/[id] — update slot
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireTeacherOrAdmin();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id } = await context.params;

  const admin = adminClient();
  if (!(await assertTeacherCanAccessSlot(caller, id))) {
    return NextResponse.json({ error: 'Access denied: slot belongs to a different school' }, { status: 403 });
  }

  const body = await request.json();

  const update: Record<string, any> = {};
  const fields = ['day_of_week', 'start_time', 'end_time', 'subject',
    'teacher_id', 'teacher_name', 'room', 'notes', 'course_id', 'timetable_id'];
  for (const f of fields) {
    if (body[f] !== undefined) update[f] = body[f];
  }
  const { data, error } = await admin
    .from('timetable_slots')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/timetable-slots/[id] — delete slot
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireTeacherOrAdmin();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id } = await context.params;
  const admin = adminClient();
  if (!(await assertTeacherCanAccessSlot(caller, id))) {
    return NextResponse.json({ error: 'Access denied: slot belongs to a different school' }, { status: 403 });
  }
  const { error } = await admin.from('timetable_slots').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
