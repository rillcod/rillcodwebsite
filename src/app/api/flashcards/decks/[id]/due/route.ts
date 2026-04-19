import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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
      .select(`
        *,
        flashcard_reviews!left(
          next_review_at,
          ease_factor,
          repetitions,
          confidence_level,
          last_reviewed_at
        )
      `)
      .eq('deck_id', deckId);

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

    // Process cards to determine due status
    const now = new Date();
    const processedCards = cards?.map(card => {
      const review = Array.isArray(card.flashcard_reviews) 
        ? card.flashcard_reviews.find((r: any) => r) 
        : card.flashcard_reviews;

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

    // Shuffle cards for better learning
    const shuffled = [...filteredCards].sort(() => Math.random() - 0.5);

    return NextResponse.json({
      data: shuffled,
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
