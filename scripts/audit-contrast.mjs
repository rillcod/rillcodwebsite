#!/usr/bin/env node
/**
 * White text on a mid-tone fill.
 *
 * `bg-amber-600` with `text-white` looks deliberate in a dark editor and is close
 * to unreadable in daylight: about 3:1, against the 4.5:1 WCAG asks for normal
 * text. It is worse on hover, because hover states go lighter. Black on the same
 * fill is roughly 7:1.
 *
 * This computes the real ratio from the Tailwind palette rather than guessing by
 * hue, so it flags `bg-amber-600` and leaves `bg-amber-800` alone, and it does the
 * same for the hover colour, which is where several of these actually fail.
 *
 * A ratchet like the accessibility gate: the existing backlog is the baseline and
 * it fails when the number goes up. Lower BASELINE when you fix a batch.
 *
 * Run: npm run audit:contrast
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Pairs failing WCAG AA for normal text, as of 23 August 2026. Never raise this.
 *
 * 293 is what the first correct run found, after the report writer's four were
 * fixed. Most are the same two shapes repeated: `bg-emerald-600` at 3.65:1 and
 * `bg-amber-600` at 3.20:1, each usually with a `hover:` one shade lighter that is
 * worse still — around 2.5:1 — so these buttons get harder to read at the moment
 * the pointer is on them.
 *
 * Not every one is a straight swap to text-black: where the failing token sits
 * behind a `hover:` and the resting fill is dark, white is right at rest. Those
 * need reading, not a bulk replace, which is why this ratchets rather than blocks.
 */
const BASELINE = 293;

const ROOT = path.join(process.cwd(), 'src');
const AA_NORMAL = 4.5;

/** Tailwind v4 default palette, the shades where white text is a judgement call. */
const PALETTE = {
  slate: { 400: '#90a1b9', 500: '#62748e', 600: '#45556c' },
  gray: { 400: '#99a1af', 500: '#6a7282', 600: '#4a5565' },
  zinc: { 400: '#9f9fa9', 500: '#71717b', 600: '#52525c' },
  red: { 400: '#ff6467', 500: '#fb2c36', 600: '#e7000b' },
  orange: { 400: '#ff8904', 500: '#ff6900', 600: '#f54a00' },
  amber: { 400: '#ffb900', 500: '#fe9a00', 600: '#e17100' },
  yellow: { 400: '#fdc700', 500: '#f0b100', 600: '#d08700' },
  lime: { 400: '#9ae600', 500: '#7ccf00', 600: '#5ea500' },
  green: { 400: '#05df72', 500: '#00c951', 600: '#00a63e' },
  emerald: { 400: '#00d492', 500: '#00bc7d', 600: '#009966' },
  teal: { 400: '#00d5be', 500: '#00bba7', 600: '#009689' },
  cyan: { 400: '#00d3f2', 500: '#00b8db', 600: '#0092b8' },
  sky: { 400: '#00bcff', 500: '#00a6f4', 600: '#0084d1' },
  blue: { 400: '#51a2ff', 500: '#2b7fff', 600: '#155dfc' },
  violet: { 400: '#a684ff', 500: '#8e51ff', 600: '#7f22fe' },
  fuchsia: { 400: '#e12afb', 500: '#c800de', 600: '#a800b7' },
  pink: { 400: '#fb64b6', 500: '#f6339a', 600: '#e60076' },
  rose: { 400: '#ff637e', 500: '#ff2056', 600: '#ec003f' },
};

const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255)
    + 0.7152 * channel((n >> 8) & 255)
    + 0.0722 * channel(n & 255);
}

function contrastWithWhite(hex) {
  const l = luminance(hex);
  return (1.05) / (l + 0.05);
}

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

/** One quoted class string, where a bg and a text colour would sit together. */
const CLASS_STRING = /(?:className|class)\s*=\s*[{]?\s*[`'"]([^`'"]{0,600})[`'"]/g;
const BG = /(?:^|\s|:)bg-([a-z]+)-(\d{3})\b/g;

const findings = [];

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  for (const match of src.matchAll(CLASS_STRING)) {
    const classes = match[1];
    if (!/\btext-white\b/.test(classes)) continue;

    for (const bg of classes.matchAll(BG)) {
      const [, hue, shade] = bg;
      const hex = PALETTE[hue]?.[shade];
      if (!hex) continue;
      const ratio = contrastWithWhite(hex);
      if (ratio >= AA_NORMAL) continue;
      const line = src.slice(0, match.index).split('\n').length;
      findings.push({
        file: path.relative(process.cwd(), file).replace(/\\/g, '/'),
        line,
        token: `bg-${hue}-${shade}`,
        ratio: ratio.toFixed(2),
      });
    }
  }
}

console.log(`[contrast] ${findings.length} white-on-light-fill pair(s) below ${AA_NORMAL}:1 (baseline ${BASELINE}).`);

if (findings.length > BASELINE) {
  console.error(
    `\n[contrast] FAIL: ${findings.length - BASELINE} more than the baseline.\n` +
      `White text needs a fill at ${AA_NORMAL}:1 or better. Use text-black on these,\n` +
      `or darken the fill (bg-amber-800 rather than bg-amber-600).\n`,
  );
  for (const f of findings.slice(0, 40)) {
    console.error(`  ${f.ratio}:1  ${f.token.padEnd(18)} ${f.file}:${f.line}`);
  }
  if (findings.length > 40) console.error(`  … and ${findings.length - 40} more`);
  process.exit(1);
}

if (findings.length < BASELINE) {
  console.log(`[contrast] ${BASELINE - findings.length} fewer than the baseline. Lower BASELINE to ${findings.length}.`);
}
console.log('[contrast] contrast gate passed.');
