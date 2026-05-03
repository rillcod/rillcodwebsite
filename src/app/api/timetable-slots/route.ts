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

// POST /api/timetable-slots — create slot
export async function POST(request: NextRequest) {
  const caller = await requireTeacherOrAdmin();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const body = await request.json();
  const { timetable_id, day_of_week, start_time, end_time, subject,
    teacher_id, teacher_name, room, notes, course_id } = body;

  if (!timetable_id || !subject?.trim())
    return NextResponse.json({ error: 'timetable_id and subject are required' }, { status: 400 });

  const admin = adminClient();

  // Teacher: verify timetable belongs to their assigned school
  if (caller.role === 'teacher') {
    const { data: tsRows } = await admin.from('teacher_schools').select('school_id').eq('teacher_id', caller.id);
    const schoolIds = new Set<string>();
    if (caller.school_id) schoolIds.add(caller.school_id);
    for (const r of tsRows ?? []) { if ((r as any).school_id) schoolIds.add((r as any).school_id); }

    const { data: timetable } = await admin.from('timetables').select('school_id').eq('id', timetable_id).maybeSingle();
    if (timetable?.school_id && !schoolIds.has(timetable.school_id)) {
      return NextResponse.json({ error: 'Access denied: timetable belongs to a different school' }, { status: 403 });
    }
  }

  // Req 13.3 — server-side conflict detection via RPC
  const { data: conflictResult, error: rpcErr } = await admin
    .rpc('check_timetable_conflicts', {
      p_slot: {
        timetable_id,
        day_of_week: day_of_week || 'Monday',
        start_time: start_time || '08:00',
        end_time: end_time || '09:00',
        teacher_id: teacher_id || null,
        room: room?.trim() || null,
      },
    });

  if (rpcErr) {
    console.error('check_timetable_conflicts RPC error:', rpcErr);
    // Non-fatal — proceed without conflict check if RPC fails
  } else if (conflictResult?.conflict === 'TEACHER_CONFLICT') {
    // Req 13.4
    return NextResponse.json(
      { error: 'TEACHER_CONFLICT', conflictingSlot: conflictResult.conflictingSlot },
      { status: 409 },
    );
  } else if (conflictResult?.conflict === 'ROOM_CONFLICT') {
    // Req 13.5
    return NextResponse.json(
      { error: 'ROOM_CONFLICT', conflictingSlot: conflictResult.conflictingSlot },
      { status: 409 },
    );
  }

  const { data, error } = await admin
    .from('timetable_slots')
    .insert({
      timetable_id,
      day_of_week: day_of_week || 'Monday',
      start_time: start_time || '08:00',
      end_time: end_time || '09:00',
      subject: subject.trim(),
      teacher_id: teacher_id || null,
      teacher_name: teacher_name?.trim() || null,
      room: room?.trim() || null,
      notes: notes?.trim() || null,
      course_id: course_id || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
