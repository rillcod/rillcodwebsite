import { normalizeComparableNarrativeText } from './topics-covered-presentation';

export function normalizeComparableText(text: string): string {
  return normalizeComparableNarrativeText(text);
}

export function textsSubstantiallyOverlap(a: string, b: string, threshold = 0.78): boolean {
  const left = normalizeComparableText(a);
  const right = normalizeComparableText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length > 36 && right.length > 36 && (left.includes(right) || right.includes(left))) return true;

  const leftWords = new Set(left.split(' ').filter((word) => word.length > 3));
  if (leftWords.size < 6) return left === right;
  const rightWords = new Set(right.split(' '));
  let overlap = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) overlap += 1;
  }
  return overlap / leftWords.size >= threshold;
}

export function dedupeStringList(items: string[], corpus: string[] = [], max = 8): string[] {
  const result: string[] = [];
  const seenCorpus = [...corpus];
  for (const item of items) {
    const trimmed = String(item || '').trim();
    if (!trimmed) continue;
    if (seenCorpus.some((entry) => textsSubstantiallyOverlap(trimmed, entry))) continue;
    if (result.some((entry) => textsSubstantiallyOverlap(trimmed, entry))) continue;
    result.push(trimmed);
    seenCorpus.push(trimmed);
    if (result.length >= max) break;
  }
  return result;
}

/** Never reuse executive summary as the community message block. */
export function resolveCommunityMessageForReport(
  communityMessage: string | null | undefined,
  executiveSummary: string | null | undefined,
): string {
  const community = String(communityMessage || '').trim();
  const executive = String(executiveSummary || '').trim();
  if (!community) return '';
  if (executive && textsSubstantiallyOverlap(community, executive)) return '';
  return community;
}

/** Hide prose/table fallbacks when structured delivery cards already carry the facts. */
export function hasStructuredDeliveryContent(snapshot: {
  deliveryDeclaration?: { selectedTopics?: unknown[] | null } | null;
}): boolean {
  return Boolean(snapshot.deliveryDeclaration?.selectedTopics?.length);
}

const INTERNAL_REPORT_LINE_PATTERNS: RegExp[] = [
  /refresh this (report )?book/i,
  /\breport book\b/i,
  /progressive module (pacing|delivery)/i,
  /structured module pacing/i,
  /open the next planned (curriculum )?module/i,
  /handover from this report/i,
  /confirm the module topics covered/i,
  /apply to update this section/i,
  /refresh the snapshot/i,
  /delivery tracking/i,
  /delivery book opened/i,
  /being recorded for this reporting period/i,
  /being captured from class teaching/i,
  /partner schools pace stem progressively/i,
  /delivery followed (progressive|structured) module pacing/i,
  /visible in the next book/i,
  /next book can coach/i,
  /pending receipt confirmation/i,
  /layout review/i,
  /publish to issue the official report/i,
  /open school billing/i,
  /attach in school billing/i,
  /school billing at snapshot/i,
  /invoice required to complete/i,
  /refresh snapshot data on the report/i,
  /no matching invoice for this term/i,
];

/** Strip staff-only placeholders from school-facing report surfaces. */
export function isInternalReportLine(text: string): boolean {
  const trimmed = String(text || '').trim();
  if (!trimmed) return true;
  return INTERNAL_REPORT_LINE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function filterSchoolFacingLines(lines: string[], max = 6): string[] {
  return dedupeStringList(
    lines.filter((line) => !isInternalReportLine(line)),
    [],
    max,
  );
}

export function resolveSchoolFacingPathNote(note: string | null | undefined): string {
  const trimmed = String(note || '').trim();
  if (!trimmed || isInternalReportLine(trimmed)) return '';
  return trimmed;
}

export const NEXT_TERM_FOCUS_LABEL = 'Next term focus';

export function filterNextPhaseItems(items: string[], alreadyShown: string[] = []): string[] {
  return dedupeStringList(filterSchoolFacingLines(items, 12), alreadyShown, 6);
}
