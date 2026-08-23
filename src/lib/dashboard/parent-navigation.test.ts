import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isDashboardPathBlockedForParent } from './route-access';

/**
 * The parent sidebar and the parent allow-list are maintained in different files.
 * Nothing connected them, so a row could point at a route parents are not allowed
 * to open — the link renders, the parent taps it, and the guard bounces them to
 * access-denied. A dead end that looks like a feature.
 *
 * It also holds the size down. The sidebar had grown to seventeen rows, seven of
 * them under one heading, including a grading reference page and an ID card. A
 * parent is checking how their child is doing and what they owe; a list that long
 * buries both.
 */

const SOURCE = readFileSync(
  path.join(process.cwd(), 'src/components/layout/DashboardNavigation.tsx'),
  'utf8',
);

/** The `case "parent":` arm of the nav builder, up to the next case. */
function parentNavBlock(): string {
  const start = SOURCE.indexOf('case "parent":');
  expect(start, 'DashboardNavigation must still have a parent nav case').toBeGreaterThan(-1);
  const end = SOURCE.indexOf('default:', start);
  expect(end).toBeGreaterThan(start);
  return SOURCE.slice(start, end);
}

const parentHrefs = (): string[] =>
  [...parentNavBlock().matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);

describe('parent navigation', () => {
  it('never links a parent to a route the guard will bounce them from', () => {
    const blocked = parentHrefs().filter((href) => isDashboardPathBlockedForParent(href));
    expect(blocked, `these parent nav rows lead to access-denied: ${blocked.join(', ')}`).toEqual([]);
  });

  it('keeps the list short enough to scan on a phone', () => {
    // Was 17. This is a ceiling, not a target — adding a row means removing one.
    expect(parentHrefs().length).toBeLessThanOrEqual(14);
  });

  it('leads with the two things a parent actually came for', () => {
    const hrefs = parentHrefs();
    expect(hrefs).toContain('/dashboard/my-children');
    expect(hrefs).toContain('/dashboard/parent-results');
    expect(hrefs).toContain('/dashboard/finance');
  });

  it('does not put a reference page or a card in the progress list', () => {
    const block = parentNavBlock();
    const progress = block.slice(
      block.indexOf('Academic Progress'),
      block.indexOf('label: "Finance"'),
    );
    // The grading guide belongs on the report card, where a parent reads a grade.
    expect(progress).not.toContain('/dashboard/grades/waec');
    expect(progress).not.toContain('/dashboard/my-card');
  });

  it('does not show a parent our internal name for their messages', () => {
    // Labels only — a comment explaining the rename is not a label.
    const labels = [...parentNavBlock().matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(labels).not.toContain('WhatsApp Inbox');
    expect(labels).toContain('Messages');
  });

  it('still reaches every route a parent needs to act on', () => {
    const hrefs = parentHrefs();
    // Consent is the one place a parent is asked to *do* something.
    expect(hrefs).toContain('/dashboard/consent-forms');
    expect(hrefs).toContain('/dashboard/support');
    expect(hrefs).toContain('/dashboard/profile');
  });

  /**
   * Scope and interface have to agree. A route a parent is allowed to open but can
   * reach from nowhere is either a page nobody finds or a permission nobody meant
   * to grant, and both look identical from the outside.
   *
   * Removing a row from the sidebar is fine — the grading guide and the feedback
   * form are reached from the report card and the support page instead. What is not
   * fine is a route reachable from nothing at all.
   */
  it('leaves no allow-listed route a parent cannot reach from anywhere', () => {
    const accessSource = readFileSync(path.join(process.cwd(), 'src/lib/dashboard/route-access.ts'), 'utf8');
    const listBlock = accessSource.slice(
      accessSource.indexOf('const PARENT_ALLOWED_PREFIXES'),
      accessSource.indexOf('const PARENT_ALLOWED_EXACT'),
    );
    const allowed = [...listBlock.matchAll(/^\s*"([^"]+)",/gm)].map((m) => m[1]);
    const inNav = new Set(parentHrefs());

    // A route with an explanation above it in the allow-list is a deliberate
    // exception — parent-card is a redirect kept alive for links already sent out.
    const documented = new Set(
      [...listBlock.matchAll(/\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*"([^"]+)",/g)].map((m) => m[1]),
    );

    // Reached from another page counts. The grading guide is linked from the report
    // card and the feedback form from support; that is a better home than a sidebar
    // row, not a gap.
    const linkedSomewhere = (route: string) => {
      const stack = [path.join(process.cwd(), 'src')];
      while (stack.length) {
        const dir = stack.pop()!;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== '.next') stack.push(full);
          } else if (/\.tsx?$/.test(entry.name) && !full.includes('route-access')) {
            if (readFileSync(full, 'utf8').includes(route)) return true;
          }
        }
      }
      return false;
    };

    const unreachable = allowed.filter(
      (route) => !inNav.has(route) && !documented.has(route) && !linkedSomewhere(route),
    );
    expect(
      unreachable,
      `allow-listed but reachable from nowhere: ${unreachable.join(', ')}`,
    ).toEqual([]);
  });
});
