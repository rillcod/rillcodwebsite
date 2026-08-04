import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const lessonPage = read('src/app/dashboard/lessons/[id]/page.tsx');
const strip = read('src/components/learning/LessonSlideStrip.tsx');

/**
 * Where the deck sits is the whole point of it existing.
 *
 * It used to be a banner above the hook that opened a fullscreen viewer: a
 * recap shown before the lesson began, which you had to leave the page to read.
 * It now renders inline after the study notes, where a recap belongs.
 */
describe('lesson slide recap placement', () => {
  it('renders the deck inline rather than only as a fullscreen link', () => {
    expect(lessonPage).toContain('<LessonSlideStrip');
  });

  it('places the recap after the study notes, not above the hook', () => {
    const hook = lessonPage.indexOf('STAGE 1: HOOK');
    const notes = lessonPage.indexOf('STAGE 4: STUDY NOTES');
    const recap = lessonPage.indexOf('STAGE 5: SLIDE RECAP');
    expect(hook).toBeGreaterThan(-1);
    expect(notes).toBeGreaterThan(-1);
    expect(recap).toBeGreaterThan(-1);
    expect(hook).toBeLessThan(notes);
    expect(notes).toBeLessThan(recap);
  });

  it('keeps a fullscreen escape hatch for anyone who wants to focus', () => {
    expect(lessonPage).toContain('onOpenFullscreen');
    expect(strip).toContain('onOpenFullscreen');
  });

  it('still handles a PDF deck, which cannot paginate inline', () => {
    // Image decks turn in place; a PDF has no per-slide keys to step through,
    // so it must keep opening the viewer instead of silently disappearing.
    expect(lessonPage).toContain('if (!deck.pdf) return null;');
  });

  it('streams slides through the enrolment-checked route, never a raw file URL', () => {
    expect(strip).toContain('/api/slides/');
    expect(strip).toContain('?lesson=');
    expect(strip).not.toMatch(/https?:\/\/[^\s"']*r2[^\s"']*/i);
  });

  it('does not request every slide up front', () => {
    // A twelve-slide deck should not fire twelve image requests on page load.
    expect(strip).toContain('reached');
    expect(strip).toContain('if (!reached.has(i)) return null;');
  });
});
