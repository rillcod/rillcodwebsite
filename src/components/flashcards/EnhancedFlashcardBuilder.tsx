'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
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
    importCards,
    setSelectedTemplate,
    setPreviewDevice,
    setShowPreview,
    saveCards,
    clearError,
    clearSuccess
  } = useFlashcardBuilder(deckId, onCardCreated, onClose);

  const searchParams = useSearchParams();
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  useEffect(() => {
    const autoGen = searchParams.get('autoGenerate') === 'true';
    if (autoGen) {
      setShowAiPanel(true);
    }
  }, [searchParams]);

  const validCardCount = cards.filter(c => c.front.trim() && c.back.trim()).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-background border border-border w-full max-w-7xl h-full sm:h-[90vh] flex flex-col overflow-hidden sm:rounded-lg shadow-2xl relative"
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
          onToggleSidebar={() => setShowMobileSidebar(v => !v)}
        />

        {/* Notifications */}
        <AnimatePresence>
          {error && <ErrorNotification message={error} onClose={clearError} />}
          {success && <SuccessNotification message={success} onClose={clearSuccess} />}
        </AnimatePresence>

        <div className="flex flex-1 overflow-hidden pt-16">
          {/* Sidebar — desktop inline, mobile drawer */}
          <BuilderSidebar
            selectedTemplate={selectedTemplate}
            previewDevice={previewDevice}
            onTemplateChange={setSelectedTemplate}
            onDeviceChange={setPreviewDevice}
            onAddCard={addCard}
            isOpen={showMobileSidebar}
            onClose={() => setShowMobileSidebar(false)}
            onClearAll={() => {
              if (confirm('Clear all cards? This cannot be undone.')) {
                cards.forEach((card) => removeCard(card.id));
                addCard();
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

          {/* Preview Panel — desktop only */}
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
            initialTopic={searchParams.get('topic') || ''}
            onClose={() => setShowAiPanel(false)}
            onCardsGenerated={(newCards) => {
              importCards(newCards);
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
