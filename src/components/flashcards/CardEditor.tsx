import { motion } from 'framer-motion';
import { PlusIcon, TrashIcon, PhotoIcon, TagIcon, StarIcon } from '@/lib/icons';
import type { CardTemplate } from '@/types/flashcards';

interface Card {
  id: number;
  front: string;
  back: string;
  frontImage?: string;
  backImage?: string;
  tags?: string[];
  difficulty?: 'easy' | 'medium' | 'hard';
  notes?: string;
}

interface CardEditorProps {
  cards: Card[];
  selectedTemplate: CardTemplate;
  onUpdateCard: (id: number, field: keyof Card, value: unknown) => void;
  onRemoveCard: (id: number) => void;
  onAddCard: () => void;
}

export default function CardEditor({
  cards,
  selectedTemplate,
  onUpdateCard,
  onRemoveCard,
  onAddCard
}: CardEditorProps) {
  return (
    <div className="flex-1 p-3 sm:p-4 md:p-6 overflow-y-auto">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Card Editor</h3>
          <span className="text-sm text-muted-foreground">
            Using {selectedTemplate.name} template
          </span>
        </div>

        {cards.map((card, index) => (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-card border border-border p-3 sm:p-4 rounded-lg space-y-4 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm">Card {index + 1}</h4>
              <div className="flex items-center gap-2">
                {/* Difficulty Selector */}
                <select
                  value={card.difficulty || 'medium'}
                  onChange={(e) => onUpdateCard(card.id, 'difficulty', e.target.value)}
                  className="text-xs bg-background border border-border px-2 py-1 rounded focus:outline-none focus:border-primary"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onRemoveCard(card.id)}
                  className="p-2 hover:bg-red-500/10 rounded-full text-red-400 hover:text-red-300 transition-colors border border-transparent hover:border-red-500/20"
                  title="Remove Card"
                >
                  <TrashIcon className="w-5 h-5" />
                </motion.button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Front Side */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-muted-foreground">
                  Front (Question)
                </label>
                <textarea
                  value={card.front}
                  onChange={(e) => onUpdateCard(card.id, 'front', e.target.value)}
                  placeholder="Enter the question or prompt..."
                  className="w-full h-24 bg-background border border-border px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary rounded transition-colors"
                />
                <input
                  type="url"
                  value={card.frontImage || ''}
                  onChange={(e) => onUpdateCard(card.id, 'frontImage', e.target.value)}
                  placeholder="Image URL (optional)"
                  className="w-full bg-background border border-border px-3 py-2 text-xs focus:outline-none focus:border-primary rounded"
                />
              </div>
              
              {/* Back Side */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-muted-foreground">
                  Back (Answer)
                </label>
                <textarea
                  value={card.back}
                  onChange={(e) => onUpdateCard(card.id, 'back', e.target.value)}
                  placeholder="Enter the answer or explanation..."
                  className="w-full h-24 bg-background border border-border px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary rounded transition-colors"
                />
                <input
                  type="url"
                  value={card.backImage || ''}
                  onChange={(e) => onUpdateCard(card.id, 'backImage', e.target.value)}
                  placeholder="Image URL (optional)"
                  className="w-full bg-background border border-border px-3 py-2 text-xs focus:outline-none focus:border-primary rounded"
                />
              </div>
            </div>

            {/* Tags Input */}
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-2">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={card.tags?.join(', ') || ''}
                onChange={(e) => onUpdateCard(
                  card.id, 
                  'tags', 
                  e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                )}
                placeholder="e.g., biology, cells, mitosis"
                className="w-full bg-background border border-border px-3 py-2 text-xs focus:outline-none focus:border-primary rounded"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-2">
                Notes (optional)
              </label>
              <textarea
                value={card.notes || ''}
                onChange={(e) => onUpdateCard(card.id, 'notes', e.target.value)}
                placeholder="Add any additional notes or context..."
                rows={2}
                className="w-full bg-background border border-border px-3 py-2 text-xs resize-none focus:outline-none focus:border-primary rounded"
              />
            </div>
          </motion.div>
        ))}
        
        <motion.button
          type="button"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={onAddCard}
          className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 text-muted-foreground hover:text-primary transition-colors rounded-lg"
        >
          <PlusIcon className="w-5 h-5" />
          Add Another Card
        </motion.button>
      </div>
    </div>
  );
}
