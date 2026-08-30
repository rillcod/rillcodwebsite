import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  filterReadableFlashcardDecks,
  getFlashcardCaller,
} from '@/lib/flashcards/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const profile = await getFlashcardCaller(admin as any, user.id);
    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 403 });
    }
    const { resolveAssignmentTermId, matchesAssignmentSession } = await import('@/lib/assignments/session');
    const liveTermId = await resolveAssignmentTermId(admin as any, {
      classId: profile.class_id ?? null,
    });

    // One visibility rule drives the deck list, dashboard count and review stats.
    const { data: decks, error: deckError } = await admin
      .from('flashcard_decks')
      .select(
        'id, term_id, created_by, school_id, class_id, course_id, is_public, lesson_plan_id, courses(program_id), lesson_plans(class_id)',
      );
    if (deckError) throw deckError;
    const readableDecks = await filterReadableFlashcardDecks(
      admin as any,
      profile,
      (decks ?? []) as any[],
    );
    const liveDeckIds = readableDecks
      .filter((deck: any) =>
        matchesAssignmentSession((deck as any).term_id, liveTermId, true),
      )
      .map((deck) => deck.id);

    let liveCardIds: string[] = [];
    if (liveDeckIds.length > 0) {
      const { data: cards, error: cardError } = await admin
        .from('flashcard_cards')
        .select('id, deck_id')
        .in('deck_id', liveDeckIds);
      if (cardError) throw cardError;
      liveCardIds = ((cards ?? []) as any[]).map((c) => c.id);
    }

    const now = new Date().toISOString();
    let dueToday = 0;
    let reviews: { card_id: string; next_review_at: string | null; repetitions: number }[] = [];
    if (liveCardIds.length > 0) {
      const { data: reviewRows, error: reviewError } = await admin
        .from('flashcard_reviews')
        .select('card_id, next_review_at, repetitions')
        .eq('student_id', user.id)
        .in('card_id', liveCardIds);
      if (reviewError) throw reviewError;
      reviews = (reviewRows ?? []) as typeof reviews;
      const reviewByCard = new Map(reviews.map((review) => [review.card_id, review]));
      dueToday = liveCardIds.filter((cardId) => {
        const review = reviewByCard.get(cardId);
        return !review?.next_review_at || review.next_review_at <= now;
      }).length;
    }

    const mastery_stats = [
      { status: 'Learning', count: reviews.filter(r => r.repetitions <= 1).length },
      { status: 'Reviewing', count: reviews.filter(r => r.repetitions > 1 && r.repetitions < 6).length },
      { status: 'Mastered', count: reviews.filter(r => r.repetitions >= 6).length },
    ];

    let recent_sessions: any[] = [];
    if (liveDeckIds.length > 0) {
      const { data: sessionRows, error: sessionError } = await admin
        .from('flashcard_study_sessions')
        .select('*, flashcard_decks(term_id)')
        .eq('student_id', user.id)
        .in('deck_id', liveDeckIds)
        .order('completed_at', { ascending: false })
        .limit(5);
      if (sessionError) throw sessionError;
      recent_sessions = (sessionRows ?? []) as any[];
    }

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
