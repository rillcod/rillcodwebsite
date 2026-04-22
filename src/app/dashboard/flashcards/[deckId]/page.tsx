'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { 
  ArrowLeftIcon, PencilIcon, TrashIcon, PlayIcon,
  DocumentTextIcon, SparklesIcon, EyeIcon, XMarkIcon,
  CheckCircleIcon, ArrowPathIcon,
} from '@/lib/icons';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import EnhancedFlashcardBuilder from '@/components/flashcards/EnhancedFlashcardBuilder';

interface Card {
  id: string;
  front: string;
  back: string;
  position: number;
  template?: string;
  created_at: string;
}

interface Deck {
  id: string;
  title: string;
  lesson_id: string | null;
  course_id: string | null;
  created_at: string;
  portal_users?: { full_name: string };
  lessons?: { title: string };
  courses?: { name: string };
}

export default function FlashcardDeckPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editForm, setEditForm] = useState({ front: '', back: '' });
  const [saving, setSaving] = useState(false);
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());

  const deckId = params.deckId as string;
  const isTeacher = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');

  useEffect(() => {
    loadDeck();
    loadCards();
  }, [deckId]);

  async function loadDeck() {
    try {
      const res = await fetch(`/api/flashcards/decks/${deckId}`);
      const json = await res.json();
      if (res.ok) {
        setDeck(json.data);
      } else {
        router.push('/dashboard/flashcards');
      }
    } catch (error) {
      console.error('Failed to load deck:', error);
      router.push('/dashboard/flashcards');
    }
  }

  async function loadCards() {
    try {
      const res = await fetch(`/api/flashcards/decks/${deckId}/cards`);
      const json = await res.json();
      if (res.ok) {
        setCards(json.data ?? []);
      }
    } catch (error) {
      console.error('Failed to load cards:', error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteCard(cardId: string) {
    if (!confirm('Delete this flashcard? This cannot be undone.')) return;
    
    try {
      const res = await fetch(`/api/flashcards/cards/${cardId}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        setCards(prev => prev.filter(c => c.id !== cardId));
        toast.success('Card deleted');
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to delete card');
      }
    } catch {
      toast.error('Failed to delete card');
    }
  }

  async function updateCard() {
    if (!editingCard || !editForm.front.trim() || !editForm.back.trim()) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/flashcards/cards/${editingCard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          front: editForm.front.trim(),
          back: editForm.back.trim()
        })
      });
      
      if (res.ok) {
        const json = await res.json();
        setCards(prev => prev.map(c => c.id === editingCard.id ? json.data : c));
        setEditingCard(null);
        setEditForm({ front: '', back: '' });
        toast.success('Card updated');
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to update card');
      }
    } catch {
      toast.error('Failed to update card');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(card: Card) {
    setEditingCard(card);
    setEditForm({ front: card.front, back: card.back });
  }

  function cancelEdit() {
    setEditingCard(null);
    setEditForm({ front: '', back: '' });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!deck) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/flashcards"
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-black text-foreground">{deck.title}</h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                <span>{cards.length} cards</span>
                {deck.lessons?.title && (
                  <span>📖 {deck.lessons.title}</span>
                )}
                {deck.courses?.name && (
                  <span>🎓 {deck.courses.name}</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {profile?.role === 'student' && cards.length > 0 && (
              <Link
                href={`/dashboard/flashcards/${deckId}/review`}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-none transition-colors"
              >
                <PlayIcon className="w-4 h-4" />
                Start Review
              </Link>
            )}
            
            {isTeacher && (
              <>
                <button
                  onClick={() => setShowBuilder(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded-none transition-colors"
                >
                  <SparklesIcon className="w-4 h-4" />
                  Add Cards
                </button>
                
                <Link
                  href={`/dashboard/flashcards/${deckId}/edit`}
                  className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-sm font-bold rounded-none transition-colors"
                >
                  <PencilIcon className="w-4 h-4" />
                  Edit Deck
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Cards Grid */}
        {cards.length === 0 ? (
          <div className="text-center py-20 bg-card border border-border rounded-2xl">
            <div className="text-6xl mb-4">🃏</div>
            <h3 className="text-lg font-black text-foreground mb-2">No Cards Yet</h3>
            <p className="text-muted-foreground text-sm mb-6">
              {isTeacher ? 'Add flashcards using the builder or AI generation.' : 'Ask your teacher to add some cards!'}
            </p>
            {isTeacher && (
              <button onClick={() => setShowBuilder(true)}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-black rounded-xl transition-colors">
                Add First Card
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {cards.map((card, index) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className="bg-card border border-border rounded-2xl overflow-hidden hover:border-orange-500/30 hover:shadow-lg transition-all group"
              >
                {editingCard?.id === card.id ? (
                  <div className="p-5 space-y-3">
                    <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Editing Card {index + 1}</p>
                    <div>
                      <label className="block text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Question</label>
                      <textarea value={editForm.front} onChange={e => setEditForm(p => ({ ...p, front: e.target.value }))}
                        className="w-full h-20 bg-background border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-orange-500 transition-colors"
                        placeholder="Enter the question…" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Answer</label>
                      <textarea value={editForm.back} onChange={e => setEditForm(p => ({ ...p, back: e.target.value }))}
                        className="w-full h-20 bg-background border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-orange-500 transition-colors"
                        placeholder="Enter the answer…" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={cancelEdit} className="flex-1 py-2 bg-muted text-muted-foreground text-sm font-black rounded-xl hover:bg-muted/80 transition-colors">Cancel</button>
                      <button onClick={updateCard} disabled={saving || !editForm.front.trim() || !editForm.back.trim()}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-black rounded-xl transition-colors">
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Flip card preview */}
                    <div
                      className={`p-5 space-y-3 min-h-[140px] flex flex-col justify-between ${!isTeacher ? 'cursor-pointer select-none' : ''}`}
                      onClick={() => {
                        if (!isTeacher) setFlippedCards(prev => {
                          const next = new Set(prev);
                          next.has(card.id) ? next.delete(card.id) : next.add(card.id);
                          return next;
                        });
                      }}
                    >
                      <AnimatePresence mode="wait">
                        {!flippedCards.has(card.id) ? (
                          <motion.div key="front" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                            <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2">Question</p>
                            <p className="text-sm font-medium text-foreground leading-relaxed">{card.front}</p>
                          </motion.div>
                        ) : (
                          <motion.div key="back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                            <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-2">Answer</p>
                            <p className="text-sm text-foreground leading-relaxed">{card.back}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {!isTeacher && (
                        <p className="text-[9px] text-muted-foreground/40 mt-2">
                          {flippedCards.has(card.id) ? '🔄 Tap for question' : '👆 Tap to reveal answer'}
                        </p>
                      )}
                    </div>

                    {/* Card number + template badge */}
                    <div className="px-5 pb-3 flex items-center justify-between">
                      <span className="text-[9px] text-muted-foreground/40 font-black uppercase tracking-widest">#{index + 1}</span>
                      {card.template && card.template !== 'classic' && (
                        <span className="text-[8px] px-2 py-0.5 bg-muted rounded-full text-muted-foreground font-bold capitalize">{card.template}</span>
                      )}
                    </div>

                    {isTeacher && (
                      <div className="px-5 pb-5 flex gap-2 border-t border-border pt-3">
                        <button onClick={() => startEdit(card)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-black rounded-xl transition-colors">
                          <PencilIcon className="w-3 h-3" /> Edit
                        </button>
                        <button onClick={() => deleteCard(card.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 text-xs font-black rounded-xl transition-colors">
                          <TrashIcon className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Enhanced Flashcard Builder */}
      <AnimatePresence>
        {showBuilder && (
          <EnhancedFlashcardBuilder
            deckId={deckId}
            onClose={() => setShowBuilder(false)}
            onCardCreated={() => {
              loadCards();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}