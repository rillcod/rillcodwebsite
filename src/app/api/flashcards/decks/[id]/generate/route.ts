import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type AiGeneratedCard = {
  front?: string;
  back?: string;
  tags?: string[];
  difficulty?: string;
};

// POST /api/flashcards/decks/[id]/generate - AI generate flashcards
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify user owns the deck
  const { data: deck } = await supabase
    .from('flashcard_decks')
    .select('created_by, title')
    .eq('id', id)
    .single();

  if (!deck || deck.created_by !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { topic, count = 10, difficulty = 'medium', content, template = 'classic' } = await req.json();
  
  if (!topic?.trim() && !content?.trim()) {
    return NextResponse.json({ error: 'Topic or content is required' }, { status: 400 });
  }

  try {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL
        ? process.env.VERCEL_URL.startsWith('http')
          ? process.env.VERCEL_URL
          : `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000');

    const aiResponse = await fetch(`${appUrl}/api/ai/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: req.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        type: 'flashcard',
        topic: topic || content || deck.title,
        difficulty,
        questionCount: count,
      })
    });

    if (!aiResponse.ok) {
      throw new Error('AI generation failed');
    }

    const aiResult = await aiResponse.json();
    const flashcards = aiResult?.data?.cards;

    if (!Array.isArray(flashcards) || flashcards.length === 0) {
      throw new Error('Invalid flashcards format');
    }

    // Get current card count for positioning
    const { count: currentCount } = await supabase
      .from('flashcard_cards')
      .select('*', { count: 'exact', head: true })
      .eq('deck_id', id);

    // Insert generated flashcards
    const cardsToInsert = flashcards.map((card: AiGeneratedCard, index: number) => ({
      deck_id: id,
      front: card.front?.trim() || '',
      back: card.back?.trim() || '',
      tags: Array.isArray(card.tags) ? card.tags : [],
      difficulty_level: card.difficulty || difficulty || 'medium',
      template,
      position: (currentCount ?? 0) + index + 1,
    })).filter(card => card.front && card.back);

    if (cardsToInsert.length === 0) {
      throw new Error('No valid flashcards generated');
    }

    const { data: insertedCards, error: insertError } = await supabase
      .from('flashcard_cards')
      .insert(cardsToInsert)
      .select();

    if (insertError) {
      throw new Error(insertError.message);
    }

    return NextResponse.json({ 
      data: insertedCards,
      generated: insertedCards.length,
      message: `Generated ${insertedCards.length} flashcards successfully`
    });

  } catch (error: unknown) {
    console.error('Flashcard generation error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate flashcards';
    return NextResponse.json({ 
      error: message
    }, { status: 500 });
  }
}