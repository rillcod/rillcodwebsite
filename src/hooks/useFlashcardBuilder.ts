import { useState, useCallback } from 'react';
import type { CardTemplate } from '@/types/flashcards';
import { CARD_TEMPLATES } from '@/components/flashcards/templates';
import {
  mapBuilderCardToCreateRequest,
  mapGeneratedCardToBuilderCard,
  type FlashcardBuilderCard,
  type GeneratedFlashcardCard,
} from '@/lib/flashcards/cards';

export function useFlashcardBuilder(
  deckId: string,
  onCardCreated: () => void,
  onClose: () => void
) {
  const [cards, setCards] = useState<FlashcardBuilderCard[]>([
    { id: Date.now(), front: '', back: '' }
  ]);
  const [selectedTemplate, setSelectedTemplate] = useState<CardTemplate>(CARD_TEMPLATES[0]);
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const addCard = useCallback(() => {
    setCards(prev => [...prev, { id: Date.now(), front: '', back: '' }]);
  }, []);

  const removeCard = useCallback((id: number) => {
    setCards(prev => prev.length > 1 ? prev.filter(card => card.id !== id) : prev);
  }, []);

  const updateCard = useCallback((id: number, field: keyof FlashcardBuilderCard, value: unknown) => {
    setCards(prev =>
      prev.map(card => (card.id === id ? { ...card, [field]: value } : card))
    );
  }, []);

  const saveCards = useCallback(async () => {
    const validCards = cards.filter(card => card.front.trim() && card.back.trim());
    
    if (validCards.length === 0) {
      setError('Please add at least one complete card with both front and back content');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const promises = validCards.map((card, index) => {
        const cardData = mapBuilderCardToCreateRequest(card, index, selectedTemplate.id);
        return fetch(`/api/flashcards/decks/${deckId}/cards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cardData)
        });
      });

      const results = await Promise.all(promises);
      const failedSaves = results.filter(res => !res.ok);

      if (failedSaves.length > 0) {
        setError(`Failed to save ${failedSaves.length} cards. Please try again.`);
        return;
      }

      setSuccess(`Successfully saved ${validCards.length} cards!`);
      onCardCreated();
      setTimeout(() => onClose(), 1500);
    } catch (_err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }, [cards, deckId, selectedTemplate.id, onCardCreated, onClose]);

  const clearError = useCallback(() => setError(null), []);
  const clearSuccess = useCallback(() => setSuccess(null), []);

  const importCards = useCallback((newCards: GeneratedFlashcardCard[]) => {
    setCards(prev => {
      // Filter out empty cards first if we're importing a bunch
      const existing = prev.filter(c => c.front.trim() || c.back.trim());
      const formatted = newCards.map((c, i) => mapGeneratedCardToBuilderCard(c, i));
      return [...existing, ...formatted];
    });
  }, []);

  return {
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
  };
}
