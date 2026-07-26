import { formatClassDisplay } from '../display-labels';
import { INK, MUTED, PDF_MIN_PANEL } from './tokens';

/**
 * Text and cell primitives shared by every section of the report book.
 *
 * Pure functions with no report/design state, so each section builder can be
 * tested on its own once the document is split up.
 */

/**
 * Repair mojibake before it reaches the page.
 *
 * Content arrives from several stores and some of it has been round-tripped
 * through a latin1 reader at some point, turning "₦" into "â‚¦" and "•" into
 * "â€¢". Re-decoding is attempted only while it strictly reduces the noise
 * characters, so correctly-encoded text is never damaged by the repair.
 */
export function cleanDisplayText(value: unknown): string {
  let text = String(value ?? '');
  for (let attempt = 0; attempt < 3 && /[ÃƒÃ‚Ã¢]/.test(text); attempt += 1) {
    const repaired = Buffer.from(text, 'latin1').toString('utf8');
    const currentNoise = (text.match(/[ÃƒÃ‚Ã¢ï¿½]/g) || []).length;
    const repairedNoise = (repaired.match(/[ÃƒÃ‚Ã¢ï¿½]/g) || []).length;
    if (repairedNoise >= currentNoise) break;
    text = repaired;
  }
  return text.replace(/ï¿½/g, '').trim();
}

/** Trim at word boundaries — avoids harsh mid-word cuts in PDF cells. */
export function smartTruncateWords(text: string, maxChars: number): string {
  const trimmed = cleanDisplayText(text);
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > maxChars * 0.55) return `${slice.slice(0, lastSpace).trimEnd()}…`;
  return `${slice.trimEnd()}…`;
}

export function wrapPdfText(
  value: unknown,
  opts?: {
    fontSize?: number;
    bold?: boolean;
    color?: string;
    align?: 'left' | 'right' | 'center';
    lineHeight?: number;
    maxChars?: number;
    italics?: boolean;
  },
) {
  let text = cleanDisplayText(value);
  if (opts?.maxChars) text = smartTruncateWords(text, opts.maxChars);
  return {
    text,
    fontSize: opts?.fontSize ?? 7.5,
    bold: opts?.bold,
    color: opts?.color ?? INK,
    alignment: opts?.align ?? ('left' as const),
    lineHeight: opts?.lineHeight ?? 1.25,
    ...(opts?.italics ? { italics: true } : {}),
  };
}

export function formatProgrammeScopeText(items: string[]): string {
  const labels = items.map((item) => cleanDisplayText(item)).filter(Boolean);
  if (!labels.length) return '';
  const inline = labels.join('   |   ');
  return inline.length > 96 ? labels.join('\n') : inline;
}

export function classListPdfCell(classNames: string[]) {
  const labels = classNames.map((name) => formatClassDisplay(name)).filter(Boolean);
  if (!labels.length) return wrapPdfText('-', { color: MUTED, fontSize: 7.25 });
  if (labels.length <= 4) {
    return {
      stack: labels.map((label) => wrapPdfText(label, { fontSize: 7.25, lineHeight: 1.2 })),
    };
  }
  return {
    stack: [
      ...labels.slice(0, 4).map((label) => wrapPdfText(label, { fontSize: 7.25, lineHeight: 1.2 })),
      wrapPdfText(`+${labels.length - 4} more`, { fontSize: 6.75, color: MUTED, italics: true, lineHeight: 1.1 }),
    ],
  };
}

export const textList = (items: string[], color = INK) =>
  items.length
    ? { ul: items, color, fontSize: 9, lineHeight: 1.35, margin: [0, 2, 0, 6] }
    : { text: 'No items recorded.', color: MUTED, italics: true, fontSize: 8, margin: [0, 2, 0, 6] };

export const briefLearnerLine = (value: string) => {
  const text = String(value || '').trim();
  const match = text.match(/^(.+?):\s*(\d+(?:\.\d+)?%)/);
  return match ? `${match[1]}: ${match[2]} term average` : smartTruncateWords(text, 160);
};

export const briefExecutiveItems = (items: string[], maxItems = 4, maxChars = 160) =>
  items.slice(0, maxItems).map((value) => {
    const text = String(value || '').trim().replace(/\s+/g, ' ');
    const firstSentence = text.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || text;
    return smartTruncateWords(firstSentence, maxChars);
  });

export const formatMoney = (value: number, currency: string, locale = 'en-NG') =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency || 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export const plainStatus = (value: string) =>
  String(value || 'pending')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function toTitleCase(value: string): string {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Keep a block from starting so close to a page break that it orphans its heading. */
export function withMinPresence(node: object, minPresenceAhead = PDF_MIN_PANEL): object {
  return { ...node, minPresenceAhead };
}
