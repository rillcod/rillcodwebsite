import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/flashcards/cards/[id] - Get single card
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: card, error } = await supabase
    .from('flashcard_cards')
    .select('*, flashcard_decks!inner(created_by)')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });

  return NextResponse.json({ data: card });
}

// PATCH /api/flashcards/cards/[id] - Update card
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { 
    front, 
    back, 
    position,
    front_image_url,
    back_image_url,
    tags,
    difficulty_level,
    is_starred,
    notes,
    template
  } = body;

  if (!front?.trim() || !back?.trim()) {
    return NextResponse.json({ error: 'Both front and back are required' }, { status: 400 });
  }

  // Verify user owns the deck
  const { data: card } = await supabase
    .from('flashcard_cards')
    .select('flashcard_decks!inner(created_by)')
    .eq('id', id)
    .single();

  if (!card || card.flashcard_decks.created_by !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const updateData: any = { 
    front: front.trim(), 
    back: back.trim(),
    updated_at: new Date().toISOString()
  };
  
  // Add optional fields if provided
  if (position !== undefined) updateData.position = position;
  if (front_image_url !== undefined) updateData.front_image_url = front_image_url;
  if (back_image_url !== undefined) updateData.back_image_url = back_image_url;
  if (tags !== undefined) updateData.tags = tags;
  if (difficulty_level !== undefined) updateData.difficulty_level = difficulty_level;
  if (is_starred !== undefined) updateData.is_starred = is_starred;
  if (notes !== undefined) updateData.notes = notes;
  if (template !== undefined) updateData.template = template;

  const { data, error } = await supabase
    .from('flashcard_cards')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/flashcards/cards/[id] - Delete card
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify user owns the deck
  const { data: card } = await supabase
    .from('flashcard_cards')
    .select('flashcard_decks!inner(created_by)')
    .eq('id', id)
    .single();

  if (!card || card.flashcard_decks.created_by !== user.id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { error } = await supabase
    .from('flashcard_cards')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}