export const FEEDBACK_TYPES = ['suggestion', 'complaint', 'praise', 'question'] as const;

export type FeedbackType = typeof FEEDBACK_TYPES[number];

export type ValidFeedbackInput = {
  type: FeedbackType;
  rating: number | null;
  subject: string;
  message: string;
};

export type FeedbackValidationResult =
  | { success: true; data: ValidFeedbackInput }
  | { success: false; error: string };

export function validateFeedbackInput(value: unknown): FeedbackValidationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { success: false, error: 'A valid feedback request is required.' };
  }

  const input = value as Record<string, unknown>;
  const type = typeof input.type === 'string' ? input.type.trim().toLowerCase() : '';
  if (!FEEDBACK_TYPES.includes(type as FeedbackType)) {
    return { success: false, error: 'Feedback type must be suggestion, complaint, praise, or question.' };
  }

  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  if (!subject) return { success: false, error: 'Subject is required.' };
  if (subject.length > 160) return { success: false, error: 'Subject must be 160 characters or fewer.' };

  const message = typeof input.message === 'string' ? input.message.trim() : '';
  if (!message) return { success: false, error: 'Message is required.' };
  if (message.length > 5000) return { success: false, error: 'Message must be 5,000 characters or fewer.' };

  let rating: number | null = null;
  if (input.rating !== undefined && input.rating !== null && input.rating !== '') {
    if (typeof input.rating !== 'number' || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      return { success: false, error: 'Rating must be a whole number from 1 to 5.' };
    }
    rating = input.rating;
  }

  return {
    success: true,
    data: {
      type: type as FeedbackType,
      rating,
      subject,
      message,
    },
  };
}
