'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeftIcon, FireIcon, TrophyIcon,
  ArrowPathIcon, HomeIcon, StarIcon, BoltIcon,
} from '@/lib/icons';
import { getTemplateStyle } from '@/components/flashcards/templates';
import FlashcardMarkdown from './FlashcardMarkdown';

interface Card {
  id: string;
  front: string;
  back: string;
  front_image_url?: string;
  back_image_url?: string;
  template?: string;
  difficulty_level?: 'easy' | 'medium' | 'hard';
}

interface StudentFlashcardReviewProps {
  deckId: string;
  deckTitle: string;
  onComplete: () => void;
  onExit: () => void;
}


const CONFIDENCE_BUTTONS = [
  { label: 'Forgot',  emoji: '😵', value: 1, color: 'bg-rose-600   hover:bg-rose-500',   key: '1' },
  { label: 'Hard',    emoji: '😫', value: 2, color: 'bg-orange-600 hover:bg-orange-500', key: '2' },
  { label: 'Good',    emoji: '😃', value: 4, color: 'bg-blue-600   hover:bg-blue-500',   key: '3' },
  { label: 'Easy',    emoji: '🤩', value: 5, color: 'bg-emerald-600 hover:bg-emerald-500', key: '4' },
];

// Confetti particle
function Confetti() {
  const colors = ['#f97316','#8b5cf6','#10b981','#3b82f6','#f59e0b','#ec4899'];
  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {Array.from({ length: 60 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-sm"
          style={{ background: colors[i % colors.length], left: `${Math.random() * 100}%`, top: '-10px' }}
          animate={{ y: ['0vh', '110vh'], rotate: [0, 360 * (Math.random() > 0.5 ? 1 : -1)], x: [(Math.random() - 0.5) * 200] }}
          transition={{ duration: 2 + Math.random() * 2, delay: Math.random() * 1.5, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}

export default function StudentFlashcardReview({ deckId, deckTitle, onComplete, onExit }: StudentFlashcardReviewProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionStats, setSessionStats] = useState({ correct: 0, incorrect: 0, streak: 0, maxStreak: 0 });
  const [sessionComplete, setSessionComplete] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  const [sessionStartTime] = useState(Date.now());
  const [cardStartTime, setCardStartTime] = useState(Date.now());
  const [showConfetti, setShowConfetti] = useState(false);
  const [lastAction, setLastAction] = useState<'correct' | 'incorrect' | null>(null);

  useEffect(() => { loadCards(); }, [deckId]);

  // Keyboard shortcuts
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
      const res = await fetch(`/api/flashcards/decks/${deckId}/due?mode=due`);
      const json = await res.json();
      if (res.ok && json.data?.length > 0) {
        setCards([...json.data].sort(() => Math.random() - 0.5));
      } else {
        const allRes = await fetch(`/api/flashcards/decks/${deckId}/due?mode=all`);
        const allJson = await allRes.json();
        if (allRes.ok && allJson.data) setCards([...allJson.data].sort(() => Math.random() - 0.5));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  const flipCard = useCallback(() => {
    if (isFlipping) return;
    setIsFlipping(true);
    setTimeout(() => { setShowAnswer(v => !v); setIsFlipping(false); }, 150);
  }, [isFlipping]);

  const handleResponse = useCallback(async (confidence: number) => {
    const correct = confidence >= 3;
    const studyTime = Math.round((Date.now() - cardStartTime) / 1000);
    setLastAction(correct ? 'correct' : 'incorrect');

    const newStats = { ...sessionStats };
    if (correct) { newStats.correct++; newStats.streak++; newStats.maxStreak = Math.max(newStats.maxStreak, newStats.streak); }
    else { newStats.incorrect++; newStats.streak = 0; }
    setSessionStats(newStats);

    try {
      await fetch(`/api/flashcards/cards/${cards[currentIndex].id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correct, confidence, studyTimeSeconds: studyTime }),
      });
    } catch { /* silent */ }

    setTimeout(() => {
      setLastAction(null);
      if (currentIndex < cards.length - 1) {
        setCurrentIndex(i => i + 1);
        setShowAnswer(false);
        setCardStartTime(Date.now());
      } else {
        completeSession(newStats);
      }
    }, 400);
  }, [cards, currentIndex, cardStartTime, sessionStats]);

  async function completeSession(stats: typeof sessionStats) {
    const accuracy = Math.round((stats.correct / (stats.correct + stats.incorrect)) * 100);
    if (accuracy >= 70) setShowConfetti(true);
    setSessionComplete(true);
    const duration = Math.round((Date.now() - sessionStartTime) / 1000);
    try {
      await fetch(`/api/flashcards/decks/${deckId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardsStudied: cards.length, cardsCorrect: stats.correct, cardsIncorrect: stats.incorrect, maxStreak: stats.maxStreak, studyDurationSeconds: duration }),
      });
    } catch { /* silent */ }
  }

  const restartSession = () => {
    setCurrentIndex(0); setShowAnswer(false); setSessionComplete(false); setShowConfetti(false);
    setSessionStats({ correct: 0, incorrect: 0, streak: 0, maxStreak: 0 });
    setCards(c => [...c].sort(() => Math.random() - 0.5));
  };

  // ── Loading ──
  if (loading) return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full mx-auto" />
        <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">Loading flashcards…</p>
      </div>
    </div>
  );

  // ── No cards ──
  if (cards.length === 0) return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="text-center space-y-6 max-w-sm">
        <div className="text-6xl">📭</div>
        <div>
          <h2 className="text-xl font-black text-foreground mb-2">No Cards Available</h2>
          <p className="text-muted-foreground text-sm">This deck doesn't have any cards yet.</p>
        </div>
        <button onClick={onExit} className="px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-xl transition-colors">
          Go Back
        </button>
      </motion.div>
    </div>
  );

  const currentCard = cards[currentIndex];
  const tpl = getTemplateStyle(currentCard?.template);
  const accuracy = sessionStats.correct + sessionStats.incorrect > 0
    ? Math.round((sessionStats.correct / (sessionStats.correct + sessionStats.incorrect)) * 100) : 0;

  // ── Session Complete ──
  if (sessionComplete) {
    const perf = accuracy >= 90 ? 'excellent' : accuracy >= 70 ? 'good' : accuracy >= 50 ? 'fair' : 'retry';
    const perfConfig = {
      excellent: { emoji: '🏆', msg: 'Outstanding! You crushed it!',    color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
      good:      { emoji: '🌟', msg: 'Great job! Keep it up!',          color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
      fair:      { emoji: '💪', msg: 'Good effort! Practice more!',     color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
      retry:     { emoji: '📚', msg: 'Keep going — you\'ll get there!', color: 'text-rose-400',   bg: 'bg-rose-500/10 border-rose-500/20' },
    }[perf];

    return (
      <>
        {showConfetti && <Confetti />}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="bg-card border border-border rounded-3xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl">

            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}
              className="text-7xl">{perfConfig.emoji}</motion.div>

            <div>
              <h2 className="text-2xl font-black text-foreground mb-1">Session Complete!</h2>
              <p className={`text-sm font-bold ${perfConfig.color}`}>{perfConfig.msg}</p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Correct',   value: sessionStats.correct,   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', emoji: '✅' },
                { label: 'Incorrect', value: sessionStats.incorrect, color: 'text-rose-400',    bg: 'bg-rose-500/10 border-rose-500/20',       emoji: '❌' },
                { label: 'Accuracy',  value: `${accuracy}%`,         color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/20',   emoji: '🎯' },
                { label: 'Best Streak', value: sessionStats.maxStreak, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20',  emoji: '🔥' },
              ].map(s => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className={`border rounded-2xl p-4 ${s.bg}`}>
                  <div className="text-xl mb-1">{s.emoji}</div>
                  <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">{s.label}</p>
                </motion.div>
              ))}
            </div>

            {/* XP earned */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <BoltIcon className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-black text-amber-400">
                +{cards.length * 10 + Math.floor(accuracy * 0.5) + sessionStats.maxStreak * 5} XP Earned!
              </span>
            </motion.div>

            <div className="flex gap-3">
              <button onClick={restartSession}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-xl transition-colors">
                <ArrowPathIcon className="w-4 h-4" /> Study Again
              </button>
              <button onClick={onComplete}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-muted hover:bg-muted/80 text-foreground font-black rounded-xl transition-colors">
                <HomeIcon className="w-4 h-4" /> Finish
              </button>
            </div>
          </motion.div>
        </motion.div>
      </>
    );
  }

  // ── Main Review ──
  const progress = ((currentIndex) / cards.length) * 100;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">

      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <button onClick={onExit} className="p-2 hover:bg-muted rounded-xl transition-colors">
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="text-xs font-black text-foreground truncate max-w-[180px]">{deckTitle}</p>
          <p className="text-[10px] text-muted-foreground">{currentIndex + 1} of {cards.length}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1">
            <span className="text-emerald-400 font-black">{sessionStats.correct}</span>
            <span className="text-muted-foreground/50 text-xs">✓</span>
          </div>
          {sessionStats.streak > 1 && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 rounded-full">
              <FireIcon className="w-3 h-3 text-orange-400" />
              <span className="text-orange-400 font-black text-xs">{sessionStats.streak}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="text-rose-400 font-black">{sessionStats.incorrect}</span>
            <span className="text-muted-foreground/50 text-xs">✗</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted shrink-0">
        <motion.div className="h-full bg-gradient-to-r from-orange-500 to-amber-400"
          animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
      </div>

      {/* Card area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 gap-6 overflow-hidden">

        {/* Difficulty badge */}
        {currentCard.difficulty_level && (
          <motion.div key={currentIndex} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
              currentCard.difficulty_level === 'hard'   ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
              currentCard.difficulty_level === 'medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                                          'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            }`}>
            {currentCard.difficulty_level === 'hard' ? '🔥 Hard' : currentCard.difficulty_level === 'medium' ? '⚡ Medium' : '✅ Easy'}
          </motion.div>
        )}

        {/* The Card — 3D flip */}
        <div className="w-full max-w-lg" style={{ perspective: '1200px' }}>
          <motion.div
            key={`card-${currentIndex}`}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{
              scale: lastAction ? 0.95 : 1,
              opacity: 1,
              x: lastAction === 'correct' ? [0, 30, 0] : lastAction === 'incorrect' ? [0, -30, 0] : 0,
            }}
            transition={{ duration: 0.3 }}
            className="relative cursor-pointer"
            onClick={flipCard}
            style={{ transformStyle: 'preserve-3d' }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={showAnswer ? 'back' : 'front'}
                initial={{ rotateY: showAnswer ? -90 : 90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: showAnswer ? 90 : -90, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className={`w-full min-h-[220px] sm:min-h-[260px] rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-2xl ${tpl.front && !showAnswer ? tpl.front : tpl.back} ${tpl.text} ${tpl.glow ? `shadow-2xl ${tpl.glow}` : ''}`}
              >
                {/* Side label */}
                <div className={`absolute top-4 left-4 text-[9px] font-black uppercase tracking-widest opacity-50`}>
                  {showAnswer ? 'Answer' : 'Question'}
                </div>

                {/* Image */}
                {(showAnswer ? currentCard.back_image_url : currentCard.front_image_url) && (
                  <img
                    src={showAnswer ? currentCard.back_image_url : currentCard.front_image_url}
                    alt="" className="w-full max-h-32 object-cover rounded-xl mb-4"
                  />
                )}

                {/* Text */}
                <motion.div
                  key={showAnswer ? 'back-text' : 'front-text'}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-lg sm:text-xl font-bold leading-relaxed text-left w-full"
                >
                  <FlashcardMarkdown content={showAnswer ? currentCard.back : currentCard.front} />
                </motion.div>

                {/* Flip hint */}
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: 0.4 }}
                  className="text-xs mt-6 font-medium">
                  {showAnswer ? 'Tap to see question' : 'Tap to reveal answer'}
                </motion.p>

                {/* Flip icon */}
                {!showAnswer && (
                  <div className="absolute bottom-4 right-4 opacity-30 text-lg">🔄</div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Confidence buttons */}
        <AnimatePresence>
          {showAnswer && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              className="w-full max-w-lg grid grid-cols-4 gap-2 sm:gap-3"
            >
              {CONFIDENCE_BUTTONS.map((btn, i) => (
                <motion.button
                  key={btn.value}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => handleResponse(btn.value)}
                  className={`flex flex-col items-center justify-center gap-1 py-3 sm:py-4 rounded-2xl text-white font-black transition-all shadow-lg ${btn.color}`}
                >
                  <span className="text-xl sm:text-2xl">{btn.emoji}</span>
                  <span className="text-[9px] sm:text-[10px] uppercase tracking-widest">{btn.label}</span>
                  <span className="text-[8px] opacity-60 hidden sm:block">Press {btn.key}</span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Keyboard hint */}
        {!showAnswer && (
          <p className="text-[10px] text-muted-foreground/50 text-center">
            Press <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded text-[9px] font-mono">Space</kbd> to flip
          </p>
        )}
      </div>
    </div>
  );
}
