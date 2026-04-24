import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/flashcards/cards/[id]/review
 * Record a flashcard review using SM-2 spaced repetition algorithm
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: cardId } = await context.params;
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { correct, confidence = 3, studyTimeSeconds = 0 } = body;

    if (typeof correct !== 'boolean') {
      return NextResponse.json(
        { error: 'correct field is required and must be boolean' },
        { status: 400 }
      );
    }

    // Get or create review record
    const { data: existingReview } = await supabase
      .from('flashcard_reviews')
      .select('*')
      .eq('card_id', cardId)
      .eq('student_id', user.id)
      .single();

    // Use shared SM-2 logic
    const { sm2 } = await import('@/lib/sm2');
    const state = existingReview 
      ? { repetitions: existingReview.repetitions, intervalDays: existingReview.interval_days, easeFactor: existingReview.ease_factor }
      : { repetitions: 0, intervalDays: 1, easeFactor: 2.5 };

    const result = sm2(state, confidence); // Use confidence (1-5) as quality

    // Calculate next review date
    const nextReviewAt = result.nextReviewAt;

    // Upsert review record
    const { data: review, error: reviewError } = await supabase
      .from('flashcard_reviews')
      .upsert({
        card_id: cardId,
        student_id: user.id,
        next_review_at: nextReviewAt,
        interval_days: result.intervalDays,
        ease_factor: result.easeFactor,
        repetitions: result.repetitions,
        confidence_level: confidence,
        study_time_seconds: studyTimeSeconds,
        last_reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'card_id,student_id'
      })
      .select()
      .single();

    if (reviewError) {
      console.error('Review upsert error:', reviewError);
      return NextResponse.json(
        { error: 'Failed to record review' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: review,
      nextReview: {
        date: nextReviewAt,
        daysUntil: result.intervalDays,
        easeFactor: result.easeFactor,
        repetitions: result.repetitions
      },
      message: correct ? 'Great job! Keep it up!' : 'Keep practicing!'
    });

  } catch (error) {
    console.error('Review API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/flashcards/cards/[id]/review
 * Get review status for a specific card
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: cardId } = await context.params;
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: review } = await supabase
      .from('flashcard_reviews')
      .select('*')
      .eq('card_id', cardId)
      .eq('student_id', user.id)
      .single();

    if (!review) {
      return NextResponse.json({
        data: null,
        isDue: true,
        isNew: true
      });
    }

    const isDue = new Date(review.next_review_at) <= new Date();

    return NextResponse.json({
      data: review,
      isDue,
      isNew: false,
      daysUntilDue: Math.ceil(
        (new Date(review.next_review_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    });

  } catch (error) {
    console.error('Get review status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
