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
 * Zero, and it stays zero. Never raise this.
 *
 * The backlog was 293 pairs: mostly `bg-emerald-600` at 3.67:1 and `bg-amber-600`
 * at 3.19:1, each usually with a `hover:` one shade lighter and worse still —
 * around 2.4:1 — so the buttons got harder to read at the moment the pointer was
 * on them.
 *
 * They were cleared by deepening the fill rather than switching to black text.
 * Every failing hue passes with white at -700, so `bg-emerald-600
 * hover:bg-emerald-500` became `bg-emerald-700 hover:bg-emerald-800`: the same
 * button, one step deeper, white text kept. A hover that landed on the new base
 * colour went deeper again, because a hover that matches the resting state stops
 * reading as a hover.
 */
const BASELINE = 0;

const ROOT = path.join(process.cwd(), 'src');
const AA_NORMAL = 4.5;

/**
 * The palette is read from the installed Tailwind rather than copied here.
 *
 * A hand-kept table was wrong twice over: the hex values were remembered rather
 * than looked up, and it was missing hues entirely — violet, purple and indigo
 * buttons were failing and going unreported because they were not in the list.
 * Tailwind 4 ships oklch, so this reads theme.css and converts.
 */
const THEME_PATH = path.join(process.cwd(), 'node_modules', 'tailwindcss', 'theme.css');
const PALETTE = new Map();
if (fs.existsSync(THEME_PATH)) {
  const theme = fs.readFileSync(THEME_PATH, 'utf8');
  for (const m of theme.matchAll(/--color-([a-z]+)-(\d{2,3}):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g)) {
    PALETTE.set(`${m[1]}-${m[2]}`, { L: +m[3] / 100, C: +m[4], H: +m[5] });
  }
}

/**
 * WCAG relative luminance from oklch, via oklab and linear-light sRGB. Luminance
 * is a weighted sum of the linear channels, so no gamma step is needed — and
 * forgetting one is exactly how the first version of this reported ratios below
 * 1:1, which is not a possible contrast ratio.
 */
function luminanceFromOklch({ L, C, H }) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const clamp = (v) => Math.min(1, Math.max(0, v));
  return 0.2126 * clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
    + 0.7152 * clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
    + 0.0722 * clamp(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}

function contrastWithWhite(token) {
  const color = PALETTE.get(token);
  if (!color) return Infinity;
  return 1.05 / (luminanceFromOklch(color) + 0.05);
}

// The arithmetic is checked on every run. White must be 1:1 against itself and
// black 21:1 — a gate whose maths nobody verified is not evidence.
{
  const white = 1.05 / (luminanceFromOklch({ L: 1, C: 0, H: 0 }) + 0.05);
  const black = 1.05 / (luminanceFromOklch({ L: 0, C: 0, H: 0 }) + 0.05);
  if (Math.abs(white - 1) > 0.02 || Math.abs(black - 21) > 0.2) {
    console.error(`[contrast] self-check failed: white=${white.toFixed(2)} black=${black.toFixed(2)}`);
    process.exit(1);
  }
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
      const ratio = contrastWithWhite(`${hue}-${shade}`);
      if (!Number.isFinite(ratio) || ratio >= AA_NORMAL) continue;
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
