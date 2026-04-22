type Dict = Record<string, unknown>;

function asObject(value: unknown): Dict {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Dict)
    : {};
}

export function getProgressionTermStatus(
  planData: Record<string, unknown>,
  yearNumber: number,
  termNumber: number,
): 'draft' | 'approved' | 'locked' {
  const progression = asObject(planData.progression);
  const generatedTerms = asObject(progression.generated_terms);
  const key = `y${yearNumber}t${termNumber}`;
  const termObj = asObject(generatedTerms[key]);
  const status = termObj.term_status;
  return status === 'approved' || status === 'locked' ? status : 'draft';
}

export function isLockedTerm(
  planData: Record<string, unknown>,
  yearNumber: number,
  termNumber: number,
): boolean {
  return getProgressionTermStatus(planData, yearNumber, termNumber) === 'locked';
}
