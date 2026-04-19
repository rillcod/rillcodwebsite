'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SparklesIcon, XMarkIcon, BeakerIcon, BookOpenIcon, CheckIcon } from '@/lib/icons';

interface AIGenerationPanelProps {
  deckId: string;
  selectedTemplate: any;
  onClose: () => void;
  onCardsGenerated: (cards: any[]) => void;
}

export default function AIGenerationPanel({
  deckId,
  selectedTemplate,
  onClose,
  onCardsGenerated
}: AIGenerationPanelProps) {
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!topic.trim() && !content.trim()) {
      setError('Please provide a topic or content to base the flashcards on.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/flashcards/decks/${deckId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          content,
          count,
          difficulty
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'AI generation failed');

      onCardsGenerated(json.data);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border w-full max-w-xl shadow-2xl overflow-hidden rounded-none"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-orange-500 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <SparklesIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">AI Studio</h2>
              <p className="text-xs text-orange-100">AI-Powered Flashcard Generation</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Topic Input */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <BookOpenIcon className="w-4 h-4" />
              Main Topic
            </label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g., Photosynthesis, Python Decorators..."
              className="w-full bg-background border border-border px-4 py-3 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 transition-all rounded-none"
            />
          </div>

          {/* Context Content (Optional) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <BeakerIcon className="w-4 h-4" />
              Source Content (Optional)
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Paste text/notes here to base the cards on..."
              rows={4}
              className="w-full bg-background border border-border px-4 py-3 text-sm resize-none focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 transition-all rounded-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Count Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Number of Cards</label>
              <select
                value={count}
                onChange={e => setCount(parseInt(e.target.value))}
                className="w-full bg-background border border-border px-4 py-3 text-sm focus:outline-none focus:border-orange-500 rounded-none transition-all"
              >
                {[5, 10, 15, 20].map(v => (
                  <option key={v} value={v}>{v} Cards</option>
                ))}
              </select>
            </div>

            {/* Difficulty Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Difficulty Level</label>
              <div className="flex gap-1 p-1 bg-background border border-border rounded-none">
                {(['easy', 'medium', 'hard'] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-tighter transition-all ${
                      difficulty === d 
                        ? 'bg-orange-500 text-white' 
                        : 'hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-rose-500/10 border border-rose-500/30 p-3 flex gap-3 text-rose-400 text-xs"
            >
              <XMarkIcon className="w-4 h-4 flex-shrink-0" />
              {error}
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-muted/50 border-t border-border flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-border text-xs font-bold uppercase transition-all hover:bg-background"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || (!topic.trim() && !content.trim())}
            className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold uppercase transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
      </motion.div>
    </div>
  );
}
