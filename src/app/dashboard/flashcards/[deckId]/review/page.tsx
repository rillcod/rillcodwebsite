'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import StudentFlashcardReview from '@/components/flashcards/StudentFlashcardReview';

interface Deck {
  id: string;
  title: string;
  flashcard_cards: { count: number }[];
}

export default function FlashcardReviewPage() {
  const params = useParams();
  const router = useRouter();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);

  const deckId = params.deckId as string;

  useEffect(() => {
    loadDeck();
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
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading flashcards...</p>
        </div>
      </div>
    );
  }

  if (!deck) {
    return null;
  }

  return (
    <StudentFlashcardReview
      deckId={deckId}
      deckTitle={deck.title}
      onComplete={() => router.push('/dashboard/flashcards')}
      onExit={() => router.push('/dashboard/flashcards')}
    />
  );
}