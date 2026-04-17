import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('portal_users')
      .select('id, role, school_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const role = profile.role;
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    let slots: any[] = [];

    if (role === 'teacher') {
      // Get teacher's slots for today
      const { data } = await supabase
        .from('timetable_slots')
        .select('*, timetables(school_id, schools(name))')
        .eq('day_of_week', today)
        .eq('teacher_id', profile.id)
        .order('start_time')
        .limit(3);

      slots = (data || []).map((s: any) => ({
        id: s.id,
        start_time: s.start_time,
        end_time: s.end_time,
        subject: s.subject,
        room: s.room,
        school_name: s.timetables?.schools?.name
      }));
    } else if (role === 'school' && profile.school_id) {
      // Get active timetable for this school
      const { data: tt } = await supabase
        .from('timetables')
        .select('id')
        .eq('school_id', profile.school_id)
        .eq('is_active', true)
        .maybeSingle();

      if (tt) {
        const { data } = await supabase
          .from('timetable_slots')
          .select('*, timetables(school_id, schools(name))')
          .eq('day_of_week', today)
          .eq('timetable_id', tt.id)
          .order('start_time')
          .limit(3);

        slots = (data || []).map((s: any) => ({
          id: s.id,
          start_time: s.start_time,
          end_time: s.end_time,
          subject: s.subject,
          room: s.room,
          school_name: s.timetables?.schools?.name
        }));
      }
    }

    return NextResponse.json({ slots });
  } catch (error: any) {
    console.error('Timetable fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch timetable' },
      { status: 500 }
    );
  }
}
