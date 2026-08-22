import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Copying belongs in one place.
 *
 * The rules started inline in generate-lessons and were about to be pasted into
 * four more routes. Generalising them turned up two bugs that had been shipped
 * in the single copy — identity inherited from the source school, and match
 * filters applied after the row limit — and either would have been pasted four
 * times over and then fixed once.
 *
 * This codebase has run that experiment enough times to stop guessing at the
 * result: model queues in six files, auto-generate settings in four, cron
 * cadence in five, the file-kind check in three. Each drifted, and in each case
 * nothing failed loudly — one copy got a fix and the others quietly did not.
 *
 * The defence that works here is the one central-policy.test.ts and
 * cron-registry.test.ts already use: fail the build when the rule is restated.
 * A route may decide WHETHER to reuse. What it may not do is implement it.
 */
const ROOT = process.cwd();

function repoRelative(file: string): string {
  return relative(ROOT, file).split(sep).join('/');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** The decision rules, the server helper that applies them, and their tests. */
const ALLOWED = [
  'src/lib/academic/content-reuse.ts',
  'src/lib/academic/content-reuse-server.ts',
];

/** Ignores comments, so prose naming a function is not mistaken for a call. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('copying stays central', () => {
  it('no route builds its own copy', () => {
    const offenders = walk(join(ROOT, 'src'))
      .map(repoRelative)
      .filter((rel) => {
        if (ALLOWED.includes(rel)) return false;
        if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) return false;
        const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
        return /\b(buildCopy|decideReuse|canBeCopied)\s*\(/.test(src);
      });

    expect(
      offenders,
      'these apply the copy rules themselves instead of calling reuseWeekContent:\n  ' +
        offenders.join('\n  ')
    ).toEqual([]);
  }, 60_000);

  it('every generator that copies a week goes through the helper', () => {
    // A generator that starts writing its own insert-from-source would not trip
    // the check above if it never imported the rules — it would simply copy
    // without the identity map, and ship the source school's id again.
    const generators = walk(join(ROOT, 'src/app/api/lesson-plans'))
      .map(repoRelative)
      .filter((rel) => /generate-(lessons|slides|flashcards|assignments|projects)\/route\.ts$/.test(rel));

    expect(generators.length).toBe(5);

    const missing = generators.filter(
      (rel) => !readFileSync(join(ROOT, rel), 'utf8').includes('reuseWeekContent')
    );

    expect(
      missing,
      'these generate a week without ever trying to reuse one:\n  ' + missing.join('\n  ')
    ).toEqual([]);
  });

  it('the identity map covers every table the helper can write', () => {
    // A table added to ReuseTable without an entry in IDENTITY_COLUMNS would
    // copy silently, carrying the source school's id — the bug this map exists
    // to prevent, reintroduced by omission rather than by edit.
    const source = readFileSync(
      join(ROOT, 'src/lib/academic/content-reuse-server.ts'),
      'utf8'
    );

    const tables =
      /export type ReuseTable =([\s\S]*?);/.exec(source)?.[1].match(/'([a-z_]+)'/g) ?? [];
    const mapped =
      /const IDENTITY_COLUMNS[\s\S]*?^};/m.exec(source)?.[0].match(/^\s{2}([a-z_]+):/gm) ?? [];

    expect(tables.length).toBeGreaterThan(0);
    const mappedNames = mapped.map((m) => m.trim().replace(':', ''));
    const unmapped = tables
      .map((t) => t.replace(/'/g, ''))
      .filter((t) => !mappedNames.includes(t));

    expect(unmapped, `no identity columns declared for: ${unmapped.join(', ')}`).toEqual([]);
  });
});
