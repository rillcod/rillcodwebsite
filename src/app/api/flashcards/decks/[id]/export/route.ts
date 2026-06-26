import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFlashcardCaller, loadFlashcardDeckForRead } from '@/lib/flashcards/auth';

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

    const admin = createAdminClient();
    const caller = await getFlashcardCaller(admin as any, user.id);
    if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { deck } = await loadFlashcardDeckForRead(admin as any, caller, deckId);

    if (!deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
    }

    // Fetch cards
    const { data: cards, error } = await (admin as any)
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
          ...cards.map((card: any) => {
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
        const ankiRows = cards.map((card: any) =>
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
          cards: cards.map((card: any) => ({
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
