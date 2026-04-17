'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { 
  ArrowLeftIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  CheckIcon,
  SparklesIcon,
  ArrowPathIcon
} from '@/lib/icons';
import Link from 'next/link';

interface Card {
  id: string;
  front: string;
  back: string;
  position: number;
}

interface Deck {
  id: string;
  title: string;
  flashcard_cards: Card[];
}

export default function EditFlashcardDeckPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const deckId = params?.deckId as string;

  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddCard, setShowAddCard] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [newCardFront, setNewCardFront] = useState('');
  const [newCardBack, setNewCardBack] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAIGenerate, setShowAIGenerate] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiContent, setAiContent] = useState('');
  const [aiCount, setAiCount] = useState(10);
  const [aiDifficulty, setAiDifficulty] = useState('medium');
  const [generating, setGenerating] = useState(false);

  const isTeacher = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');

  useEffect(() => {
    if (deckId) loadDeck();
  }, [deckId]);

  async function loadDeck() {
    setLoading(true);
    try {
      const res = await fetch(`/api/flashcards/decks/${deckId}`);
      const json = await res.json();
      if (res.ok) {
        setDeck(json.data);
      } else {
        alert(json.error || 'Failed to load deck');
        router.push('/dashboard/flashcards');
      }
    } catch (error) {
      alert('Failed to load deck');
      router.push('/dashboard/flashcards');
    } finally {
      setLoading(false);
    }
  }

  async function addCard() {
    if (!newCardFront.trim() || !newCardBack.trim()) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/flashcards/decks/${deckId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          front: newCardFront,
          back: newCardBack
        })
      });
      
      const json = await res.json();
      if (res.ok) {
        setDeck(prev => prev ? {
          ...prev,
          flashcard_cards: [...prev.flashcard_cards, json.data]
        } : null);
        setNewCardFront('');
        setNewCardBack('');
        setShowAddCard(false);
      } else {
        alert(json.error || 'Failed to add card');
      }
    } catch (error) {
      alert('Failed to add card');
    } finally {
      setSaving(false);
    }
  }

  async function updateCard() {
    if (!editingCard || !newCardFront.trim() || !newCardBack.trim()) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/flashcards/cards/${editingCard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          front: newCardFront,
          back: newCardBack
        })
      });
      
      const json = await res.json();
      if (res.ok) {
        setDeck(prev => prev ? {
          ...prev,
          flashcard_cards: prev.flashcard_cards.map(card => 
            card.id === editingCard.id ? json.data : card
          )
        } : null);
        setEditingCard(null);
        setNewCardFront('');
        setNewCardBack('');
      } else {
        alert(json.error || 'Failed to update card');
      }
    } catch (error) {
      alert('Failed to update card');
    } finally {
      setSaving(false);
    }
  }

  async function deleteCard(cardId: string) {
    if (!confirm('Delete this flashcard?')) return;
    
    try {
      const res = await fetch(`/api/flashcards/cards/${cardId}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        setDeck(prev => prev ? {
          ...prev,
          flashcard_cards: prev.flashcard_cards.filter(card => card.id !== cardId)
        } : null);
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to delete card');
      }
    } catch (error) {
      alert('Failed to delete card');
    }
  }

  async function generateAICards() {
    if (!aiTopic.trim() && !aiContent.trim()) return;
    
    setGenerating(true);
    try {
      const res = await fetch(`/api/flashcards/decks/${deckId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: aiTopic,
          content: aiContent,
          count: aiCount,
          difficulty: aiDifficulty
        })
      });
      
      const json = await res.json();
      if (res.ok) {
        alert(json.message || `Generated ${json.generated} flashcards!`);
        setShowAIGenerate(false);
        setAiTopic('');
        setAiContent('');
        loadDeck(); // Refresh to show new cards
      } else {
        alert(json.error || 'Failed to generate flashcards');
      }
    } catch (error) {
      alert('Failed to generate flashcards');
    } finally {
      setGenerating(false);
    }
  }

  function startEdit(card: Card) {
    setEditingCard(card);
    setNewCardFront(card.front);
    setNewCardBack(card.back);
  }

  function cancelEdit() {
    setEditingCard(null);
    setNewCardFront('');
    setNewCardBack('');
    setShowAddCard(false);
  }

  if (!isTeacher) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Access denied. Teachers only.</p>
          <Link href="/dashboard/flashcards" className="text-orange-400 hover:text-orange-300 mt-2 inline-block">
            Back to Flashcards
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Deck not found.</p>
          <Link href="/dashboard/flashcards" className="text-orange-400 hover:text-orange-300 mt-2 inline-block">
            Back to Flashcards
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href="/dashboard/flashcards"
              className="p-2 hover:bg-muted rounded-none transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5 text-muted-foreground" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{deck.title}</h1>
              <p className="text-muted-foreground text-sm">
                {deck.flashcard_cards.length} card{deck.flashcard_cards.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setShowAIGenerate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded-none transition-colors"
            >
              <SparklesIcon className="w-4 h-4" />
              AI Generate
            </button>
            <button
              onClick={() => setShowAddCard(true)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-none transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Add Card
            </button>
          </div>
        </div>

        {/* Cards Grid */}
        {deck.flashcard_cards.length === 0 ? (
          <div className="text-center py-20 bg-card border border-border rounded-none">
            <div className="w-16 h-16 bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
              <PlusIcon className="w-8 h-8 text-orange-400" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">No Cards Yet</h3>
            <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
              Start building your flashcard deck by adding cards manually or using AI generation.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setShowAddCard(true)}
                className="px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-none transition-colors"
              >
                Add First Card
              </button>
              <button
                onClick={() => setShowAIGenerate(true)}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-none transition-colors"
              >
                Generate with AI
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {deck.flashcard_cards.map((card, index) => (
              <div key={card.id} className="bg-card border border-border rounded-none overflow-hidden group">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-xs text-muted-foreground font-medium">
                      Card {index + 1}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(card)}
                        className="p-2 hover:bg-muted rounded-none transition-colors"
                        title="Edit Card"
                      >
                        <PencilIcon className="w-4 h-4 text-blue-400" />
                      </button>
                      <button
                        onClick={() => deleteCard(card.id)}
                        className="p-2 hover:bg-rose-500/10 rounded-none transition-colors"
                        title="Delete Card"
                      >
                        <TrashIcon className="w-4 h-4 text-rose-400" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-2">
                        FRONT
                      </label>
                      <div className="bg-background border border-border rounded-none p-4 min-h-[80px]">
                        <p className="text-sm text-foreground whitespace-pre-wrap">{card.front}</p>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-2">
                        BACK
                      </label>
                      <div className="bg-background border border-border rounded-none p-4 min-h-[80px]">
                        <p className="text-sm text-foreground whitespace-pre-wrap">{card.back}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Card Modal */}
        {(showAddCard || editingCard) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-none w-full max-w-2xl p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground">
                  {editingCard ? 'Edit Card' : 'Add New Card'}
                </h2>
                <button 
                  onClick={cancelEdit}
                  className="p-2 hover:bg-muted rounded-none transition-colors"
                >
                  <XMarkIcon className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Front (Question/Term)
                  </label>
                  <textarea
                    value={newCardFront}
                    onChange={e => setNewCardFront(e.target.value)}
                    placeholder="Enter the question, term, or concept..."
                    rows={3}
                    className="w-full bg-background border border-border text-foreground px-4 py-3 rounded-none focus:outline-none focus:border-orange-500 text-sm resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Back (Answer/Definition)
                  </label>
                  <textarea
                    value={newCardBack}
                    onChange={e => setNewCardBack(e.target.value)}
                    placeholder="Enter the answer, definition, or explanation..."
                    rows={4}
                    className="w-full bg-background border border-border text-foreground px-4 py-3 rounded-none focus:outline-none focus:border-orange-500 text-sm resize-none"
                  />
                </div>
              </div>
              
              <div className="flex gap-3">
                <button 
                  onClick={cancelEdit} 
                  className="flex-1 py-3 bg-muted text-muted-foreground font-bold rounded-none hover:bg-muted/80 text-sm transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={editingCard ? updateCard : addCard} 
                  disabled={!newCardFront.trim() || !newCardBack.trim() || saving} 
                  className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold rounded-none text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      {editingCard ? 'Updating...' : 'Adding...'}
                    </>
                  ) : (
                    <>
                      <CheckIcon className="w-4 h-4" />
                      {editingCard ? 'Update Card' : 'Add Card'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI Generate Modal */}
        {showAIGenerate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-none w-full max-w-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="w-5 h-5 text-purple-400" />
                  <h2 className="text-xl font-bold text-foreground">AI Flashcard Generator</h2>
                </div>
                <button 
                  onClick={() => setShowAIGenerate(false)}
                  className="p-2 hover:bg-muted rounded-none transition-colors"
                >
                  <XMarkIcon className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Topic or Subject
                  </label>
                  <input
                    value={aiTopic}
                    onChange={e => setAiTopic(e.target.value)}
                    placeholder="e.g., Python functions, World War II, Cell biology"
                    className="w-full bg-background border border-border text-foreground px-4 py-3 rounded-none focus:outline-none focus:border-purple-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Content (Optional)
                  </label>
                  <textarea
                    value={aiContent}
                    onChange={e => setAiContent(e.target.value)}
                    placeholder="Paste your study material, notes, or textbook content here for AI to create flashcards from..."
                    rows={4}
                    className="w-full bg-background border border-border text-foreground px-4 py-3 rounded-none focus:outline-none focus:border-purple-500 text-sm resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Number of Cards
                    </label>
                    <select
                      value={aiCount}
                      onChange={e => setAiCount(Number(e.target.value))}
                      className="w-full bg-background border border-border text-foreground px-4 py-3 rounded-none focus:outline-none focus:border-purple-500 text-sm"
                    >
                      <option value={5}>5 cards</option>
                      <option value={10}>10 cards</option>
                      <option value={15}>15 cards</option>
                      <option value={20}>20 cards</option>
                      <option value={25}>25 cards</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Difficulty Level
                    </label>
                    <select
                      value={aiDifficulty}
                      onChange={e => setAiDifficulty(e.target.value)}
                      className="w-full bg-background border border-border text-foreground px-4 py-3 rounded-none focus:outline-none focus:border-purple-500 text-sm"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowAIGenerate(false)} 
                  className="flex-1 py-3 bg-muted text-muted-foreground font-bold rounded-none hover:bg-muted/80 text-sm transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={generateAICards} 
                  disabled={(!aiTopic.trim() && !aiContent.trim()) || generating} 
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-none text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {generating ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="w-4 h-4" />
                      Generate Cards
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}