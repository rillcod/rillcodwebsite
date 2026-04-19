'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, CheckIcon, EyeIcon, SparklesIcon } from '@/lib/icons';
import type { CardTemplate, CreateCardRequest } from '@/types/flashcards';
import { CARD_TEMPLATES } from './templates';
import BuilderHeader from './BuilderHeader';
import BuilderSidebar from './BuilderSidebar';
import CardEditor from './CardEditor';
import CardPreview from './CardPreview';
import AIGenerationPanel from './AIGenerationPanel';
import ImportExportPanel from './ImportExportPanel';
import { ErrorNotification, SuccessNotification } from './Notifications';
import { useFlashcardBuilder } from '@/hooks/useFlashcardBuilder';

interface EnhancedFlashcardBuilderProps {
  deckId: string;
  onClose: () => void;
  onCardCreated: () => void;
}

export default function EnhancedFlashcardBuilder({
  deckId,
  onClose,
  onCardCreated
}: EnhancedFlashcardBuilderProps) {
  const {
    cards,
    selectedTemplate,
    previewDevice,
    showPreview,
    saving,
    error,
    success,
    addCard,
    removeCard,
    updateCard,
    setSelectedTemplate,
    setPreviewDevice,
    setShowPreview,
    saveCards,
    clearError,
    clearSuccess
  } = useFlashcardBuilder(deckId, onCardCreated, onClose);

  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);

  const validCardCount = cards.filter(c => c.front.trim() && c.back.trim()).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-background border border-border w-full max-w-7xl h-[90vh] flex overflow-hidden rounded-lg shadow-2xl"
      >
        {/* Header */}
        <BuilderHeader
          validCardCount={validCardCount}
          showPreview={showPreview}
          saving={saving}
          onTogglePreview={() => setShowPreview(!showPreview)}
          onShowAI={() => setShowAiPanel(true)}
          onShowImport={() => setShowImportPanel(true)}
          onSave={saveCards}
          onClose={onClose}
        />

        {/* Notifications */}
        <AnimatePresence>
          {error && <ErrorNotification message={error} onClose={clearError} />}
          {success && <SuccessNotification message={success} onClose={clearSuccess} />}
        </AnimatePresence>

        <div className="flex w-full pt-20">
          {/* Sidebar */}
          <BuilderSidebar
            selectedTemplate={selectedTemplate}
            previewDevice={previewDevice}
            onTemplateChange={setSelectedTemplate}
            onDeviceChange={setPreviewDevice}
            onAddCard={addCard}
            onClearAll={() => {
              if (confirm('Clear all cards? This cannot be undone.')) {
                // Reset to single empty card
                cards.forEach((card, i) => i > 0 && removeCard(card.id));
                updateCard(cards[0].id, 'front', '');
                updateCard(cards[0].id, 'back', '');
              }
            }}
          />

          {/* Card Editor */}
          <CardEditor
            cards={cards}
            selectedTemplate={selectedTemplate}
            onUpdateCard={updateCard}
            onRemoveCard={removeCard}
            onAddCard={addCard}
          />

          {/* Preview Panel */}
          {showPreview && (
            <CardPreview
              cards={cards.filter(c => c.front.trim() && c.back.trim())}
              template={selectedTemplate}
              device={previewDevice}
            />
          )}
        </div>
      </motion.div>

      {/* AI Generation Modal */}
      <AnimatePresence>
        {showAiPanel && (
          <AIGenerationPanel
            deckId={deckId}
            selectedTemplate={selectedTemplate}
            onClose={() => setShowAiPanel(false)}
            onCardsGenerated={(newCards) => {
              newCards.forEach(card => {
                const id = Date.now() + Math.random();
                addCard();
                const lastCard = cards[cards.length - 1];
                if (lastCard) {
                  updateCard(lastCard.id, 'front', card.front);
                  updateCard(lastCard.id, 'back', card.back);
                }
              });
            }}
          />
        )}
      </AnimatePresence>

      {/* Import/Export Modal */}
      <AnimatePresence>
        {showImportPanel && (
          <ImportExportPanel
            deckId={deckId}
            onClose={() => setShowImportPanel(false)}
            onImportComplete={onCardCreated}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
