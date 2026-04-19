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

    // 2. Get master level stats from flashcard_card_statistics
    // This table was enhanced in our latest migration
    const { data: stats } = await supabase
      .from('flashcard_card_statistics')
      .select('mastery_level, count')
      .eq('student_id', user.id);

    // 3. Get recent study sessions
    const { data: sessions } = await supabase
      .from('flashcard_study_sessions')
      .select('*')
      .eq('student_id', user.id)
      .order('started_at', { ascending: false })
      .limit(5);

    return NextResponse.json({
      data: {
        due_today: dueToday || 0,
        mastery_stats: stats ?? [],
        recent_sessions: sessions ?? []
      }
    });

  } catch (error: any) {
    console.error('Flashcard stats error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
