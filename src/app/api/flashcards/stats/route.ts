import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { resolveAssignmentTermId, matchesAssignmentSession } = await import('@/lib/assignments/session');
    const liveTermId = await resolveAssignmentTermId(admin as any, {});

    // Limit due/mastery stats to cards in live-session decks.
    const { data: decks } = await admin
      .from('flashcard_decks')
      .select('id, term_id');
    const liveDeckIds = new Set(
      ((decks ?? []) as any[])
        .filter((d) => matchesAssignmentSession(d.term_id, liveTermId, true))
        .map((d) => d.id),
    );

    let liveCardIds: string[] = [];
    if (liveDeckIds.size > 0) {
      const { data: cards } = await admin
        .from('flashcard_cards')
        .select('id, deck_id')
        .in('deck_id', [...liveDeckIds]);
      liveCardIds = ((cards ?? []) as any[]).map((c) => c.id);
    }

    const now = new Date().toISOString();
    let dueToday = 0;
    let reviews: { repetitions: number }[] = [];
    if (liveCardIds.length > 0) {
      const [{ count }, { data: reviewRows }] = await Promise.all([
        admin
          .from('flashcard_reviews')
          .select('*', { count: 'exact', head: true })
          .eq('student_id', user.id)
          .in('card_id', liveCardIds)
          .lte('next_review_at', now),
        admin
          .from('flashcard_reviews')
          .select('repetitions')
          .eq('student_id', user.id)
          .in('card_id', liveCardIds),
      ]);
      dueToday = count || 0;
      reviews = (reviewRows ?? []) as any[];
    }

    const mastery_stats = [
      { status: 'Learning', count: reviews.filter(r => r.repetitions <= 1).length },
      { status: 'Reviewing', count: reviews.filter(r => r.repetitions > 1 && r.repetitions < 6).length },
      { status: 'Mastered', count: reviews.filter(r => r.repetitions >= 6).length },
    ];

    const sessionsQuery = admin
      .from('flashcard_study_sessions')
      .select('*, flashcard_decks(term_id)')
      .eq('student_id', user.id)
      .order('completed_at', { ascending: false })
      .limit(20);
    const { data: sessionRows } = await sessionsQuery;
    const recent_sessions = ((sessionRows ?? []) as any[])
      .filter((s) => matchesAssignmentSession(s.flashcard_decks?.term_id, liveTermId, true))
      .slice(0, 5);

    return NextResponse.json({
      data: {
        due_today: dueToday,
        mastery_stats,
        recent_sessions,
        term_id: liveTermId,
      }
    });

  } catch (error: any) {
    console.error('Flashcard stats error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
