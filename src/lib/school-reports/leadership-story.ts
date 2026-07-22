import type { SchoolReportSnapshot } from './types';

/** Cap report story length and trim obvious statistics — scores live elsewhere in the book. */
export function normalizeLeadershipReportStory(text: string, maxSentences = 2): string {
  let cleaned = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  cleaned = cleaned
    .replace(/\b\d+(\.\d+)?%/g, '')
    .replace(/\b\d+\s+(learners?|students?|pupils?)\b/gi, 'learners')
    .replace(/\b(average|mean)\s+(score\s+)?of\s+\d+(\.\d+)?%?/gi, '')
    .replace(/\battendance\s+(rate\s+)?of\s+\d+(\.\d+)?%?/gi, '')
    .replace(/\b\d+\s+of\s+\d+\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .trim();

  const sentences = cleaned.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  if (!sentences?.length) return cleaned.slice(0, 320);
  return sentences
    .slice(0, maxSentences)
    .map((sentence) => sentence.trim())
    .join(' ')
    .trim()
    .slice(0, 480);
}

/** Plain-language fallback when AI is unavailable — story only, no stats. */
export function fallbackLeadershipReportStory(snapshot: SchoolReportSnapshot): string | undefined {
  const school = snapshot.school?.name || 'the school';
  const termLabel = snapshot.period?.termLabel || 'this term';
  const programmes = Array.from(
    new Set(
      [
        ...(snapshot.curriculum?.courses || []).map((row) => row.programme),
        ...(snapshot.schoolProgrammes || []).map((row) => row.programme),
      ].filter(Boolean),
    ),
  ).slice(0, 3);

  if (!programmes.length) {
    return `During ${termLabel}, ${school} continued purposeful STEM learning with Rillcod — building confidence through guided practice and real classroom projects.`;
  }

  const programmePhrase =
    programmes.length === 1
      ? programmes[0]
      : `${programmes.slice(0, -1).join(', ')} and ${programmes[programmes.length - 1]}`;

  return `During ${termLabel}, ${school} learners engaged with ${programmePhrase} through focused, mastery-led sessions across the reporting window. The term reflects consistent delivery between the school and Rillcod.`;
}

export const LEADERSHIP_REPORT_STORY_HINT =
  'A short report story (1–2 sentences, no statistics) for Nigerian school leaders and parents. Course cards already show what was taught.';
