export const REPORT_COLORS = {
  emerald: '#059669', amber: '#d97706', rose: '#e11d48', slate: '#64748b', blue: '#2563eb', violet: '#7c3aed',
};

export function roundMetric(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

export function average(values: number[]): number {
  return values.length ? roundMetric(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

export function percentage(part: number, whole: number): number {
  return whole > 0 ? roundMetric((part / whole) * 100) : 0;
}

export function inCurriculumRange(
  term: number,
  week: number,
  startTerm: number,
  startWeek: number,
  endTerm: number,
  endWeek: number,
): boolean {
  const point = term * 100 + week;
  return point >= startTerm * 100 + startWeek && point <= endTerm * 100 + endWeek;
}

export function scoreBands(scores: number[]) {
  return [
    { label: 'Excellent 75-100%', count: scores.filter((score) => score >= 75).length, color: REPORT_COLORS.emerald },
    { label: 'Developing 50-74%', count: scores.filter((score) => score >= 50 && score < 75).length, color: REPORT_COLORS.amber },
    { label: 'Needs support below 50%', count: scores.filter((score) => score < 50).length, color: REPORT_COLORS.rose },
  ];
}

export function attendanceBands(rates: number[]) {
  return [
    { label: 'Strong 80-100%', count: rates.filter((rate) => rate >= 80).length, color: REPORT_COLORS.blue },
    { label: 'Watch 60-79%', count: rates.filter((rate) => rate >= 60 && rate < 80).length, color: REPORT_COLORS.violet },
    { label: 'Needs action below 60%', count: rates.filter((rate) => rate < 60).length, color: REPORT_COLORS.rose },
  ];
}
