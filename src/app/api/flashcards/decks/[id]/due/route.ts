import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type FlashcardReviewRow = {
  card_id: string;
  next_review_at: string | null;
  ease_factor: number | null;
  repetitions: number | null;
  confidence_level: number | null;
  last_reviewed_at: string | null;
};

/**
 * GET /api/flashcards/decks/[id]/due
 * Get cards due for review using spaced repetition
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: deckId } = await context.params;
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'due'; // due, all, starred, difficult
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabase
      .from('flashcard_cards')
      .select('*')
      .eq('deck_id', deckId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    // Apply filters based on mode
    switch (mode) {
      case 'starred':
        query = query.eq('is_starred', true);
        break;
      case 'difficult':
        query = query.eq('difficulty_level', 'hard');
        break;
      case 'new':
        // Cards never reviewed
        query = query.is('flashcard_reviews.next_review_at', null);
        break;
      case 'due':
      default:
        // Cards due for review or never reviewed
        // This will be filtered in post-processing
        break;
    }

    query = query.limit(limit);

    const { data: cards, error } = await query;

    if (error) {
      console.error('Due cards fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch cards' },
        { status: 500 }
      );
    }

    const cardIds = (cards ?? []).map((card) => card.id);
    const { data: reviews } = cardIds.length
      ? await supabase
          .from('flashcard_reviews')
          .select('card_id, next_review_at, ease_factor, repetitions, confidence_level, last_reviewed_at')
          .eq('student_id', user.id)
          .in('card_id', cardIds)
      : { data: [] as FlashcardReviewRow[] };

    const reviewByCardId = new Map<string, FlashcardReviewRow>((reviews ?? []).map((review) => [review.card_id, review]));

    // Process cards to determine due status
    const now = new Date();
    const processedCards = cards?.map(card => {
      const review = reviewByCardId.get(card.id) ?? null;

      const isDue = !review?.next_review_at || new Date(review.next_review_at) <= now;
      const isNew = !review?.next_review_at;
      
      return {
        ...card,
        review: review || null,
        isDue,
        isNew,
        daysUntilDue: review?.next_review_at
          ? Math.ceil((new Date(review.next_review_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 0
      };
    }) || [];

    // Filter for due cards if mode is 'due'
    const filteredCards = mode === 'due' 
      ? processedCards.filter(card => card.isDue)
      : processedCards;

    return NextResponse.json({
      data: filteredCards,
      meta: {
        total: filteredCards.length,
        mode,
        dueCount: processedCards.filter(c => c.isDue).length,
        newCount: processedCards.filter(c => c.isNew).length,
        reviewedCount: processedCards.filter(c => !c.isNew).length
      }
    });

  } catch (error) {
    console.error('Due cards API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
