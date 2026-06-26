import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFlashcardCaller, loadFlashcardDeckForRead } from '@/lib/flashcards/auth';

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
    const admin = createAdminClient();
    const caller = await getFlashcardCaller(admin as any, user.id);
    if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { deck } = await loadFlashcardDeckForRead(admin as any, caller, deckId);
    if (!deck) return NextResponse.json({ error: 'Deck not found or access denied' }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'due'; // due, all, starred, difficult
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = (admin as any)
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

    const cardIds = (cards ?? []).map((card: any) => card.id);
    const { data: reviews } = cardIds.length
      ? await supabase
          .from('flashcard_reviews')
          .select('card_id, next_review_at, ease_factor, repetitions, confidence_level, last_reviewed_at')
          .eq('student_id', user.id)
          .in('card_id', cardIds)
      : { data: [] as FlashcardReviewRow[] };

    const reviewByCardId = new Map((reviews ?? []).map((review) => [review.card_id, review]));

    // Process cards to determine due status
    const now = new Date();
    const processedCards = cards?.map((card: any) => {
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
      ? processedCards.filter((card: any) => card.isDue)
      : processedCards;

    return NextResponse.json({
      data: filteredCards,
      meta: {
        total: filteredCards.length,
        mode,
        dueCount: processedCards.filter((c: any) => c.isDue).length,
        newCount: processedCards.filter((c: any) => c.isNew).length,
        reviewedCount: processedCards.filter((c: any) => !c.isNew).length
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
