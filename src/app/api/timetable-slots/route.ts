import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin') return null;
  return profile;
}

// POST /api/timetable-slots — create slot
export async function POST(request: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const body = await request.json();
  const { timetable_id, day_of_week, start_time, end_time, subject,
    teacher_id, teacher_name, room, notes, course_id } = body;

  if (!timetable_id || !subject?.trim())
    return NextResponse.json({ error: 'timetable_id and subject are required' }, { status: 400 });

  const admin = adminClient();
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
