'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { AcademicCapIcon, ArrowLeftIcon, CheckCircleIcon, XCircleIcon } from '@/lib/icons';
import Link from 'next/link';

interface Card {
  id: string;
  front: string;
  back: string;
  position: number;
}

const QUALITY_LABELS = [
  { q: 1, label: 'Again', color: 'bg-rose-600 hover:bg-rose-500', desc: 'Complete blackout' },
  { q: 2, label: 'Hard', color: 'bg-orange-600 hover:bg-orange-500', desc: 'Significant difficulty' },
  { q: 3, label: 'Good', color: 'bg-amber-600 hover:bg-amber-500', desc: 'Correct with effort' },
  { q: 4, label: 'Easy', color: 'bg-emerald-600 hover:bg-emerald-500', desc: 'Correct with hesitation' },
  { q: 5, label: 'Perfect', color: 'bg-blue-600 hover:bg-blue-500', desc: 'Perfect recall' },
];

export default function FlashcardReviewPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { profile } = useAuth();
  const [deckId, setDeckId] = useState('');
  const [cards, setCards] = useState<Card[]>([]);
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [nextReviewAt, setNextReviewAt] = useState<string | null>(null);
  const [results, setResults] = useState<{ quality: number }[]>([]);

  useEffect(() => {
    params.then(p => {
      setDeckId(p.deckId);
      loadDueCards(p.deckId);
    });
  }, []);

  async function loadDueCards(id: string) {
    setLoading(true);
    const res = await fetch(`/api/flashcards/decks/${id}/due`);
    const json = await res.json();
    setCards(json.data ?? []);
    setNextReviewAt(json.nextReviewAt);
    setLoading(false);
  }

  async function rate(quality: number) {
    const card = cards[current];
    await fetch('/api/flashcards/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: card.id, quality }),
    });
    setResults(prev => [...prev, { quality }]);
    if (current + 1 >= cards.length) {
      setDone(true);
    } else {
      setCurrent(c => c + 1);
      setFlipped(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (cards.length === 0) return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <CheckCircleIcon className="w-16 h-16 mx-auto text-emerald-400 mb-4" />
        <h1 className="text-2xl font-black mb-2">No cards due!</h1>
        <p className="text-muted-foreground text-sm mb-6">
          {nextReviewAt
            ? `Your next review is scheduled for ${new Date(nextReviewAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}.`
            : 'Great work! Check back later.'}
        </p>
        <Link href="/dashboard/flashcards" className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-none transition-colors text-sm">
          Back to Decks
        </Link>
      </div>
    </div>
  );

  if (done) {
    const great = results.filter(r => r.quality >= 4).length;
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <AcademicCapIcon className="w-16 h-16 mx-auto text-orange-400 mb-4" />
          <h1 className="text-2xl font-black mb-2">Session Complete! 🎉</h1>
          <p className="text-muted-foreground text-sm mb-2">{cards.length} cards reviewed</p>
          <p className="text-emerald-400 text-sm mb-6">{great} / {cards.length} recalled well</p>
          <Link href="/dashboard/flashcards" className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-none transition-colors text-sm">
            Back to Decks
          </Link>
        </div>
      </div>
    );
  }

  const card = cards[current];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div className="h-1 bg-orange-500 transition-all duration-300" style={{ width: `${(current / cards.length) * 100}%` }} />
      </div>

      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 py-8 gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/dashboard/flashcards" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <p className="text-muted-foreground text-sm">{current + 1} / {cards.length}</p>
        </div>

        {/* Card */}
        <div
          className={`flex-1 min-h-48 bg-card border-2 rounded-none cursor-pointer flex items-center justify-center p-8 text-center transition-all duration-300 ${flipped ? 'border-orange-500/50' : 'border-border hover:border-orange-500/20'}`}
          onClick={() => setFlipped(!flipped)}
        >
          <div>
            {!flipped ? (
              <>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Question</p>
                <p className="text-xl font-bold text-foreground leading-relaxed">{card.front}</p>
                <p className="text-xs text-muted-foreground mt-6">Click to reveal answer</p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Answer</p>
                <p className="text-xl font-bold text-orange-400 leading-relaxed">{card.back}</p>
              </>
            )}
          </div>
        </div>

        {/* Rating buttons */}
        {flipped && (
          <div>
            <p className="text-xs text-muted-foreground text-center mb-3">How well did you recall this?</p>
            <div className="grid grid-cols-5 gap-2">
              {QUALITY_LABELS.map(({ q, label, color }) => (
                <button key={q} onClick={() => rate(q)} className={`py-3 ${color} text-white text-xs font-bold rounded-none transition-colors`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!flipped && (
          <button onClick={() => setFlipped(true)} className="py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-none transition-colors">
            Reveal Answer
          </button>
        )}
      </div>
    </div>
  );
}
