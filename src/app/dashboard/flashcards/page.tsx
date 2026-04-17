'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { 
  AcademicCapIcon, 
  ClockIcon, 
  CheckCircleIcon, 
  StarIcon, 
  XMarkIcon, 
  PlusIcon, 
  ArrowPathIcon,
  PencilIcon,
  TrashIcon,
  SparklesIcon,
  BookOpenIcon,
  EyeIcon,
  ChartBarIcon
} from '@/lib/icons';
import Link from 'next/link';

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
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showAIGenerate, setShowAIGenerate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [aiTopic, setAiTopic] = useState('');
  const [aiContent, setAiContent] = useState('');
  const [aiCount, setAiCount] = useState(10);
  const [aiDifficulty, setAiDifficulty] = useState('medium');
  const [generating, setGenerating] = useState(false);

  const isTeacher = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');

  useEffect(() => { loadDecks(); }, []);

  async function loadDecks() {
    setLoading(true);
    try {
      const res = await fetch('/api/flashcards/decks');
      const json = await res.json();
      setDecks(json.data ?? []);
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
        body: JSON.stringify({ title: newTitle }),
      });
      const json = await res.json();
      if (res.ok) { 
        setDecks(prev => [json.data, ...prev]); 
        setNewTitle(''); 
        setShowCreate(false); 
      } else {
        alert(json.error || 'Failed to create deck');
      }
    } catch (error) {
      alert('Failed to create deck');
    } finally {
      setCreating(false);
    }
  }

  async function deleteDeck(deckId: string, deckTitle: string) {
    if (!confirm(`Delete "${deckTitle}"? This will permanently remove all cards.`)) return;
    
    try {
      const res = await fetch(`/api/flashcards/decks/${deckId}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        setDecks(prev => prev.filter(d => d.id !== deckId));
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to delete deck');
      }
    } catch (error) {
      alert('Failed to delete deck');
    }
  }

  async function generateAICards() {
    if (!selectedDeck || (!aiTopic.trim() && !aiContent.trim())) return;
    
    setGenerating(true);
    try {
      const res = await fetch(`/api/flashcards/decks/${selectedDeck}/generate`, {
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
        setSelectedDeck(null);
        loadDecks(); // Refresh to show updated card counts
      } else {
        alert(json.error || 'Failed to generate flashcards');
      }
    } catch (error) {
      alert('Failed to generate flashcards');
    } finally {
      setGenerating(false);
    }
  }

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
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AcademicCapIcon className="w-5 h-5 text-orange-400" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">Spaced Repetition Learning</span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-black text-foreground">Flashcard Decks</h1>
            <p className="text-muted-foreground mt-2">Master concepts with AI-powered spaced repetition system</p>
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

        {/* Stats Cards */}
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-none p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-500/10 flex items-center justify-center">
                  <BookOpenIcon className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-black text-foreground">{decks.length}</p>
                  <p className="text-xs text-muted-foreground">Total Decks</p>
                </div>
              </div>
            </div>
            
            <div className="bg-card border border-border rounded-none p-6">
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
            </div>
            
            <div className="bg-card border border-border rounded-none p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-black text-foreground">
                    {profile?.role === 'student' ? 'Active' : 'Ready'}
                  </p>
                  <p className="text-xs text-muted-foreground">Study Status</p>
                </div>
              </div>
            </div>
            
            <div className="bg-card border border-border rounded-none p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/10 flex items-center justify-center">
                  <ChartBarIcon className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-black text-foreground">SM-2</p>
                  <p className="text-xs text-muted-foreground">Algorithm</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Decks Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : decks.length === 0 ? (
          <div className="text-center py-20 bg-card border border-border rounded-none">
            <AcademicCapIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-bold text-foreground mb-2">No Flashcard Decks Yet</h3>
            <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
              {isTeacher 
                ? 'Create your first flashcard deck to help students learn more effectively with spaced repetition.' 
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
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {decks.map(deck => {
              const cardCount = deck.flashcard_cards?.[0]?.count ?? 0;
              return (
                <div key={deck.id} className="bg-card border border-border rounded-none overflow-hidden hover:border-orange-500/30 transition-all duration-200 group">
                  
                  {/* Card Header */}
                  <div className="p-6 pb-4">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-bold text-foreground text-lg leading-tight group-hover:text-orange-400 transition-colors">
                        {deck.title}
                      </h3>
                      {isTeacher && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setSelectedDeck(deck.id);
                              setShowAIGenerate(true);
                            }}
                            className="p-2 hover:bg-muted rounded-none transition-colors"
                            title="Generate AI Cards"
                          >
                            <SparklesIcon className="w-4 h-4 text-purple-400" />
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
                          <Link 
                            href={`/dashboard/flashcards/${deck.id}/edit`}
                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-muted hover:bg-muted/80 text-foreground text-sm font-bold rounded-none transition-colors"
                          >
                            <PencilIcon className="w-4 h-4" />
                            Edit Cards
                          </Link>
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
                </div>
              );
            })}
          </div>
        )}

        {/* Create Deck Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-none w-full max-w-md p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground">Create New Deck</h2>
                <button 
                  onClick={() => setShowCreate(false)}
                  className="p-2 hover:bg-muted rounded-none transition-colors"
                >
                  <XMarkIcon className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Deck Title
                  </label>
                  <input
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="e.g., Python Fundamentals, World History, Biology Terms"
                    className="w-full bg-background border border-border text-foreground px-4 py-3 rounded-none focus:outline-none focus:border-orange-500 text-sm"
                    onKeyDown={e => e.key === 'Enter' && createDeck()}
                    autoFocus
                  />
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
                  {creating ? 'Creating...' : 'Create Deck'}
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