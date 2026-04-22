import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeftIcon, ArrowRightIcon } from '@/lib/icons';
import type { CardTemplate } from '@/types/flashcards';
import Image from 'next/image';

interface Card {
  front: string;
  back: string;
  frontImage?: string;
  backImage?: string;
}

interface CardPreviewProps {
  cards: Card[];
  template: CardTemplate;
  device: 'mobile' | 'tablet' | 'desktop';
}

export default function CardPreview({ cards, template, device }: CardPreviewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const deviceStyles = {
    mobile: 'w-64 h-96',
    tablet: 'w-80 h-96',
    desktop: 'w-96 h-64'
  };

  if (cards.length === 0) {
    return (
      <div className="w-96 border-l border-border p-6 overflow-y-auto">
        <div className="space-y-4">
          <h3 className="text-lg font-bold">Live Preview</h3>
          <div className="flex items-center justify-center h-64 bg-muted/20 border border-dashed border-muted-foreground/30 rounded-lg">
            <p className="text-muted-foreground text-sm">Add cards to see preview</p>
          </div>
        </div>
      </div>
    );
  }

  const currentCard = cards[currentIndex];
  const currentImage = showAnswer ? currentCard.backImage : currentCard.frontImage;

  return (
    <div className="w-96 border-l border-border p-6 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Live Preview</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="px-2 py-0.5 bg-muted rounded-full font-medium">{template.name}</span>
            <span>{currentIndex + 1} / {cards.length}</span>
          </div>
        </div>

        <div className="flex justify-center">
          <div className={`${deviceStyles[device]} relative`}>
            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentIndex}-${showAnswer}`}
                initial={{ rotateY: showAnswer ? -90 : 90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: showAnswer ? 90 : -90, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className={`w-full h-full ${
                  showAnswer ? template.backStyle : template.frontStyle
                } ${template.textStyle} p-6 flex flex-col items-center justify-center text-center cursor-pointer rounded-lg shadow-lg overflow-hidden`}
                onClick={() => setShowAnswer(!showAnswer)}
              >
                {currentImage && (
                  <div className="relative w-full h-32 mb-4 rounded-lg overflow-hidden">
                    <Image
                      src={currentImage}
                      alt={showAnswer ? 'Back' : 'Front'}
                      fill
                      className="object-cover"
                    />
                  </div>
                )}
                
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-sm font-medium leading-relaxed"
                >
                  {showAnswer ? currentCard.back : currentCard.front}
                </motion.p>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.7 }}
                  transition={{ delay: 0.3 }}
                  className="text-xs mt-4"
                >
                  {showAnswer ? 'Click to see question' : 'Click to reveal answer'}
                </motion.p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="flex justify-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setCurrentIndex(Math.max(0, currentIndex - 1));
              setShowAnswer(false);
            }}
            disabled={currentIndex === 0}
            className="px-3 py-2 bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold rounded transition-colors flex items-center gap-1"
          >
            <ArrowLeftIcon className="w-3 h-3" />
            Previous
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowAnswer(!showAnswer)}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded transition-colors"
          >
            {showAnswer ? 'Show Question' : 'Show Answer'}
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setCurrentIndex(Math.min(cards.length - 1, currentIndex + 1));
              setShowAnswer(false);
            }}
            disabled={currentIndex === cards.length - 1}
            className="px-3 py-2 bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold rounded transition-colors flex items-center gap-1"
          >
            Next
            <ArrowRightIcon className="w-3 h-3" />
          </motion.button>
        </div>

        {/* Device Frame Indicator */}
        <div className="text-center space-y-2">
          <div className="flex justify-center gap-1">
            {cards.map((_, i) => (
              <button
                key={i}
                onClick={() => { setCurrentIndex(i); setShowAnswer(false); }}
                className={`w-2 h-2 rounded-full transition-all ${i === currentIndex ? 'bg-orange-500 w-4' : 'bg-muted hover:bg-muted-foreground/40'}`}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {showAnswer ? '↩ Answer' : '→ Question'} · {device}
          </span>
        </div>
      </motion.div>
    </div>
  );
}
