import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftIcon, ArrowRightIcon } from '@/lib/icons';
import type { CardTemplate } from '@/types/flashcards';

interface Card { front: string; back: string; frontImage?: string; backImage?: string; }

interface CardPreviewProps {
  cards: Card[];
  template: CardTemplate;
  device: 'mobile' | 'tablet' | 'desktop';
}

const DEVICE_SIZES = {
  mobile:  'w-56 h-80',
  tablet:  'w-72 h-80',
  desktop: 'w-80 h-56',
};

export default function CardPreview({ cards, template, device }: CardPreviewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  if (cards.length === 0) {
    return (
      <div className="w-80 border-l border-border p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest">Live Preview</h3>
        </div>
        <div className="flex-1 flex items-center justify-center border-2 border-dashed border-border rounded-2xl min-h-[200px]">
          <div className="text-center space-y-2">
            <div className="text-4xl">🃏</div>
            <p className="text-xs text-muted-foreground font-medium">Add cards to preview</p>
          </div>
        </div>
      </div>
    );
  }

  const card = cards[currentIndex];
  const img = showAnswer ? card.backImage : card.frontImage;

  const prev = () => { setCurrentIndex(i => Math.max(0, i - 1)); setShowAnswer(false); };
  const next = () => { setCurrentIndex(i => Math.min(cards.length - 1, i + 1)); setShowAnswer(false); };

  return (
    <div className="w-80 border-l border-border p-5 flex flex-col gap-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <h3 className="text-sm font-black uppercase tracking-widest">Live Preview</h3>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-muted rounded-full text-[10px] font-bold text-muted-foreground">{template.name}</span>
          <span className="text-[10px] text-muted-foreground">{currentIndex + 1}/{cards.length}</span>
        </div>
      </div>

      {/* Card */}
      <div className="flex justify-center" style={{ perspective: '1000px' }}>
        <div className={`${DEVICE_SIZES[device]} relative cursor-pointer`} onClick={() => setShowAnswer(v => !v)}>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${currentIndex}-${showAnswer}`}
              initial={{ rotateY: showAnswer ? -90 : 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: showAnswer ? 90 : -90, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className={`w-full h-full rounded-2xl p-5 flex flex-col items-center justify-center text-center shadow-xl overflow-hidden relative
                ${showAnswer ? template.backStyle : template.frontStyle} ${template.textStyle}`}
            >
              {/* Side label */}
              <span className="absolute top-2 left-3 text-[8px] font-black uppercase tracking-widest opacity-40">
                {showAnswer ? 'Answer' : 'Question'}
              </span>

              {img && (
                <img src={img} alt="" className="w-full max-h-20 object-cover rounded-lg mb-3" />
              )}

              <motion.p
                key={showAnswer ? 'b' : 'f'}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-sm font-semibold leading-snug"
              >
                {showAnswer ? card.back : card.front}
              </motion.p>

              <p className="text-[9px] mt-3 opacity-50">
                {showAnswer ? 'Click for question' : 'Click to reveal'}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <button onClick={prev} disabled={currentIndex === 0}
          className="p-2 bg-muted hover:bg-muted/80 disabled:opacity-30 rounded-xl transition-colors">
          <ArrowLeftIcon className="w-3.5 h-3.5" />
        </button>

        <button onClick={() => setShowAnswer(v => !v)}
          className="flex-1 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-black rounded-xl transition-colors">
          {showAnswer ? 'Show Question' : 'Show Answer'}
        </button>

        <button onClick={next} disabled={currentIndex === cards.length - 1}
          className="p-2 bg-muted hover:bg-muted/80 disabled:opacity-30 rounded-xl transition-colors">
          <ArrowRightIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Dot navigation */}
      <div className="flex justify-center gap-1 shrink-0">
        {cards.map((_, i) => (
          <button key={i} onClick={() => { setCurrentIndex(i); setShowAnswer(false); }}
            className={`h-1.5 rounded-full transition-all ${i === currentIndex ? 'bg-orange-500 w-5' : 'bg-muted w-1.5 hover:bg-muted-foreground/40'}`}
          />
        ))}
      </div>
    </div>
  );
}
