import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type JsonImportCard = {
  front?: string;
  question?: string;
  back?: string;
  answer?: string;
  tags?: string[];
  difficulty_level?: string;
  difficulty?: string;
  template?: string;
  notes?: string;
  front_image_url?: string;
  frontImage?: string;
  back_image_url?: string;
  backImage?: string;
};

/**
 * POST /api/flashcards/decks/[id]/import
 * Import flashcards from CSV or JSON
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
    // Verify user owns the deck
    const { data: deck } = await supabase
      .from('flashcard_decks')
      .select('created_by')
      .eq('id', deckId)
      .single();

    if (!deck || deck.created_by !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await req.json();
    const { format, data: importData } = body;

    if (!format || !importData) {
      return NextResponse.json(
        { error: 'Format and data are required' },
        { status: 400 }
      );
    }

    let cards: Array<{
      front: string;
      back: string;
      tags?: string[];
      difficulty_level?: string;
      template?: string;
      notes?: string;
      front_image_url?: string;
      back_image_url?: string;
    }> = [];

    // Parse based on format
    switch (format) {
      case 'csv':
        // Parse CSV: front,back,tags,difficulty,template,notes,front_image_url,back_image_url
        const lines = importData.split('\n').filter((line: string) => line.trim());
        const hasHeader = lines[0].toLowerCase().includes('front');
        const dataLines = hasHeader ? lines.slice(1) : lines;

        cards = dataLines.map((line: string) => {
          const parts = line.split(',').map((p: string) => p.trim().replace(/^"|"$/g, ''));
          return {
            front: parts[0] || '',
            back: parts[1] || '',
            tags: parts[2] ? parts[2].split(';').map(t => t.trim()) : [],
            difficulty_level: parts[3] || 'medium',
            template: parts[4] || 'classic',
            notes: parts[5] || '',
            front_image_url: parts[6] || '',
            back_image_url: parts[7] || ''
          };
        });
        break;

      case 'json':
        // Parse JSON array
        try {
          const parsed = typeof importData === 'string' ? JSON.parse(importData) : importData;
          if (!Array.isArray(parsed)) {
            throw new Error('JSON must be an array');
          }
          cards = (parsed as JsonImportCard[]).map((item) => ({
            front: item.front || item.question || '',
            back: item.back || item.answer || '',
            tags: item.tags || [],
            difficulty_level: item.difficulty_level || item.difficulty || 'medium',
            template: item.template || 'classic',
            notes: item.notes || '',
            front_image_url: item.front_image_url || item.frontImage || '',
            back_image_url: item.back_image_url || item.backImage || '',
          }));
        } catch (_e) {
          return NextResponse.json(
            { error: 'Invalid JSON format' },
            { status: 400 }
          );
        }
        break;

      case 'anki':
        // Parse Anki format: front\tback
        const ankiLines = importData.split('\n').filter((line: string) => line.trim());
        cards = ankiLines.map((line: string) => {
          const [front, back] = line.split('\t');
          return {
            front: front?.trim() || '',
            back: back?.trim() || '',
            tags: [],
            difficulty_level: 'medium'
          };
        });
        break;

      default:
        return NextResponse.json(
          { error: 'Unsupported format. Use csv, json, or anki' },
          { status: 400 }
        );
    }

    // Validate cards
    const validCards = cards.filter(card => card.front && card.back);

    if (validCards.length === 0) {
      return NextResponse.json(
        { error: 'No valid cards found in import data' },
        { status: 400 }
      );
    }

    // Get current card count for positioning
    const { count: currentCount } = await supabase
      .from('flashcard_cards')
      .select('*', { count: 'exact', head: true })
      .eq('deck_id', deckId);

    // Insert cards
    const cardsToInsert = validCards.map((card, index) => ({
      deck_id: deckId,
      front: card.front,
      back: card.back,
      tags: card.tags || [],
      difficulty_level: card.difficulty_level || 'medium',
      notes: card.notes || null,
      front_image_url: card.front_image_url || null,
      back_image_url: card.back_image_url || null,
      position: (currentCount || 0) + index + 1,
      template: card.template || 'classic'
    }));

    const { data: insertedCards, error: insertError } = await supabase
      .from('flashcard_cards')
      .insert(cardsToInsert)
      .select();

    if (insertError) {
      console.error('Import insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to import cards' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: insertedCards,
      imported: insertedCards.length,
      skipped: cards.length - validCards.length,
      message: `Successfully imported ${insertedCards.length} cards`
    });

  } catch (error) {
    console.error('Import API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
