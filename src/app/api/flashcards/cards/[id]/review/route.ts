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

    // SM-2 Algorithm implementation
    let newEaseFactor: number;
    let newIntervalDays: number;
    let newRepetitions: number;

    if (existingReview) {
      const { ease_factor, interval_days, repetitions } = existingReview;
      
      if (correct) {
        // Correct answer - increase interval
        newRepetitions = repetitions + 1;
        
        if (newRepetitions === 1) {
          newIntervalDays = 1;
        } else if (newRepetitions === 2) {
          newIntervalDays = 6;
        } else {
          newIntervalDays = Math.round(interval_days * ease_factor);
        }
        
        // Adjust ease factor based on confidence (1-5 scale)
        const qualityScore = confidence; // 1=hard, 3=good, 5=easy
        newEaseFactor = ease_factor + (0.1 - (5 - qualityScore) * (0.08 + (5 - qualityScore) * 0.02));
        newEaseFactor = Math.max(1.3, newEaseFactor); // Minimum ease factor
      } else {
        // Incorrect answer - reset
        newRepetitions = 0;
        newIntervalDays = 1;
        newEaseFactor = Math.max(1.3, ease_factor - 0.2);
      }
    } else {
      // First review
      if (correct) {
        newRepetitions = 1;
        newIntervalDays = 1;
        newEaseFactor = 2.5;
      } else {
        newRepetitions = 0;
        newIntervalDays = 1;
        newEaseFactor = 2.3;
      }
    }

    // Calculate next review date
    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + newIntervalDays);

    // Upsert review record
    const { data: review, error: reviewError } = await supabase
      .from('flashcard_reviews')
      .upsert({
        card_id: cardId,
        student_id: user.id,
        next_review_at: nextReviewAt.toISOString(),
        interval_days: newIntervalDays,
        ease_factor: newEaseFactor,
        repetitions: newRepetitions,
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
        date: nextReviewAt.toISOString(),
        daysUntil: newIntervalDays,
        easeFactor: newEaseFactor,
        repetitions: newRepetitions
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
