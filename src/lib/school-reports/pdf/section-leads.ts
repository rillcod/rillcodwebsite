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

/** Sections that read as prose and benefit from an opening line. */
export const LEAD_SECTION_KEYS = [
  'curriculumDelivery',
  'partnershipBriefing',
  'nextPhase',
] as const;

const MAX_LEAD_CHARS = 140;

/**
 * Reject anything containing a digit. The model is told not to cite numbers,
 * but a lead that says "attendance held at 91%" beside a table showing 88%
 * makes the whole book untrustworthy — so this is enforced, not requested.
 */
export function sanitiseLead(value: unknown): string | null {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return null;
  if (/\d/.test(text)) return null;
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
      `- Return JSON: { "leads": { ${LEAD_SECTION_KEYS.map((k) => `"${k}": string`).join(', ')} } }`,
    ].join('\n');

    const userPrompt = JSON.stringify({
      school: snapshot?.school?.name ?? null,
      term: snapshot?.period?.termLabel ?? null,
      academicYear: snapshot?.period?.academicYear ?? null,
      sections: LEAD_SECTION_KEYS,
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
