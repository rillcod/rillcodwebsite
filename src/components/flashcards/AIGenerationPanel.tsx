'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  XMarkIcon, 
  SparklesIcon, 
  ArrowPathIcon,
  ExclamationTriangleIcon
} from '@/lib/icons';
import type { CardTemplate } from '@/types/flashcards';
import type { GeneratedFlashcardCard } from '@/lib/flashcards/cards';

interface AIGenerationPanelProps {
  deckId: string;
  selectedTemplate: CardTemplate;
  onClose: () => void;
  onCardsGenerated: (cards: GeneratedFlashcardCard[]) => void;
  initialTopic?: string;
}

export default function AIGenerationPanel({
  deckId: _deckId,
  selectedTemplate,
  onClose,
  onCardsGenerated,
  initialTopic = ''
}: AIGenerationPanelProps) {
  const [topic, setTopic] = useState(initialTopic);
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!topic.trim()) {
      setError('Please enter a topic or paste content to generate cards from.');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'flashcard',
          topic,
          questionCount: count,
          difficulty
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to generate cards');

      if (json.data && json.data.cards) {
        const normalizedCards = json.data.cards.map((card: Record<string, unknown>) => ({
          ...card,
          difficulty: typeof card.difficulty === 'string' ? card.difficulty : difficulty,
          template: typeof card.template === 'string' ? card.template : selectedTemplate.id,
        }));
        onCardsGenerated(normalizedCards);
        onClose();
      } else {
        throw new Error('AI returned an empty set of cards. Please try a different topic.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate cards');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border w-full max-w-lg overflow-hidden shadow-2xl rounded-none"
      >
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500/10 flex items-center justify-center">
              <SparklesIcon className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">AI Card Generator</h2>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Powered by Gemini 2.0</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-muted transition-colors rounded-none"
          >
            <XMarkIcon className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">
                Topic or Learning Material
              </label>
              <textarea
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. Fundamental laws of physics, Python list comprehensions, or paste your lesson notes here..."
                className="w-full bg-background border border-border px-4 py-3 rounded-none focus:outline-none focus:border-orange-500 text-sm min-h-[120px] resize-none italic"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">
                  Number of Cards
                </label>
                <select 
                  value={count}
                  onChange={e => setCount(Number(e.target.value))}
                  className="w-full bg-background border border-border px-4 py-3 rounded-none focus:outline-none focus:border-orange-500 text-sm font-bold"
                >
                  {[5, 10, 15, 20, 30].map(c => (
                    <option key={c} value={c}>{c} Cards</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">
                  Difficulty
                </label>
                <select 
                  value={difficulty}
                  onChange={e => setDifficulty(e.target.value)}
                  className="w-full bg-background border border-border px-4 py-3 rounded-none focus:outline-none focus:border-orange-500 text-sm font-bold"
                >
                  <option value="easy">Beginner / Foundation</option>
                  <option value="medium">Intermediate / Standard</option>
                  <option value="hard">Advanced / Expert</option>
                </select>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 flex gap-3 text-rose-400 text-xs italic">
              <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="bg-orange-500/5 border border-orange-500/10 p-4 rounded-none space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">Template Context</p>
            <p className="text-xs text-muted-foreground italic">
              Cards will be generated with the &quot;{selectedTemplate.name}&quot; style applied automatically.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-muted/30 border-t border-border flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-3 bg-background border border-border text-muted-foreground font-bold rounded-none hover:bg-muted transition-colors text-sm uppercase tracking-widest"
          >
            Cancel
          </button>
          <button 
            onClick={handleGenerate}
            disabled={generating}
            className="flex-[2] py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold rounded-none text-sm transition-all flex items-center justify-center gap-2 uppercase tracking-widest shadow-lg shadow-orange-500/20"
          >
            {generating ? (
              <>
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                <span>Generating Card Deck...</span>
              </>
            ) : (
              <>
                <SparklesIcon className="w-4 h-4" />
                <span>Generate with AI</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
