import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Accessibility guards for read-aloud.
 *
 * This feature exists so learners who struggle to read can still take the
 * lesson. That makes its own accessibility non-negotiable in a way an ordinary
 * button's is not: if the control is unreachable, the feature is not degraded,
 * it is pointless.
 *
 * These are source assertions rather than render tests because the repository
 * has no DOM testing setup, and a guard that exists is worth more than a better
 * one that does not. Each pins a specific way this has already gone wrong or
 * easily could.
 */

const COMPONENT = readFileSync(
  path.join(process.cwd(), 'src/components/ai/ReadAloud.tsx'),
  'utf8',
);

const LESSON_PAGE = readFileSync(
  path.join(process.cwd(), 'src/app/dashboard/lessons/[id]/page.tsx'),
  'utf8',
);

describe('the control is reachable', () => {
  it('is a real button, not a clickable div', () => {
    // A div with onClick is invisible to keyboard and screen reader users.
    expect(COMPONENT).toContain('<button');
    expect(COMPONENT).toContain('type="button"');
  });

  it('carries an accessible name that says what will be read', () => {
    expect(COMPONENT).toContain('aria-label={accessibleName}');
    expect(COMPONENT).toContain('Listen to this passage');
  });

  it('announces play state, which the label alone does not', () => {
    expect(COMPONENT).toContain('aria-pressed={isPlaying}');
  });

  it('hides decorative icons from the accessibility tree', () => {
    // An SVG without this is announced as "image", which tells nobody anything.
    const icons = COMPONENT.match(/aria-hidden="true"/g) ?? [];
    expect(icons.length).toBeGreaterThanOrEqual(3);
    expect(COMPONENT).toContain('focusable="false"');
  });

  it('keeps a visible focus ring for keyboard users', () => {
    expect(COMPONENT).toContain('focus-visible:outline');
  });
});

describe('status is heard, not only seen', () => {
  it('routes progress through a polite live region', () => {
    // A spinner alone leaves a screen-reader user with silence and no idea
    // whether the button worked.
    expect(COMPONENT).toContain('aria-live="polite"');
    expect(COMPONENT).toContain('role="status"');
  });

  it('speaks failures too', () => {
    expect(COMPONENT).toContain('Read-aloud is unavailable right now');
  });

  it('uses sr-only rather than display:none for the live region', () => {
    // display:none removes it from the accessibility tree entirely, so nothing
    // would ever be announced.
    expect(COMPONENT).toContain('className="sr-only"');
    expect(COMPONENT).not.toMatch(/role="status"[\s\S]{0,200}hidden(?!=")/);
  });
});

describe('discoverability on the devices learners actually use', () => {
  it('is never hidden behind hover', () => {
    // Most of this audience is on phones, where hover does not exist. A
    // hover-revealed listen button is an invisible one.
    const mount = LESSON_PAGE.slice(
      LESSON_PAGE.indexOf('<ReadAloud') - 800,
      LESSON_PAGE.indexOf('<ReadAloud'),
    );
    expect(mount).not.toContain('opacity-0');
    expect(mount).not.toContain('group-hover:opacity-100');
  });

  it('is mounted on the lesson body', () => {
    expect(LESSON_PAGE).toContain('import ReadAloud from "@/components/ai/ReadAloud"');
    expect(LESSON_PAGE).toContain('<ReadAloud');
  });
});

describe('cost discipline', () => {
  it('fetches nothing until a learner asks', () => {
    // Pre-fetching every passage on mount would spend the daily free
    // allocation generating audio nobody plays.
    const beforeFirstFetch = COMPONENT.slice(0, COMPONENT.indexOf("fetch('/api/ai/tts'"));
    expect(beforeFirstFetch).toContain('const play = useCallback');
    expect(COMPONENT).not.toMatch(/useEffect\([^)]*\)\s*=>\s*\{[^}]*fetch\('\/api\/ai\/tts'/);
  });

  it('reuses the fetched audio for replays instead of re-requesting', () => {
    expect(COMPONENT).toContain('if (!urlRef.current)');
  });

  it('only offers the control for passages worth hearing', () => {
    expect(LESSON_PAGE).toContain('.trim().length > 120');
  });
});
