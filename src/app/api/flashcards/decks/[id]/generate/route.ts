import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geminiGenerateText } from '@/lib/gemini/client';

export const dynamic = 'force-dynamic';

type AiGeneratedCard = {
  front?: string;
  back?: string;
  tags?: string[];
  difficulty?: string;
};

const FLASHCARD_SYSTEM_PROMPT = `You are an expert educational content creator for Rillcod Technologies.
Generate high-quality flashcards that are clear, accurate, and pedagogically sound.
Each card should have a clear question or concept on the front and a concise, complete answer on the back.
Return ONLY valid JSON — no markdown fences, no extra text.`;

function buildFlashcardPrompt(topic: string, count: number, difficulty: string, content?: string): string {
  const contextBlock = content?.trim()
    ? `\nLesson context (use this to make cards more relevant):\n${content.trim().slice(0, 2000)}`
    : '';

  return `Generate exactly ${count} flashcards about: "${topic}"
Difficulty level: ${difficulty}${contextBlock}

Return a JSON object with this exact shape:
{
  "cards": [
    {
      "front": "string — question or concept to test",
      "back": "string — clear, complete answer or explanation",
      "tags": ["string — relevant topic tags"],
      "difficulty": "${difficulty}"
    }
  ]
}

RULES:
- Generate EXACTLY ${count} cards — no more, no less.
- Cards must directly test knowledge of "${topic}".
- front: concise question or prompt (max 20 words).
- back: clear answer with enough context to be self-explanatory (1-3 sentences).
- Vary question types: definitions, applications, comparisons, code output, true/false reasoning.
- British English throughout.`;
}

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
    const effectiveTopic = topic?.trim() || deck.title;
    const prompt = buildFlashcardPrompt(effectiveTopic, count, difficulty, content);

    // Direct Gemini call — no HTTP round-trip, no cookie auth issues
    const aiResult = await geminiGenerateText(FLASHCARD_SYSTEM_PROMPT, prompt, true);
    if (!aiResult?.text) {
      throw new Error('AI returned empty response');
    }

    let parsed: { cards?: AiGeneratedCard[] };
    try {
      // Strip markdown fences if any model wraps the JSON
      const clean = aiResult.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      throw new Error('AI returned invalid JSON for flashcards');
    }

    const flashcards = parsed?.cards;
    if (!Array.isArray(flashcards) || flashcards.length === 0) {
      throw new Error('Invalid flashcards format — cards array missing or empty');
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
      message: `Generated ${insertedCards.length} flashcards successfully`,
    });

  } catch (error: unknown) {
    console.error('Flashcard generation error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate flashcards';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}