import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/flashcards/decks/[id]/cards
// Logic for retrieving all cards for a specific deck
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const deckId = params.id;

  const { data, error } = await supabase
    .from('flashcard_cards')
    .select('*')
    .eq('deck_id', deckId)
    .order('position', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/flashcards/decks/[id]/cards
// Logic for adding a new card to a deck
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const deckId = params.id;
  const body = await req.json();

  // Verify ownership or staff status if needed (RLS handles this mostly)
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

  const { data, error } = await supabase
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
      position: position ?? 0
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}