import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFlashcardCaller, loadFlashcardDeckForManage, loadFlashcardDeckForRead } from '@/lib/flashcards/auth';

export const dynamic = 'force-dynamic';

// GET /api/flashcards/decks/[id]/cards
// Logic for retrieving all cards for a specific deck
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: deckId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const adminClient = createAdminClient();
  const caller = await getFlashcardCaller(adminClient as any, user.id);
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { deck } = await loadFlashcardDeckForRead(adminClient as any, caller, deckId);
  if (!deck) return NextResponse.json({ error: 'Deck not found or access denied' }, { status: 404 });

  const { data, error } = await (adminClient as any)
    .from('flashcard_cards')
    .select('*')
    .eq('deck_id', deckId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/flashcards/decks/[id]/cards
// Logic for adding a new card to a deck
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: deckId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  const {
    front,
    back,
    front_image_url,
    back_image_url,
    tags,
    difficulty_level,
    notes,
    template,
    position
  } = body;

  // Use admin client to bypass RLS on flashcard_cards
  const adminClient = createAdminClient();
  const caller = await getFlashcardCaller(adminClient as any, user.id);
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { deck } = await loadFlashcardDeckForManage(adminClient as any, caller, deckId);
  if (!deck) return NextResponse.json({ error: 'Deck not found or access denied' }, { status: 404 });

  let nextPosition = position;
  if (nextPosition === null || nextPosition === undefined) {
    const { data: lastCard } = await (adminClient as any)
      .from('flashcard_cards')
      .select('position')
      .eq('deck_id', deckId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    nextPosition = (lastCard?.position ?? -1) + 1;
  }

  const { data, error } = await (adminClient as any)
    .from('flashcard_cards')
    .insert({
      deck_id: deckId,
      front,
      back,
      front_image_url,
      back_image_url,
      tags: tags || [],
      difficulty_level: difficulty_level || 'medium',
      notes,
      template: template || 'classic',
      position: nextPosition
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}