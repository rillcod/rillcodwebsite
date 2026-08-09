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
      // The timetable for the term we are actually in.
      //
      // This asked for the school's one active timetable with maybeSingle() and
      // no term filter at all. Two problems, both live:
      //
      //  - A school keeping last term's timetable active alongside a new one
      //    returns two rows, maybeSingle() refuses them, the error was
      //    discarded, and the school's schedule silently vanished from the
      //    dashboard. Preparing next term is exactly when a second active
      //    timetable appears, so the failure was waiting for this week.
      //  - With no term filter, a Second Term timetable was being shown as
      //    today's schedule two terms later. All five in the system are
      //    Second Term 2025/2026 and all five are still flagged active.
      //
      // Now: prefer the live term, fall back to whatever is active, and take the
      // newest deterministically instead of refusing to choose.
      // Returns a bare uuid, not a row — granted to authenticated, so the
      // school's own session can call it.
      const { data: liveTermId } = await (supabase as any).rpc('current_academic_term');

      let pick = supabase
        .from('timetables')
        .select('id, term_id, updated_at')
        .eq('school_id', profile.school_id)
        .eq('is_active', true);
      if (typeof liveTermId === 'string' && liveTermId) pick = pick.eq('term_id', liveTermId);

      let { data: candidates } = await pick
        .order('updated_at', { ascending: false })
        .limit(1);

      // No timetable written for this term yet — show the school's current one
      // rather than an empty day.
      if (!candidates?.length) {
        const { data: fallback } = await supabase
          .from('timetables')
          .select('id, term_id, updated_at')
          .eq('school_id', profile.school_id)
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          .limit(1);
        candidates = fallback ?? [];
      }
      const tt = candidates?.[0] ?? null;

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
