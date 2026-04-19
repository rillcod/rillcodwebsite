/**
 * Flashcard System Types
 * Generated from database schema migration 20260501000021_flashcards_enhanced
 */

// Database table types matching exact schema
export interface FlashcardDeck {
  id: string;
  title: string;
  lesson_id: string | null;
  course_id: string | null;
  school_id: string;
  created_by: string;
  created_at: string;
  is_public: boolean;
  description: string | null;
  tags: string[];
  updated_at: string;
}

export interface FlashcardCard {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  front_image_url: string | null;
  back_image_url: string | null;
  position: number;
  tags: string[];
  difficulty_level: 'easy' | 'medium' | 'hard';
  is_starred: boolean;
  notes: string | null;
  template: string;
  created_at: string;
  updated_at: string;
}

export interface FlashcardReview {
  id: string;
  card_id: string;
  student_id: string;
  next_review_at: string;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  study_time_seconds: number;
  confidence_level: number;
  last_reviewed_at: string | null;
  updated_at: string;
}

export interface FlashcardStudySession {
  id: string;
  deck_id: string;
  student_id: string;
  cards_studied: number;
  cards_correct: number;
  cards_incorrect: number;
  max_streak: number;
  study_duration_seconds: number;
  completed_at: string;
  created_at: string;
}

export interface FlashcardCardStatistics {
  id: string;
  card_id: string;
  total_reviews: number;
  correct_reviews: number;
  incorrect_reviews: number;
  average_confidence: number;
  last_updated: string;
}

// Extended types with relations
export interface FlashcardDeckWithCards extends FlashcardDeck {
  flashcard_cards: FlashcardCard[];
  card_count?: number;
}

export interface FlashcardCardWithReview extends FlashcardCard {
  review: FlashcardReview | null;
  isDue: boolean;
  isNew: boolean;
  daysUntilDue: number;
}

export interface FlashcardDeckWithStats extends FlashcardDeck {
  card_count: number;
  due_count: number;
  mastered_count: number;
  portal_users?: {
    full_name: string;
    email: string;
  };
  lessons?: {
    title: string;
  };
  courses?: {
    name: string;
  };
}

// API Request/Response types
export interface CreateDeckRequest {
  title: string;
  description?: string;
  lesson_id?: string;
  course_id?: string;
  tags?: string[];
  is_public?: boolean;
}

export interface CreateCardRequest {
  front: string;
  back: string;
  front_image_url?: string;
  back_image_url?: string;
  tags?: string[];
  difficulty_level?: 'easy' | 'medium' | 'hard';
  notes?: string;
  template?: string;
  position?: number;
}

export interface UpdateCardRequest extends Partial<CreateCardRequest> {
  is_starred?: boolean;
}

export interface RecordReviewRequest {
  correct: boolean;
  confidence?: number; // 1-5 scale
  studyTimeSeconds?: number;
}

export interface RecordSessionRequest {
  cardsStudied: number;
  cardsCorrect: number;
  cardsIncorrect: number;
  maxStreak: number;
  studyDurationSeconds: number;
}

export interface GenerateCardsRequest {
  topic?: string;
  content?: string;
  count?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  template?: string;
}

export interface ImportCardsRequest {
  format: 'csv' | 'json' | 'anki';
  data: string | object;
}

// Study mode types
export type StudyMode = 'all' | 'due' | 'starred' | 'difficult' | 'new';

export interface StudyModeConfig {
  mode: StudyMode;
  label: string;
  description: string;
  icon: string;
  color: string;
}

// Template types
export interface CardTemplate {
  id: string;
  name: string;
  description: string;
  frontStyle: string;
  backStyle: string;
  textStyle: string;
  animation: 'flip' | 'slide' | 'fade' | 'glow' | 'bounce';
  icon: string;
}

// Session statistics
export interface SessionStats {
  correct: number;
  incorrect: number;
  streak: number;
  maxStreak: number;
  accuracy: number;
  totalTime: number;
  cardsStudied: number;
}

// Review result
export interface ReviewResult {
  nextReview: {
    date: string;
    daysUntil: number;
    easeFactor: number;
    repetitions: number;
  };
  message: string;
}

// Analytics types
export interface DeckAnalytics {
  totalCards: number;
  dueCards: number;
  newCards: number;
  masteredCards: number;
  averageEaseFactor: number;
  studySessions: number;
  totalStudyTime: number;
  averageAccuracy: number;
}

export interface CardAnalytics {
  totalReviews: number;
  correctReviews: number;
  incorrectReviews: number;
  successRate: number;
  averageConfidence: number;
  lastReviewed: string | null;
  nextReview: string | null;
}

// Export/Import types
export interface ExportData {
  deck: {
    title: string;
    description: string | null;
    exportedAt: string;
    cardCount: number;
  };
  cards: Array<{
    front: string;
    back: string;
    front_image_url: string | null;
    back_image_url: string | null;
    tags: string[];
    difficulty_level: string;
    template: string;
    notes: string | null;
  }>;
}

// UI State types
export interface BuilderState {
  selectedTemplate: CardTemplate;
  previewDevice: 'mobile' | 'tablet' | 'desktop';
  showPreview: boolean;
  cards: Array<{
    id: number;
    front: string;
    back: string;
    frontImage?: string;
    backImage?: string;
    tags?: string[];
    difficulty?: 'easy' | 'medium' | 'hard';
    notes?: string;
  }>;
  aiGenerating: boolean;
  saving: boolean;
}

export interface ReviewState {
  currentIndex: number;
  showAnswer: boolean;
  sessionStats: SessionStats;
  sessionComplete: boolean;
  startTime: number;
}

// Filter and sort types
export interface CardFilters {
  tags?: string[];
  difficulty?: ('easy' | 'medium' | 'hard')[];
  starred?: boolean;
  search?: string;
}

export interface CardSortOptions {
  field: 'position' | 'created_at' | 'difficulty_level' | 'front';
  direction: 'asc' | 'desc';
}

// Gamification types
export interface StudyRewards {
  xp: number;
  accuracy: number;
  breakdown: {
    base: number;
    accuracyBonus: number;
    streakBonus: number;
  };
}

// Error types
export interface FlashcardError {
  code: string;
  message: string;
  details?: unknown;
}

// API Response wrapper
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
  meta?: Record<string, unknown>;
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}
