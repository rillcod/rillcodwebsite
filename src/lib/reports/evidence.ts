export type AssignmentEvidence = { id: string; class_id?: string | null; term_id?: string | null };

export function relevantAssignmentsForReport<T extends AssignmentEvidence>(rows: T[], classId: string | null, termId: string | null): T[] {
  return rows.filter(row =>
    (!row.class_id || row.class_id === classId)
    && (!termId || row.term_id === termId),
  );
}

export function evidencePercentage(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

export function isEvidenceWithinPeriod(value: string | null | undefined, startDate?: string | null, endDate?: string | null): boolean {
  if (!startDate && !endDate) return true;
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  if (startDate && timestamp < new Date(`${startDate}T00:00:00`).getTime()) return false;
  if (endDate && timestamp > new Date(`${endDate}T23:59:59`).getTime()) return false;
  return true;
}