import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/flashcards/decks/[id]/cards - Get all cards in deck
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: cards, error } = await supabase
    .from('flashcard_cards')
    .select('*')
    .eq('deck_id', id)
    .order('position');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: cards });
}

// POST /api/flashcards/decks/[id]/cards - Add a card to deck
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify user owns the deck
  const { data: deck } = await supabase
    .from('flashcard_decks')
    .select('created_by')
    .eq('id', id)
    .single();

  if (!deck || deck.created_by !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { 
    front, 
    back, 
    front_image_url, 
    back_image_url, 
    template, 
    tags, 
    difficulty_level, 
    notes 
  } = await req.json();

  if (!front?.trim() || !back?.trim()) {
    return NextResponse.json({ error: 'Both front and back are required' }, { status: 400 });
  }

  // Get next position
  const { count } = await supabase
    .from('flashcard_cards')
    .select('*', { count: 'exact', head: true })
    .eq('deck_id', id);

  const { data, error } = await supabase
    .from('flashcard_cards')
    .insert({ 
      deck_id: id, 
      front: front.trim(), 
      back: back.trim(), 
      position: (count ?? 0) + 1,
      front_image_url,
      back_image_url,
      template: template || 'classic',
      tags: tags || [],
      difficulty_level: difficulty_level || 'medium',
      notes
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}