import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { geminiGenerateText } from '@/lib/gemini/client';

export const dynamic = 'force-dynamic';

type AiGeneratedCard = {
  front?: string;
  back?: string;
  tags?: string[];
  difficulty?: string;
};

const FLASHCARD_SYSTEM_PROMPT = `You are an expert educational content creator for Rillcod Technologies, a Christian STEM innovation academy.
Generate high-quality flashcards that are clear, accurate, and pedagogically sound.
Each card should have a clear question or concept on the front and a concise, complete answer on the back.
Return ONLY valid JSON — no markdown fences, no extra text.`;

function buildFlashcardPrompt(topic: string, count: number, difficulty: string, content?: string, existingFronts?: string[]): string {
  const contextBlock = content?.trim()
    ? `\nLesson context (use this to make cards more relevant):\n${content.trim().slice(0, 2000)}`
    : '';

  // Anti-repetition: the deck may already have cards (regeneration). Tell the model
  // exactly what exists so every NEW card is genuinely different — no duplicates or
  // lightly-reworded repeats.
  const avoidBlock = existingFronts && existingFronts.length > 0
    ? `\nALREADY IN THIS DECK — do NOT repeat, paraphrase, or lightly reword any of these; generate genuinely NEW, non-overlapping cards that go deeper or cover different angles:\n${existingFronts.slice(0, 60).map((f, i) => `${i + 1}. ${f}`).join('\n')}`
    : '';

  return `Generate exactly ${count} flashcards about: "${topic}"
Difficulty level: ${difficulty}${contextBlock}${avoidBlock}

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
- "Christian STEM & Local African Integration": We are a Christian academy. Creatively weave Christian concepts, Biblical analogies (Noah's Ark database, Joshua's Jericho loops, Moses' rod variables, David's coordinates, Tower of Babel protocols), and local African/Nigerian tech scenarios (OPay fintech USSD, Northern smart agriculture, Lagos transit systems) into card questions, answers, and tags. Use local names like Chioma, Kofi, Tunde, Musa.
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

  // Verify user owns the deck — use admin client to bypass RLS so the lookup
  // succeeds regardless of school_id or other RLS conditions on flashcard_decks.
  const adminClient = createAdminClient();
  const { data: deck } = await (adminClient as any)
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

    // Pull existing card fronts so regeneration produces UNIQUE, non-repeating cards.
    const { data: existingCards } = await (adminClient as any)
      .from('flashcard_cards')
      .select('front')
      .eq('deck_id', id);
    const existingFronts: string[] = (existingCards ?? [])
      .map((c: { front: string | null }) => (c.front ?? '').trim())
      .filter(Boolean);
    const existingFrontSet = new Set(existingFronts.map((f) => f.toLowerCase()));

    const prompt = buildFlashcardPrompt(effectiveTopic, count, difficulty, content, existingFronts);

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

    // Get current card count for positioning — use admin client to bypass RLS
    const { count: currentCount } = await (adminClient as any)
      .from('flashcard_cards')
      .select('*', { count: 'exact', head: true })
      .eq('deck_id', id);

    // Insert generated flashcards — use admin client to bypass RLS
    // Drop any card that duplicates an existing one or repeats within this batch.
    const seenFronts = new Set<string>();
    const cardsToInsert = flashcards.map((card: AiGeneratedCard, index: number) => ({
      deck_id: id,
      front: card.front?.trim() || '',
      back: card.back?.trim() || '',
      tags: Array.isArray(card.tags) ? card.tags : [],
      difficulty_level: card.difficulty || difficulty || 'medium',
      template,
      position: (currentCount ?? 0) + index + 1,
    })).filter(card => {
      if (!card.front || !card.back) return false;
      const key = card.front.toLowerCase();
      if (existingFrontSet.has(key) || seenFronts.has(key)) return false;
      seenFronts.add(key);
      return true;
    });

    if (cardsToInsert.length === 0) {
      throw new Error('No valid flashcards generated');
    }

    const { data: insertedCards, error: insertError } = await (adminClient as any)
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