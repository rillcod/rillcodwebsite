'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { AcademicCapIcon, ClockIcon, CheckCircleIcon, StarIcon, XMarkIcon, PlusIcon, ArrowPathIcon } from '@/lib/icons';
import Link from 'next/link';

interface Deck {
  id: string;
  title: string;
  lesson_id: string | null;
  course_id: string | null;
  created_at: string;
  flashcard_cards: { count: number }[];
}

export default function FlashcardsPage() {
  const { profile } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const isTeacher = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');

  useEffect(() => { loadDecks(); }, []);

  async function loadDecks() {
    setLoading(true);
    const res = await fetch('/api/flashcards/decks');
    const json = await res.json();
    setDecks(json.data ?? []);
    setLoading(false);
  }

  async function createDeck() {
    if (!newTitle.trim()) return;
    setCreating(true);
    const res = await fetch('/api/flashcards/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    });
    const json = await res.json();
    if (res.ok) { setDecks(prev => [json.data, ...prev]); setNewTitle(''); setShowCreate(false); }
    setCreating(false);
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AcademicCapIcon className="w-5 h-5 text-orange-400" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Spaced Repetition</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black">Flashcard Decks</h1>
            <p className="text-muted-foreground text-sm mt-1">Study smarter with SM-2 spaced repetition algorithm</p>
          </div>
          {isTeacher && (
            <button 
              onClick={() => setShowCreate(true)} 
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 min-h-[44px] sm:min-h-0 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-none transition-colors"
            >
              <PlusIcon className="w-4 h-4" /> New Deck
            </button>
          )}
        </div>

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-[#0d1526] border border-border rounded-none w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-black text-foreground">New Flashcard Deck</h2>
                <button 
                  onClick={() => setShowCreate(false)}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-muted/50 transition-colors"
                >
                  <XMarkIcon className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Deck title, e.g. Python Basics"
                className="w-full bg-card border border-border text-foreground px-4 py-3 min-h-[44px] rounded-none focus:outline-none focus:border-orange-500 text-sm"
                onKeyDown={e => e.key === 'Enter' && createDeck()}
              />
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowCreate(false)} 
                  className="flex-1 py-3 min-h-[44px] bg-card text-muted-foreground font-bold rounded-none hover:bg-muted text-sm transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={createDeck} 
                  disabled={!newTitle.trim() || creating} 
                  className="flex-1 py-3 min-h-[44px] bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-bold rounded-none text-sm transition-colors"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : decks.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-none">
            <AcademicCapIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">{isTeacher ? 'Create your first flashcard deck for students.' : 'No flashcard decks available yet.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {decks.map(deck => {
              const cardCount = deck.flashcard_cards?.[0]?.count ?? 0;
              return (
                <div key={deck.id} className="bg-card border border-border rounded-none p-5 space-y-3 hover:border-orange-500/30 transition-colors">
                  <h3 className="font-bold text-foreground">{deck.title}</h3>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <StarIcon className="w-3.5 h-3.5" /> {cardCount} card{cardCount !== 1 ? 's' : ''}
                  </div>
                  <div className="flex gap-2">
                    {profile?.role === 'student' && (
                      <Link href={`/dashboard/flashcards/${deck.id}/review`}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 min-h-[44px] bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-none transition-colors">
                        <ArrowPathIcon className="w-3.5 h-3.5" /> Start Review
                      </Link>
                    )}
                    {isTeacher && (
                      <Link href={`/dashboard/flashcards/${deck.id}/edit`}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 min-h-[44px] bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-none transition-colors">
                        Edit Cards
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
