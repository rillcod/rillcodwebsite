import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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

  const { topic, count = 10, difficulty = 'medium', content } = await req.json();
  
  if (!topic?.trim() && !content?.trim()) {
    return NextResponse.json({ error: 'Topic or content is required' }, { status: 400 });
  }

  try {
    // Use OpenRouter API for AI generation
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://rillcod.com',
        'X-Title': 'Rillcod Academy Flashcards'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          {
            role: 'system',
            content: `You are an expert educational content creator. Generate flashcards that are:
- Clear and concise
- Educationally valuable
- Appropriate for the specified difficulty level
- Well-formatted for study

Return ONLY a JSON array of flashcard objects with "front" and "back" properties. No additional text or formatting.`
          },
          {
            role: 'user',
            content: `Create ${count} flashcards about "${topic || 'the provided content'}" at ${difficulty} difficulty level.

${content ? `Base the flashcards on this content:\n${content}` : ''}

Requirements:
- Front: Question, term, or concept
- Back: Answer, definition, or explanation
- ${difficulty} difficulty level
- Educational and accurate
- Varied question types (definitions, examples, applications, comparisons)

Return as JSON array: [{"front": "question", "back": "answer"}, ...]`
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!openRouterResponse.ok) {
      throw new Error('AI generation failed');
    }

    const aiResult = await openRouterResponse.json();
    const aiContent = aiResult.choices?.[0]?.message?.content;

    if (!aiContent) {
      throw new Error('No content generated');
    }

    // Parse the AI response
    let flashcards;
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        flashcards = JSON.parse(jsonMatch[0]);
      } else {
        flashcards = JSON.parse(aiContent);
      }
    } catch (parseError) {
      throw new Error('Failed to parse AI response');
    }

    if (!Array.isArray(flashcards) || flashcards.length === 0) {
      throw new Error('Invalid flashcards format');
    }

    // Get current card count for positioning
    const { count: currentCount } = await supabase
      .from('flashcard_cards')
      .select('*', { count: 'exact', head: true })
      .eq('deck_id', id);

    // Insert generated flashcards
    const cardsToInsert = flashcards.map((card: any, index: number) => ({
      deck_id: id,
      front: card.front?.trim() || '',
      back: card.back?.trim() || '',
      position: (currentCount ?? 0) + index + 1
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

  } catch (error: any) {
    console.error('Flashcard generation error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to generate flashcards' 
    }, { status: 500 });
  }
}