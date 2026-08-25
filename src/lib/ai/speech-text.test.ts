import { describe, expect, it } from 'vitest';
import { AURA_VOICES, resolveVoice, toSpeechText, VOICE_ROLES } from './speech-text';

/**
 * What a learner actually hears.
 *
 * Every assertion here is a thing a child would otherwise have read aloud to
 * them as punctuation. The platform's content is markdown end to end, so this
 * is the difference between a lesson being listenable and being gibberish.
 */

describe('markdown never reaches the voice', () => {
  it('drops emphasis markers but keeps the words', () => {
    expect(toSpeechText('The **water cycle** is *continuous*.')).toBe(
      'The water cycle is continuous.',
    );
  });

  it('reads a heading as its own sentence so the voice pauses', () => {
    expect(toSpeechText('# Lesson One\nEvaporation happens first.')).toBe(
      'Lesson One. Evaporation happens first.',
    );
  });

  it('strips list markers rather than saying "dash"', () => {
    expect(toSpeechText('- Evaporation\n- Condensation\n- Precipitation')).toBe(
      'Evaporation. Condensation. Precipitation.',
    );
  });

  it('numbers a list without reciting "1 dot"', () => {
    expect(toSpeechText('1. Heat the water\n2. Watch the steam')).toBe(
      'Heat the water. Watch the steam.',
    );
  });

  it('keeps a link label and never spells out the address', () => {
    const out = toSpeechText('See [the diagram](https://example.com/a/b?c=1) for detail.');
    expect(out).toBe('See the diagram for detail.');
    expect(out).not.toContain('http');
  });

  it('drops a bare URL', () => {
    expect(toSpeechText('Visit https://rillcod.com today.')).toBe('Visit today.');
  });

  it('announces an image by its alt text', () => {
    expect(toSpeechText('![water cycle diagram](/img/wc.png)')).toBe('image: water cycle diagram.');
  });

  it('strips stray HTML', () => {
    expect(toSpeechText('Water <br/> becomes <b>vapour</b>.')).toBe('Water becomes vapour.');
  });
});

describe('code is not read aloud', () => {
  it('announces a fenced block instead of reciting it', () => {
    const out = toSpeechText('Try this:\n```python\nfor i in range(10):\n  print(i)\n```\nThen run it.');
    expect(out).toContain('code example');
    expect(out).not.toContain('range');
    expect(out).not.toContain('print');
  });

  it('can omit the block entirely', () => {
    const out = toSpeechText('Before\n```js\nlet x = 1;\n```\nAfter', { codeBlocks: 'omit' });
    expect(out).not.toContain('code example');
    expect(out).toContain('Before');
    expect(out).toContain('After');
  });

  it('keeps inline code as words', () => {
    expect(toSpeechText('The `print` function shows output.')).toBe(
      'The print function shows output.',
    );
  });
});

describe('shorthand is spoken as words', () => {
  it('expands classroom abbreviations', () => {
    expect(toSpeechText('Use a solvent, e.g. water.')).toBe('Use a solvent, for example, water.');
    expect(toSpeechText('Evaporation, i.e. turning to vapour.')).toBe(
      'Evaporation, that is, turning to vapour.',
    );
  });

  it('speaks symbols that would otherwise be skipped', () => {
    // A trailing full stop is added deliberately so the voice lands rather than
    // trailing off — see the end of toSpeechText.
    expect(toSpeechText('Science & Technology')).toBe('Science and Technology.');
    expect(toSpeechText('About 70% of Earth is water.')).toBe(
      'About 70 percent of Earth is water.',
    );
  });

  it('leaves hyphens and dates alone', () => {
    // Over-eager symbol substitution mangles ordinary writing.
    expect(toSpeechText('A well-known fact from 2026-08-25.')).toBe(
      'A well-known fact from 2026-08-25.',
    );
  });
});

describe('punctuation stays clean', () => {
  it('does not stack full stops at paragraph breaks', () => {
    expect(toSpeechText('First idea.\n\nSecond idea.')).toBe('First idea. Second idea.');
    expect(toSpeechText('# Title\n\nBody.')).toBe('Title. Body.');
  });

  it('returns empty for content that was only markup', () => {
    expect(toSpeechText('---')).toBe('');
    expect(toSpeechText('```\ncode\n```', { codeBlocks: 'omit' })).toBe('');
  });
});

describe('voice selection', () => {
  it('maps a purpose to a real voice', () => {
    expect(resolveVoice('lesson')).toBe(VOICE_ROLES.lesson);
    expect(resolveVoice('story')).toBe(VOICE_ROLES.story);
  });

  it('accepts a raw voice the model knows', () => {
    expect(resolveVoice('hera')).toBe('hera');
  });

  it('falls back rather than sending the model a 400', () => {
    // An unknown speaker is rejected by Aura, which a learner would experience
    // as read-aloud being broken.
    expect(resolveVoice('bartholomew')).toBe(VOICE_ROLES.lesson);
    expect(resolveVoice(undefined)).toBe(VOICE_ROLES.lesson);
  });

  it('every named role is a voice the model actually accepts', () => {
    for (const voice of Object.values(VOICE_ROLES)) {
      expect(AURA_VOICES).toContain(voice);
    }
  });
});
