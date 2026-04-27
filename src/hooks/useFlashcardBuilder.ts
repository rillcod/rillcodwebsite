import { useState, useCallback, useEffect } from 'react';
import type { CardTemplate } from '@/types/flashcards';
import type { FlashcardCard } from '@/types/flashcards';
import { CARD_TEMPLATES } from '@/components/flashcards/templates';
import {
  mapBuilderCardToCreateRequest,
  mapGeneratedCardToBuilderCard,
  mapApiCardToBuilderCard,
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
  const [initialized, setInitialized] = useState(false);
  const [removedCardIds, setRemovedCardIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadDeckCards() {
      try {
        const res = await fetch(`/api/flashcards/decks/${deckId}/cards`);
        const json = await res.json();
        if (!res.ok || cancelled) return;

        const incoming: FlashcardCard[] = Array.isArray(json.data) ? (json.data as FlashcardCard[]) : [];
        if (incoming.length > 0) {
          const mapped = incoming.map((card, index) => mapApiCardToBuilderCard(card, index));
          setCards(mapped);
          const firstTemplateId = incoming[0]?.template;
          const matchedTemplate = CARD_TEMPLATES.find((t) => t.id === firstTemplateId);
          if (matchedTemplate) setSelectedTemplate(matchedTemplate);
        }
      } catch {
        // keep default empty draft if load fails
      } finally {
        if (!cancelled) setInitialized(true);
      }
    }

    loadDeckCards();
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  const addCard = useCallback(() => {
    setCards(prev => [...prev, { id: Date.now(), front: '', back: '' }]);
  }, []);

  const removeCard = useCallback((id: number) => {
    setCards(prev => {
      const cardToRemove = prev.find(c => c.id === id);
      if (cardToRemove?.dbId) {
        setRemovedCardIds(r => [...r, cardToRemove.dbId!]);
      }
      return prev.filter(card => card.id !== id);
    });
  }, []);

  const updateCard = useCallback((id: number, field: keyof FlashcardBuilderCard, value: unknown) => {
    setCards(prev =>
      prev.map(card => (card.id === id ? { ...card, [field]: value } : card))
    );
  }, []);

  const clearAll = useCallback(() => {
    setCards(prev => {
      const idsToRemove = prev.filter(c => c.dbId).map(c => c.dbId!);
      if (idsToRemove.length > 0) {
        setRemovedCardIds(r => [...r, ...idsToRemove]);
      }
      return [{ id: Date.now(), front: '', back: '' }];
    });
  }, []);

  const saveCards = useCallback(async () => {
    const validCards = cards.filter(card => card.front.trim() && card.back.trim());
    
    if (validCards.length === 0 && removedCardIds.length === 0) {
      setError('Please add at least one complete card or remove existing cards');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Delete removed cards
      const deletePromises = removedCardIds.map(dbId => 
        fetch(`/api/flashcards/cards/${dbId}`, { method: 'DELETE' })
      );

      // 2. Save remaining cards (Update existing or Create new)
      const savePromises = validCards.map((card, index) => {
        const cardData = mapBuilderCardToCreateRequest(card, index, selectedTemplate.id);
        
        if (card.dbId) {
          // UPDATE existing card
          return fetch(`/api/flashcards/cards/${card.dbId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cardData)
          });
        } else {
          // CREATE new card
          return fetch(`/api/flashcards/decks/${deckId}/cards`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cardData)
          });
        }
      });

      const allResults = await Promise.all([...deletePromises, ...savePromises]);
      const failed = allResults.filter(res => !res.ok);

      if (failed.length > 0) {
        setError(`Failed to process ${failed.length} operations. Some changes might not have saved.`);
        return;
      }

      setSuccess(`Successfully saved changes!`);
      setRemovedCardIds([]);
      onCardCreated();
      setTimeout(() => onClose(), 1500);
    } catch (_err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }, [cards, deckId, selectedTemplate.id, removedCardIds, onCardCreated, onClose]);

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
    initialized,
    selectedTemplate,
    previewDevice,
    showPreview,
    saving,
    error,
    success,
    addCard,
    removeCard,
    updateCard,
    clearAll,
    importCards,
    setSelectedTemplate,
    setPreviewDevice,
    setShowPreview,
    saveCards,
    clearError,
    clearSuccess
  };
}
