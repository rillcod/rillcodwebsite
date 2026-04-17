'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { 
  ArrowLeftIcon,
  PencilIcon,
  TrashIcon,
  ArrowPathIcon,
  StarIcon,
  ClockIcon,
  UserIcon,
  BookOpenIcon,
  AcademicCapIcon
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
  created_at: string;
  flashcard_cards: Card[];
  portal_users?: { full_name: string };
  lessons?: { title: string };
  courses?: { name: string };
}

export default function FlashcardDeckDetailsPage() {
  const params = useParams();
  const { profile } = useAuth();
  const deckId = params?.deckId as string;

  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCard, setShowCard] = useState<Card | null>(null);
  const [showBack, setShowBack] = useState(false);

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
      }
    } catch (error) {
      alert('Failed to load deck');
    } finally {
      setLoading(false);
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

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
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        
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
              <h1 className="text-3xl font-bold text-foreground">{deck.title}</h1>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <StarIcon className="w-4 h-4" />
                  <span>{deck.flashcard_cards.length} cards</span>
                </div>
                <div className="flex items-center gap-1">
                  <ClockIcon className="w-4 h-4" />
                  <span>Created {formatDate(deck.created_at)}</span>
                </div>
                {deck.portal_users?.full_name && (
                  <div className="flex items-center gap-1">
                    <UserIcon className="w-4 h-4" />
                    <span>by {deck.portal_users.full_name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
            {profile?.role === 'student' && deck.flashcard_cards.length > 0 && (
              <Link
                href={`/dashboard/flashcards/${deckId}/review`}
                className="flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-none transition-colors"
              >
                <ArrowPathIcon className="w-4 h-4" />
                Start Review
              </Link>
            )}
            
            {isTeacher && (
              <Link
                href={`/dashboard/flashcards/${deckId}/edit`}
                className="flex items-center gap-2 px-6 py-3 bg-muted hover:bg-muted/80 text-foreground text-sm font-bold rounded-none transition-colors"
              >
                <PencilIcon className="w-4 h-4" />
                Edit Deck
              </Link>
            )}
          </div>
        </div>

        {/* Deck Info */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-card border border-border rounded-none p-6 space-y-6">
              <div>
                <h3 className="text-sm font-bold text-foreground mb-4">Deck Information</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total Cards</span>
                    <span className="text-sm font-bold text-foreground">{deck.flashcard_cards.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Study Method</span>
                    <span className="text-sm font-bold text-orange-400">SM-2</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Created</span>
                    <span className="text-sm font-bold text-foreground">{formatDate(deck.created_at)}</span>
                  </div>
                  {deck.portal_users?.full_name && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Author</span>
                      <span className="text-sm font-bold text-foreground">{deck.portal_users.full_name}</span>
                    </div>
                  )}
                </div>
              </div>

              {(deck.lessons?.title || deck.courses?.name) && (
                <div>
                  <h3 className="text-sm font-bold text-foreground mb-4">Linked Content</h3>
                  <div className="space-y-2">
                    {deck.lessons?.title && (
                      <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-none">
                        <BookOpenIcon className="w-4 h-4 text-blue-400" />
                        <span className="text-sm text-blue-400">{deck.lessons.title}</span>
                      </div>
                    )}
                    {deck.courses?.name && (
                      <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-none">
                        <AcademicCapIcon className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm text-emerald-400">{deck.courses.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {profile?.role === 'student' && (
                <div>
                  <h3 className="text-sm font-bold text-foreground mb-4">Study Tips</h3>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p>• Review cards daily for best retention</p>
                    <p>• Focus on cards you find difficult</p>
                    <p>• Use spaced repetition consistently</p>
                    <p>• Take breaks between study sessions</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cards Preview */}
          <div className="lg:col-span-3">
            {deck.flashcard_cards.length === 0 ? (
              <div className="text-center py-20 bg-card border border-border rounded-none">
                <AcademicCapIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-bold text-foreground mb-2">No Cards Yet</h3>
                <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
                  This deck doesn't have any flashcards yet. 
                  {isTeacher ? ' Add some cards to get started.' : ' Ask your teacher to add some cards.'}
                </p>
                {isTeacher && (
                  <Link
                    href={`/dashboard/flashcards/${deckId}/edit`}
                    className="px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-none transition-colors"
                  >
                    Add Cards
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground">Flashcards Preview</h3>
                  <p className="text-sm text-muted-foreground">
                    Click any card to preview
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {deck.flashcard_cards.map((card, index) => (
                    <div 
                      key={card.id} 
                      className="bg-card border border-border rounded-none p-6 cursor-pointer hover:border-orange-500/30 transition-all group"
                      onClick={() => setShowCard(card)}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs text-muted-foreground font-medium">
                          Card {index + 1}
                        </span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-xs text-orange-400">Click to preview</span>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            FRONT
                          </label>
                          <p className="text-sm text-foreground line-clamp-2">{card.front}</p>
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            BACK
                          </label>
                          <p className="text-sm text-muted-foreground line-clamp-2">{card.back}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Card Preview Modal */}
        {showCard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-none w-full max-w-2xl">
              <div className="p-6 border-b border-border flex items-center justify-between">
                <h3 className="text-lg font-bold text-foreground">Card Preview</h3>
                <button 
                  onClick={() => {
                    setShowCard(null);
                    setShowBack(false);
                  }}
                  className="p-2 hover:bg-muted rounded-none transition-colors"
                >
                  <ArrowLeftIcon className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              
              <div className="p-8">
                <div className="bg-background border border-border rounded-none p-8 min-h-[200px] flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-lg text-foreground mb-4 whitespace-pre-wrap">
                      {showBack ? showCard.back : showCard.front}
                    </p>
                    <button
                      onClick={() => setShowBack(!showBack)}
                      className="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-none transition-colors"
                    >
                      {showBack ? 'Show Front' : 'Show Back'}
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="p-6 border-t border-border text-center">
                <p className="text-xs text-muted-foreground">
                  {showBack ? 'Back' : 'Front'} • Card {deck.flashcard_cards.findIndex(c => c.id === showCard.id) + 1} of {deck.flashcard_cards.length}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}