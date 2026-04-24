import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Get cards due today
    const now = new Date().toISOString();
    const { count: dueToday } = await supabase
      .from('flashcard_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', user.id)
      .lte('next_review_at', now);

    // 2. Derive mastery stats from flashcard_reviews
    // 0-1 reps: Learning, 2-5 reps: Reviewing, 6+: Mastered
    const { data: reviews } = await supabase
      .from('flashcard_reviews')
      .select('repetitions')
      .eq('student_id', user.id);

    const mastery_stats = [
      { status: 'Learning', count: reviews?.filter(r => r.repetitions <= 1).length || 0 },
      { status: 'Reviewing', count: reviews?.filter(r => r.repetitions > 1 && r.repetitions < 6).length || 0 },
      { status: 'Mastered', count: reviews?.filter(r => r.repetitions >= 6).length || 0 },
    ];

    // 3. Get recent study sessions using correct column completed_at
    const { data: sessions } = await supabase
      .from('flashcard_study_sessions')
      .select('*')
      .eq('student_id', user.id)
      .order('completed_at', { ascending: false })
      .limit(5);

    return NextResponse.json({
      data: {
        due_today: dueToday || 0,
        mastery_stats,
        recent_sessions: sessions ?? []
      }
    });

  } catch (error: any) {
    console.error('Flashcard stats error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
