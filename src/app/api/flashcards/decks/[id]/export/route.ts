import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/flashcards/decks/[id]/export
 * Export flashcards to CSV, JSON, or Anki format
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
    const format = searchParams.get('format') || 'json';

    // Get deck and cards
    const { data: deck } = await supabase
      .from('flashcard_decks')
      .select('title, created_by')
      .eq('id', deckId)
      .single();

    if (!deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
    }

    // Check access
    const { data: profile } = await supabase
      .from('portal_users')
      .select('role, school_id')
      .eq('id', user.id)
      .single();

    const isOwner = deck.created_by === user.id;
    const isTeacher = profile && ['teacher', 'admin', 'school'].includes(profile.role);

    if (!isOwner && !isTeacher) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch cards
    const { data: cards, error } = await supabase
      .from('flashcard_cards')
      .select('*')
      .eq('deck_id', deckId)
      .order('position');

    if (error) {
      console.error('Export fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch cards' },
        { status: 500 }
      );
    }

    if (!cards || cards.length === 0) {
      return NextResponse.json(
        { error: 'No cards to export' },
        { status: 400 }
      );
    }

    let content: string;
    let contentType: string;
    let filename: string;

    switch (format) {
      case 'csv':
        // CSV format: front,back,tags,difficulty,template,notes,front_image_url,back_image_url
        const csvRows = [
          'front,back,tags,difficulty,template,notes,front_image_url,back_image_url',
          ...cards.map(card => {
            const front = `"${(card.front || '').replace(/"/g, '""')}"`;
            const back = `"${(card.back || '').replace(/"/g, '""')}"`;
            const tags = `"${(card.tags || []).join(';')}"`;
            const difficulty = card.difficulty_level || 'medium';
            const template = card.template || 'classic';
            const notes = `"${(card.notes || '').replace(/"/g, '""')}"`;
            const frontImage = `"${(card.front_image_url || '').replace(/"/g, '""')}"`;
            const backImage = `"${(card.back_image_url || '').replace(/"/g, '""')}"`;
            return `${front},${back},${tags},${difficulty},${template},${notes},${frontImage},${backImage}`;
          })
        ];
        content = csvRows.join('\n');
        contentType = 'text/csv';
        filename = `${deck.title.replace(/[^a-z0-9]/gi, '_')}_flashcards.csv`;
        break;

      case 'anki':
        // Anki format: front\tback
        const ankiRows = cards.map(card => 
          `${card.front || ''}\t${card.back || ''}`
        );
        content = ankiRows.join('\n');
        contentType = 'text/plain';
        filename = `${deck.title.replace(/[^a-z0-9]/gi, '_')}_flashcards.txt`;
        break;

      case 'json':
      default:
        // JSON format with full card data
        const jsonData = {
          deck: {
            title: deck.title,
            exportedAt: new Date().toISOString(),
            cardCount: cards.length
          },
          cards: cards.map(card => ({
            front: card.front,
            back: card.back,
            front_image_url: card.front_image_url,
            back_image_url: card.back_image_url,
            tags: card.tags || [],
            difficulty_level: card.difficulty_level || 'medium',
            template: card.template || 'classic',
            notes: card.notes
          }))
        };
        content = JSON.stringify(jsonData, null, 2);
        contentType = 'application/json';
        filename = `${deck.title.replace(/[^a-z0-9]/gi, '_')}_flashcards.json`;
        break;
    }

    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error) {
    console.error('Export API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
