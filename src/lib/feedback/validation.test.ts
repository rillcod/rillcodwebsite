import { describe, expect, it } from 'vitest';
import { validateFeedbackInput } from './validation';

describe('validateFeedbackInput', () => {
  it('normalises and accepts bounded feedback', () => {
    const result = validateFeedbackInput({
      type: ' Complaint ',
      rating: 2,
      subject: '  Billing concern  ',
      message: '  Please review this invoice.  ',
    });

    expect(result).toEqual({
      success: true,
      data: {
        type: 'complaint',
        rating: 2,
        subject: 'Billing concern',
        message: 'Please review this invoice.',
      },
    });
  });

  it.each([
    [{ type: 'unknown', subject: 'Subject', message: 'Message' }, 'Feedback type'],
    [{ type: 'question', subject: '', message: 'Message' }, 'Subject is required'],
    [{ type: 'question', subject: 'x'.repeat(161), message: 'Message' }, '160 characters'],
    [{ type: 'question', subject: 'Subject', message: '' }, 'Message is required'],
    [{ type: 'question', subject: 'Subject', message: 'x'.repeat(5001) }, '5,000 characters'],
    [{ type: 'question', rating: 0, subject: 'Subject', message: 'Message' }, 'Rating'],
    [{ type: 'question', rating: 3.5, subject: 'Subject', message: 'Message' }, 'Rating'],
  ])('rejects invalid input %#', (input, expected) => {
    const result = validateFeedbackInput(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain(expected);
  });
});
