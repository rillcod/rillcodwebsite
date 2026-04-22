'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  XCircleIcon,
  StarIcon,
  FireIcon,
  TrophyIcon,
  ArrowPathIcon,
  HomeIcon
} from '@/lib/icons';

interface Card {
  id: string;
  front: string;
  back: string;
  front_image_url?: string;
  back_image_url?: string;
  template?: string;
  difficulty_level?: 'easy' | 'medium' | 'hard';
  last_reviewed?: string;
  next_review?: string;
  review_count?: number;
}

interface StudentFlashcardReviewProps {
  deckId: string;
  deckTitle: string;
  onComplete: () => void;
  onExit: () => void;
}

// Card Templates matching the builder
const CARD_TEMPLATES = {
  classic: {
    frontStyle: 'bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 text-gray-800',
    backStyle: 'bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200 text-gray-800'
  },
  modern: {
    frontStyle: 'bg-gradient-to-br from-purple-600 to-blue-600 text-white',
    backStyle: 'bg-gradient-to-br from-orange-500 to-red-500 text-white'
  },
  neon: {
    frontStyle: 'bg-black border-2 border-cyan-400 shadow-lg shadow-cyan-400/50 text-cyan-400',
    backStyle: 'bg-black border-2 border-pink-400 shadow-lg shadow-pink-400/50 text-pink-400'
  },
  minimal: {
    frontStyle: 'bg-white border border-gray-200 shadow-sm text-gray-900',
    backStyle: 'bg-gray-50 border border-gray-200 shadow-sm text-gray-900'
  },
  playful: {
    frontStyle: 'bg-gradient-to-br from-yellow-300 via-pink-300 to-purple-400 text-gray-800 font-bold',
    backStyle: 'bg-gradient-to-br from-green-300 via-blue-300 to-indigo-400 text-gray-800 font-bold'
  },
  professional: {
    frontStyle: 'bg-gradient-to-br from-slate-800 to-slate-900 text-white',
    backStyle: 'bg-gradient-to-br from-slate-700 to-slate-800 text-white'
  }
};

export default function StudentFlashcardReview({ 
  deckId, 
  deckTitle, 
  onComplete, 
  onExit 
}: StudentFlashcardReviewProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionStats, setSessionStats] = useState({
    correct: 0,
    incorrect: 0,
    streak: 0,
    maxStreak: 0
  });
  const [sessionComplete, setSessionComplete] = useState(false);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [sessionStartTime] = useState(Date.now());
  const [cardStartTime, setCardStartTime] = useState(Date.now());

  useEffect(() => {
    loadCards();
  }, [deckId]);

  // Keyboard shortcuts: Space = flip, 1-4 = rate
  useEffect(() => {
    if (sessionComplete || loading) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') { e.preventDefault(); flipCard(); }
      if (showAnswer) {
        if (e.key === '1') handleResponse(1);
        if (e.key === '2') handleResponse(2);
        if (e.key === '3') handleResponse(4);
        if (e.key === '4') handleResponse(5);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showAnswer, sessionComplete, loading, currentIndex]);

  async function loadCards() {
    try {
      // First try due cards
      const res = await fetch(`/api/flashcards/decks/${deckId}/due?mode=due`);
      const json = await res.json();
      if (res.ok && json.data && json.data.length > 0) {
        setCards([...json.data].sort(() => Math.random() - 0.5));
      } else {
        // Fall back to all cards if nothing is due
        const allRes = await fetch(`/api/flashcards/decks/${deckId}/due?mode=all`);
        const allJson = await allRes.json();
        if (allRes.ok && allJson.data) {
          setCards([...allJson.data].sort(() => Math.random() - 0.5));
        }
      }
    } catch (error) {
      console.error('Failed to load cards:', error);
    } finally {
      setLoading(false);
    }
  }

  const currentCard = cards[currentIndex];
  const template = CARD_TEMPLATES[currentCard?.template as keyof typeof CARD_TEMPLATES] || CARD_TEMPLATES.classic;

  const flipCard = () => {
    setCardFlipped(true);
    setTimeout(() => {
      setShowAnswer(!showAnswer);
      setCardFlipped(false);
    }, 150);
  };

  const handleResponse = async (confidence: number) => {
    const correct = confidence >= 3;
    const studyTime = Math.round((Date.now() - cardStartTime) / 1000);
    
    const newStats = { ...sessionStats };
    if (correct) {
      newStats.correct++;
      newStats.streak++;
      newStats.maxStreak = Math.max(newStats.maxStreak, newStats.streak);
    } else {
      newStats.incorrect++;
      newStats.streak = 0;
    }
    setSessionStats(newStats);

    // Record the review
    try {
      await fetch(`/api/flashcards/cards/${currentCard.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          correct, 
          confidence,
          studyTimeSeconds: studyTime
        })
      });
    } catch (error) {
      console.error('Failed to record review:', error);
    }

    // Move to next card or complete session
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowAnswer(false);
      setCardStartTime(Date.now());
    } else {
      completeSession(newStats);
    }
  };

  const completeSession = async (stats: typeof sessionStats) => {
    setSessionComplete(true);
    const duration = Math.round((Date.now() - sessionStartTime) / 1000);

    try {
      await fetch(`/api/flashcards/decks/${deckId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardsStudied: cards.length,
          cardsCorrect: stats.correct,
          cardsIncorrect: stats.incorrect,
          maxStreak: stats.maxStreak,
          studyDurationSeconds: duration
        })
      });
    } catch (error) {
      console.error('Failed to submit session analytics:', error);
    }
  };

  const restartSession = () => {
    setCurrentIndex(0);
    setShowAnswer(false);
    setSessionComplete(false);
    setSessionStats({ correct: 0, incorrect: 0, streak: 0, maxStreak: 0 });
    // Reshuffle cards
    setCards([...cards].sort(() => Math.random() - 0.5));
  };

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

  if (cards.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-16 h-16 bg-muted border border-border flex items-center justify-center mx-auto">
            <StarIcon className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground mb-2">No Cards Available</h2>
            <p className="text-muted-foreground">This deck doesn't have any cards yet. Ask your teacher to add some!</p>
          </div>
          <button
            onClick={onExit}
            className="px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (sessionComplete) {
    const accuracy = Math.round((sessionStats.correct / (sessionStats.correct + sessionStats.incorrect)) * 100);
    const performance = accuracy >= 90 ? 'excellent' : accuracy >= 70 ? 'good' : accuracy >= 50 ? 'fair' : 'needs-improvement';
    
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4"
      >
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-card border border-border p-8 max-w-md w-full text-center space-y-6"
        >
          <div className="space-y-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className={`w-20 h-20 mx-auto flex items-center justify-center ${
                performance === 'excellent' ? 'bg-emerald-500/20 text-emerald-400' :
                performance === 'good' ? 'bg-blue-500/20 text-blue-400' :
                performance === 'fair' ? 'bg-orange-500/20 text-orange-400' :
                'bg-red-500/20 text-red-400'
              }`}
            >
              {performance === 'excellent' ? <TrophyIcon className="w-10 h-10" /> :
               performance === 'good' ? <StarIcon className="w-10 h-10" /> :
               performance === 'fair' ? <FireIcon className="w-10 h-10" /> :
               <ArrowPathIcon className="w-10 h-10" />}
            </motion.div>
            
            <div>
              <h2 className="text-2xl font-black text-foreground mb-2">Session Complete!</h2>
              <p className="text-muted-foreground">
                {performance === 'excellent' ? 'Outstanding work! 🌟' :
                 performance === 'good' ? 'Great job! Keep it up! 👏' :
                 performance === 'fair' ? 'Good effort! Practice makes perfect! 💪' :
                 'Keep practicing! You\'ll get better! 📚'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-4">
              <p className="text-2xl font-black text-emerald-400">{sessionStats.correct}</p>
              <p className="text-emerald-300 text-xs">Correct</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 p-4">
              <p className="text-2xl font-black text-red-400">{sessionStats.incorrect}</p>
              <p className="text-red-300 text-xs">Incorrect</p>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/20 p-4">
              <p className="text-2xl font-black text-orange-400">{accuracy}%</p>
              <p className="text-orange-300 text-xs">Accuracy</p>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/20 p-4">
              <p className="text-2xl font-black text-purple-400">{sessionStats.maxStreak}</p>
              <p className="text-purple-300 text-xs">Best Streak</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={restartSession}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold transition-colors"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Study Again
            </button>
            <button
              onClick={onComplete}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-muted hover:bg-muted/80 text-foreground font-bold transition-colors"
            >
              <HomeIcon className="w-4 h-4" />
              Finish
            </button>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-bold text-foreground">{deckTitle}</h1>
            <p className="text-xs text-muted-foreground">
              Card {currentIndex + 1} of {cards.length}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
            <span className="text-emerald-400 font-bold">{sessionStats.correct}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full" />
            <span className="text-red-400 font-bold">{sessionStats.incorrect}</span>
          </div>
          {sessionStats.streak > 0 && (
            <div className="flex items-center gap-2">
              <FireIcon className="w-4 h-4 text-orange-400" />
              <span className="text-orange-400 font-bold">{sessionStats.streak}</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-muted">
        <motion.div
          className="h-full bg-orange-500"
          initial={{ width: 0 }}
          animate={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          
          {/* Flashcard */}
          <motion.div
            key={`${currentIndex}-${showAnswer}`}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ 
              scale: cardFlipped ? 0.95 : 1, 
              opacity: cardFlipped ? 0.8 : 1,
              rotateY: cardFlipped ? 5 : 0
            }}
            transition={{ duration: 0.15 }}
            className="relative"
          >
            <div 
              className={`w-full h-80 ${showAnswer ? template.backStyle : template.frontStyle} p-8 flex items-center justify-center text-center cursor-pointer shadow-2xl transition-all duration-300 hover:shadow-3xl`}
              onClick={flipCard}
            >
              <div className="space-y-4">
                {!showAnswer && (
                  <div className="w-8 h-8 bg-white/20 border border-white/30 flex items-center justify-center mx-auto rounded-full">
                    <span className="text-sm font-bold">?</span>
                  </div>
                )}
                
                <motion.div 
                  key={showAnswer ? 'answer' : 'question'}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <p className="text-xl font-bold leading-relaxed">
                    {showAnswer ? currentCard.back : currentCard.front}
                  </p>
                  
                  {showAnswer && currentCard.back_image_url && (
                    <div className="relative w-48 h-32 mx-auto">
                      <img src={currentCard.back_image_url} alt="Back context" className="object-cover w-full h-full rounded" />
                    </div>
                  )}
                  {!showAnswer && currentCard.front_image_url && (
                    <div className="relative w-48 h-32 mx-auto">
                      <img src={currentCard.front_image_url} alt="Front context" className="object-cover w-full h-full rounded" />
                    </div>
                  )}
                </motion.div>
                
                <p className="text-sm opacity-70">
                  {showAnswer ? 'How did you do?' : 'Tap to reveal answer'}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Answer Buttons */}
          <AnimatePresence>
            {showAnswer && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 w-full max-w-xl mx-auto"
              >
                <button
                  onClick={() => handleResponse(1)}
                  className="flex flex-col items-center justify-center gap-1 p-4 bg-rose-600 hover:bg-rose-500 text-white rounded-none transition-all shadow-lg group"
                >
                  <span className="text-xl">😵</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">Forgot</span>
                </button>
                
                <button
                  onClick={() => handleResponse(2)}
                  className="flex flex-col items-center justify-center gap-1 p-4 bg-orange-600 hover:bg-orange-500 text-white rounded-none transition-all shadow-lg group"
                >
                  <span className="text-xl">😫</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">Hard</span>
                </button>

                <button
                  onClick={() => handleResponse(4)}
                  className="flex flex-col items-center justify-center gap-1 p-4 bg-blue-600 hover:bg-blue-500 text-white rounded-none transition-all shadow-lg group"
                >
                  <span className="text-xl">😃</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">Good</span>
                </button>

                <button
                  onClick={() => handleResponse(5)}
                  className="flex flex-col items-center justify-center gap-1 p-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-none transition-all shadow-lg group"
                >
                  <span className="text-xl">🤩</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">Easy</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation Hint */}
          {!showAnswer && (
            <div className="text-center mt-8 space-y-1">
              <p className="text-muted-foreground text-sm">
                Click the card or press <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-xs font-mono">Space</kbd> to reveal the answer
              </p>
            </div>
          )}
          {showAnswer && (
            <div className="text-center mt-4">
              <p className="text-muted-foreground text-xs">
                Keyboard: <kbd className="px-1 py-0.5 bg-muted border border-border rounded text-xs font-mono">1</kbd> Forgot &nbsp;
                <kbd className="px-1 py-0.5 bg-muted border border-border rounded text-xs font-mono">2</kbd> Hard &nbsp;
                <kbd className="px-1 py-0.5 bg-muted border border-border rounded text-xs font-mono">3</kbd> Good &nbsp;
                <kbd className="px-1 py-0.5 bg-muted border border-border rounded text-xs font-mono">4</kbd> Easy
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}