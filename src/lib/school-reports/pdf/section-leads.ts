import { geminiGenerateText } from '@/lib/gemini/client';
import type { SchoolPerformanceReportRow } from '../types';

/**
 * One-line lead sentences that introduce a section to the reader.
 *
 * Generation is async but the document builder is synchronous, so leads are
 * resolved in renderSchoolReportPdf and handed to the builder as data. That
 * ordering is deliberate: no section may await anything mid-render, or a slow
 * model call would hold a page open.
 *
 * A lead is decoration. Every failure path returns {} and the book renders
 * exactly as it does today — a report must never fail, or wait, on a sentence.
 * Nothing here may invent a number: leads are capped, stripped of digits, and
 * dropped entirely if the model tries to state a statistic, because a figure in
 * a lead that disagrees with the table beneath it is worse than no lead at all.
 */

export type SectionLeads = Record<string, string>;

/**
 * Sections that read as prose and benefit from an opening line, each with what
 * it ACTUALLY contains.
 *
 * Without these the model guesses from the key name and gets it wrong in ways a
 * principal would notice: it described partnershipBriefing as "ongoing and newly
 * established partnerships" (it is one school's strengths and focus areas), and
 * called nextPhase "the final section" when appendices and the closing remark
 * follow it.
 */
export const LEAD_SECTIONS = {
  curriculumDelivery: 'What was actually taught this term: the topics staff confirmed were delivered, week by week.',
  partnershipBriefing: "This one school's strengths this term, and the areas Rillcod and the school will focus on together next.",
  nextPhase: 'The agreed actions for the coming term, and how school, families and Rillcod each stay involved.',
} as const;

export const LEAD_SECTION_KEYS = Object.keys(LEAD_SECTIONS) as Array<keyof typeof LEAD_SECTIONS>;

const MAX_LEAD_CHARS = 140;

/**
 * Reject anything containing a digit. The model is told not to cite numbers,
 * but a lead that says "attendance held at 91%" beside a table showing 88%
 * makes the whole book untrustworthy — so this is enforced, not requested.
 */
/**
 * Claims about where a section sits in the document. Sections are reordered via
 * the registry and hidden when empty, so "the final section" is a statement that
 * will eventually be false in print — enforced rather than merely discouraged,
 * for the same reason as the digit rule.
 */
const POSITIONAL_WORDS = 'first|second|third|last|final|closing|opening|preceding|following|above|below';
const POSITIONAL_NOUNS = 'section|part|chapter|page';
const POSITIONAL_CLAIM = new RegExp(
  // Both orders: "the final section" and "the section below".
  `\\b(?:(?:${POSITIONAL_WORDS})\\s+(?:${POSITIONAL_NOUNS})|(?:${POSITIONAL_NOUNS})\\s+(?:${POSITIONAL_WORDS}))\\b`,
  'i',
);

export function sanitiseLead(value: unknown): string | null {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return null;
  if (/\d/.test(text)) return null;
  if (POSITIONAL_CLAIM.test(text)) return null;
  if (text.length > MAX_LEAD_CHARS) return null;
  return text;
}

export function normaliseSectionLeads(parsed: unknown): SectionLeads {
  if (!parsed || typeof parsed !== 'object') return {};
  const source = (parsed as Record<string, unknown>).leads ?? parsed;
  if (!source || typeof source !== 'object') return {};

  const leads: SectionLeads = {};
  for (const key of LEAD_SECTION_KEYS) {
    const clean = sanitiseLead((source as Record<string, unknown>)[key]);
    if (clean) leads[key] = clean;
  }
  return leads;
}

export async function generateSectionLeads(
  report: SchoolPerformanceReportRow,
): Promise<SectionLeads> {
  try {
    const snapshot = report.snapshot;
    const systemPrompt = [
      'You write single-sentence section openers for a school term report sent to Nigerian school leadership.',
      'Rules:',
      '- One sentence per section. Plain English. No marketing language, no praise inflation.',
      '- NEVER cite a number, percentage, count or score. The tables carry the figures.',
      '- Describe what the section is about, not how well the school did.',
      '- Use ONLY the supplied description of each section. Do not infer from the key name.',
      '- Never describe a section\'s position in the document. Do not say "the first section", "the final section" or similar — sections are reordered and some are hidden, so any such claim will eventually be false.',
      `- Return JSON: { "leads": { ${LEAD_SECTION_KEYS.map((k) => `"${k}": string`).join(', ')} } }`,
    ].join('\n');

    const userPrompt = JSON.stringify({
      school: snapshot?.school?.name ?? null,
      term: snapshot?.period?.termLabel ?? null,
      academicYear: snapshot?.period?.academicYear ?? null,
      sections: LEAD_SECTIONS,
    });

    const result = await geminiGenerateText(systemPrompt, userPrompt, true);
    if (!result?.text) return {};
    return normaliseSectionLeads(JSON.parse(result.text));
  } catch {
    // Never fail or delay a report over decoration.
    return {};
  }
}

/**
 * Render a lead if one exists. Muted and italic so it reads as an opener rather
 * than as report content — nobody should mistake a generated sentence for a
 * finding.
 */
export function sectionLeadBlock(leads: SectionLeads, key: string, color: string): object[] {
  const text = leads?.[key];
  if (!text) return [];
  return [{ text, fontSize: 8, italics: true, color, margin: [0, 0, 0, 5] as [number, number, number, number] }];
}
