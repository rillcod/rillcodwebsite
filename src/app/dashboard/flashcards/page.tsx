'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  AcademicCapIcon, ClockIcon, StarIcon, XMarkIcon,
  PlusIcon, ArrowPathIcon, TrashIcon, SparklesIcon,
  BookOpenIcon, EyeIcon, DocumentTextIcon,
} from '@/lib/icons';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import EnhancedFlashcardBuilder from '@/components/flashcards/EnhancedFlashcardBuilder';
import PipelineStepper from '@/components/pipeline/PipelineStepper';

interface Deck {
  id: string;
  title: string;
  lesson_id: string | null;
  course_id: string | null;
  created_at: string;
  flashcard_cards: { count: number }[];
  portal_users?: { full_name: string };
  lessons?: { title: string };
  courses?: { name: string };
}

export default function FlashcardsPage() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();

  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [dueCount, setDueCount] = useState<number>(0);

  // Context from curriculum/lesson pipeline
  const courseIdParam = searchParams.get('course_id') ?? '';
  const lessonIdParam = searchParams.get('lesson_id') ?? '';
  const topicParam    = searchParams.get('topic')     ?? '';
  const autoGenParam  = searchParams.get('autoGenerate') === 'true';

  const isTeacher = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');

  useEffect(() => { 
    loadDecks(); 
    // Handle auto-generation redirect from curriculum
    const deckId = searchParams.get('deckId');
    if (autoGenParam && deckId) {
      setSelectedDeckId(deckId);
      setShowBuilder(true);
    }
  }, [searchParams]);

  async function loadDecks() {
    setLoading(true);
    try {
      const res = await fetch('/api/flashcards/decks');
      const json = await res.json();
      setDecks(json.data ?? []);

      if (profile?.role === 'student') {
        const statsRes = await fetch('/api/flashcards/stats');
        const statsJson = await statsRes.json();
        setDueCount(statsJson.data?.due_today ?? 0);
      }
    } catch (error) {
      console.error('Failed to load decks:', error);
    } finally {
      setLoading(false);
    }
  }

  async function createDeck() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/flashcards/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          course_id: courseIdParam || null,
          lesson_id: lessonIdParam || null,
        }),
      });
      const json = await res.json();
      if (res.ok) { 
        setDecks(prev => [json.data, ...prev]); 
        setNewTitle(''); 
        setShowCreate(false);
        setSelectedDeckId(json.data.id);
        setShowBuilder(true);
        toast.success('Deck created! Add your first cards.');
      } else {
        toast.error(json.error || 'Failed to create deck');
      }
    } catch {
      toast.error('Failed to create deck');
    } finally {
      setCreating(false);
    }
  }

  async function deleteDeck(deckId: string, deckTitle: string) {
    if (!confirm(`Delete "${deckTitle}"? This will permanently remove all cards.`)) return;
    
    try {
      const res = await fetch(`/api/flashcards/decks/${deckId}`, { method: 'DELETE' });
      if (res.ok) {
        setDecks(prev => prev.filter(d => d.id !== deckId));
        toast.success('Deck deleted');
      } else {
        const json = await res.json();
        toast.error(json.error || 'Failed to delete deck');
      }
    } catch {
      toast.error('Failed to delete deck');
    }
  }

  const openBuilder = (deckId: string) => {
    setSelectedDeckId(deckId);
    setShowBuilder(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">

        {/* ── Content Pipeline (staff only) ── */}
        {isTeacher && <PipelineStepper current="flashcards" />}

        {/* Enhanced Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AcademicCapIcon className="w-5 h-5 text-orange-400" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Spaced Repetition Learning</span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-black text-foreground">Flashcard Studio</h1>
            <p className="text-muted-foreground mt-2">Create, customize, and deploy AI-powered flashcards with advanced templates</p>
          </div>
          
          {isTeacher && (
            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                onClick={() => setShowCreate(true)} 
                className="flex items-center justify-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-none transition-colors shadow-lg"
              >
                <PlusIcon className="w-4 h-4" /> Create Deck
              </button>
            </div>
          )}
        </div>

        {/* Enhanced Stats Cards */}
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-none p-6 hover:border-orange-500/30 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-500/10 flex items-center justify-center">
                  <BookOpenIcon className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-black text-foreground">{decks.length}</p>
                  <p className="text-xs text-muted-foreground">Total Decks</p>
                </div>
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-card border border-border rounded-none p-6 hover:border-blue-500/30 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/10 flex items-center justify-center">
                  <StarIcon className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-black text-foreground">
                    {decks.reduce((sum, deck) => sum + (deck.flashcard_cards?.[0]?.count ?? 0), 0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Cards</p>
                </div>
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-card border border-border rounded-none p-6 hover:border-emerald-500/30 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 flex items-center justify-center">
                  <SparklesIcon className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-black text-foreground">
                    {profile?.role === 'student' ? dueCount : 'AI'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {profile?.role === 'student' ? 'Due Today' : 'Powered'}
                  </p>
                </div>
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-card border border-border rounded-none p-6 hover:border-purple-500/30 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/10 flex items-center justify-center">
                  <DocumentTextIcon className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-black text-foreground">6</p>
                  <p className="text-xs text-muted-foreground">Templates</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Decks Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : decks.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-20 bg-card border border-border rounded-none"
          >
            <div className="w-16 h-16 bg-orange-500/10 border border-orange-500/30 flex items-center justify-center mx-auto mb-4">
              <AcademicCapIcon className="w-8 h-8 text-orange-400" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">No Flashcard Decks Yet</h3>
            <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
              {isTeacher 
                ? 'Create your first flashcard deck with our advanced builder featuring AI generation and multiple templates.' 
                : 'No flashcard decks are available yet. Check back later or ask your teacher to create some.'}
            </p>
            {isTeacher && (
              <button 
                onClick={() => setShowCreate(true)}
                className="px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-none transition-colors"
              >
                Create First Deck
              </button>
            )}
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {decks.map((deck, index) => {
                const cardCount = deck.flashcard_cards?.[0]?.count ?? 0;
                return (
                  <motion.div 
                    key={deck.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-card border border-border rounded-none overflow-hidden hover:border-orange-500/30 transition-all duration-200 group"
                  >
                    
                    {/* Card Header */}
                    <div className="p-6 pb-4">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-bold text-foreground text-lg leading-tight group-hover:text-orange-400 transition-colors">
                          {deck.title}
                        </h3>
                        {isTeacher && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openBuilder(deck.id)}
                              className="p-2 hover:bg-muted rounded-none transition-colors"
                              title="Open Builder"
                            >
                              <DocumentTextIcon className="w-4 h-4 text-purple-400" />
                            </button>
                            <button
                              onClick={() => deleteDeck(deck.id, deck.title)}
                              className="p-2 hover:bg-rose-500/10 rounded-none transition-colors"
                              title="Delete Deck"
                            >
                              <TrashIcon className="w-4 h-4 text-rose-400" />
                            </button>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                        <div className="flex items-center gap-1">
                          <StarIcon className="w-3.5 h-3.5" />
                          <span>{cardCount} card{cardCount !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ClockIcon className="w-3.5 h-3.5" />
                          <span>{formatDate(deck.created_at)}</span>
                        </div>
                      </div>

                      {(deck.lessons?.title || deck.courses?.name) && (
                        <div className="mb-4">
                          <span className="inline-block px-2 py-1 bg-blue-500/10 text-blue-400 text-xs font-medium rounded-none">
                            {deck.lessons?.title || deck.courses?.name}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Card Actions */}
                    <div className="px-6 pb-6">
                      <div className="flex gap-2">
                        {profile?.role === 'student' && cardCount > 0 && (
                          <Link 
                            href={`/dashboard/flashcards/${deck.id}/review`}
                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-none transition-colors"
                          >
                            <ArrowPathIcon className="w-4 h-4" />
                            Start Review
                          </Link>
                        )}
                        
                        {isTeacher && (
                          <>
                            <button
                              onClick={() => openBuilder(deck.id)}
                              className="flex-1 flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded-none transition-colors"
                            >
                              <DocumentTextIcon className="w-4 h-4" />
                              Builder
                            </button>
                            <Link 
                              href={`/dashboard/flashcards/${deck.id}`}
                              className="px-4 py-3 bg-card hover:bg-muted border border-border text-muted-foreground text-sm font-bold rounded-none transition-colors"
                              title="View Details"
                            >
                              <EyeIcon className="w-4 h-4" />
                            </Link>
                          </>
                        )}
                        
                        {profile?.role === 'student' && cardCount === 0 && (
                          <div className="flex-1 flex items-center justify-center py-3 bg-muted/50 text-muted-foreground text-sm font-bold rounded-none">
                            No Cards Yet
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Create Deck Modal */}
        <AnimatePresence>
          {showCreate && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-card border border-border rounded-none w-full max-w-md p-6 space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-foreground">Create New Deck</h2>
                  <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-muted rounded-xl transition-colors">
                    <XMarkIcon className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                {/* Curriculum context banner */}
                {(courseIdParam || lessonIdParam || topicParam) && (
                  <div className="flex items-start gap-3 p-3 bg-orange-500/5 border border-orange-500/20 rounded-xl">
                    <span className="text-lg shrink-0">📚</span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-0.5">From Curriculum</p>
                      {topicParam && <p className="text-sm font-bold text-foreground truncate">{topicParam}</p>}
                      {courseIdParam && <p className="text-[10px] text-muted-foreground">Linked to course · AI will auto-generate cards</p>}
                    </div>
                  </div>
                )}
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Deck Title</label>
                    <input
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder={topicParam ? `e.g., ${topicParam} Flashcards` : 'e.g., Python Fundamentals, World History…'}
                      className="w-full bg-background border border-border text-foreground px-4 py-3 rounded-xl focus:outline-none focus:border-orange-500 text-sm transition-colors"
                      onKeyDown={e => e.key === 'Enter' && createDeck()}
                      autoFocus
                    />
                    {topicParam && !newTitle && (
                      <button onClick={() => setNewTitle(topicParam)}
                        className="mt-1.5 text-[10px] text-orange-400 hover:text-orange-300 font-bold transition-colors">
                        ↑ Use "{topicParam}" as title
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowCreate(false)} 
                    className="flex-1 py-3 bg-muted text-muted-foreground font-bold rounded-none hover:bg-muted/80 text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={createDeck} 
                    disabled={!newTitle.trim() || creating} 
                    className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold rounded-none text-sm transition-colors"
                  >
                    {creating ? 'Creating...' : 'Create & Build'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Enhanced Flashcard Builder */}
        <AnimatePresence>
          {showBuilder && selectedDeckId && (
            <EnhancedFlashcardBuilder
              deckId={selectedDeckId}
              onClose={() => {
                setShowBuilder(false);
                setSelectedDeckId(null);
              }}
              onCardCreated={() => {
                loadDecks(); // Refresh decks to show updated card counts
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}