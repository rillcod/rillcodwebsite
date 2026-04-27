import type { CreateCardRequest, FlashcardCard } from '@/types/flashcards';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface FlashcardBuilderCard {
  id: number;
  dbId?: string;
  front: string;
  back: string;
  frontImage?: string;
  backImage?: string;
  tags?: string[];
  difficulty?: DifficultyLevel;
  notes?: string;
  template?: string;
}

export interface GeneratedFlashcardCard {
  front: string;
  back: string;
  tags?: string[];
  difficulty?: string;
  notes?: string;
  template?: string;
  frontImage?: string;
  backImage?: string;
}

export function normalizeDifficulty(value?: string | null): DifficultyLevel {
  if (value === 'easy' || value === 'medium' || value === 'hard') return value;
  return 'medium';
}

export function normalizeTemplate(template?: string | null): string {
  return template?.trim() || 'classic';
}

export function mapBuilderCardToCreateRequest(
  card: FlashcardBuilderCard,
  index: number,
  selectedTemplateId: string
): CreateCardRequest {
  return {
    front: card.front.trim(),
    back: card.back.trim(),
    template: normalizeTemplate(card.template ?? selectedTemplateId),
    front_image_url: card.frontImage?.trim() || undefined,
    back_image_url: card.backImage?.trim() || undefined,
    tags: card.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
    difficulty_level: normalizeDifficulty(card.difficulty),
    notes: card.notes?.trim() || undefined,
    position: index + 1,
  };
}

export function mapGeneratedCardToBuilderCard(
  card: GeneratedFlashcardCard,
  index: number
): FlashcardBuilderCard {
  return {
    id: Date.now() + index + Math.floor(Math.random() * 100000),
    front: card.front ?? '',
    back: card.back ?? '',
    tags: card.tags ?? [],
    difficulty: normalizeDifficulty(card.difficulty),
    notes: card.notes ?? '',
    template: normalizeTemplate(card.template),
    frontImage: card.frontImage ?? '',
    backImage: card.backImage ?? '',
  };
}

export function mapApiCardToBuilderCard(card: FlashcardCard, index: number): FlashcardBuilderCard {
  return {
    id: index + 1,
    dbId: card.id,
    front: card.front,
    back: card.back,
    frontImage: card.front_image_url ?? '',
    backImage: card.back_image_url ?? '',
    tags: card.tags ?? [],
    difficulty: normalizeDifficulty(card.difficulty_level),
    notes: card.notes ?? '',
    template: normalizeTemplate(card.template),
  };
}
