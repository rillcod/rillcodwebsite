import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sm2 } from '@/lib/sm2';

export const dynamic = 'force-dynamic';

// POST /api/flashcards/reviews
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { card_id, quality } = await req.json();
  if (!card_id || quality == null || quality < 0 || quality > 5) {
    return NextResponse.json({ error: 'card_id and quality (0-5) are required' }, { status: 400 });
  }

  // Get existing review state or use defaults
  const { data: existing } = await supabase
    .from('flashcard_reviews')
    .select('*')
    .eq('card_id', card_id)
    .eq('student_id', user.id)
    .single();

  const state = existing
    ? { repetitions: existing.repetitions, intervalDays: existing.interval_days, easeFactor: existing.ease_factor }
    : { repetitions: 0, intervalDays: 1, easeFactor: 2.5 };

  const result = sm2(state, quality);

  const reviewData = {
    card_id,
    student_id: user.id,
    repetitions: result.repetitions,
    interval_days: result.intervalDays,
    ease_factor: result.easeFactor,
    next_review_at: result.nextReviewAt,
  };

  const { error } = await supabase
    .from('flashcard_reviews')
    .upsert(reviewData, { onConflict: 'card_id,student_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: result });
}
