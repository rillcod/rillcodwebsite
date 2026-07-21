import type { SuggestedCurriculumRange } from './curriculum-range';

type RangeFields = {
  curriculumStartTerm: number;
  curriculumStartWeek: number;
  curriculumEndTerm: number;
  curriculumEndWeek: number;
};

export function curriculumRangeDiffersFromSuggestion(
  form: RangeFields,
  suggestion: SuggestedCurriculumRange | null | undefined,
): boolean {
  if (!suggestion) return false;
  return (
    form.curriculumStartTerm !== suggestion.curriculumStartTerm ||
    form.curriculumStartWeek !== suggestion.curriculumStartWeek ||
    form.curriculumEndTerm !== suggestion.curriculumEndTerm ||
    form.curriculumEndWeek !== suggestion.curriculumEndWeek
  );
}

export function needsCurriculumOverrideReason(
  form: RangeFields,
  suggestion: SuggestedCurriculumRange | null | undefined,
): boolean {
  if (!suggestion) return false;
  if (suggestion.status === 'query_failed' || suggestion.status === 'migration_missing') return true;
  return curriculumRangeDiffersFromSuggestion(form, suggestion);
}

export function validateCurriculumOverrideReason(
  form: RangeFields & { curriculumOverrideReason?: string },
  suggestion: SuggestedCurriculumRange | null | undefined,
): string | null {
  if (!needsCurriculumOverrideReason(form, suggestion)) return null;
  const reason = String(form.curriculumOverrideReason || '').trim();
  if (reason.length < 8) {
    return 'Enter a clear reason for the manual curriculum range (at least 8 characters).';
  }
  return null;
}
