'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { ArrowLeftIcon } from '@/lib/icons';
import EnhancedFlashcardBuilder from '@/components/flashcards/EnhancedFlashcardBuilder';

interface DeckSummary {
  id: string;
  title: string;
}

export default function EditFlashcardDeckPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const deckId = params?.deckId as string;
  const [deck, setDeck] = useState<DeckSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const isTeacher = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');

  useEffect(() => {
    async function loadDeck() {
      setLoading(true);
      try {
        const res = await fetch(`/api/flashcards/decks/${deckId}`);
        const json = await res.json();
        if (!res.ok) {
          router.push('/dashboard/flashcards');
          return;
        }
        setDeck({ id: json.data.id, title: json.data.title });
      } finally {
        setLoading(false);
      }
    }

    if (deckId) loadDeck();
  }, [deckId, router]);

  if (!isTeacher) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Access denied. Teachers only.</p>
          <Link href="/dashboard/flashcards" className="text-primary hover:text-primary mt-2 inline-block">
            Back to Flashcards
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !deck) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-4">
          <Link href={`/dashboard/flashcards/${deckId}`} className="p-2 hover:bg-muted rounded-xl transition-colors">
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-black">{deck.title}</h1>
            <p className="text-xs text-muted-foreground">Unified deck editor</p>
          </div>
        </div>
      </div>

      <EnhancedFlashcardBuilder
        deckId={deckId}
        onClose={() => router.push(`/dashboard/flashcards/${deckId}`)}
        onCardCreated={() => {}}
      />
    </div>
  );
}