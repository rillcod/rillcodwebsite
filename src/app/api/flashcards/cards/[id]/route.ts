import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFlashcardCaller, loadFlashcardDeckForManage, loadFlashcardDeckForRead } from '@/lib/flashcards/auth';

async function loadCardWithDeck(admin: any, id: string) {
  const { data: card, error } = await admin
    .from('flashcard_cards')
    .select('*, flashcard_decks!inner(id)')
    .eq('id', id)
    .maybeSingle();
  return { card, error, deckId: card?.flashcard_decks?.id ?? null };
}

export const dynamic = 'force-dynamic';

// GET /api/flashcards/cards/[id] - Get single card
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const caller = await getFlashcardCaller(admin as any, user.id);
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { card, error, deckId } = await loadCardWithDeck(admin as any, id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  if (!deckId) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
  const { deck } = await loadFlashcardDeckForRead(admin as any, caller, deckId);
  if (!deck) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

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

  const admin = createAdminClient();
  const caller = await getFlashcardCaller(admin as any, user.id);
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { deckId } = await loadCardWithDeck(admin as any, id);
  if (!deckId) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  const { deck } = await loadFlashcardDeckForManage(admin as any, caller, deckId);
  if (!deck) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

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

  const { data, error } = await (admin as any)
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

  const admin = createAdminClient();
  const caller = await getFlashcardCaller(admin as any, user.id);
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { deckId } = await loadCardWithDeck(admin as any, id);
  if (!deckId) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  const { deck } = await loadFlashcardDeckForManage(admin as any, caller, deckId);
  if (!deck) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const { error } = await (admin as any)
    .from('flashcard_cards')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}