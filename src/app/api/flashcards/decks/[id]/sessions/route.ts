import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/flashcards/decks/[id]/sessions
 * Record a completed study session
 */
export async function POST(
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
    const body = await req.json();
    const {
      cardsStudied,
      cardsCorrect,
      cardsIncorrect,
      maxStreak,
      studyDurationSeconds
    } = body;

    // Validate input
    if (
      typeof cardsStudied !== 'number' ||
      typeof cardsCorrect !== 'number' ||
      typeof cardsIncorrect !== 'number'
    ) {
      return NextResponse.json(
        { error: 'Invalid session data' },
        { status: 400 }
      );
    }

    // Record session
    const { data: session, error: sessionError } = await supabase
      .from('flashcard_study_sessions')
      .insert({
        deck_id: deckId,
        student_id: user.id,
        cards_studied: cardsStudied,
        cards_correct: cardsCorrect,
        cards_incorrect: cardsIncorrect,
        max_streak: maxStreak || 0,
        study_duration_seconds: studyDurationSeconds || 0,
        completed_at: new Date().toISOString()
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Session insert error:', sessionError);
      return NextResponse.json(
        { error: 'Failed to record session' },
        { status: 500 }
      );
    }

    // Calculate XP reward (gamification)
    const accuracy = cardsStudied > 0 ? (cardsCorrect / cardsStudied) * 100 : 0;
    const baseXP = cardsStudied * 10;
    const accuracyBonus = Math.floor(accuracy * 0.5);
    const streakBonus = maxStreak * 5;
    const totalXP = baseXP + accuracyBonus + streakBonus;

    // Award XP via engagement service
    try {
      const { engagementService } = await import('@/services/engagement.service');
      
      // Get deck details to find school_id
      const { data: deck } = await supabase.from('flashcard_decks').select('school_id').eq('id', deckId).single();

      await engagementService.awardXP(user.id, 'flashcard_review', {
        refId: session.id,
        refType: 'assignment', // using assignment as refType proxy for engagement tracking
        schoolId: deck?.school_id ?? undefined,
        metadata: {
          cards_studied: cardsStudied,
          accuracy: Math.round(accuracy),
          deck_id: deckId
        }
      });
    } catch (xpErr) {
      console.error('Failed to award XP for flashcards:', xpErr);
    }

    return NextResponse.json({
      data: session,
      rewards: {
        xp: totalXP,
        accuracy: Math.round(accuracy),
        breakdown: {
          base: baseXP,
          accuracyBonus,
          streakBonus
        }
      },
      message: 'Study session recorded successfully! XP Awarded.'
    });

  } catch (error) {
    console.error('Session API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/flashcards/decks/[id]/sessions
 * Get study sessions for a deck
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
    const limit = parseInt(searchParams.get('limit') || '10');
    const studentId = searchParams.get('studentId') || user.id;

    // Check if user can view other students' sessions (teachers only)
    if (studentId !== user.id) {
      const { data: profile } = await supabase
        .from('portal_users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!profile || !['teacher', 'admin', 'school'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { data: sessions, error } = await supabase
      .from('flashcard_study_sessions')
      .select('*')
      .eq('deck_id', deckId)
      .eq('student_id', studentId)
      .order('completed_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Sessions fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch sessions' },
        { status: 500 }
      );
    }

    // Calculate aggregate statistics
    const stats = sessions.reduce(
      (acc, session) => ({
        totalSessions: acc.totalSessions + 1,
        totalCards: acc.totalCards + session.cards_studied,
        totalCorrect: acc.totalCorrect + session.cards_correct,
        totalIncorrect: acc.totalIncorrect + session.cards_incorrect,
        totalTime: acc.totalTime + session.study_duration_seconds,
        bestStreak: Math.max(acc.bestStreak, session.max_streak)
      }),
      {
        totalSessions: 0,
        totalCards: 0,
        totalCorrect: 0,
        totalIncorrect: 0,
        totalTime: 0,
        bestStreak: 0
      }
    );

    const averageAccuracy =
      stats.totalCards > 0
        ? Math.round((stats.totalCorrect / stats.totalCards) * 100)
        : 0;

    return NextResponse.json({
      data: sessions,
      stats: {
        ...stats,
        averageAccuracy
      }
    });

  } catch (error) {
    console.error('Get sessions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
