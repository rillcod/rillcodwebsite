import type { SchoolReportNarrative } from './types';

export type SchoolReportEditorState = {
  executiveSummary: string;
  topicsCovered: string;
  achievements: string;
  concerns: string;
  recommendations: string;
  nextPeriodFocus: string;
};

export const EMPTY_EDITOR: SchoolReportEditorState = {
  executiveSummary: '',
  topicsCovered: '',
  achievements: '',
  concerns: '',
  recommendations: '',
  nextPeriodFocus: '',
};

const lines = (value: string[]) => value.join('\n');
const parseLines = (value: string) =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

export function editorFromNarrative(n: SchoolReportNarrative | null | undefined): SchoolReportEditorState {
  if (!n) return { ...EMPTY_EDITOR };
  return {
    executiveSummary: n.executiveSummary || '',
    topicsCovered: n.topicsCovered || '',
    achievements: lines(n.achievements || []),
    concerns: lines(n.concerns || []),
    recommendations: lines(n.recommendations || []),
    nextPeriodFocus: lines(n.nextPeriodFocus || []),
  };
}

export function narrativeFromEditor(editor: SchoolReportEditorState): SchoolReportNarrative {
  return {
    executiveSummary: editor.executiveSummary.trim(),
    topicsCovered: editor.topicsCovered.trim() || undefined,
    achievements: parseLines(editor.achievements),
    concerns: parseLines(editor.concerns),
    recommendations: parseLines(editor.recommendations),
    nextPeriodFocus: parseLines(editor.nextPeriodFocus),
  };
}

export function editorStatesEqual(a: SchoolReportEditorState, b: SchoolReportEditorState): boolean {
  return (
    a.executiveSummary === b.executiveSummary &&
    a.topicsCovered === b.topicsCovered &&
    a.achievements === b.achievements &&
    a.concerns === b.concerns &&
    a.recommendations === b.recommendations &&
    a.nextPeriodFocus === b.nextPeriodFocus
  );
}
