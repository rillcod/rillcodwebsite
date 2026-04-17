import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/flashcards/decks/[id]/due — returns cards due for review today
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get all cards in deck
  const { data: cards } = await supabase
    .from('flashcard_cards')
    .select('*')
    .eq('deck_id', id)
    .order('position');

  if (!cards?.length) return NextResponse.json({ data: [], nextReviewAt: null });

  const cardIds = cards.map((c: any) => c.id);
  const now = new Date().toISOString();

  // Find existing reviews
  const { data: reviews } = await supabase
    .from('flashcard_reviews')
    .select('*')
    .eq('student_id', user.id)
    .in('card_id', cardIds)
    .lte('next_review_at', now);

  const reviewedIds = new Set((reviews ?? []).map((r: any) => r.card_id));
  // Cards with no review yet or due review
  const dueCards = cards.filter((c: any) => reviewedIds.has(c.id) || !reviews?.some((r: any) => r.card_id === c.id));

  // Get next scheduled review for non-due cards
  const { data: futureReviews } = await supabase
    .from('flashcard_reviews')
    .select('next_review_at')
    .eq('student_id', user.id)
    .in('card_id', cardIds)
    .gt('next_review_at', now)
    .order('next_review_at')
    .limit(1);

  const nextReviewAt = futureReviews?.[0]?.next_review_at ?? null;
  return NextResponse.json({ data: dueCards, nextReviewAt });
}

// POST /api/flashcards/decks/[id]/cards — add a card to a deck
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { front, back } = await req.json();
  if (!front?.trim() || !back?.trim()) {
    return NextResponse.json({ error: 'Both front and back are required' }, { status: 400 });
  }

  const { count } = await supabase
    .from('flashcard_cards')
    .select('*', { count: 'exact', head: true })
    .eq('deck_id', id);

  const { data, error } = await supabase
    .from('flashcard_cards')
    .insert({ deck_id: id, front: front.trim(), back: back.trim(), position: (count ?? 0) + 1 })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
