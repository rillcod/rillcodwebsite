'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { 
  ArrowLeftIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  PlayIcon,
  EyeIcon,
  DocumentTextIcon,
  SparklesIcon,
  CheckIcon,
  XMarkIcon
} from '@/lib/icons';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import FlashcardBuilder from '@/components/flashcards/FlashcardBuilder';

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
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to delete card');
      }
    } catch (error) {
      alert('Failed to delete card');
    }
  }

  async function updateCard() {
    if (!editingCard || !editForm.front.trim() || !editForm.back.trim()) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/flashcards/cards/${editingCard.id}`, {
        method: 'PUT',
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
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to update card');
      }
    } catch (error) {
      alert('Failed to update card');
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
          <div className="text-center py-20 bg-card border border-border">
            <DocumentTextIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">No Cards Yet</h3>
            <p className="text-muted-foreground text-sm mb-6">
              {isTeacher 
                ? 'Add flashcards to this deck using the builder or AI generation.'
                : 'This deck doesn\'t have any cards yet. Ask your teacher to add some!'}
            </p>
            {isTeacher && (
              <button
                onClick={() => setShowBuilder(true)}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-none transition-colors"
              >
                Add First Card
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cards.map((card, index) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-card border border-border overflow-hidden hover:border-orange-500/30 transition-all group"
              >
                {editingCard?.id === card.id ? (
                  /* Edit Mode */
                  <div className="p-6 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground mb-2">Front (Question)</label>
                      <textarea
                        value={editForm.front}
                        onChange={(e) => setEditForm(prev => ({ ...prev, front: e.target.value }))}
                        className="w-full h-20 bg-background border border-border px-3 py-2 text-sm resize-none focus:outline-none focus:border-orange-500"
                        placeholder="Enter the question..."
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-bold text-muted-foreground mb-2">Back (Answer)</label>
                      <textarea
                        value={editForm.back}
                        onChange={(e) => setEditForm(prev => ({ ...prev, back: e.target.value }))}
                        className="w-full h-20 bg-background border border-border px-3 py-2 text-sm resize-none focus:outline-none focus:border-orange-500"
                        placeholder="Enter the answer..."
                      />
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={cancelEdit}
                        className="flex-1 py-2 bg-muted text-muted-foreground text-sm font-bold hover:bg-muted/80 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={updateCard}
                        disabled={saving || !editForm.front.trim() || !editForm.back.trim()}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold transition-colors"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View Mode */
                  <>
                    <div className="p-6 space-y-4">
                      <div>
                        <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">Question</p>
                        <p className="text-sm font-medium text-foreground leading-relaxed">
                          {card.front}
                        </p>
                      </div>
                      
                      <div>
                        <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">Answer</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {card.back}
                        </p>
                      </div>
                    </div>
                    
                    {isTeacher && (
                      <div className="px-6 pb-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(card)}
                          className="flex-1 flex items-center justify-center gap-2 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold transition-colors"
                        >
                          <PencilIcon className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          onClick={() => deleteCard(card.id)}
                          className="flex-1 flex items-center justify-center gap-2 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 text-xs font-bold transition-colors"
                        >
                          <TrashIcon className="w-3 h-3" />
                          Delete
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

      {/* Flashcard Builder */}
      <AnimatePresence>
        {showBuilder && (
          <FlashcardBuilder
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