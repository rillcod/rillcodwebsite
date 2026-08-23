#!/usr/bin/env node
/**
 * Accessibility gate: form controls must have a programmatic accessible name.
 *
 * A visible caption sitting next to an input is not a label. Without htmlFor/id,
 * aria-label or aria-labelledby, a screen reader announces the field as an
 * unlabelled edit box, and the caption is not a click target either. A placeholder
 * does not count — it is not an accessible name and it disappears as soon as the
 * field has content, which is exactly when a user is most likely to need it.
 *
 * This is a static gate, not a browser one. It cannot compute a real accessibility
 * tree, so it deliberately checks the one thing that can be decided from source and
 * that accounts for the bulk of the product's WCAG 1.3.1/4.1.2 exposure. A browser
 * axe run is still required and is tracked separately by SYS-037.
 *
 * It is a ratchet, not a wall. The backlog was 1553 controls when this was written;
 * failing the build on all of them would only mean deleting the gate. It fails when
 * the count goes UP, so the number can only be paid down. Lower BASELINE whenever
 * you fix a batch — the gate tells you the new number to write.
 *
 * Run: npm run audit:a11y
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'src');

/**
 * Controls without a programmatic name, as of 23 August 2026.
 * Lower this as the backlog is paid down. Never raise it.
 *
 * Was 1553. Dropped to 1304 not by fixing 249 controls but by teaching this
 * scanner that a control nested inside a <label> is already labelled. Those were
 * this gate's own false positives — accessible markup it was reporting as broken,
 * which is worse than missing a defect because it sends people to change working
 * code and teaches them to distrust the gate.
 */
const BASELINE = 1304;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const p = path.join(dir, entry);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p) && !/\.test\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

const CONTROL = /<(input|textarea|select)\b([^>]*?)\/?>/gis;
// A control of these types is named by its own value or nothing at all.
const UNNAMEABLE_TYPE = /type=\s*["'](hidden|submit|button|image)["']/i;

/**
 * Character ranges covered by a <label>…</label> element.
 *
 * A control nested inside a label is labelled by it — that is implicit labelling,
 * and it needs no htmlFor or id at all. Reporting those was this scanner's own
 * false-positive class: it flagged perfectly accessible markup and would have sent
 * someone to "fix" it. Nesting labels is invalid HTML, so a simple depth-free scan
 * of open and close tags is sufficient.
 */
function labelRanges(src) {
  const ranges = [];
  const open = /<label\b[^>]*>/gi;
  let match;
  while ((match = open.exec(src))) {
    const close = src.indexOf('</label>', match.index);
    if (close === -1) continue;
    ranges.push([match.index, close]);
  }
  return ranges;
}

const insideAny = (ranges, index) => ranges.some(([start, end]) => index > start && index < end);

function scan() {
  let total = 0;
  let unnamed = 0;
  const byFile = new Map();

  for (const file of walk(ROOT)) {
    const src = fs.readFileSync(file, 'utf8');
    const htmlFors = new Set(
      [...src.matchAll(/htmlFor=\{?["'`]([^"'`}]+)/g)].map((m) => m[1]),
    );
    const wrappingLabels = labelRanges(src);

    for (const match of src.matchAll(CONTROL)) {
      const attrs = match[2] || '';
      if (UNNAMEABLE_TYPE.test(attrs)) continue;
      total += 1;

      const idMatch = attrs.match(/\bid=\{?["'`]([^"'`}]+)/);
      // An id built from a template literal cannot be resolved here. If the file
      // pairs labels at all, assume this one is paired rather than reporting noise
      // the reader cannot act on.
      const dynamicId = /\bid=\{/.test(attrs) && !idMatch;

      const named =
        /aria-label\s*=/.test(attrs) ||
        /aria-labelledby\s*=/.test(attrs) ||
        (idMatch ? htmlFors.has(idMatch[1]) : false) ||
        (dynamicId && htmlFors.size > 0) ||
        // Nested inside a <label>, which names it without needing an id.
        insideAny(wrappingLabels, match.index);

      if (!named) {
        unnamed += 1;
        const rel = path
          .relative(process.cwd(), file)
          .replace(/\\/g, '/');
        byFile.set(rel, (byFile.get(rel) || 0) + 1);
      }
    }
  }
  return { total, unnamed, byFile };
}

const { total, unnamed, byFile } = scan();

console.log(`[a11y] ${total} form controls scanned.`);
console.log(`[a11y] ${unnamed} without a programmatic accessible name (baseline ${BASELINE}).`);

if (unnamed > BASELINE) {
  const worst = [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.error(
    `\n[a11y] FAIL: ${unnamed - BASELINE} more unlabelled control(s) than the baseline.\n` +
      `Give each new control a paired <label htmlFor>/id, an aria-label, or an\n` +
      `aria-labelledby. Do not raise BASELINE to make this pass.\n\n` +
      `Files with the most unlabelled controls:`,
  );
  for (const [file, count] of worst) console.error(`  ${String(count).padStart(4)}  ${file}`);
  process.exit(1);
}

if (unnamed < BASELINE) {
  console.log(
    `\n[a11y] ${BASELINE - unnamed} fewer than the baseline. ` +
      `Lower BASELINE in scripts/audit-accessibility.mjs to ${unnamed} to lock the gain in.`,
  );
}

console.log('[a11y] accessibility gate passed.');
