import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type DeckCardRow = { position?: number | null; created_at: string };

// GET /api/flashcards/decks/[id] - Get deck details with cards
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: deck, error } = await supabase
    .from('flashcard_decks')
    .select(`
      *,
      flashcard_cards(*),
      portal_users!flashcard_decks_created_by_fkey(full_name),
      lessons(title),
      courses(name)
    `)
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });

  const deckWithCards = deck as typeof deck & { flashcard_cards?: DeckCardRow[] };
  if (Array.isArray(deckWithCards.flashcard_cards)) {
    deckWithCards.flashcard_cards.sort((a, b) => {
      const pos = (a.position ?? 0) - (b.position ?? 0);
      if (pos !== 0) return pos;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }

  return NextResponse.json({ data: deck });
}

// PATCH /api/flashcards/decks/[id] - Update deck
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, lesson_id, course_id } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const { data, error } = await supabase
    .from('flashcard_decks')
    .update({ 
      title: title.trim(), 
      lesson_id: lesson_id || null, 
      course_id: course_id || null 
    })
    .eq('id', id)
    .eq('created_by', user.id) // Only allow creator to update
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Deck not found or access denied' }, { status: 404 });

  return NextResponse.json({ data });
}

// DELETE /api/flashcards/decks/[id] - Delete deck
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('flashcard_decks')
    .delete()
    .eq('id', id)
    .eq('created_by', user.id); // Only allow creator to delete

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}