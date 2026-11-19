import { describe, expect, it } from 'vitest';
import {
  countEssayWords,
  hasEssayResponse,
  parseEssayAnswer,
  serializeEssayAnswer,
} from './essay-attachments';

describe('CBT essay attachment helpers', () => {
  it('round-trips essay text with multiple image and PDF attachments', () => {
    const serialized = serializeEssayAnswer('Here is my flowchart explanation.', [
      { name: 'flowchart.png', url: 'https://cdn.example.com/flowchart.png', isImage: true },
      { name: 'notes.pdf', url: 'https://cdn.example.com/notes.pdf', isImage: false },
    ]);
    const parsed = parseEssayAnswer(serialized);
    expect(parsed.text).toBe('Here is my flowchart explanation.');
    expect(parsed.attachments).toHaveLength(2);
    expect(parsed.attachments[0]).toEqual({
      name: 'flowchart.png',
      url: 'https://cdn.example.com/flowchart.png',
      isImage: true,
    });
    expect(parsed.attachments[1].isImage).toBe(false);
  });

  it('recognizes image-only essay answers as answered', () => {
    const serialized = serializeEssayAnswer('', [
      { name: 'handwritten.jpg', url: 'https://cdn.example.com/handwritten.jpg', isImage: true },
    ]);
    expect(hasEssayResponse(serialized)).toBe(true);
    expect(parseEssayAnswer(serialized).text).toBe('');
    expect(parseEssayAnswer(serialized).attachments).toHaveLength(1);
  });

  it('counts words accurately', () => {
    expect(countEssayWords('')).toBe(0);
    expect(countEssayWords('  Python uses   indentation  ')).toBe(3);
  });
});
