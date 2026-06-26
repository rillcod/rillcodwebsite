import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFlashcardCaller, loadFlashcardDeckForManage, loadFlashcardDeckForRead } from '@/lib/flashcards/auth';

export const dynamic = 'force-dynamic';

// GET /api/flashcards/decks/[id] - Get deck details with cards
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient();
  const caller = await getFlashcardCaller(db as any, user.id);
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { deck, error } = await loadFlashcardDeckForRead(db as any, caller, id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!deck) return NextResponse.json({ error: error?.message === 'Forbidden' ? 'Forbidden' : 'Deck not found' }, { status: error?.message === 'Forbidden' ? 403 : 404 });

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

  const db = createAdminClient();
  const caller = await getFlashcardCaller(db as any, user.id);
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { deck } = await loadFlashcardDeckForManage(db as any, caller, id);
  if (!deck) return NextResponse.json({ error: 'Deck not found or access denied' }, { status: 404 });

  const { data, error } = await db
    .from('flashcard_decks')
    .update({ 
      title: title.trim(), 
      lesson_id: lesson_id || null, 
      course_id: course_id || null 
    })
    .eq('id', id)
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

  const db = createAdminClient();
  const caller = await getFlashcardCaller(db as any, user.id);
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { deck } = await loadFlashcardDeckForManage(db as any, caller, id);
  if (!deck) return NextResponse.json({ error: 'Deck not found or access denied' }, { status: 404 });

  const { error } = await db
    .from('flashcard_decks')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}